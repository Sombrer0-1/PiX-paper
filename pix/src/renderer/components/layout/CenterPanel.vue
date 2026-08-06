<script setup lang="ts">
/**
 * CenterPanel - Main workspace column
 *
 * ┌──────────────────────────────┐
 * │ TopBar (breadcrumb, status,  │
 * │   connection, session ops)   │
 * ├──────────────────────────────┤
 * │ Session content (scrollable) │
 * ├──────────────────────────────┤
 * │ Composer                     │
 * └──────────────────────────────┘
 */
import { computed, ref, watch, nextTick, onMounted } from "vue";
import { useSessionStore } from "../../stores/session-store";
import { useRpc } from "../../composables/useRpc";
import { useProjectStore } from "../../stores/project-store";
import { useCommandsStore } from "../../stores/commands-store";
import SessionView from "../session/SessionView.vue";
import RawOutputViewer from "../session/RawOutputViewer.vue";
import SessionTreeView from "../session/SessionTreeView.vue";
import ForkDialog from "../session/ForkDialog.vue";
import CommandPalette from "../input/CommandPalette.vue";
import ModelSelector from "../input/ModelSelector.vue";
import ThinkingSelector from "../input/ThinkingSelector.vue";
import ClarificationCard from "../input/ClarificationCard.vue";
import ClarificationChip from "../input/ClarificationChip.vue";
import StageProgress from "../paper/StageProgress.vue";
import GateCard from "../paper/GateCard.vue";
import { deriveSessionTitle } from "@/utils/session-title";
import { useSettingsStore } from "../../stores/settings-store";
import type { GateRequest, RequestUserInputRequest, RequestUserInputQuestion, StageId, StageState } from "@/types/rpc";

const sessionStore = useSessionStore();
const rpc = useRpc();
const projectStore = useProjectStore();
const settingsStore = useSettingsStore();
const commandsStore = useCommandsStore();

// Clarification props — driven by WorkspacePage's request_user_input handling
const props = defineProps<{
  pendingUserInput: RequestUserInputRequest | null;
  currentQuestionIndex: number;
  currentAnswer: string;
  currentQuestion: RequestUserInputQuestion | null;
  totalQuestions: number;
  answeredSummary: Array<{ field: string; value: string; checked: boolean; index: number }>;
  paperMode: boolean;
  paperCurrentStage: StageId | null;
  paperSelectedStage: StageId | null;
  paperStages: Record<StageId, StageState> | null;
  paperPendingGate: GateRequest | null;
  paperError: string | null;
}>();

const emit = defineEmits<{
  "update:currentAnswer": [value: string];
  advanceQuestion: [];
  jumpToQuestion: [index: number];
  cancelClarification: [];
  "paper-gate-decide": [payload: { decision: "rework" | "continue" | "abort"; reworkTarget?: StageId; reason?: string }];
  "paper-stage-select": [stage: StageId];
  "open-runtime": [];
  "dismiss-paper-error": [];
  "paper-open-artifact": [path: string];
}>();

type ViewMode = "session" | "raw" | "tree";
type ExecutionMode = "read-only" | "approval" | "unattended";
const viewMode = ref<ViewMode>("session");
const showExportMenu = ref(false);
const showForkDialog = ref(false);
const showExecutionModeMenu = ref(false);
const contentArea = ref<HTMLElement | null>(null);
const shouldStickToBottom = ref(true);

// Composer state
const inputText = ref("");
const searchQuery = ref("");
const showCommandPalette = ref(false);
const showModelSelector = ref(false);
const showThinkingSelector = ref(false);
const isSending = ref(false);
const feedbackOpen = ref(false);
const feedbackText = ref("");
const feedbackColor = ref<"error" | "info" | "success">("info");
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isDraggingFiles = ref(false);
const AUTO_SCROLL_THRESHOLD_PX = 48;
let programmaticScrollFrame: number | null = null;
let isProgrammaticScroll = false;

function showFeedback(text: string, color: "error" | "info" | "success" = "info"): void {
  feedbackText.value = text;
  feedbackColor.value = color;
  feedbackOpen.value = true;
}

interface ChatAttachment {
  path: string;
  name: string;
  base64?: string;
  mimeType?: string;
}

const attachments = ref<ChatAttachment[]>([]);

const projectName = computed(() => projectStore.currentProject?.name || "");
const sessionName = computed(() => {
  const explicitName = rpc.sessionState.value?.sessionName?.trim();
  if (explicitName) return explicitName;
  return deriveSessionTitle(projectStore.currentSession);
});
const canSend = computed(() =>
  (inputText.value.trim().length > 0 || attachments.value.length > 0) &&
  rpc.isConnected.value &&
  !isSending.value
);
// Mirrors CommandPalette's own results so we can detect when the open palette
// is showing nothing. The palette renders nothing when results is empty, but
// its window keydown capture listener stays mounted and swallows Enter (#C-ux-7).
const commandPaletteHasResults = computed(() => commandsStore.searchCommands(searchQuery.value).length > 0);
const isStreaming = computed(() => rpc.isStreaming.value);

const statusText = computed(() => {
  if (rpc.isStreaming.value) return "运行中";
  if (rpc.sessionState.value?.isCompacting) return "压缩中";
  return "空闲";
});

const statusClass = computed(() => {
  if (rpc.isStreaming.value) return "status-running";
  if (rpc.sessionState.value?.isCompacting) return "status-compacting";
  return "status-idle";
});

const modelDisplay = computed(() => {
  const model = rpc.sessionState.value?.model;
  return model ? `${model.provider}/${model.id}` : "未选择模型";
});

const thinkingDisplay = computed(() => {
  const labels: Record<string, string> = {
    off: "关闭",
    minimal: "极简",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "极高",
  };
  return labels[rpc.sessionState.value?.thinkingLevel || "medium"] || rpc.sessionState.value?.thinkingLevel || "中";
});

const modelButtonDisplay = computed(() => {
  const model = rpc.sessionState.value?.model;
  if (!model) return "未选择模型";
  return `${model.provider}/${model.id} · ${thinkingDisplay.value}`;
});

const currentModelInfo = computed(() => {
  const model = rpc.sessionState.value?.model;
  if (!model) return null;
  return rpc.availableModels.value.find((item) => item.provider === model.provider && item.id === model.id) ?? null;
});

const modelOnlyDisplay = computed(() => {
  const model = rpc.sessionState.value?.model;
  return model ? `${model.provider}/${model.id}` : "未选择模型";
});

const cleanThinkingDisplay = computed(() => {
  const labels: Record<string, string> = {
    off: "关闭",
    minimal: "轻量",
    low: "低",
    medium: "标准",
    high: "深入",
    xhigh: "极深",
  };
  const level = rpc.sessionState.value?.thinkingLevel || "medium";
  return labels[level] || level;
});
const thinkingButtonDisplay = computed(() => `思考 ${cleanThinkingDisplay.value}`);
const thinkingButtonDisabled = computed(() => !rpc.sessionState.value?.model);

const takeHerEyesEnabled = computed(() => settingsStore.settings.takeHerEyes?.enabled ?? false);
const takeHerEyesConfigured = computed(() =>
  takeHerEyesEnabled.value &&
  !!settingsStore.settings.takeHerEyes?.provider &&
  !!settingsStore.settings.takeHerEyes?.modelId
);
const currentModelSupportsImages = computed(() => currentModelInfo.value?.input?.includes("image") ?? false);
const imagesBlocked = computed(() => rpc.sessionState.value?.blockImages ?? false);
const eyeIndicatorVisible = computed(() => takeHerEyesEnabled.value);
const eyeIndicatorActive = computed(() => takeHerEyesConfigured.value && !currentModelSupportsImages.value && !imagesBlocked.value);
const eyeIndicatorTitle = computed(() => {
  if (!takeHerEyesConfigured.value) return "眼睛已启用，但还没有选择视觉模型";
  if (imagesBlocked.value) return "眼睛已启用，但已开启阻止图片，不会调用视觉模型";
  if (currentModelSupportsImages.value) return "眼睛已启用，但当前主模型支持图片，已自动停用";
  return "眼睛已启用：当前主模型不能看图，上传图片时会自动调用视觉模型";
});

const executionModes: Array<{ value: ExecutionMode; label: string; description: string; icon: string }> = [
  { value: "read-only", label: "只读", description: "只能读取和搜索，禁止修改文件。", icon: "mdi-eye-outline" },
  { value: "approval", label: "审批", description: "高风险操作需要确认。", icon: "mdi-shield-check-outline" },
  { value: "unattended", label: "无监管", description: "工具调用不弹出审批。", icon: "mdi-lightning-bolt-outline" },
];
const executionMode = computed<ExecutionMode>(() => rpc.sessionState.value?.executionMode ?? "approval");
const currentExecutionMode = computed(() =>
  executionModes.find((mode) => mode.value === executionMode.value) ?? executionModes[1]
);
const isSwitchingExecutionMode = ref(false);

// Auto-scroll
watch(
  () => sessionStore.displayBlocks,
  async () => {
    await nextTick();
    if (shouldStickToBottom.value) {
      scrollContentToBottom();
    }
  },
  { deep: true }
);

// Close the command palette when its query yields no matches. With zero results
// the palette renders nothing but its window keydown capture listener stays
// active and swallows Enter, so the message can't be sent. Closing it unmounts
// the palette (removing that listener), letting Enter reach the textarea (#C-ux-7).
watch(commandPaletteHasResults, (has) => {
  if (showCommandPalette.value && !has) showCommandPalette.value = false;
});

// Scroll to bottom on mount when there are existing blocks (e.g. navigating back from settings)
onMounted(async () => {
  if (sessionStore.displayBlocks.length > 0) {
    await nextTick();
    scrollContentToBottom();
  }
});

function scrollContentToBottom(): void {
  const el = contentArea.value;
  if (!el) return;
  isProgrammaticScroll = true;
  el.scrollTop = el.scrollHeight;
  if (programmaticScrollFrame !== null) cancelAnimationFrame(programmaticScrollFrame);
  programmaticScrollFrame = requestAnimationFrame(() => {
    isProgrammaticScroll = false;
    programmaticScrollFrame = null;
  });
}

function handleContentScroll(): void {
  if (isProgrammaticScroll) return;
  const el = contentArea.value;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  shouldStickToBottom.value = distance <= AUTO_SCROLL_THRESHOLD_PX;
}

// Session ops
async function setExecutionMode(mode: ExecutionMode): Promise<void> {
  if (isSwitchingExecutionMode.value) return;
  if (executionMode.value === mode) {
    showExecutionModeMenu.value = false;
    return;
  }
  isSwitchingExecutionMode.value = true;
  try {
    await rpc.setPiSetting("executionMode", mode);
    await rpc.refreshState();
  } catch (err) {
    console.error("[CenterPanel] Failed to toggle execution mode:", err);
    showFeedback(err instanceof Error ? err.message : "无法切换执行模式", "error");
  } finally {
    isSwitchingExecutionMode.value = false;
    showExecutionModeMenu.value = false;
  }
}

async function exportHtml(): Promise<void> {
  try {
    const result = await rpc.exportHtml();
    if (result) showFeedback(`会话已导出到：${result}`, "success");
  } catch (err) {
    console.error("[CenterPanel] Export HTML failed:", err);
    showFeedback(err instanceof Error ? err.message : "HTML 导出失败", "error");
  }
}

async function exportJsonl(): Promise<void> {
  try {
    const result = await rpc.exportJsonl();
    if (result) showFeedback(`会话已导出到：${result}`, "success");
  } catch (err) {
    console.error("[CenterPanel] Export JSONL failed:", err);
    showFeedback(err instanceof Error ? err.message : "JSONL 导出失败", "error");
  }
}

async function handleFork(entryId: string, label?: string): Promise<void> {
  try {
    await rpc.forkSession(entryId, "before", label);
    showForkDialog.value = false;
    sessionStore.clearSession();
    await rpc.getMessages().then((msgs: unknown) => {
      if (Array.isArray(msgs)) {
        sessionStore.loadMessages(msgs as Array<{ role: string; content: unknown }>);
      }
    });
    await rpc.refreshState();
    await projectStore.listSessions();
    projectStore.syncCurrentSession(
      rpc.sessionState.value?.sessionFile,
      rpc.sessionState.value?.sessionId
    );
  } catch (err) {
    console.error("[CenterPanel] Fork failed:", err);
    showFeedback(err instanceof Error ? err.message : "创建分支失败", "error");
  }
}

// Composer methods
function handleInput(e: Event): void {
  const target = e.target as HTMLTextAreaElement;
  inputText.value = target.value;
  void nextTick(autoResize);

  const cursorPos = target.selectionStart;
  const textBeforeCursor = target.value.slice(0, cursorPos);
  const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

  if (lastSlashIndex !== -1) {
    const charBefore = textBeforeCursor[lastSlashIndex - 1];
    if (lastSlashIndex === 0 || charBefore === " " || charBefore === "\n") {
      const query = textBeforeCursor.slice(lastSlashIndex + 1);
      if (query.length <= 20 && !query.includes(" ")) {
        searchQuery.value = query;
        showCommandPalette.value = true;
      } else {
        showCommandPalette.value = false;
      }
    } else {
      showCommandPalette.value = false;
    }
  } else {
    showCommandPalette.value = false;
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function addAttachmentPaths(paths: string[]): void {
  const existing = new Set(attachments.value.map((file) => file.path));
  const next = [...attachments.value];

  for (const path of paths) {
    const trimmed = path.trim();
    if (!trimmed || existing.has(trimmed)) continue;
    next.push({ path: trimmed, name: fileNameFromPath(trimmed) });
    existing.add(trimmed);
  }

  attachments.value = next;
}

function removeAttachment(path: string): void {
  attachments.value = attachments.value.filter((file) => file.path !== path);
}

async function pickFiles(): Promise<void> {
  try {
    const paths = await window.pixApi.selectChatFiles();
    addAttachmentPaths(paths);
    textareaRef.value?.focus();
  } catch (err) {
    console.error("[CenterPanel] Select files failed:", err);
    showFeedback(err instanceof Error ? err.message : "无法选择附件", "error");
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/xxx;base64, prefix
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addImageFiles(files: File[]): Promise<void> {
  const existing = new Set(attachments.value.map((file) => file.path));
  const next = [...attachments.value];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const key = `clipboard-${file.name}-${file.size}-${file.lastModified}`;
    if (existing.has(key)) continue;

    try {
      const base64 = await fileToBase64(file);
      next.push({
        path: key,
        name: file.name || `image.${file.type.split("/")[1] || "png"}`,
        base64,
        mimeType: file.type,
      });
      existing.add(key);
    } catch (err) {
      console.error("[CenterPanel] Failed to convert image to base64:", err);
    }
  }

  attachments.value = next;
}

function hasDraggedFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

function handleDragEnter(e: DragEvent): void {
  if (!hasDraggedFiles(e)) return;
  e.preventDefault();
  isDraggingFiles.value = true;
}

function handleDragOver(e: DragEvent): void {
  if (!hasDraggedFiles(e)) return;
  e.preventDefault();
  isDraggingFiles.value = true;
}

function handleDragLeave(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement | null;
  const related = e.relatedTarget as Node | null;
  if (!target || !related || !target.contains(related)) {
    isDraggingFiles.value = false;
  }
}

function handleDrop(e: DragEvent): void {
  if (!hasDraggedFiles(e)) return;
  e.preventDefault();
  isDraggingFiles.value = false;

  const files = Array.from(e.dataTransfer?.files ?? []);
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const nonImageFiles = files.filter((file) => !file.type.startsWith("image/"));

  // Handle non-image files via file paths
  if (nonImageFiles.length > 0) {
    const paths = nonImageFiles
      .map((file) => window.pixApi.getPathForFile(file))
      .filter((path) => path.length > 0);
    addAttachmentPaths(paths);
  }

  // Handle image files via base64
  if (imageFiles.length > 0) {
    void addImageFiles(imageFiles);
  }
}

function handlePaste(e: ClipboardEvent): void {
  const items = Array.from(e.clipboardData?.items ?? []);
  const imageItems = items.filter((item) => item.type.startsWith("image/"));

  if (imageItems.length === 0) return;

  e.preventDefault();

  const files: File[] = [];
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (file) files.push(file);
  }

  if (files.length > 0) {
    void addImageFiles(files);
  }
}

function sendErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendMessage(): Promise<void> {
  const text = inputText.value.trim();
  if (!text && attachments.value.length === 0) return;
  if (!canSend.value) return;

  isSending.value = true;
  const originalText = text;
  const originalAttachments = [...attachments.value];

  // Separate file paths and clipboard images
  const filePaths: string[] = [];
  const clipboardImages: Array<{ mimeType: string; base64: string }> = [];

  for (const attachment of attachments.value) {
    if (attachment.base64 && attachment.mimeType) {
      clipboardImages.push({ mimeType: attachment.mimeType, base64: attachment.base64 });
    } else {
      filePaths.push(attachment.path);
    }
  }

  // Clear input immediately while the request is being sent.
  inputText.value = "";
  attachments.value = [];
  if (textareaRef.value) {
    textareaRef.value.value = "";
    textareaRef.value.style.height = "auto";
  }

  const allFilePaths = filePaths.length > 0 ? filePaths : undefined;
  const allImages = clipboardImages.length > 0 ? clipboardImages : undefined;

  let optimisticBlockId: string | null = null;
  try {
    optimisticBlockId = sessionStore.appendOptimisticUserMessage(text, allFilePaths);
    const commandType = isStreaming.value ? "steer" : "prompt";
    void rpc.sendCommandAsync({ type: commandType, message: text, filePaths: allFilePaths, images: allImages }).catch((error) => {
      sessionStore.failOptimisticUserMessage(optimisticBlockId, sendErrorMessage(error));
      // Restore the draft the user just typed so a failed send isn't lossy (#6).
      inputText.value = originalText;
      attachments.value = originalAttachments;
      if (textareaRef.value) {
        textareaRef.value.value = originalText;
        void nextTick(autoResize);
      }
    });
  } catch (error) {
    sessionStore.failOptimisticUserMessage(optimisticBlockId, sendErrorMessage(error));
    inputText.value = originalText;
    attachments.value = originalAttachments;
    if (textareaRef.value) {
      textareaRef.value.value = originalText;
      void nextTick(autoResize);
    }
  } finally {
    isSending.value = false;
  }
}

async function stopAgent(): Promise<void> {
  await rpc.abort();
}

function onCommandSelected(commandName: string): void {
  if (textareaRef.value) {
    const cursorPos = textareaRef.value.selectionStart;
    const textBeforeCursor = inputText.value.slice(0, cursorPos);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");
    if (lastSlashIndex !== -1) {
      const before = inputText.value.slice(0, lastSlashIndex);
      const after = inputText.value.slice(cursorPos);
      inputText.value = before + "/" + commandName + " " + after;
      textareaRef.value.value = inputText.value;
    }
  }
  showCommandPalette.value = false;
  textareaRef.value?.focus();
}

function autoResize(): void {
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 200) + "px";
  }
}
</script>

<template>
  <div class="center-panel">
    <!-- TopBar -->
    <div class="center-topbar">
      <div class="topbar-left">
        <span class="topbar-brand">PiX-paper</span>
        <template v-if="projectName">
          <span class="topbar-sep">&rsaquo;</span>
          <span class="topbar-path">{{ projectName }}</span>
        </template>
        <template v-if="sessionName">
          <span class="topbar-sep">&rsaquo;</span>
          <span class="topbar-path">{{ sessionName }}</span>
        </template>
        <span class="status-pill" :class="statusClass">
          <span class="status-dot"></span>
          {{ statusText }}
        </span>
      </div>

      <div class="topbar-center">
        <button
          class="view-tab"
          :class="{ active: viewMode === 'session' }"
          @click="viewMode = 'session'"
        >会话</button>
        <button
          class="view-tab"
          :class="{ active: viewMode === 'tree' }"
          @click="viewMode = 'tree'"
        >树</button>
        <button
          class="view-tab"
          :class="{ active: viewMode === 'raw' }"
          @click="viewMode = 'raw'"
        >原始</button>
        <button class="topbar-action" @click="showForkDialog = true">分支</button>
        <v-menu v-model="showExportMenu" :close-on-content-click="true" location="bottom end">
          <template #activator="{ props: menuProps }">
            <button class="topbar-action" v-bind="menuProps">导出</button>
          </template>
          <v-list density="compact">
            <v-list-item @click="exportHtml(); showExportMenu = false" title="导出 HTML" />
            <v-list-item @click="exportJsonl(); showExportMenu = false" title="导出 JSONL" />
          </v-list>
        </v-menu>
      </div>

      <div class="topbar-right">
        <v-menu v-model="showExecutionModeMenu" location="bottom end" :close-on-content-click="false">
          <template #activator="{ props: menuProps }">
            <button
              class="execution-mode-select"
              :class="executionMode"
              type="button"
              :title="currentExecutionMode.description"
              :aria-label="`执行模式：${currentExecutionMode.label}`"
              :disabled="isSwitchingExecutionMode"
              v-bind="menuProps"
            >
              <v-icon :icon="currentExecutionMode.icon" size="14" />
              <span>{{ currentExecutionMode.label }}</span>
              <v-icon icon="mdi-chevron-down" size="13" />
            </button>
          </template>
          <div class="execution-mode-menu">
            <button
              v-for="mode in executionModes"
              :key="mode.value"
              class="execution-mode-option"
              :class="{ active: executionMode === mode.value }"
              type="button"
              @click="setExecutionMode(mode.value)"
            >
              <span class="mode-option-icon" :class="mode.value">
                <v-icon :icon="mode.icon" size="16" />
              </span>
              <span class="mode-option-text">
                <span class="mode-option-label">{{ mode.label }}</span>
                <span class="mode-option-desc">{{ mode.description }}</span>
              </span>
              <v-icon v-if="executionMode === mode.value" icon="mdi-check" size="15" />
            </button>
          </div>
        </v-menu>
        <button
          class="topbar-action runtime-panel-action"
          type="button"
          title="打开运行状态"
          aria-label="打开运行状态"
          @click="emit('open-runtime')"
        >
          <v-icon icon="mdi-chart-box-outline" size="16" />
        </button>
        <span class="conn-pill" :class="rpc.isConnected.value ? 'connected' : 'offline'">
          <span class="conn-dot"></span>
          {{ rpc.isConnected.value ? '已连接' : '离线' }}
        </span>
      </div>
    </div>

    <StageProgress
      v-if="paperMode"
      :current="paperCurrentStage"
      :selected="paperSelectedStage"
      :stages="paperStages"
      @select="emit('paper-stage-select', $event)"
    />

    <div v-if="paperError" class="paper-error-banner">
      <span class="paper-error-text">{{ paperError }}</span>
      <button class="paper-error-dismiss" type="button" aria-label="关闭" @click="emit('dismiss-paper-error')">×</button>
    </div>

    <!-- Session content -->
    <div class="session-content" ref="contentArea" @scroll="handleContentScroll">
      <div v-if="sessionStore.displayBlocks.length === 0" class="empty-state">
        <div class="empty-orbit" aria-hidden="true">
          <span class="empty-planet"></span>
          <span class="empty-ring"></span>
          <span class="empty-star empty-star-a"></span>
          <span class="empty-star empty-star-b"></span>
        </div>
        <p class="empty-title">Paper 工作区</p>
        <p class="empty-hint">agent 将按阶段推进论文写作，完成后请求你审核。</p>
      </div>

      <SessionView v-if="viewMode === 'session'" :blocks="sessionStore.displayBlocks" />
      <SessionTreeView v-else-if="viewMode === 'tree'" />
      <RawOutputViewer v-else :raw-json="sessionStore.getRawEventsJson()" />
    </div>

    <!-- Composer -->
    <div class="center-composer">
      <div
        class="composer-inner"
        :class="{ 'dragging-files': isDraggingFiles }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <CommandPalette
          v-if="showCommandPalette"
          :search="searchQuery"
          @select="onCommandSelected"
          @close="showCommandPalette = false"
        />

        <!-- Clarification section: summary chips + current question card -->
        <div v-if="pendingUserInput" class="clarification-section">
          <div v-if="answeredSummary.some(s => s.checked)" class="clarification-chips">
            <ClarificationChip
              v-for="item in answeredSummary.filter(s => s.checked)"
              :key="item.field"
              :field="item.field"
              :value="item.value"
              @edit="emit('jumpToQuestion', item.index)"
            />
          </div>
          <ClarificationCard
            v-if="currentQuestion"
            :question="currentQuestion"
            :question-index="currentQuestionIndex + 1"
            :total-questions="totalQuestions"
            :answer="currentAnswer"
            @update:answer="emit('update:currentAnswer', $event)"
            @next="emit('advanceQuestion')"
            @cancel="emit('cancelClarification')"
          />
        </div>

        <!-- Paper stage gate -->
        <GateCard
          v-if="paperPendingGate"
          :gate="paperPendingGate"
          @decide="emit('paper-gate-decide', $event)"
          @open-artifact="emit('paper-open-artifact', $event)"
        />

        <!-- Paper mode guidance (before first agent message) -->
        <div
          v-if="paperMode && !pendingUserInput && !paperPendingGate && sessionStore.displayBlocks.length === 0 && !isStreaming"
          class="onboarding-hints"
        >
          <span class="onboarding-label">paper 模式已就绪。agent 将按阶段自主推进,完成阶段会请求你审核;有拿不准的小问题会主动询问你。</span>
        </div>

        <div v-if="attachments.length > 0" class="attachment-list">
          <span
            v-for="file in attachments"
            :key="file.path"
            class="attachment-chip"
            :title="file.path"
          >
            <span class="attachment-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            </span>
            <span class="attachment-name">{{ file.name }}</span>
            <button class="attachment-remove" @click="removeAttachment(file.path)" title="移除文件">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </span>
        </div>

        <textarea
          v-if="!pendingUserInput"
          ref="textareaRef"
          class="composer-textarea"
          :placeholder="isStreaming ? 'AI 正在运行... 输入以操控' : '输入任务或按 / 使用命令...'"
          @input="handleInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
          rows="2"
          spellcheck="true"
        ></textarea>

        <div v-if="!pendingUserInput" class="composer-controls">
          <div class="composer-left">
            <button
              class="composer-icon-btn"
              @click="pickFiles"
              title="添加文件"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <span class="selector-anchor">
              <button
                class="model-btn"
                :title="modelOnlyDisplay"
                @click="showModelSelector = !showModelSelector; showThinkingSelector = false"
              >
                <span>{{ modelOnlyDisplay }}</span>
                <span class="model-btn-chevron">&#9660;</span>
              </button>
              <ModelSelector v-if="showModelSelector" @close="showModelSelector = false" />
            </span>
            <span class="selector-anchor">
              <button
                class="thinking-btn"
                :title="thinkingButtonDisplay"
                :disabled="thinkingButtonDisabled"
                @click="showThinkingSelector = !showThinkingSelector; showModelSelector = false"
              >
                <v-icon icon="mdi-brain" size="14" />
                <span>{{ thinkingButtonDisplay }}</span>
                <span class="model-btn-chevron">&#9660;</span>
              </button>
              <ThinkingSelector v-if="showThinkingSelector" @close="showThinkingSelector = false" />
            </span>
            <span
              v-if="eyeIndicatorVisible"
              class="eye-indicator"
              :class="{ active: eyeIndicatorActive, inactive: !eyeIndicatorActive }"
              :title="eyeIndicatorTitle"
            >
              <v-icon :icon="eyeIndicatorActive ? 'mdi-eye-outline' : 'mdi-eye-off-outline'" size="14" />
            </span>
          </div>
          <div class="composer-right">
            <button
              v-if="isStreaming"
              class="composer-action-btn primary-action"
              type="button"
              :disabled="!canSend"
              title="发送引导"
              aria-label="发送引导"
              @click="sendMessage"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </button>
            <button
              v-if="isStreaming"
              class="composer-action-btn stop-action"
              type="button"
              title="停止"
              aria-label="停止"
              @click="stopAgent"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
            <button
              v-else
              class="composer-action-btn primary-action"
              type="button"
              :disabled="!canSend"
              title="发送"
              aria-label="发送"
              @click="sendMessage"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <ForkDialog v-if="showForkDialog" @close="showForkDialog = false" @fork="handleFork" />
    <v-snackbar
      v-model="feedbackOpen"
      :color="feedbackColor"
      :timeout="5000"
      location="bottom end"
      variant="tonal"
    >
      {{ feedbackText }}
      <template #actions>
        <v-btn variant="text" @click="feedbackOpen = false">关闭</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<style scoped>
.center-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--pix-bg-content);
}

.paper-error-banner {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  margin: var(--pix-space-sm) var(--pix-space-xl) 0;
  padding: 8px 12px;
  border: 1px solid var(--pix-error-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-error-bg);
  color: var(--pix-error);
  font-size: var(--pix-text-sm);
  flex-shrink: 0;
}

.paper-error-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.paper-error-dismiss {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--pix-radius-xs);
  color: var(--pix-error);
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.paper-error-dismiss:hover {
  background: var(--pix-error-light);
}

/* ── TopBar ── */
.center-topbar {
  display: flex;
  align-items: center;
  height: var(--pix-topbar-height);
  min-height: var(--pix-topbar-height);
  padding: 0 calc(var(--pix-space-lg) + var(--pix-window-controls-width) + var(--pix-space-xs)) 0 var(--pix-space-xl);
  background: var(--pix-bg-topbar);
  border-bottom: 1px solid var(--pix-border-light);
  -webkit-app-region: no-drag;
  user-select: none;
  flex-shrink: 0;
  gap: var(--pix-space-md);
  backdrop-filter: none;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  min-width: 0;
  overflow: hidden;
  flex-shrink: 1;
  -webkit-app-region: drag;
}

.topbar-brand {
  font-size: var(--pix-text-sm);
  font-weight: var(--pix-weight-semibold);
  color: var(--pix-text-primary);
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

.topbar-sep {
  font-size: var(--pix-text-md);
  color: var(--pix-border);
  flex-shrink: 0;
  line-height: 1;
}

.topbar-path {
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
  font-weight: var(--pix-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--pix-space-xs);
}

/* Status pill */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: var(--pix-text-xs);
  font-weight: var(--pix-weight-medium);
  flex-shrink: 0;
  margin-left: var(--pix-space-sm);
}
.status-pill .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-pill.status-idle {
  background: var(--pix-bg-hover);
  color: var(--pix-text-secondary);
}
.status-pill.status-idle .status-dot {
  background: var(--pix-text-secondary);
}
.status-pill.status-running {
  background: var(--pix-accent-light);
  color: var(--pix-accent);
}
.status-pill.status-running .status-dot {
  background: var(--pix-accent);
  animation: none;
}
.status-pill.status-compacting {
  background: var(--pix-warning-bg);
  color: var(--pix-warning);
}
.status-pill.status-compacting .status-dot {
  background: var(--pix-warning);
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.topbar-center {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  padding: 3px;
  border: 1px solid var(--pix-border-subtle);
  border-radius: var(--pix-radius-lg);
  background: var(--pix-bg-subtle);
  box-shadow: none;
}

/* View mode tabs */
.view-tab {
  padding: 5px 12px;
  border-radius: var(--pix-radius-md);
  font-size: var(--pix-text-sm);
  font-family: var(--pix-font-ui);
  color: var(--pix-text-secondary);
  cursor: pointer;
  transition: background var(--pix-transition-fast), color var(--pix-transition-fast);
  font-weight: var(--pix-weight-normal);
}

.view-tab:hover {
  background: var(--pix-bg-content);
  color: var(--pix-text-primary);
}

.view-tab.active {
  background: var(--pix-bg-content);
  color: var(--pix-accent);
  font-weight: var(--pix-weight-medium);
  box-shadow: var(--pix-shadow-xs);
}

.topbar-action {
  padding: 5px 10px;
  border-radius: var(--pix-radius-md);
  font-size: var(--pix-text-sm);
  font-family: var(--pix-font-ui);
  color: var(--pix-text-secondary);
  cursor: pointer;
  transition: background var(--pix-transition-fast), color var(--pix-transition-fast);
}

.topbar-action:hover {
  background: var(--pix-bg-content);
  color: var(--pix-text-primary);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  flex-shrink: 0;
  margin-left: auto;
  -webkit-app-region: no-drag;
}

.topbar-right button,
.topbar-center button,
.topbar-center .v-menu {
  -webkit-app-region: no-drag !important;
  pointer-events: auto !important;
}

.execution-mode-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-content);
  color: var(--pix-text-secondary);
  font-size: var(--pix-text-xs);
  font-weight: var(--pix-weight-medium);
  cursor: pointer;
  transition:
    background var(--pix-transition-fast),
    border-color var(--pix-transition-fast),
    color var(--pix-transition-fast);
}

.execution-mode-select:hover {
  background: var(--pix-accent-light);
  border-color: var(--pix-border);
  color: var(--pix-text-primary);
}

.execution-mode-select:disabled {
  opacity: 0.65;
  cursor: wait;
}

.execution-mode-select.read-only {
  color: var(--pix-info);
  background: var(--pix-info-bg);
  border-color: var(--pix-border-light);
}

.execution-mode-select.approval {
  color: var(--pix-warning);
  background: var(--pix-warning-bg);
  border-color: var(--pix-warning-light);
}

.execution-mode-select.unattended {
  color: var(--pix-success);
  background: var(--pix-success-bg);
  border-color: var(--pix-success-light);
}

.execution-mode-menu {
  width: 244px;
  padding: var(--pix-space-xs);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  background: var(--pix-bg-content);
  box-shadow: var(--pix-shadow-xl);
}

.execution-mode-option {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  width: 100%;
  min-height: 52px;
  padding: var(--pix-space-sm);
  border-radius: var(--pix-radius-lg);
  text-align: left;
  color: var(--pix-text-primary);
}

.execution-mode-option:hover,
.execution-mode-option.active {
  background: var(--pix-bg-hover);
}

.mode-option-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--pix-radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--pix-bg-code);
  color: var(--pix-text-secondary);
}

.mode-option-icon.read-only {
  background: var(--pix-info-bg);
  color: var(--pix-info);
}

.mode-option-icon.approval {
  background: var(--pix-warning-bg);
  color: var(--pix-warning);
}

.mode-option-icon.unattended {
  background: var(--pix-success-bg);
  color: var(--pix-success);
}

.mode-option-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.mode-option-label {
  font-size: var(--pix-text-sm);
  font-weight: var(--pix-weight-semibold);
}

.mode-option-desc {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-muted);
  line-height: 1.35;
}

/* Connection pill */
.conn-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: var(--pix-text-xs);
  font-weight: var(--pix-weight-medium);
}
.conn-pill .conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.conn-pill.connected {
  background: var(--pix-success-bg);
  color: var(--pix-success);
}
.conn-pill.connected .conn-dot {
  background: var(--pix-success);
}
.conn-pill.offline {
  background: var(--pix-bg-hover);
  color: var(--pix-text-secondary);
}
.conn-pill.offline .conn-dot {
  background: var(--pix-text-secondary);
}

/* ── Session content ── */
.session-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--pix-space-3xl) var(--pix-space-xl) var(--pix-space-xl);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding-bottom: 9vh;
}

.empty-orbit {
  position: relative;
  width: 92px;
  height: 78px;
  margin-bottom: var(--pix-space-lg);
}

.empty-planet {
  position: absolute;
  left: 25px;
  top: 12px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--pix-accent-light);
  border: 1px solid var(--pix-accent-soft);
  box-shadow: none;
}

.empty-ring {
  position: absolute;
  left: 12px;
  top: 22px;
  width: 78px;
  height: 34px;
  border: 4px solid color-mix(in srgb, var(--pix-accent-soft) 24%, transparent);
  border-left-color: var(--pix-accent-soft);
  border-radius: 50%;
  transform: rotate(-24deg);
}

.empty-star {
  position: absolute;
  width: 7px;
  height: 7px;
  color: var(--pix-accent-soft);
}

.empty-star::before,
.empty-star::after {
  content: "";
  position: absolute;
  background: currentColor;
  border-radius: 999px;
}

.empty-star::before {
  left: 3px;
  top: 0;
  width: 1px;
  height: 7px;
}

.empty-star::after {
  left: 0;
  top: 3px;
  width: 7px;
  height: 1px;
}

.empty-star-a {
  left: 9px;
  top: 20px;
}

.empty-star-b {
  right: 5px;
  bottom: 18px;
}

.empty-title {
  font-size: var(--pix-text-xl);
  font-weight: var(--pix-weight-semibold);
  color: var(--pix-text-primary);
  margin-bottom: var(--pix-space-xs);
}

.empty-hint {
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
}

/* ── Composer ── */
.center-composer {
  flex-shrink: 0;
  padding: var(--pix-space-md) var(--pix-space-xl) var(--pix-space-xl);
}

.composer-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-sm);
  background: var(--pix-bg-content);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  padding: 12px;
  box-shadow: var(--pix-shadow-lg);
  transition: border-color var(--pix-transition-base), box-shadow var(--pix-transition-base);
}

.composer-inner:focus-within {
  border-color: var(--pix-accent);
  box-shadow: var(--pix-shadow-sm), 0 0 0 3px var(--pix-focus-ring);
}

.composer-inner.dragging-files {
  border-color: var(--pix-accent);
  background: var(--pix-accent-light);
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pix-space-xs);
  padding: 0 var(--pix-space-xs);
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 220px;
  padding: 4px 6px;
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-hover);
  color: var(--pix-text-secondary);
  font-size: var(--pix-text-xs);
}

.attachment-icon {
  display: inline-flex;
  color: var(--pix-text-secondary);
  flex-shrink: 0;
}

.attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.attachment-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--pix-radius-xs);
  color: var(--pix-text-secondary);
  flex-shrink: 0;
}

.attachment-remove:hover {
  background: var(--pix-bg-active);
  color: var(--pix-text-primary);
}

/* ── Clarification section (above textarea) ── */
.clarification-section {
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-sm);
  padding: 0 var(--pix-space-xs);
}

.clarification-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pix-space-xs);
  padding-bottom: 2px;
}

/* ── Paper onboarding ── */
.onboarding-hints {
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-sm);
  padding: 0 var(--pix-space-xs);
  animation: card-enter 220ms ease-out;
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.onboarding-label {
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
  font-weight: var(--pix-weight-medium);
}

.composer-textarea {
  width: 100%;
  padding: var(--pix-space-sm) var(--pix-space-sm);
  border: none;
  border-radius: var(--pix-radius-sm);
  font-size: var(--pix-text-base);
  line-height: var(--pix-leading-base);
  background: transparent;
  color: var(--pix-text-primary);
  resize: none;
  font-family: var(--pix-font-ui);
  min-height: 46px;
}

.composer-textarea:focus {
  outline: none;
}

.composer-textarea::placeholder {
  color: var(--pix-text-muted);
}

.composer-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.composer-left {
  display: flex;
  gap: var(--pix-space-xs);
  position: relative;
  align-items: center;
}

.composer-right {
  display: flex;
  gap: var(--pix-space-xs);
  align-items: center;
}

/* Icon action in composer */
.composer-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--pix-radius-md);
  color: var(--pix-text-secondary);
  cursor: pointer;
  transition: background var(--pix-transition-fast), color var(--pix-transition-fast);
}

.composer-icon-btn:hover {
  background: var(--pix-accent-light);
  color: var(--pix-text-primary);
}

.selector-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

/* Model button in composer */
.model-btn,
.thinking-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: var(--pix-radius-md);
  font-size: var(--pix-text-sm);
  font-family: var(--pix-font-ui);
  color: var(--pix-text-secondary);
  cursor: pointer;
  transition: background var(--pix-transition-fast), color var(--pix-transition-fast);
  white-space: nowrap;
  max-width: min(420px, 48vw);
}

.thinking-btn {
  max-width: 180px;
  color: var(--pix-accent);
  background: var(--pix-accent-light);
}

.thinking-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.model-btn span:first-child,
.thinking-btn span:first-of-type {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.model-btn:hover,
.thinking-btn:hover:not(:disabled) {
  background: var(--pix-bg-hover);
  color: var(--pix-text-primary);
}

.model-btn-chevron {
  font-size: 11px;
  color: var(--pix-text-secondary);
  transition: transform var(--pix-transition-fast);
}

.eye-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-content);
  color: var(--pix-text-muted);
}

.eye-indicator.active {
  color: var(--pix-info);
  background: var(--pix-info-bg);
  border-color: var(--pix-border-light);
}

.eye-indicator.inactive {
  color: var(--pix-text-muted);
  background: var(--pix-bg-hover);
}

/* Send / Stop icon actions */
.composer-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--pix-radius-lg);
  cursor: pointer;
  transition:
    background var(--pix-transition-fast),
    box-shadow var(--pix-transition-fast),
    opacity var(--pix-transition-fast),
    transform var(--pix-transition-fast);
  border: none;
}

.composer-action-btn.primary-action {
  background: var(--pix-accent);
  color: var(--pix-text-inverse);
  box-shadow: none;
}

.composer-action-btn.primary-action:hover:not(:disabled) {
  background: var(--pix-accent-hover);
}

.composer-action-btn.primary-action:disabled {
  background: var(--pix-bg-hover);
  color: var(--pix-text-secondary);
  cursor: not-allowed;
  box-shadow: none;
  opacity: 0.62;
}

.composer-action-btn.stop-action {
  background: var(--pix-error-bg);
  color: var(--pix-error);
}

.composer-action-btn.stop-action:hover {
  background: var(--pix-error-light);
}

@media (max-width: 960px) {
  .center-topbar {
    gap: var(--pix-space-sm);
    padding-left: var(--pix-space-md);
    padding-right: calc(var(--pix-space-md) + var(--pix-window-controls-width) + var(--pix-space-xs));
  }

  .topbar-center {
    gap: 0;
  }

  .view-tab,
  .topbar-action {
    padding-left: 7px;
    padding-right: 7px;
  }

  .execution-mode-select {
    padding-left: 7px;
    padding-right: 7px;
  }

  .execution-mode-select span {
    display: none;
  }

  .conn-pill {
    padding-left: 7px;
    padding-right: 7px;
  }

  .center-composer {
    padding-left: var(--pix-space-md);
    padding-right: var(--pix-space-md);
  }

  .composer-controls {
    gap: var(--pix-space-sm);
    flex-wrap: wrap;
  }

  .composer-left {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .model-btn {
    max-width: min(280px, 34vw);
  }

  .thinking-btn {
    max-width: 150px;
  }

  .composer-right {
    margin-left: auto;
  }
}

@media (max-width: 720px) {
  .topbar-left {
    max-width: 28%;
  }

  .topbar-center .view-tab {
    padding-left: 5px;
    padding-right: 5px;
  }

  .topbar-center .topbar-action {
    font-size: 0;
    padding-left: 6px;
    padding-right: 6px;
  }

  .topbar-center .topbar-action::before {
    content: "...";
    font-size: var(--pix-text-sm);
  }

  .composer-left {
    flex-basis: 100%;
    flex-wrap: wrap;
    overflow: visible;
  }

  .model-btn {
    max-width: min(220px, 52vw);
  }

  .thinking-btn {
    max-width: 140px;
  }
}
</style>
