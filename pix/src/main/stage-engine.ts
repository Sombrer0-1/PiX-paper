/**
 * Stage engine (design §4, §5.3).
 *
 * Drives the five paper stages on top of a SessionBridge. The engine:
 *  - starts a stage by prompting the agent with the stage prompt (workflow pkg)
 *  - exposes `request_stage_review` as an injected tool (ExtensionFactory) so
 *    the agent declares stage completion; the tool's execute triggers a human
 *    gate via a dedicated IPC channel (NOT request_user_input, which
 *    ExtensionAPI cannot initiate - design §5.3)
 *  - applies the human gate decision (advance / rework / abort), persists
 *    progress, and auto-loads the next stage once the agent turn ends
 *  - registers declared artifacts and runs lightweight quality checks
 *
 * The engine holds a back-reference to SessionBridge for prompting, and emits
 * gate / progress-changed events that paper-rpc forwards to the renderer.
 */

import { Type } from "typebox";
import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionFactory,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	type Artifact,
	type ArtifactType,
	type DeclaredArtifact,
	type GateDecision,
	type GateRequest,
	type InboxItem,
	type InboxItemKind,
	type InboxItemStatus,
	type PaperInbox,
	type PaperProgress,
	type PaperProjectConfig,
	type QualityCheckItem,
	type StageId,
	STAGE_LABELS,
	applyGateDecision,
	buildResumeNudge,
	buildStagePrompt,
	canStartStage,
	getStageArtifacts,
	isArtifactType,
	isStageId,
	pauseStage,
	registerArtifacts,
	requestGate,
	resumeStage,
	startStage,
} from "pi-paper-workflow";
import type { SessionBridge } from "./session-bridge.js";
import {
	captureArtifactRevisions,
	loadPaperConfig,
	loadPaperInbox,
	loadPaperProgress,
	normalizePaperArtifactPath,
	savePaperInbox,
	savePaperProgress,
} from "./paper-project.js";

const requestStageReviewSchema = Type.Object({
	stage: Type.String({
		description: "当前阶段 id 之一: literature / reproduction / improvement / experiment / writing。",
	}),
	summary: Type.String({
		description: "本阶段完成的工作摘要(中文),供用户 gate 审核时参考。简明列出做了什么、关键产物与关键结论。",
	}),
	artifacts: Type.Array(
		Type.Object({
			type: Type.String({
				description:
					"产物类型,取值: paper / paper_pdf / survey / method / repo / reproduction_log / experiment_config / experiment_result / figure / literature_pool。",
			}),
			role: Type.Optional(Type.Union([Type.Literal("primary"), Type.Literal("supporting")])),
			metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
			relations: Type.Optional(Type.Array(Type.Object({
				kind: Type.Union([
					Type.Literal("cites"),
					Type.Literal("illustrates"),
					Type.Literal("derived_from"),
					Type.Literal("supports"),
				]),
				targetArtifactId: Type.Optional(Type.String()),
				targetPath: Type.Optional(Type.String()),
				label: Type.Optional(Type.String()),
			}))),
			path: Type.String({ description: "产物文件路径,相对项目目录或绝对路径。" }),
		}),
		{ description: "本阶段产出的文件列表,会登记到产物注册表并在 gate 中展示。" },
	),
});

export interface StageEngineListeners {
	/** Fired when a stage needs a human gate; paper-rpc forwards it to GateCard. */
	onGateRequest: (gate: GateRequest) => void;
	/** Fired whenever progress changes; paper-rpc forwards it to refresh the UI. */
	onProgressChanged: (progress: PaperProgress, config: PaperProjectConfig) => void;
	onInboxChanged: (inbox: PaperInbox, config: PaperProjectConfig) => void;
}

export class StageEngine {
	private _bridge: SessionBridge;
	private _projectDir: string;
	private _config: PaperProjectConfig | null = null;
	private _progress: PaperProgress | null = null;
	private _inbox: PaperInbox | null = null;
	private _pendingGate: {
		gate: GateRequest;
		resolve: (decision: GateDecision) => void;
		reject: (error: Error) => void;
	} | null = null;
	/** Stage to auto-load once the current agent turn ends (set by respondGate). */
	private _pendingStart: { stage: StageId; notes?: string; fork?: boolean } | null = null;
	private _inboxMutation: Promise<void> = Promise.resolve();
	private _listeners: StageEngineListeners = {
		onGateRequest: () => {},
		onProgressChanged: () => {},
		onInboxChanged: () => {},
	};

	constructor(bridge: SessionBridge, projectDir: string) {
		this._bridge = bridge;
		this._projectDir = projectDir;
	}

	/** Wire up event sinks used by paper-rpc to forward to the renderer. */
	setListeners(listeners: Partial<StageEngineListeners>): void {
		this._listeners = { ...this._listeners, ...listeners };
	}

	/** Load config + progress from disk. Safe to call on startup or reconnect. */
	async load(): Promise<void> {
		this._config = await loadPaperConfig(this._projectDir);
		this._progress = await loadPaperProgress(this._projectDir);
		this._inbox = await loadPaperInbox(this._projectDir, this._config.id);
		await this._ensurePersistedGateInbox();
		await this._persist();
	}

	get config(): PaperProjectConfig {
		this._requireLoaded();
		return this._config as PaperProjectConfig;
	}

	get projectDir(): string {
		return this._projectDir;
	}

	get progress(): PaperProgress {
		this._requireLoaded();
		return this._progress as PaperProgress;
	}

	get inbox(): PaperInbox {
		return this._inbox ?? { version: 1, items: [], updatedAt: Date.now() };
	}

	get pendingGate(): GateRequest | null {
		return this._pendingGate?.gate ?? this._progress?.pendingGate ?? null;
	}

	listArtifacts(stage?: StageId): Artifact[] {
		if (!this._progress) return [];
		return stage ? getStageArtifacts(this._progress, stage) : this._progress.artifacts;
	}

	/**
	 * Start (or resume) a stage: mark it running, persist, and prompt the agent.
	 * `resume` sends a short nudge instead of the full stage prompt (used when
	 * recovering from a restart mid-stage); `notes` adds extra context (e.g. a
	 * rework reason) appended to the prompt.
	 */
	async startStage(stage: StageId, opts?: { resume?: boolean; notes?: string; sessionFile?: string; allowExisting?: boolean }): Promise<void> {
		this._requireLoaded();
		if (this._progress?.stage.stages[stage].status === "running" && !opts?.resume && !opts?.allowExisting) {
			throw new Error(`Stage "${stage}" is already running.`);
		}
		const check = canStartStage(this._progress as PaperProgress, stage);
		if (!check.ok) {
			throw new Error(check.reason ?? `Cannot start stage ${stage}`);
		}
		this._progress = startStage(this._progress as PaperProgress, stage, opts?.sessionFile);
		await this._persist();

		const ctx = { topic: this.config.topic, projectDir: this._projectDir, notes: opts?.notes };
		const prompt = opts?.resume ? buildResumeNudge(stage, ctx) : buildStagePrompt(stage, ctx);
		await this._bridge.prompt(prompt);
	}

	async pauseStage(stage: StageId, reason?: string): Promise<void> {
		this._requireLoaded();
		if (this._progress?.stage.stages[stage].status !== "running") {
			throw new Error("Only a running stage can be paused.");
		}
		await this._bridge.abort();
		this._progress = pauseStage(this._progress as PaperProgress, stage, reason);
		await this._persist();
	}

	async resumeStage(stage: StageId): Promise<void> {
		this._requireLoaded();
		if (this._progress?.stage.stages[stage].status !== "paused") {
			throw new Error("Only a paused stage can be resumed.");
		}
		this._progress = resumeStage(this._progress as PaperProgress, stage);
		await this._persist();
		const ctx = { topic: this.config.topic, projectDir: this._projectDir };
		await this._bridge.prompt(buildResumeNudge(stage, ctx));
	}

	/**
	 * Called from the request_stage_review tool execute closure. Registers
	 * declared artifacts, runs quality checks, fires the gate, and resolves to
	 * the human gate decision (which the tool returns to the agent).
	 */
	async requestReview(stage: StageId, summary: string, declared: DeclaredArtifact[]): Promise<GateDecision> {
		this._requireLoaded();
		if (this.pendingGate) throw new Error("A stage gate is already pending.");
		const normalized = await Promise.all(declared.map(async (artifact) => ({
			...artifact,
			path: await normalizePaperArtifactPath(this._projectDir, artifact.path),
		})));
		this._progress = registerArtifacts(
			this._progress as PaperProgress,
			this.config.id,
			stage,
			normalized,
			"agent",
		);
		this._progress = await captureArtifactRevisions(this._projectDir, this._progress);
		const artifacts = getStageArtifacts(this._progress as PaperProgress, stage);
		const checks = runQualityChecks(stage, artifacts, summary);
		const gate: GateRequest = {
			id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			stage,
			summary,
			artifacts,
			primaryArtifactId: artifacts.find((artifact) => artifact.role === "primary")?.id ?? artifacts[0]?.id,
			checks,
			requestedAt: Date.now(),
		};
		this._progress = requestGate(this._progress as PaperProgress, gate);
		await this._persist();
		await this._upsertGateInbox(gate);

		return new Promise<GateDecision>((resolve, reject) => {
			this._pendingGate = { gate, resolve, reject };
			this._listeners.onGateRequest(gate);
		});
	}

	/** Apply a human gate decision (called from the paper-respond-gate IPC handler). */
	async respondGate(decision: GateDecision): Promise<void> {
		this._requireLoaded();
		if (!this._pendingGate && !this._progress?.pendingGate) {
			throw new Error("No pending gate to respond to.");
		}
		const restoredGate = !this._pendingGate;
		const gateId = this._pendingGate?.gate.id ?? this._progress?.pendingGate?.id;
		const { progress, outcome } = applyGateDecision(this._progress as PaperProgress, decision);
		this._progress = progress;
		await this._persist();

		// Let the request_stage_review tool call return the decision to the agent.
		this._pendingGate?.resolve(decision);
		this._pendingGate = null;
		if (gateId) await this._resolveGateInbox(gateId);

		// Schedule the next stage prompt; it is sent once the agent turn ends
		// (see onAgentEnd), so we never prompt while a turn is still active.
		if (outcome.action === "advance") {
			this._pendingStart = { stage: outcome.nextStage };
		} else if (outcome.action === "rework") {
			// Rework forks a new session branch so the original session is preserved
			// (design §4.1/§10). The fork happens in onAgentEnd once the agent is idle.
			this._pendingStart = { stage: outcome.target, notes: decision.reason, fork: true };
		}
		// abort: nothing to schedule.
		// A persisted gate is resolved after the application has restarted, so
		// there may be no future agent_end event to release the queued stage.
		// Keep the event-driven path for an active turn, but start it now when the
		// restored session is already idle.
		if (restoredGate && !this._bridge.isStreaming()) {
			await this.onAgentEnd();
		}
	}

	/**
	 * Called by paper-rpc when SessionBridge emits agent_end. If a stage was
	 * scheduled by a prior gate decision, send its prompt now. For rework, fork
	 * a new session branch first so the original session is preserved.
	 */
	async onAgentEnd(): Promise<void> {
		const start = this._pendingStart;
		this._pendingStart = null;
		if (!start) return;
		let sessionFile: string | undefined;
		if (start.fork) {
			try {
				const result = await this._bridge.clone();
				if (result.cancelled) return;
				sessionFile = this._bridge.getState().sessionFile ?? undefined;
			} catch (err) {
				console.error("[StageEngine] rework fork failed, continuing on same session:", err);
			}
		}
		await this.startStage(start.stage, { notes: start.notes, sessionFile, allowExisting: true });
	}

	/** ExtensionFactory that registers request_stage_review (design §5.3). */
	get extensionFactory(): ExtensionFactory {
		return (pi: ExtensionAPI): void => {
			pi.registerTool(this._requestStageReviewTool());
		};
	}

	dispose(): void {
		this._pendingGate?.reject(new Error("StageEngine disposed"));
		this._pendingGate = null;
		this._pendingStart = null;
	}

	private _requireLoaded(): void {
		if (!this._config || !this._progress) {
			throw new Error("StageEngine not loaded. Call load() first.");
		}
	}

	private async _ensurePersistedGateInbox(): Promise<void> {
		const gate = this._progress?.pendingGate;
		if (!gate) return;
		await this._upsertGateInbox(gate);
	}

	private async _upsertGateInbox(gate: GateRequest): Promise<void> {
		await this._queueInboxMutation(async () => {
			if (!this._config) return;
			const existing = this.inbox.items.find((item) => item.gateId === gate.id);
			if (existing) return;
			const now = Date.now();
			const item: InboxItem = {
				id: `inbox-${gate.id}`,
				projectId: this._config.id,
				kind: "gate",
				status: "open",
				severity: "warning",
				title: `Review ${gate.stage} stage`,
				summary: gate.summary.slice(0, 500),
				createdAt: gate.requestedAt,
				updatedAt: now,
				stage: gate.stage,
				gateId: gate.id,
			};
			this._inbox = {
				...this.inbox,
				items: [...this.inbox.items, item],
				updatedAt: now,
			};
			await savePaperInbox(this._projectDir, this.inbox);
			this._listeners.onInboxChanged(this.inbox, this.config);
		});
	}

	private async _resolveGateInbox(gateId: string): Promise<void> {
		await this._queueInboxMutation(async () => {
			if (!this._config) return;
			const now = Date.now();
			const items = this.inbox.items.map((item) => item.gateId === gateId ? { ...item, status: "resolved" as const, updatedAt: now } : item);
			this._inbox = { ...this.inbox, items, updatedAt: now };
			await savePaperInbox(this._projectDir, this.inbox);
			this._listeners.onInboxChanged(this.inbox, this.config);
		});
	}

	async markInboxItem(itemId: string, status: InboxItemStatus): Promise<void> {
		this._requireLoaded();
		await this._queueInboxMutation(async () => {
			if (!this.inbox.items.some((item) => item.id === itemId)) throw new Error("Inbox item was not found.");
			const now = Date.now();
			this._inbox = {
				...this.inbox,
				items: this.inbox.items.map((item) => item.id === itemId ? { ...item, status, updatedAt: now } : item),
				updatedAt: now,
			};
			await savePaperInbox(this._projectDir, this.inbox);
			this._listeners.onInboxChanged(this.inbox, this.config);
		});
	}

	/**
	 * Persist a non-gate event that needs the PI's attention. Event producers
	 * supply a request id when the source has one so repeated forwarding after
	 * a renderer reconnect does not create duplicate inbox entries.
	 */
	async recordInboxItem(input: {
		kind: InboxItemKind;
		severity: InboxItem["severity"];
		title: string;
		summary: string;
		stage?: StageId;
		requestId?: string;
		errorCode?: string;
	}): Promise<void> {
		this._requireLoaded();
		await this._queueInboxMutation(async () => {
			if (input.requestId && this.inbox.items.some((item) => item.kind === input.kind && item.requestId === input.requestId)) return;
			const now = Date.now();
			const item: InboxItem = {
				id: `inbox-${input.kind}-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
				projectId: this.config.id,
				kind: input.kind,
				status: "open",
				severity: input.severity,
				title: input.title.slice(0, 160),
				summary: input.summary.slice(0, 1000),
				createdAt: now,
				updatedAt: now,
				stage: input.stage,
				requestId: input.requestId,
				errorCode: input.errorCode,
			};
			this._inbox = {
				...this.inbox,
				items: [...this.inbox.items, item],
				updatedAt: now,
			};
			await savePaperInbox(this._projectDir, this.inbox);
			this._listeners.onInboxChanged(this.inbox, this.config);
		});
	}

	private async _queueInboxMutation(operation: () => Promise<void>): Promise<void> {
		const next = this._inboxMutation.then(operation);
		this._inboxMutation = next.catch(() => {});
		await next;
	}

	private async _persist(): Promise<void> {
		if (!this._progress) return;
		await savePaperProgress(this._projectDir, this._progress);
		this._listeners.onProgressChanged(this._progress, this.config);
	}

	private _requestStageReviewTool(): ToolDefinition<typeof requestStageReviewSchema, GateDecision> {
		return {
			name: "request_stage_review",
			label: "阶段审核",
			description:
				"声明当前 paper 阶段完成并请求用户 gate 审核。调用后用户会审核本阶段产物与质量检查,并决定:继续下一阶段 / 返工(指定阶段+原因) / 终止。不要自行宣布进入下一阶段。",
			promptSnippet:
				"完成一个 paper 阶段的全部工作后,调用 request_stage_review 声明完成、登记产物并等待用户 gate 决策。",
			promptGuidelines: [
				"只在真正完成本阶段全部工作后才调用 request_stage_review。",
				"调用 request_stage_review 后不要自行开始下一阶段工作,等待编排器加载下一阶段指引。",
			],
			parameters: requestStageReviewSchema,
			execute: async (_toolCallId, params) => {
				// The stage param is informational only; the gate always applies to the
				// current stage. Ignoring params.stage prevents the agent from
				// registering artifacts to / requesting a gate for the wrong stage (#2).
				const stage = this.progress.stage.current;
				if (isStageId(params.stage) && params.stage !== stage) {
					throw new Error(
						`request_stage_review: 参数 stage "${params.stage}" 与当前阶段 "${stage}" 不一致,只能审核当前阶段。`,
					);
				}
				const summary = typeof params.summary === "string" ? params.summary : "";
				const declared: DeclaredArtifact[] = [];
				for (const artifact of params.artifacts ?? []) {
					if (isArtifactType(artifact.type)) {
						const relations = [];
						for (const relation of artifact.relations ?? []) {
							relations.push({
								...relation,
								targetPath: relation.targetPath
									? await normalizePaperArtifactPath(this._projectDir, relation.targetPath)
									: undefined,
							});
						}
						declared.push({
							type: artifact.type,
							path: artifact.path,
							role: artifact.role,
							metadata: artifact.metadata,
							relations,
						});
					}
				}
				const decision = await this.requestReview(stage, summary, declared);
				return {
					content: [{ type: "text" as const, text: this._formatDecision(decision) }],
					details: decision,
				} satisfies AgentToolResult<GateDecision>;
			},
		};
	}

	private _formatDecision(decision: GateDecision): string {
		if (decision.decision === "continue") {
			return "GATE_PASSED: 用户审核通过本阶段。请停止当前阶段工作,不要自行开始下一阶段;编排器将加载下一阶段指引。";
		}
		if (decision.decision === "rework") {
			const target = decision.reworkTarget ? STAGE_LABELS[decision.reworkTarget] : "当前阶段";
			return `GATE_REWORK: 用户要求返工到「${target}」。原因: ${decision.reason ?? "(未说明)"}。请停止当前工作,编排器将重新加载该阶段指引。`;
		}
		return "GATE_ABORT: 用户终止了本次 paper 工作。停止所有工作。";
	}
}

/**
 * Lightweight per-stage quality checks (design §4.4). MVP only verifies that
 * the expected artifact types were declared and the summary is non-empty.
 * These are best-effort hints shown in the gate card, NOT hard pass/fail gates.
 */
function runQualityChecks(stage: StageId, artifacts: Artifact[], summary: string): QualityCheckItem[] {
	const hasType = (t: ArtifactType): boolean => artifacts.some((a) => a.type === t);
	const checks: QualityCheckItem[] = [];
	switch (stage) {
		case "literature":
			checks.push({ label: "文献池已生成", ok: hasType("literature_pool") });
			checks.push({ label: "文献综述已生成", ok: hasType("survey") });
			break;
		case "reproduction":
			checks.push({ label: "代码仓库已登记", ok: hasType("repo") });
			checks.push({ label: "复现日志已生成", ok: hasType("reproduction_log") });
			break;
		case "improvement":
			checks.push({ label: "方法描述已生成", ok: hasType("method") });
			checks.push({ label: "实验配置已生成", ok: hasType("experiment_config") });
			break;
		case "experiment":
			checks.push({ label: "实验结果已产出", ok: hasType("experiment_result") });
			checks.push({ label: "图表已生成", ok: hasType("figure") });
			break;
		case "writing":
			checks.push({ label: "论文手稿已生成", ok: hasType("paper") });
			checks.push({ label: "导出产物已生成", ok: hasType("paper_pdf") });
			break;
	}
	checks.push({ label: "工作摘要非空", ok: summary.trim().length > 0 });
	return checks;
}
