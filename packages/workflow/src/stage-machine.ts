/**
 * Paper stage state machine (design §4.1).
 *
 * Pure functions over PaperProgress: no I/O, no Electron, no pi dependencies.
 * The Electron main process owns persistence (.pp/progress.json) and applies
 * these transitions; keeping them pure makes the orchestration logic testable.
 */

import {
	type Artifact,
	type ArtifactCreator,
	type ArtifactRelation,
	type ArtifactRelationKind,
	type ArtifactRevision,
	type ArtifactType,
	type GateDecision,
	type GateRequest,
	type PaperProgress,
	PAPER_PROGRESS_VERSION,
	STAGE_IDS,
	type StageId,
	type StageActivity,
	type StageActivityKind,
	type StageRun,
	type StageProgress,
	type StageState,
	type StageStatus,
	type QualityCheckItem,
	isArtifactType,
	isStageId,
} from "./types.ts";

export const STAGE_LABELS: Record<StageId, string> = {
	literature: "文献调研",
	reproduction: "代码复现",
	improvement: "方法改进",
	experiment: "实验执行",
	writing: "论文撰写",
};

const MAX_ACTIVITIES = 200;

function createId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendActivity(progress: PaperProgress, activity: StageActivity): PaperProgress {
	const activities = [...(progress.activities ?? []), activity];
	return { ...progress, activities: activities.slice(-MAX_ACTIVITIES) };
}

function updateRun(progress: PaperProgress, runId: string | undefined, patch: Partial<StageRun>): PaperProgress {
	if (!runId) return progress;
	return {
		...progress,
		stageRuns: (progress.stageRuns ?? []).map((run) => (run.id === runId ? { ...run, ...patch } : run)),
	};
}

function currentRun(progress: PaperProgress, stage: StageId): StageRun | undefined {
	const runId = progress.stage.stages[stage]?.runId;
	return (progress.stageRuns ?? []).find((run) => run.id === runId);
}

function currentStageArtifactIds(progress: PaperProgress, stage: StageId): string[] {
	return progress.stage.stages[stage]?.artifacts ?? [];
}

export function getNextStage(stage: StageId): StageId | null {
	const index = STAGE_IDS.indexOf(stage);
	return index >= 0 && index < STAGE_IDS.length - 1 ? STAGE_IDS[index + 1] : null;
}

export function createInitialProgress(): PaperProgress {
	const stages = {} as Record<StageId, StageState>;
	for (const id of STAGE_IDS) {
		stages[id] = { status: "pending", artifacts: [] };
	}
	return {
		version: PAPER_PROGRESS_VERSION,
		stage: { current: "literature", stages },
		artifacts: [],
		artifactRevisions: [],
		stageRuns: [],
		activities: [],
		updatedAt: Date.now(),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStageStatus(value: unknown): value is StageStatus {
	return value === "pending" || value === "running" || value === "paused" || value === "awaiting_gate" ||
		value === "passed" || value === "failed" || value === "rework";
}

function isArtifactRelationKind(value: unknown): value is ArtifactRelationKind {
	return value === "cites" || value === "illustrates" || value === "derived_from" || value === "supports";
}

function parseArtifact(value: unknown): Artifact | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.projectId !== "string" ||
		!isArtifactType(value.type) ||
		typeof value.path !== "string" ||
		!isStageId(value.stage) ||
		(value.createdBy !== "user" && value.createdBy !== "agent" && value.createdBy !== "tool") ||
		typeof value.createdAt !== "number"
	) {
		return null;
	}
	return {
		id: value.id,
		projectId: value.projectId,
		type: value.type,
		path: value.path,
		stage: value.stage,
		createdBy: value.createdBy,
		createdAt: value.createdAt,
		role: value.role === "primary" || value.role === "supporting" ? value.role : undefined,
		latestRevisionId: typeof value.latestRevisionId === "string" ? value.latestRevisionId : undefined,
		relations: Array.isArray(value.relations) ? value.relations.filter(isRecord).map((relation) => ({
			kind: isArtifactRelationKind(relation.kind) ? relation.kind : "supports",
			targetArtifactId: typeof relation.targetArtifactId === "string" ? relation.targetArtifactId : undefined,
			targetPath: typeof relation.targetPath === "string" ? relation.targetPath : undefined,
			label: typeof relation.label === "string" ? relation.label : undefined,
		})) : undefined,
		metadata: isRecord(value.metadata) ? value.metadata : undefined,
	};
}

function parseArtifactRevision(value: unknown): ArtifactRevision | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.artifactId !== "string" ||
		typeof value.revision !== "number" ||
		typeof value.path !== "string" ||
		typeof value.createdAt !== "number" ||
		typeof value.available !== "boolean"
	) {
		return null;
	}
	return {
		id: value.id,
		artifactId: value.artifactId,
		revision: value.revision,
		path: value.path,
		createdAt: value.createdAt,
		hash: typeof value.hash === "string" ? value.hash : undefined,
		byteSize: typeof value.byteSize === "number" ? value.byteSize : undefined,
		mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
		snapshotPath: typeof value.snapshotPath === "string" ? value.snapshotPath : undefined,
		available: value.available,
		error: typeof value.error === "string" ? value.error : undefined,
	};
}

function isStageActivityKind(value: unknown): value is StageActivityKind {
	return value === "started" || value === "resumed" || value === "paused" || value === "artifact" ||
		value === "gate_requested" || value === "gate_decided" || value === "error";
}

function parseStageRun(value: unknown): StageRun | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		!isStageId(value.stage) ||
		typeof value.startedAt !== "number" ||
		typeof value.lastActivityAt !== "number" ||
		!isStageStatus(value.status) ||
		value.status === "pending" ||
		!Array.isArray(value.artifactIds)
	) return null;
	const usage = isRecord(value.usage) &&
		typeof value.usage.inputTokens === "number" &&
		typeof value.usage.outputTokens === "number" &&
		typeof value.usage.cacheReadTokens === "number" &&
		typeof value.usage.cacheWriteTokens === "number" &&
		typeof value.usage.cost === "number"
		? {
			inputTokens: value.usage.inputTokens,
			outputTokens: value.usage.outputTokens,
			cacheReadTokens: value.usage.cacheReadTokens,
			cacheWriteTokens: value.usage.cacheWriteTokens,
			cost: value.usage.cost,
		}
		: undefined;
	return {
		id: value.id,
		stage: value.stage,
		sessionFile: typeof value.sessionFile === "string" ? value.sessionFile : undefined,
		startedAt: value.startedAt,
		finishedAt: typeof value.finishedAt === "number" ? value.finishedAt : undefined,
		status: value.status,
		lastActivityAt: value.lastActivityAt,
		artifactIds: value.artifactIds.filter((id): id is string => typeof id === "string"),
		gateId: typeof value.gateId === "string" ? value.gateId : undefined,
		summary: typeof value.summary === "string" ? value.summary : undefined,
		usage,
	};
}

function parseStageActivity(value: unknown): StageActivity | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		!isStageId(value.stage) ||
		!isStageActivityKind(value.kind) ||
		typeof value.at !== "number" ||
		typeof value.message !== "string"
	) return null;
	return {
		id: value.id,
		stage: value.stage,
		kind: value.kind,
		at: value.at,
		message: value.message,
		artifactIds: Array.isArray(value.artifactIds)
			? value.artifactIds.filter((id): id is string => typeof id === "string")
			: undefined,
		gateId: typeof value.gateId === "string" ? value.gateId : undefined,
	};
}

function parseQualityCheck(value: unknown): QualityCheckItem | null {
	if (!isRecord(value) || typeof value.label !== "string" || typeof value.ok !== "boolean") return null;
	return {
		label: value.label,
		ok: value.ok,
		detail: typeof value.detail === "string" ? value.detail : undefined,
	};
}

function parseGateRequest(value: unknown): GateRequest | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		!isStageId(value.stage) ||
		typeof value.summary !== "string" ||
		!Array.isArray(value.artifacts) ||
		typeof value.requestedAt !== "number"
	) return null;
	const artifacts = value.artifacts.map(parseArtifact).filter((artifact): artifact is Artifact => artifact !== null);
	const checks = Array.isArray(value.checks)
		? value.checks.map(parseQualityCheck).filter((check): check is QualityCheckItem => check !== null)
		: [];
	return {
		id: value.id,
		stage: value.stage,
		summary: value.summary,
		artifacts,
		primaryArtifactId: typeof value.primaryArtifactId === "string" ? value.primaryArtifactId : undefined,
		checks,
		requestedAt: value.requestedAt,
	};
}

/** Convert v1 or partially written manifests into the current state shape. */
export function migratePaperProgress(input: unknown): PaperProgress {
	const initial = createInitialProgress();
	if (!isRecord(input)) return initial;
	const inputStage = isRecord(input.stage) ? input.stage : undefined;
	const inputStages = inputStage && isRecord(inputStage.stages) ? inputStage.stages : undefined;
	const stages = { ...initial.stage.stages };
	for (const stage of STAGE_IDS) {
		const value = inputStages?.[stage];
		if (!isRecord(value)) continue;
		const status = isStageStatus(value.status) ? value.status : stages[stage].status;
		stages[stage] = {
			...stages[stage],
			status,
			artifacts: Array.isArray(value.artifacts) ? value.artifacts.filter((id): id is string => typeof id === "string") : [],
			sessionFile: typeof value.sessionFile === "string" ? value.sessionFile : undefined,
			gateDecision: value.gateDecision === "continue" || value.gateDecision === "rework" || value.gateDecision === "abort"
				? value.gateDecision
				: undefined,
			reworkTarget: isStageId(value.reworkTarget) ? value.reworkTarget : undefined,
			runId: typeof value.runId === "string" ? value.runId : undefined,
			startedAt: typeof value.startedAt === "number" ? value.startedAt : undefined,
			finishedAt: typeof value.finishedAt === "number" ? value.finishedAt : undefined,
			pausedAt: typeof value.pausedAt === "number" ? value.pausedAt : undefined,
			lastActivityAt: typeof value.lastActivityAt === "number" ? value.lastActivityAt : undefined,
		};
	}
	const artifacts = Array.isArray(input.artifacts)
		? input.artifacts.map(parseArtifact).filter((artifact): artifact is Artifact => artifact !== null)
		: [];
	const artifactRevisions = Array.isArray(input.artifactRevisions)
		? input.artifactRevisions.map(parseArtifactRevision).filter((revision): revision is ArtifactRevision => revision !== null)
		: [];
	return {
		version: PAPER_PROGRESS_VERSION,
		stage: {
			current: isStageId(inputStage?.current) ? inputStage.current : initial.stage.current,
			stages,
		},
		artifacts,
		artifactRevisions,
		stageRuns: Array.isArray(input.stageRuns)
			? input.stageRuns.map(parseStageRun).filter((run): run is StageRun => run !== null)
			: [],
		activities: Array.isArray(input.activities)
			? input.activities.map(parseStageActivity).filter((activity): activity is StageActivity => activity !== null)
			: [],
		pendingGate: parseGateRequest(input.pendingGate) ?? undefined,
		updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : initial.updatedAt,
	};
}

function touch(progress: PaperProgress): PaperProgress {
	return { ...progress, updatedAt: Date.now() };
}

function withStage(progress: PaperProgress, stage: StageId, patch: Partial<StageState>): PaperProgress {
	return {
		...progress,
		stage: {
			...progress.stage,
			stages: {
				...progress.stage.stages,
				[stage]: { ...progress.stage.stages[stage], ...patch },
			},
		},
	};
}

/** Mark a stage as the current running stage. */
export function startStage(progress: PaperProgress, stage: StageId, sessionFile?: string): PaperProgress {
	const existingState = progress.stage.stages[stage];
	if (existingState.status === "running" && existingState.runId) return progress;
	const startedAt = Date.now();
	const runId = createId("run");
	const nextStage = withStage(progress, stage, {
		status: "running",
		startedAt,
		finishedAt: undefined,
		pausedAt: undefined,
		lastActivityAt: startedAt,
		runId,
		sessionFile: sessionFile ?? progress.stage.stages[stage].sessionFile,
	});
	const run: StageRun = {
		id: runId,
		stage,
		sessionFile: sessionFile ?? progress.stage.stages[stage].sessionFile,
		startedAt,
		status: "running",
		lastActivityAt: startedAt,
		artifactIds: [],
	};
	const withRun = { ...nextStage, stageRuns: [...(nextStage.stageRuns ?? []), run] };
	return touch(
		appendActivity(withRun, {
			id: createId("activity"),
			stage,
			kind: "started",
			at: startedAt,
			message: `Stage ${stage} started`,
		}),
	);
}

export interface DeclaredArtifact {
	type: ArtifactType;
	path: string;
	role?: "primary" | "supporting";
	metadata?: Record<string, unknown>;
	relations?: ArtifactRelation[];
}

function sameArtifactRelation(left: ArtifactRelation, right: ArtifactRelation): boolean {
	return left.kind === right.kind &&
		left.targetArtifactId === right.targetArtifactId &&
		left.targetPath === right.targetPath &&
		left.label === right.label;
}

/** Register logical artifacts and append a new revision for each declaration. */
export function registerArtifacts(
	progress: PaperProgress,
	projectId: string,
	stage: StageId,
	declared: DeclaredArtifact[],
	createdBy: ArtifactCreator = "agent",
): PaperProgress {
	let next = progress;
	for (const item of declared) {
		const existing = next.artifacts.find((a) => a.type === item.type && a.path === item.path);
		const artifact: Artifact = existing ?? {
			id: createId("artifact"),
			projectId,
			type: item.type,
			path: item.path,
			stage,
			createdBy,
			createdAt: Date.now(),
			role: item.role,
			metadata: item.metadata,
		};
		const revisionNumber = (next.artifactRevisions ?? []).filter((revision) => revision.artifactId === artifact.id).length + 1;
		const revision: ArtifactRevision = {
			id: createId("revision"),
			artifactId: artifact.id,
			revision: revisionNumber,
			path: item.path,
			createdAt: Date.now(),
			available: false,
		};
		const updatedArtifact: Artifact = {
			...artifact,
			stage,
			role: item.role ?? artifact.role,
			latestRevisionId: revision.id,
			metadata: item.metadata ?? artifact.metadata,
			relations: item.relations?.length
				? [...(artifact.relations ?? []), ...item.relations].filter((relation, index, relations) =>
					relations.findIndex((candidate) => sameArtifactRelation(candidate, relation)) === index,
				)
				: artifact.relations,
		};
		next = {
			...next,
			artifacts: existing
				? next.artifacts.map((candidate) => (candidate.id === artifact.id ? updatedArtifact : candidate))
				: [...next.artifacts, updatedArtifact],
			artifactRevisions: [...(next.artifactRevisions ?? []), revision],
		};
		const stageArtifacts = currentStageArtifactIds(next, stage);
		if (!stageArtifacts.includes(artifact.id)) {
			next = withStage(next, stage, { artifacts: [...stageArtifacts, artifact.id] });
		}
		const run = currentRun(next, stage);
		if (run && !run.artifactIds.includes(artifact.id)) {
			next = updateRun(next, run.id, { artifactIds: [...run.artifactIds, artifact.id], lastActivityAt: Date.now() });
		}
		next = appendActivity(next, {
			id: createId("activity"),
			stage,
			kind: "artifact",
			at: Date.now(),
			message: `Artifact registered: ${item.path}`,
			artifactIds: [artifact.id],
		});
	}
	return touch(next);
}

/** Move a stage into awaiting_gate and persist the gate payload for UI re-rendering. */
export function requestGate(progress: PaperProgress, gate: GateRequest): PaperProgress {
	const requestedAt = gate.requestedAt;
	let next = withStage(progress, gate.stage, {
		status: "awaiting_gate",
		lastActivityAt: requestedAt,
	});
	const run = currentRun(next, gate.stage);
	if (run) {
		next = updateRun(next, run.id, {
			status: "awaiting_gate",
			lastActivityAt: requestedAt,
			gateId: gate.id,
			summary: gate.summary,
		});
	}
	next = { ...next, pendingGate: gate };
	return touch(
		appendActivity(next, {
			id: createId("activity"),
			stage: gate.stage,
			kind: "gate_requested",
			at: requestedAt,
			message: "Stage is ready for review",
			artifactIds: gate.artifacts.map((artifact) => artifact.id),
			gateId: gate.id,
		}),
	);
}

export type GateOutcome =
	| { action: "advance"; nextStage: StageId }
	| { action: "complete" }
	| { action: "rework"; target: StageId }
	| { action: "abort" };

/**
 * Apply a human gate decision (design §4.2):
 * - continue: stage passed; advance to the next stage (or complete after writing).
 * - rework: roll back to an earlier (or the same) stage; later stages reset to pending.
 * - abort: stage failed; progress halted.
 */
export function applyGateDecision(progress: PaperProgress, decision: GateDecision): { progress: PaperProgress; outcome: GateOutcome } {
	const gate = progress.pendingGate;
	const stage = gate?.stage ?? progress.stage.current;
	const decidedAt = Date.now();
	let next: PaperProgress = { ...progress, pendingGate: undefined };
	const run = currentRun(next, stage);

	const recordDecision = (status: Exclude<StageStatus, "pending">): void => {
		next = withStage(next, stage, {
			status,
			gateDecision: decision.decision,
			finishedAt: status === "rework" ? decidedAt : decidedAt,
			lastActivityAt: decidedAt,
		});
		if (run) {
			next = updateRun(next, run.id, {
				status,
				finishedAt: decidedAt,
				lastActivityAt: decidedAt,
			});
		}
		next = appendActivity(next, {
			id: createId("activity"),
			stage,
			kind: "gate_decided",
			at: decidedAt,
			message: `Gate decision: ${decision.decision}`,
			gateId: gate?.id,
		});
	};

	if (decision.decision === "continue") {
		recordDecision("passed");
		const nextStage = getNextStage(stage);
		if (!nextStage) {
			return { progress: touch(next), outcome: { action: "complete" } };
		}
		next = { ...next, stage: { ...next.stage, current: nextStage } };
		return { progress: touch(next), outcome: { action: "advance", nextStage } };
	}

	if (decision.decision === "rework") {
		// Rework may only target the current stage or an earlier one (design §4.1).
		// A target past the current stage is nonsensical (you don't rework forward);
		// fall back to the current stage so a bad IPC payload can't corrupt state.
		const requested = decision.reworkTarget && isStageId(decision.reworkTarget) ? decision.reworkTarget : stage;
		const target = STAGE_IDS.indexOf(requested) <= STAGE_IDS.indexOf(stage) ? requested : stage;
		recordDecision("rework");
	next = withStage(next, stage, { reworkTarget: target });
		// Reset the target and everything after it, retaining artifact history.
		const targetIndex = STAGE_IDS.indexOf(target);
		for (let i = targetIndex; i < STAGE_IDS.length; i++) {
			const id = STAGE_IDS[i];
			if (i !== targetIndex) {
				next = withStage(next, id, {
					status: "pending",
					artifacts: next.stage.stages[id].artifacts,
					runId: undefined,
					startedAt: undefined,
					finishedAt: undefined,
					pausedAt: undefined,
					lastActivityAt: undefined,
					gateDecision: undefined,
					reworkTarget: undefined,
				});
			}
		}
		next = { ...next, stage: { ...next.stage, current: target } };
		next = startStage(next, target, next.stage.stages[target].sessionFile);
		return { progress: touch(next), outcome: { action: "rework", target } };
	}

	recordDecision("failed");
	return { progress: touch(next), outcome: { action: "abort" } };
}

export function pauseStage(progress: PaperProgress, stage: StageId, reason?: string): PaperProgress {
	const pausedAt = Date.now();
	const state = progress.stage.stages[stage];
	if (state.status !== "running") return progress;
	let next = withStage(progress, stage, {
		status: "paused",
		pausedAt,
		lastActivityAt: pausedAt,
	});
	const run = currentRun(next, stage);
	if (run) next = updateRun(next, run.id, { status: "paused", lastActivityAt: pausedAt });
	return touch(
		appendActivity(next, {
			id: createId("activity"),
			stage,
			kind: "paused",
			at: pausedAt,
			message: reason?.trim() || "Stage paused",
		}),
	);
}

export function resumeStage(progress: PaperProgress, stage: StageId): PaperProgress {
	const resumedAt = Date.now();
	const state = progress.stage.stages[stage];
	if (state.status !== "paused") return progress;
	let next = withStage(progress, stage, {
		status: "running",
		pausedAt: undefined,
		lastActivityAt: resumedAt,
	});
	const run = currentRun(next, stage);
	if (run) next = updateRun(next, run.id, { status: "running", lastActivityAt: resumedAt });
	return touch(
		appendActivity(next, {
			id: createId("activity"),
			stage,
			kind: "resumed",
			at: resumedAt,
			message: "Stage resumed",
		}),
	);
}

/** Preserve a persisted gate so the renderer can recover and resolve it after restart. */
export function resetAwaitingGate(progress: PaperProgress): PaperProgress {
	return progress;
}

export function getStageArtifacts(progress: PaperProgress, stage: StageId): Artifact[] {
	const ids = new Set(progress.stage.stages[stage].artifacts);
	return progress.artifacts.filter((a) => ids.has(a.id));
}

/** Hard constraint (design §1.1): writing may not start until experiment passed. */
export function canStartStage(progress: PaperProgress, stage: StageId): { ok: boolean; reason?: string } {
	const index = STAGE_IDS.indexOf(stage);
	if (index === 0) return { ok: true };
	const previous = STAGE_IDS[index - 1];
	if (progress.stage.stages[previous].status !== "passed") {
		return { ok: false, reason: `Previous stage "${previous}" has not passed its gate.` };
	}
	return { ok: true };
}
