<script setup lang="ts">
/**
 * Workspace Page
 *
 * Three-panel layout:
 * - Left: session navigation
 * - Center: session content + composer
 * - Right: inspector (status, tokens, errors)
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../stores/session-store";
import { useRpc } from "../composables/useRpc";
import { useProjectStore } from "../stores/project-store";
import { useAuthStore } from "../stores/auth-store";
import { usePaperStore } from "../stores/paper-store";
import AppLayout from "../components/layout/AppLayout.vue";
import LeftPanel from "../components/layout/LeftPanel.vue";
import CenterPanel from "../components/layout/CenterPanel.vue";
import RightPanel from "../components/layout/RightPanel.vue";
import PaperWorkspace from "../components/paper/PaperWorkspace.vue";
import PaperRuntimePanel from "../components/paper/PaperRuntimePanel.vue";
import type { AgentMessage, RequestUserInputRequest } from "@/types/rpc";
import type { StageId } from "../shared/types";

const router = useRouter();
const sessionStore = useSessionStore();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const rpc = useRpc();
const showRuntimePanel = ref(false);
const paperStore = usePaperStore();
let unsubscribeEvent: (() => void) | null = null;
let unsubscribeUserInput: (() => void) | null = null;
let unsubscribePaperState: (() => void) | null = null;
let unsubscribePaperGate: (() => void) | null = null;
let unsubscribePaperInbox: (() => void) | null = null;
const pendingUserInput = computed<RequestUserInputRequest | null>({
  get: () => paperStore.pendingUserInput,
  set: (value) => paperStore.setPendingUserInput(value),
});
const userInputAnswers = computed<Record<string, string>>({
  get: () => paperStore.userInputAnswers,
  set: (value) => paperStore.setUserInputAnswers(value),
});
const currentQuestionIndex = computed<number>({
  get: () => paperStore.currentQuestionIndex,
  set: (value) => paperStore.setCurrentQuestionIndex(value),
});
const currentAnswer = computed<string>({
  get: () => {
    const question = pendingUserInput.value?.questions[currentQuestionIndex.value];
    return question ? userInputAnswers.value[question.id] ?? "" : "";
  },
  set: (value) => {
    const question = pendingUserInput.value?.questions[currentQuestionIndex.value];
    if (!question) return;
    userInputAnswers.value = { ...userInputAnswers.value, [question.id]: value };
  },
});

const currentQuestion = computed(() => {
  const req = pendingUserInput.value;
  if (!req || currentQuestionIndex.value >= req.questions.length) return null;
  return req.questions[currentQuestionIndex.value];
});

const totalQuestions = computed(() => pendingUserInput.value?.questions.length ?? 0);

const answeredSummary = computed(() => {
  const req = pendingUserInput.value;
  if (!req) return [];
  return req.questions.map((q, i) => ({
    field: q.header,
    value: userInputAnswers.value[q.id] || "",
    checked: !!userInputAnswers.value[q.id]?.trim(),
    index: i,
  }));
});

function openUserInputRequest(request: RequestUserInputRequest): void {
  pendingUserInput.value = request;
  currentQuestionIndex.value = 0;
  const next: Record<string, string> = {};
  for (const question of request.questions) {
    next[question.id] = "";
  }
  userInputAnswers.value = next;
  currentAnswer.value = "";
}

async function respondUserInput(cancelled = false): Promise<void> {
	const request = pendingUserInput.value;
	if (!request) return;
	const inboxItem = paperStore.inbox.items.find((item) => item.requestId === request.id && item.status !== "resolved");
	const response = {
		id: request.id,
		answers: { ...userInputAnswers.value },
		cancelled,
	};
	try {
		const result = await window.pixApi.sendCommand({ type: "respond_user_input", response });
		if (!result.success) throw new Error(result.error ?? "无法提交澄清回答");
		if (pendingUserInput.value?.id === request.id) {
			pendingUserInput.value = null;
			userInputAnswers.value = {};
			currentQuestionIndex.value = 0;
			currentAnswer.value = "";
		}
		if (inboxItem) void paperStore.markInboxItem(inboxItem.id, "resolved");
	} catch (err) {
		paperStore.error = err instanceof Error ? err.message : "无法提交澄清回答";
	}
}

function advanceToNextQuestion(): void {
  const question = currentQuestion.value;
  if (!question) return;
  userInputAnswers.value[question.id] = currentAnswer.value.trim();
  currentAnswer.value = "";
  if (currentQuestionIndex.value < totalQuestions.value - 1) {
    currentQuestionIndex.value++;
    const nextQ = pendingUserInput.value!.questions[currentQuestionIndex.value];
    currentAnswer.value = userInputAnswers.value[nextQ.id] || "";
  } else {
    void respondUserInput(false);
  }
}

function jumpToQuestion(index: number): void {
  const curQ = currentQuestion.value;
  if (curQ) {
    userInputAnswers.value[curQ.id] = currentAnswer.value.trim();
  }
  currentQuestionIndex.value = index;
  const targetQ = pendingUserInput.value!.questions[index];
  currentAnswer.value = userInputAnswers.value[targetQ.id] || "";
}

function cancelClarification(): void {
  void respondUserInput(true);
}

async function handleGateDecide(payload: {
  decision: "rework" | "continue" | "abort";
  reworkTarget?: StageId;
  reason?: string;
}): Promise<void> {
	await paperStore.respondGate(payload);
	if (!paperStore.pendingGate && paperStore.currentStage) {
		paperStore.selectStage(paperStore.currentStage);
		paperStore.setView("stage");
		await router.push(`/workspace/stage/${paperStore.currentStage}`);
	}
}

function handleStageSelect(stage: StageId): void {
  paperStore.selectStage(paperStore.selectedStage === stage ? null : stage);
}

const paperArtifacts = computed(() =>
  paperStore.selectedStage ? paperStore.artifactsOf(paperStore.selectedStage) : paperStore.artifacts,
);

async function syncWorkspaceState(options: { loadMessagesIfEmpty?: boolean } = {}): Promise<void> {
  await rpc.refreshState();
  await rpc.refreshModels();
  await rpc.refreshSessionStats();
  await projectStore.listSessions();
  projectStore.syncCurrentSession(
    rpc.sessionState.value?.sessionFile,
    rpc.sessionState.value?.sessionId
  );

  if (options.loadMessagesIfEmpty && sessionStore.displayBlocks.length === 0) {
    const messages = await rpc.getMessages();
    if (Array.isArray(messages) && messages.length > 0) {
      sessionStore.loadMessages(messages as AgentMessage[]);
    }
  }
}

onMounted(async () => {
  if (!rpc.isConnected.value) {
    const attached = await rpc.attachToRunningSession();
    if (!attached) {
      router.push("/");
      return;
    }
  }

  // Fetch provider auth status so the model selector shows correct badges.
  try { await authStore.refreshStatus(); } catch { /* non-fatal */ }

  await syncWorkspaceState({ loadMessagesIfEmpty: true });

  unsubscribeEvent = window.pixApi.onPiEvent((event) => {
    sessionStore.addEvent(event);
    const shouldRefreshSessions =
      event.type === "agent_start" ||
      event.type === "agent_end" ||
      event.type === "session_info_changed" ||
      (event.type === "message_end" && event.message.role === "user");
    if (shouldRefreshSessions) {
      void syncWorkspaceState();
    }
  });

  unsubscribeUserInput = window.pixApi.onUserInputRequest((request) => {
    if (pendingUserInput.value) {
      void respondUserInput(true);
    }
    openUserInputRequest(request);
  });

  unsubscribePaperState = window.pixApi.onPaperStateChanged((event) => {
    paperStore.applySnapshot(event);
    if (event.pendingGate && router.currentRoute.value.name !== "paper-gate") {
      paperStore.setView("gate");
      void router.push("/workspace/gate");
    }
  });
  // Gate requests arrive on the dedicated paper-gate channel (design §5.3);
  // it is the authoritative signal for the pending gate.
  unsubscribePaperGate = window.pixApi.onPaperGate((gate) => {
    paperStore.pendingGate = gate;
    paperStore.setView("gate");
    void router.push("/workspace/gate");
  });
  unsubscribePaperInbox = window.pixApi.onPaperInboxChanged((event) => {
    paperStore.applySnapshot(event);
  });
  await paperStore.refresh();
  if (paperStore.pendingGate && router.currentRoute.value.name !== "paper-gate") {
    paperStore.setView("gate");
    await router.push("/workspace/gate");
  }
  // Auto-start the first stage for a fresh paper project (design §1.1 全自动).
  // autoStartDone guards against duplicate prompts on rapid WorkspacePage
  // remounts while the backend has not yet flipped the stage to running (#9).
  if (paperStore.isPaperMode && !paperStore.autoStartDone) {
    const cur = paperStore.currentStage;
    const state = cur ? paperStore.stages?.[cur] : null;
    if (cur && state && state.status === "pending") {
      paperStore.autoStartDone = true;
      await paperStore.startStage(cur);
    }
  }
});

onUnmounted(() => {
  if (unsubscribeEvent) {
    unsubscribeEvent();
    unsubscribeEvent = null;
  }
  if (unsubscribeUserInput) {
    unsubscribeUserInput();
    unsubscribeUserInput = null;
  }
  if (unsubscribePaperState) {
    unsubscribePaperState();
    unsubscribePaperState = null;
  }
  if (unsubscribePaperGate) {
    unsubscribePaperGate();
    unsubscribePaperGate = null;
  }
  if (unsubscribePaperInbox) {
    unsubscribePaperInbox();
    unsubscribePaperInbox = null;
  }
});
</script>

<template>
	<PaperWorkspace
		v-if="paperStore.isPaperMode"
		:pending-user-input="pendingUserInput"
		:current-question-index="currentQuestionIndex"
		:current-answer="currentAnswer"
		:current-question="currentQuestion"
		:total-questions="totalQuestions"
		:answered-summary="answeredSummary"
		:paper-error="paperStore.error"
		:blocks="sessionStore.displayBlocks"
		@update:current-answer="currentAnswer = $event"
		@advance-question="advanceToNextQuestion"
		@jump-to-question="jumpToQuestion"
		@cancel-clarification="cancelClarification"
		@paper-gate-decide="handleGateDecide"
		@dismiss-paper-error="paperStore.error = null"
	/>
	<AppLayout v-else>
    <template #left>
      <LeftPanel />
    </template>
    <template #center>
      <CenterPanel
        :pending-user-input="pendingUserInput"
        :current-question-index="currentQuestionIndex"
        :current-answer="currentAnswer"
        :current-question="currentQuestion"
        :total-questions="totalQuestions"
        :answered-summary="answeredSummary"
        :paper-mode="paperStore.isPaperMode"
        :paper-current-stage="paperStore.currentStage"
        :paper-selected-stage="paperStore.selectedStage"
        :paper-stages="paperStore.stages"
        :paper-pending-gate="paperStore.pendingGate"
        :paper-error="paperStore.error"
        @update:current-answer="currentAnswer = $event"
        @advance-question="advanceToNextQuestion"
        @jump-to-question="jumpToQuestion"
        @cancel-clarification="cancelClarification"
        @paper-gate-decide="handleGateDecide"
        @paper-stage-select="handleStageSelect"
        @open-runtime="showRuntimePanel = true"
        @dismiss-paper-error="paperStore.error = null"
        @paper-open-artifact="paperStore.openArtifact"
      />
    </template>
    <template #right>
      <RightPanel
        :paper-mode="paperStore.isPaperMode"
        :paper-artifacts="paperArtifacts"
        @paper-open-artifact="paperStore.openArtifact"
        @paper-open-in-folder="paperStore.openInFolder"
      />
    </template>
    <template #overlay>
      <PaperRuntimePanel :open="showRuntimePanel" @close="showRuntimePanel = false" />
    </template>
	</AppLayout>
</template>


<style scoped>
</style>
