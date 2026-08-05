/**
 * Paper Store
 *
 * Paper-mode state for PiX-paper: stage progress, pending gate, artifacts.
 * Driven by the paper-state-changed / paper-gate IPC events forwarded from
 * StageEngine, plus explicit actions (start stage, respond gate, create
 * project, open artifact).
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
	Artifact,
	GateRequest,
	PaperArtifactContent,
	PaperInbox,
	PaperProjectConfig,
	PaperProgress,
	PaperStateSnapshot,
	RequestUserInputRequest,
	RespondGatePayload,
	StageId,
} from "../../shared/types";
import type { PixApi } from "../../main/preload";

export type PaperView = "dashboard" | "stage" | "gate" | "library" | "figures" | "results" | "manuscript" | "artifact" | "inbox";

function api(): PixApi {
	if (!window.pixApi) {
		throw new Error("PiX preload API is not available.");
	}
	return window.pixApi;
}

export const usePaperStore = defineStore("paper", () => {
	type PaperOperation = "startStage" | "pauseStage" | "resumeStage" | "respondGate" | "openArtifact" | "openInFolder" | "markInboxItem" | "createProject";
	const config = ref<PaperProjectConfig | null>(null);
	const progress = ref<PaperProgress | null>(null);
	const pendingGate = ref<GateRequest | null>(null);
	const inbox = ref<PaperInbox>({ version: 1, items: [], updatedAt: Date.now() });
	const isPaperMode = ref(false);
	const error = ref<string | null>(null);
	const selectedStage = ref<StageId | null>(null);
	const selectedArtifactId = ref<string | null>(null);
	const activeView = ref<PaperView>("dashboard");
	const agentLogOpen = ref(false);
	const pendingOperations = ref<Record<PaperOperation, boolean>>({
		startStage: false,
		pauseStage: false,
		resumeStage: false,
		respondGate: false,
		openArtifact: false,
		openInFolder: false,
		markInboxItem: false,
		createProject: false,
	});
	const pendingUserInput = ref<RequestUserInputRequest | null>(null);
	const userInputAnswers = ref<Record<string, string>>({});
	const currentQuestionIndex = ref(0);
	const composerDrafts = ref<Record<string, string>>({});
	/** Guards against duplicate auto-start prompts on rapid WorkspacePage remounts (#9). */
	const autoStartDone = ref(false);

	const currentStage = computed<StageId | null>(() => progress.value?.stage.current ?? null);
	const stages = computed(() => progress.value?.stage.stages ?? null);
	const artifacts = computed<Artifact[]>(() => progress.value?.artifacts ?? []);
	const topic = computed(() => config.value?.topic ?? "");
	const openInboxCount = computed(() => inbox.value.items.filter((item) => item.status !== "resolved").length);
	const currentStageState = computed(() => {
		const stage = selectedStage.value ?? currentStage.value;
		return stage ? progress.value?.stage.stages[stage] ?? null : null;
	});

	function uiStorageKey(projectId: string): string {
		return `pix-paper-ui:${projectId}`;
	}

	function loadUiState(projectId: string): void {
		try {
			const raw = localStorage.getItem(uiStorageKey(projectId));
			if (!raw) {
				selectedStage.value = progress.value?.stage.current ?? null;
				selectedArtifactId.value = null;
				activeView.value = "dashboard";
				agentLogOpen.value = false;
				composerDrafts.value = {};
				return;
			}
			const parsed = JSON.parse(raw) as {
				selectedStage?: StageId;
				selectedArtifactId?: string;
				activeView?: PaperView;
				agentLogOpen?: boolean;
				composerDrafts?: Record<string, string>;
			};
			selectedStage.value = parsed.selectedStage ?? progress.value?.stage.current ?? null;
			selectedArtifactId.value = parsed.selectedArtifactId ?? null;
			activeView.value = parsed.activeView ?? "dashboard";
			agentLogOpen.value = parsed.agentLogOpen ?? false;
			composerDrafts.value = parsed.composerDrafts ?? {};
		} catch {
			selectedStage.value = progress.value?.stage.current ?? null;
			selectedArtifactId.value = null;
			activeView.value = "dashboard";
			agentLogOpen.value = false;
			composerDrafts.value = {};
		}
	}

	function persistUiState(): void {
		const projectId = config.value?.id;
		if (!projectId) return;
		try {
			localStorage.setItem(uiStorageKey(projectId), JSON.stringify({
				selectedStage: selectedStage.value,
				selectedArtifactId: selectedArtifactId.value,
				activeView: activeView.value,
				agentLogOpen: agentLogOpen.value,
				composerDrafts: composerDrafts.value,
			}));
		} catch {
			// UI persistence is best-effort and must not block the paper runtime.
		}
	}

	function setPending(operation: PaperOperation, value: boolean): void {
		pendingOperations.value[operation] = value;
	}

	function applySnapshot(snap: PaperStateSnapshot): void {
		const projectChanged = config.value?.id !== snap.config.id;
		config.value = snap.config;
		progress.value = snap.progress;
		pendingGate.value = snap.pendingGate;
		inbox.value = snap.inbox;
		isPaperMode.value = true;
		error.value = null;
		if (projectChanged) {
			autoStartDone.value = false;
			loadUiState(snap.config.id);
		}
	}

	function clear(): void {
		config.value = null;
		progress.value = null;
		pendingGate.value = null;
		inbox.value = { version: 1, items: [], updatedAt: Date.now() };
		isPaperMode.value = false;
		error.value = null;
		selectedStage.value = null;
		selectedArtifactId.value = null;
		activeView.value = "dashboard";
		agentLogOpen.value = false;
		pendingUserInput.value = null;
		userInputAnswers.value = {};
		currentQuestionIndex.value = 0;
		composerDrafts.value = {};
		autoStartDone.value = false;
	}

	/** Pull current paper state. A failure means no active paper project. */
	async function refresh(): Promise<void> {
		try {
			const result = await api().paperGetState();
			if (result.success && result.data) {
				applySnapshot(result.data);
			} else {
				clear();
			}
		} catch {
			clear();
		}
	}

	async function startStage(stage: StageId): Promise<void> {
		setPending("startStage", true);
		try {
			const result = await api().paperStartStage({ stage });
			if (!result.success) error.value = result.error ?? "Failed to start stage";
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to start stage";
		} finally {
			setPending("startStage", false);
		}
	}

	async function pauseStage(stage: StageId, reason?: string): Promise<void> {
		setPending("pauseStage", true);
		try {
			const result = await api().paperPauseStage({ stage, reason });
			if (!result.success) error.value = result.error ?? "Failed to pause stage";
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to pause stage";
		} finally {
			setPending("pauseStage", false);
		}
	}

	async function resumeStage(stage: StageId): Promise<void> {
		setPending("resumeStage", true);
		try {
			const result = await api().paperResumeStage({ stage });
			if (!result.success) error.value = result.error ?? "Failed to resume stage";
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to resume stage";
		} finally {
			setPending("resumeStage", false);
		}
	}

	async function respondGate(payload: RespondGatePayload): Promise<void> {
		setPending("respondGate", true);
		try {
			const result = await api().paperRespondGate(payload);
			if (!result.success) {
				await refresh();
				error.value = result.error ?? "Failed to respond gate";
			} else {
				// The main process persists the decision before returning. Pulling a
				// snapshot here makes restored and live gates converge immediately,
				// even when the event arrives after the IPC response.
				await refresh();
			}
		} catch (err) {
			await refresh();
			error.value = err instanceof Error ? err.message : "Failed to respond gate";
		} finally {
			setPending("respondGate", false);
		}
	}

	async function openArtifact(pathOrId: string): Promise<void> {
		setPending("openArtifact", true);
		try {
			const result = await api().paperOpenArtifact(
				artifacts.value.some((artifact) => artifact.id === pathOrId) ? { artifactId: pathOrId } : { path: pathOrId },
			);
			if (!result.success) error.value = result.error ?? "Failed to open artifact";
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to open artifact";
		} finally {
			setPending("openArtifact", false);
		}
	}

	async function readArtifact(artifactId: string, revisionId?: string): Promise<PaperArtifactContent> {
		const result = await api().paperReadArtifact({ artifactId, revisionId });
		if (!result.success || !result.data) throw new Error(result.error ?? "Failed to read artifact");
		return result.data;
	}

	async function openInFolder(pathOrId: string): Promise<void> {
		setPending("openInFolder", true);
		try {
			const result = await api().paperOpenInFolder(
				artifacts.value.some((artifact) => artifact.id === pathOrId) ? { artifactId: pathOrId } : { path: pathOrId },
			);
			if (!result.success) error.value = result.error ?? "Failed to open artifact folder";
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to open artifact folder";
		} finally {
			setPending("openInFolder", false);
		}
	}

	async function markInboxItem(itemId: string, status: "open" | "read" | "resolved"): Promise<void> {
		setPending("markInboxItem", true);
		try {
			const result = await api().paperMarkInboxItem({ itemId, status });
			if (!result.success) error.value = result.error ?? "Failed to update inbox item";
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to update inbox item";
		} finally {
			setPending("markInboxItem", false);
		}
	}

	async function createProject(payload: {
		projectDir: string;
		name: string;
		topic: string;
	}): Promise<boolean> {
		setPending("createProject", true);
		try {
			const result = await api().paperCreateProject(payload);
			if (!result.success) error.value = result.error ?? "Failed to create paper project";
			return result.success;
		} catch (err) {
			error.value = err instanceof Error ? err.message : "Failed to create paper project";
			return false;
		} finally {
			setPending("createProject", false);
		}
	}

	function selectStage(stage: StageId | null): void {
		selectedStage.value = stage;
		persistUiState();
	}

	function selectArtifact(artifactId: string | null): void {
		selectedArtifactId.value = artifactId;
		persistUiState();
	}

	function setView(view: PaperView): void {
		activeView.value = view;
		persistUiState();
	}

	function setAgentLogOpen(open: boolean): void {
		agentLogOpen.value = open;
		persistUiState();
	}

	function setPendingUserInput(request: RequestUserInputRequest | null): void {
		pendingUserInput.value = request;
		if (!request) {
			userInputAnswers.value = {};
			currentQuestionIndex.value = 0;
		}
	}

	function setUserInputAnswers(answers: Record<string, string>): void {
		userInputAnswers.value = answers;
	}

	function setCurrentQuestionIndex(index: number): void {
		currentQuestionIndex.value = index;
	}

	function draftKey(stage: StageId | null = selectedStage.value): string {
		return stage ?? "project";
	}

	function getComposerDraft(stage?: StageId | null): string {
		return composerDrafts.value[draftKey(stage)] ?? "";
	}

	function setComposerDraft(value: string, stage?: StageId | null): void {
		composerDrafts.value[draftKey(stage)] = value;
		persistUiState();
	}

	function clearComposerDraft(stage?: StageId | null): void {
		delete composerDrafts.value[draftKey(stage)];
		persistUiState();
	}

	function artifactsOf(stage: StageId): Artifact[] {
		const ids = new Set(progress.value?.stage.stages[stage]?.artifacts ?? []);
		return artifacts.value.filter((artifact) => ids.has(artifact.id));
	}

	return {
		config,
		progress,
		pendingGate,
		inbox,
		isPaperMode,
		error,
		selectedStage,
		selectedArtifactId,
		activeView,
		agentLogOpen,
		pendingOperations,
		pendingUserInput,
		userInputAnswers,
		currentQuestionIndex,
		autoStartDone,
		currentStage,
		stages,
		artifacts,
		topic,
		openInboxCount,
		currentStageState,
		applySnapshot,
		refresh,
		clear,
		startStage,
		pauseStage,
		resumeStage,
		respondGate,
		openArtifact,
		readArtifact,
		openInFolder,
		markInboxItem,
		createProject,
		artifactsOf,
		selectStage,
		selectArtifact,
		setView,
		setAgentLogOpen,
		setPendingUserInput,
		setUserInputAnswers,
		setCurrentQuestionIndex,
		getComposerDraft,
		setComposerDraft,
		clearComposerDraft,
	};
});
