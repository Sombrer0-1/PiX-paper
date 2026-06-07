<script setup lang="ts">
/**
 * ResearchProjectPage
 *
 * Three-panel research workspace:
 * - Left: workflow progress + artifact list
 * - Center: stage detail + agent chat
 * - Right: quality gate + library
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkflowStore } from '../stores/workflow-store';
import { useSessionStore } from '../stores/session-store';
import { useRpc } from '../composables/useRpc';
import WorkflowProgress from '../components/workflow/WorkflowProgress.vue';
import QualityGatePanel from '../components/workflow/QualityGatePanel.vue';
import ApprovalDialog from '../components/workflow/ApprovalDialog.vue';
import ArtifactList from '../components/workflow/ArtifactList.vue';
import LibraryPanel from '../components/research/LibraryPanel.vue';
import AppLayout from '../components/layout/AppLayout.vue';
import CenterPanel from '../components/layout/CenterPanel.vue';
import type { ApprovalRequest, ApprovalResponse } from '@/types/workflow';

const router = useRouter();
const workflowStore = useWorkflowStore();
const sessionStore = useSessionStore();
const rpc = useRpc();

// Local state
const activeTab = ref<'workflow' | 'artifacts' | 'library'>('workflow');
const stagePrompt = ref<string>('');
const pendingApproval = ref<ApprovalRequest | null>(null);
const approvalComments = ref('');
const agentOutput = ref<string>('');

// Persisted in store (survives navigation)
const researchTopic = computed({
  get: () => workflowStore.researchTopic,
  set: (val: string) => workflowStore.setResearchTopic(val),
});
const selectedTemplate = computed({
  get: () => workflowStore.selectedTemplate,
  set: (val: string) => workflowStore.setSelectedTemplate(val),
});

// Backtrack dialog state
const showBacktrackDialog = ref(false);
const backtrackNodeId = ref('');
const backtrackReason = ref('');

// Composer state
const composerText = ref('');
const isComposerSending = ref(false);

// Unsubscribe functions
let unsubWorkflowEvent: (() => void) | null = null;
let unsubApprovalRequest: (() => void) | null = null;
let unsubStagePrompt: (() => void) | null = null;
let unsubWorkflowComplete: (() => void) | null = null;

// Computed
const isWorkflowRunning = computed(() => workflowStore.isRunning);
const currentNode = computed(() => workflowStore.currentNode);
const nodes = computed(() => workflowStore.nodes);
const artifacts = computed(() => workflowStore.artifacts);
const currentQualityGate = computed(() => workflowStore.currentQualityGate);
const progress = computed(() => workflowStore.progress);

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(async () => {
  // Attach to running session if needed
  if (!rpc.isConnected.value) {
    const attached = await rpc.attachToRunningSession();
    if (!attached) {
      router.push('/');
      return;
    }
  }

  // Load initial workflow state
  await workflowStore.refreshState();

  // Subscribe to workflow events
  unsubWorkflowEvent = window.pixApi.onWorkflowEvent((event: any) => {
    workflowStore.handleWorkflowEvent(event);
  });

  unsubApprovalRequest = window.pixApi.onWorkflowApprovalRequest((request: any) => {
    pendingApproval.value = request as ApprovalRequest;
  });

  unsubStagePrompt = window.pixApi.onWorkflowStagePrompt((data: any) => {
    stagePrompt.value = data.taskDescription || '';
    // Send the stage prompt to the agent
    if (data.taskDescription) {
      rpc.sendPrompt(data.taskDescription);
    }
  });

  unsubWorkflowComplete = window.pixApi.onWorkflowComplete(() => {
    workflowStore.setRunning(false);
    workflowStore.refreshState();
  });

  // Listen for agent output
  window.pixApi.onWorkflowAgentOutput?.((data: any) => {
    if (data?.text) {
      agentOutput.value += data.text;
    }
  });
});

onUnmounted(() => {
  unsubWorkflowEvent?.();
  unsubApprovalRequest?.();
  unsubStagePrompt?.();
  unsubWorkflowComplete?.();
});

// =========================================================================
// Actions
// =========================================================================

async function startWorkflow(): Promise<void> {
  if (!researchTopic.value.trim()) {
    return;
  }
  agentOutput.value = '';
  const result = await window.pixApi.workflowStart(selectedTemplate.value, researchTopic.value);
  if (result.success) {
    workflowStore.setRunning(true);
    await workflowStore.refreshState();
  }
}

async function stopWorkflow(): Promise<void> {
  await window.pixApi.workflowStop();
  workflowStore.setRunning(false);
}

async function pauseWorkflow(): Promise<void> {
  await window.pixApi.workflowPause();
}

async function resumeWorkflow(): Promise<void> {
  await window.pixApi.workflowResume();
}

function handleSelectNode(nodeId: string): void {
  workflowStore.selectNode(nodeId);
}

async function handleApprovalResponse(approved: boolean): Promise<void> {
  if (!pendingApproval.value) return;

  await window.pixApi.workflowApprove(
    pendingApproval.value.id,
    approved,
    approvalComments.value || undefined
  );

  pendingApproval.value = null;
  approvalComments.value = '';
}

function requestBacktrack(nodeId: string): void {
  backtrackNodeId.value = nodeId;
  backtrackReason.value = '';
  showBacktrackDialog.value = true;
}

async function confirmBacktrack(): Promise<void> {
  if (!backtrackReason.value.trim() || !backtrackNodeId.value) return;
  await window.pixApi.workflowBacktrack(backtrackNodeId.value, backtrackReason.value.trim());
  await workflowStore.refreshState();
  showBacktrackDialog.value = false;
  backtrackNodeId.value = '';
  backtrackReason.value = '';
}

async function sendComposerMessage(): Promise<void> {
  const text = composerText.value.trim();
  if (!text || !rpc.isConnected.value) return;
  isComposerSending.value = true;
  try {
    await rpc.sendPrompt(text);
    composerText.value = '';
  } catch (err) {
    console.error("[ResearchProjectPage] Send failed:", err);
  } finally {
    isComposerSending.value = false;
  }
}

function goHome(): void {
  router.push('/');
}
</script>

<template>
  <AppLayout>
    <!-- Left Panel: Workflow Progress + Artifacts -->
    <template #left>
      <div class="research-left-panel">
        <!-- Header -->
        <div class="panel-header">
          <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goHome">
            返回首页
          </v-btn>
          <v-btn variant="text" size="small" icon="mdi-cog-outline" title="设置" @click="router.push('/settings')" />
        </div>

        <!-- Workflow Controls -->
        <div class="workflow-controls">
          <div v-if="!isWorkflowRunning" class="start-form">
            <v-text-field
              v-model="researchTopic"
              label="研究主题"
              placeholder="例：Large Language Model for Code Generation"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
              @keyup.enter="startWorkflow"
            />
            <v-select
              v-model="selectedTemplate"
              :items="[
                { title: '完整研究流程', value: 'default' },
                { title: '快速综述', value: 'quick-survey' },
                { title: '仅实验', value: 'experiment-only' },
              ]"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
            />
            <v-btn
              color="primary"
              variant="flat"
              block
              prepend-icon="mdi-play"
              :disabled="!researchTopic.trim()"
              @click="startWorkflow"
            >
              开始研究
            </v-btn>
          </div>
          <div v-else class="control-row">
            <v-btn size="small" variant="outlined" prepend-icon="mdi-pause" @click="pauseWorkflow">
              暂停
            </v-btn>
            <v-btn size="small" variant="outlined" prepend-icon="mdi-stop" @click="stopWorkflow">
              停止
            </v-btn>
          </div>
        </div>

        <!-- Progress Bar -->
        <div v-if="isWorkflowRunning" class="progress-bar-container">
          <v-progress-linear
            :model-value="progress"
            color="primary"
            height="6"
            rounded
          />
          <span class="progress-text">{{ progress }}% 完成</span>
        </div>

        <!-- Tab Switcher -->
        <v-tabs v-model="activeTab" density="compact" class="research-tabs">
          <v-tab value="workflow">工作流</v-tab>
          <v-tab value="artifacts">产出物</v-tab>
          <v-tab value="library">文献库</v-tab>
        </v-tabs>

        <!-- Tab Content -->
        <div class="tab-content">
          <WorkflowProgress
            v-if="activeTab === 'workflow'"
            :nodes="nodes"
            :current-node-id="currentNode?.id ?? null"
            @select-node="handleSelectNode"
          />

          <ArtifactList
            v-if="activeTab === 'artifacts'"
            :artifacts="artifacts"
          />

          <LibraryPanel
            v-if="activeTab === 'library'"
            :papers="[]"
            :tags="[]"
          />
        </div>
      </div>
    </template>

    <!-- Center Panel: Stage Detail + Agent Output -->
    <template #center>
      <div class="research-center-panel">
        <!-- Current Stage Info -->
        <div v-if="currentNode" class="stage-info-bar">
          <v-chip :color="currentNode.status === 'completed' ? 'success' : currentNode.status === 'running' ? 'primary' : 'grey'" size="small">
            {{ currentNode.name }}
          </v-chip>
          <span class="stage-description">{{ currentNode.description }}</span>
          <v-spacer />
          <v-btn
            v-if="currentNode.status === 'completed' || currentNode.status === 'failed'"
            size="x-small"
            variant="text"
            prepend-icon="mdi-arrow-u-left-top"
            @click="requestBacktrack(currentNode.id)"
          >
            回跳到此
          </v-btn>
        </div>

        <!-- Agent Output -->
        <div class="agent-output-area">
          <div v-if="!isWorkflowRunning && !agentOutput" class="empty-center">
            <v-icon size="64" color="grey-lighten-1">mdi-flask-outline</v-icon>
            <div class="text-h6 text-grey mt-4">输入研究主题，开始 AI 驱动的科研流程</div>
            <div class="text-body-2 text-grey mt-2">
              系统将自动完成文献调研、方法设计、代码复现、实验执行和论文撰写
            </div>
          </div>
          <div v-else-if="isWorkflowRunning && !agentOutput" class="empty-center">
            <v-progress-circular indeterminate color="primary" size="48" />
            <div class="text-body-2 text-grey mt-4">Agent 正在执行...</div>
          </div>
          <div v-else class="output-content">
            <pre class="output-text">{{ agentOutput }}</pre>
          </div>
        </div>

        <!-- Composer -->
        <div class="research-composer">
          <textarea
            v-model="composerText"
            class="composer-textarea"
            placeholder="输入消息与 Agent 交互..."
            rows="2"
            @keydown.enter.exact.prevent="sendComposerMessage"
            spellcheck="true"
          ></textarea>
          <div class="composer-actions">
            <span class="composer-hint">Enter 发送，Shift+Enter 换行</span>
            <v-btn
              size="small"
              color="primary"
              variant="flat"
              :disabled="!composerText.trim() || !rpc.isConnected.value"
              :loading="isComposerSending"
              @click="sendComposerMessage"
            >
              发送
            </v-btn>
          </div>
        </div>
      </div>
    </template>

    <!-- Right Panel: Quality Gate -->
    <template #right>
      <div class="research-right-panel">
        <QualityGatePanel
          :gate="currentQualityGate"
          :loading="false"
        />

        <!-- Current Node Details -->
        <div v-if="currentNode" class="node-details">
          <div class="detail-header">
            <v-icon size="small" class="mr-1">mdi-information-outline</v-icon>
            <span class="text-subtitle-2">阶段详情</span>
          </div>

          <v-list density="compact" bg-color="transparent">
            <v-list-item>
              <template #prepend><v-icon size="small">mdi-tag</v-icon></template>
              <v-list-item-title class="text-caption">类型</v-list-item-title>
              <v-list-item-subtitle>{{ currentNode.type }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="currentNode.startedAt">
              <template #prepend><v-icon size="small">mdi-clock-outline</v-icon></template>
              <v-list-item-title class="text-caption">开始时间</v-list-item-title>
              <v-list-item-subtitle>{{ new Date(currentNode.startedAt).toLocaleString() }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="currentNode.completedAt">
              <template #prepend><v-icon size="small">mdi-clock-check</v-icon></template>
              <v-list-item-title class="text-caption">完成时间</v-list-item-title>
              <v-list-item-subtitle>{{ new Date(currentNode.completedAt).toLocaleString() }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="currentNode.error">
              <template #prepend><v-icon size="small" color="error">mdi-alert</v-icon></template>
              <v-list-item-title class="text-caption">错误</v-list-item-title>
              <v-list-item-subtitle class="text-error">{{ currentNode.error }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <template #prepend><v-icon size="small">mdi-file-tree</v-icon></template>
              <v-list-item-title class="text-caption">产出物数量</v-list-item-title>
              <v-list-item-subtitle>{{ currentNode.artifacts.length }}</v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <template #prepend><v-icon size="small">mdi-check-all</v-icon></template>
              <v-list-item-title class="text-caption">任务数</v-list-item-title>
              <v-list-item-subtitle>{{ currentNode.tasks.length }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>

        <!-- Empty State -->
        <div v-if="!currentNode && !isWorkflowRunning" class="empty-state">
          <v-icon size="48" color="grey">mdi-flask-outline</v-icon>
          <div class="text-body-2 text-grey mt-2">点击"开始研究"启动工作流</div>
        </div>
      </div>
    </template>
  </AppLayout>

  <!-- Approval Dialog -->
  <ApprovalDialog
    :request="pendingApproval"
    @respond="(resp) => handleApprovalResponse(resp.approved)"
  />

  <!-- Backtrack Dialog -->
  <v-dialog v-model="showBacktrackDialog" max-width="480">
    <v-card class="backtrack-dialog-card">
      <div class="backtrack-dialog-title">回跳到此阶段</div>
      <div class="backtrack-dialog-desc">请输入回跳原因，以便记录工作流历史。</div>
      <v-textarea
        v-model="backtrackReason"
        label="回跳原因"
        placeholder="例如：需要补充消融实验..."
        variant="outlined"
        density="compact"
        rows="3"
        autofocus
        @keydown.enter.ctrl="confirmBacktrack"
        @keydown.enter.meta="confirmBacktrack"
        class="mt-3"
      />
      <v-card-actions class="pa-0 mt-2">
        <v-spacer />
        <v-btn variant="text" @click="showBacktrackDialog = false">取消</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!backtrackReason.trim()" @click="confirmBacktrack">确认回跳</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.research-left-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.workflow-controls {
  padding: 12px;
}

.control-row {
  display: flex;
  gap: 8px;
}

.progress-bar-container {
  padding: 0 12px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-text {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}

.research-tabs {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

.research-center-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.start-form {
  display: flex;
  flex-direction: column;
}

.agent-output-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-center {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.output-content {
  height: 100%;
}

.output-text {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(var(--v-theme-on-surface), 0.87);
  margin: 0;
}

.stage-info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.5);
}

.stage-description {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.stage-prompt-banner {
  display: flex;
  align-items: flex-start;
  padding: 8px 16px;
  background: rgba(var(--v-theme-primary), 0.04);
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.1);
}

.prompt-text {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  line-height: 1.4;
}

.research-right-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  gap: 12px;
  padding: 12px;
}

.node-details {
  padding: 12px;
  background: rgba(var(--v-theme-surface), 0.5);
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.detail-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

/* Composer */
.research-composer {
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.8);
}

.composer-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 8px;
  font-size: 0.875rem;
  line-height: 1.5;
  background: rgba(var(--v-theme-surface), 1);
  color: rgba(var(--v-theme-on-surface), 0.87);
  resize: none;
  font-family: inherit;
}

.composer-textarea:focus {
  outline: none;
  border-color: rgba(var(--v-theme-primary), 0.5);
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.1);
}

.composer-textarea::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.composer-hint {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* Backtrack Dialog */
.backtrack-dialog-card {
  padding: 24px;
  border-radius: 12px;
}

.backtrack-dialog-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.87);
  margin-bottom: 4px;
}

.backtrack-dialog-desc {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
