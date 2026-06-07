<script setup lang="ts">
/**
 * ResearchProjectPage — MVP per-stage execution
 *
 * Flow: Initialize workflow → run stages one by one → view artifacts
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkflowStore } from '../stores/workflow-store';
import { useProjectStore } from '../stores/project-store';
import ArtifactList from '../components/workflow/ArtifactList.vue';
import ApprovalDialog from '../components/workflow/ApprovalDialog.vue';
import AppLayout from '../components/layout/AppLayout.vue';
import type { ApprovalRequest, ApprovalResponse } from '@/types/workflow';

const router = useRouter();
const workflowStore = useWorkflowStore();
const projectStore = useProjectStore();

// Local state
const pendingApproval = ref<ApprovalRequest | null>(null);
const approvalComments = ref('');
const agentOutput = ref<string>('');

// Persisted in store
const researchTopic = computed({
  get: () => workflowStore.researchTopic,
  set: (val: string) => workflowStore.setResearchTopic(val),
});

// Unsubscribe functions
let unsubWorkflowEvent: (() => void) | null = null;
let unsubApprovalRequest: (() => void) | null = null;
let unsubAgentOutput: (() => void) | null = null;

// Computed
const isWorkflowRunning = computed(() => workflowStore.isRunning);
const nodes = computed(() => workflowStore.nodes);
const artifacts = computed(() => workflowStore.artifacts);
const stageRunning = computed(() => workflowStore.stageRunning);
const stageError = computed(() => workflowStore.stageError);

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(async () => {
  // Guard: require a project to be loaded (no Pi/isConnected dependency)
  if (!projectStore.currentProject?.path) {
    router.push('/');
    return;
  }

  await workflowStore.refreshState();

  unsubWorkflowEvent = window.pixApi.onWorkflowEvent((event: any) => {
    workflowStore.handleWorkflowEvent(event);
  });

  unsubApprovalRequest = window.pixApi.onWorkflowApprovalRequest((request: any) => {
    pendingApproval.value = request as ApprovalRequest;
  });

  unsubAgentOutput = window.pixApi.onWorkflowAgentOutput?.((data: any) => {
    if (data?.text) {
      agentOutput.value += data.text;
    }
  }) ?? null;
});

onUnmounted(() => {
  unsubWorkflowEvent?.();
  unsubApprovalRequest?.();
  unsubAgentOutput?.();
});

// =========================================================================
// Actions
// =========================================================================

async function initializeWorkflow(): Promise<void> {
  if (!researchTopic.value.trim()) return;
  agentOutput.value = '';
  const result = await window.pixApi.workflowStart('mvp', researchTopic.value);
  if (result.success) {
    workflowStore.setRunning(false); // Not running yet — just initialized
    await workflowStore.refreshState();
  }
}

async function runStage(stageId: string): Promise<void> {
  agentOutput.value = '';
  const result = await workflowStore.startStage(stageId);
  if (!result.success) {
    console.error(`[ResearchProjectPage] Stage ${stageId} failed:`, result.error);
  }
  await workflowStore.refreshState();
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

function goHome(): void {
  router.push('/');
}

function getStageLabel(node: any): string {
  const labels: Record<string, string> = {
    literature: '文献调研',
    method: '方法设计',
    reproduction: '代码复现',
    experiment: '实验执行',
    writing: '论文撰写',
    review: '质量审查',
  };
  return labels[node.type] || node.name;
}

function getStageIcon(node: any): string {
  const icons: Record<string, string> = {
    literature: 'mdi-bookshelf',
    method: 'mdi-lightbulb-outline',
    reproduction: 'mdi-git',
    experiment: 'mdi-flask-outline',
    writing: 'mdi-file-document-edit-outline',
    review: 'mdi-check-decagram',
  };
  return icons[node.type] || 'mdi-circle-outline';
}

function canRunStage(node: any): boolean {
  if (node.status === 'running' || stageRunning.value) return false;
  // Can run if all dependencies are completed
  return node.dependencies.every((depId: string) => {
    const dep = nodes.value.find((n: any) => n.id === depId);
    return dep?.status === 'completed';
  });
}

function getStageStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'success';
    case 'running': return 'primary';
    case 'failed': return 'error';
    default: return 'grey';
  }
}

function getStageStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return 'mdi-check-circle';
    case 'running': return 'mdi-loading';
    case 'failed': return 'mdi-alert-circle';
    default: return 'mdi-circle-outline';
  }
}
</script>

<template>
  <AppLayout>
    <!-- Left Panel: Stage List -->
    <template #left>
      <div class="left-panel">
        <div class="panel-header">
          <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goHome">
            返回首页
          </v-btn>
        </div>

        <!-- Topic Input / Initialize -->
        <div class="topic-section">
          <div v-if="nodes.length === 0" class="init-form">
            <v-text-field
              v-model="researchTopic"
              label="研究主题"
              placeholder="例：LLM for Code Generation"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-2"
              @keyup.enter="initializeWorkflow"
            />
            <v-btn
              color="primary"
              variant="flat"
              block
              prepend-icon="mdi-play"
              :disabled="!researchTopic.trim()"
              @click="initializeWorkflow"
            >
              初始化工作流
            </v-btn>
          </div>
          <div v-else class="topic-display">
            <v-icon size="small" class="mr-1">mdi-flask-outline</v-icon>
            <span class="text-body-2 font-weight-medium">{{ researchTopic }}</span>
          </div>
        </div>

        <!-- Stage List -->
        <div v-if="nodes.length > 0" class="stage-list">
          <div class="stage-list-header">
            <v-icon size="small" class="mr-1">mdi-sitemap</v-icon>
            <span class="text-subtitle-2">研究阶段</span>
          </div>

          <div
            v-for="node in nodes"
            :key="node.id"
            class="stage-card"
            :class="{ 'stage-active': node.status === 'running' }"
          >
            <div class="stage-card-header">
              <v-icon :color="getStageStatusColor(node.status)" size="20">
                {{ getStageStatusIcon(node.status) }}
              </v-icon>
              <div class="stage-card-info">
                <div class="stage-card-name">{{ getStageLabel(node) }}</div>
                <div class="stage-card-desc text-caption">{{ node.description }}</div>
              </div>
            </div>

            <div class="stage-card-actions">
              <v-btn
                v-if="canRunStage(node)"
                size="x-small"
                color="primary"
                variant="flat"
                :loading="stageRunning === node.id"
                @click="runStage(node.id)"
              >
                运行
              </v-btn>
              <v-btn
                v-else-if="node.status === 'failed'"
                size="x-small"
                color="error"
                variant="outlined"
                :loading="stageRunning === node.id"
                @click="runStage(node.id)"
              >
                重试
              </v-btn>
              <v-chip
                v-else-if="node.status === 'completed'"
                size="x-small"
                color="success"
                variant="tonal"
              >
                完成
              </v-chip>
              <v-chip
                v-else-if="node.status === 'running'"
                size="x-small"
                color="primary"
                variant="tonal"
              >
                运行中
              </v-chip>
            </div>
          </div>
        </div>

        <!-- Artifacts -->
        <div v-if="artifacts.length > 0" class="artifacts-section">
          <ArtifactList :artifacts="artifacts" />
        </div>
      </div>
    </template>

    <!-- Center Panel: Agent Output -->
    <template #center>
      <div class="center-panel">
        <div v-if="nodes.length === 0" class="empty-center">
          <v-icon size="64" color="grey-lighten-1">mdi-flask-outline</v-icon>
          <div class="text-h6 text-grey mt-4">输入研究主题，初始化工作流</div>
          <div class="text-body-2 text-grey mt-2">
            然后逐个运行研究阶段：文献调研 → 方法设计 → 论文撰写
          </div>
        </div>

        <div v-else-if="stageRunning" class="running-state">
          <v-progress-circular indeterminate color="primary" size="48" />
          <div class="text-body-2 text-grey mt-4">
            正在执行：{{ getStageLabel(nodes.find(n => n.id === stageRunning) || {}) }}
          </div>
        </div>

        <div v-else-if="stageError" class="error-state">
          <v-icon size="48" color="error">mdi-alert-circle</v-icon>
          <div class="text-body-1 text-error mt-4">{{ stageError }}</div>
        </div>

        <div v-else-if="agentOutput" class="output-content">
          <pre class="output-text">{{ agentOutput }}</pre>
        </div>

        <div v-else class="empty-center">
          <v-icon size="48" color="grey">mdi-arrow-left</v-icon>
          <div class="text-body-2 text-grey mt-2">点击左侧阶段的"运行"按钮开始</div>
        </div>
      </div>
    </template>

    <!-- Right Panel: Stage Details -->
    <template #right>
      <div class="right-panel">
        <div v-if="nodes.length === 0" class="empty-right">
          <v-icon size="48" color="grey">mdi-flask-outline</v-icon>
          <div class="text-body-2 text-grey mt-2">初始化工作流后查看阶段详情</div>
        </div>

        <div v-else class="stage-details">
          <div class="detail-header">
            <v-icon size="small" class="mr-1">mdi-information-outline</v-icon>
            <span class="text-subtitle-2">阶段概览</span>
          </div>

          <v-list density="compact" bg-color="transparent">
            <v-list-item v-for="node in nodes" :key="node.id">
              <template #prepend>
                <v-icon :color="getStageStatusColor(node.status)" size="small">
                  {{ getStageStatusIcon(node.status) }}
                </v-icon>
              </template>
              <v-list-item-title class="text-caption">{{ getStageLabel(node) }}</v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="node.status === 'completed'">已完成</span>
                <span v-else-if="node.status === 'running'">运行中...</span>
                <span v-else-if="node.status === 'failed'" class="text-error">失败: {{ node.error }}</span>
                <span v-else>等待中</span>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>

          <!-- Expected Outputs -->
          <div class="expected-outputs">
            <div class="detail-header">
              <v-icon size="small" class="mr-1">mdi-file-tree</v-icon>
              <span class="text-subtitle-2">预期产物</span>
            </div>
            <v-list density="compact" bg-color="transparent">
              <v-list-item>
                <template #prepend><v-icon size="small" color="blue">mdi-bookshelf</v-icon></template>
                <v-list-item-title class="text-caption">literature/survey.md</v-list-item-title>
              </v-list-item>
              <v-list-item>
                <template #prepend><v-icon size="small" color="blue">mdi-magnify</v-icon></template>
                <v-list-item-title class="text-caption">literature/gaps.md</v-list-item-title>
              </v-list-item>
              <v-list-item>
                <template #prepend><v-icon size="small" color="orange">mdi-lightbulb-outline</v-icon></template>
                <v-list-item-title class="text-caption">method/method.md</v-list-item-title>
              </v-list-item>
              <v-list-item>
                <template #prepend><v-icon size="small" color="orange">mdi-clipboard-text-outline</v-icon></template>
                <v-list-item-title class="text-caption">method/experiment_plan.md</v-list-item-title>
              </v-list-item>
              <v-list-item>
                <template #prepend><v-icon size="small" color="green">mdi-file-document-edit-outline</v-icon></template>
                <v-list-item-title class="text-caption">paper/paper.md</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </div>
      </div>
    </template>
  </AppLayout>

  <!-- Approval Dialog -->
  <ApprovalDialog
    :request="pendingApproval"
    @respond="(resp) => handleApprovalResponse(resp.approved)"
  />
</template>

<style scoped>
.left-panel {
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

.topic-section {
  padding: 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.init-form {
  display: flex;
  flex-direction: column;
}

.topic-display {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.stage-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.stage-list-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.stage-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  transition: all 0.2s;
}

.stage-card.stage-active {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background: rgba(var(--v-theme-primary), 0.04);
}

.stage-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.stage-card-info {
  flex: 1;
  min-width: 0;
}

.stage-card-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.stage-card-desc {
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-card-actions {
  flex-shrink: 0;
  margin-left: 8px;
}

.artifacts-section {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  overflow-y: auto;
  max-height: 40%;
}

.center-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.empty-center {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.running-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.error-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.output-content {
  flex: 1;
  overflow-y: auto;
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

.right-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px;
}

.empty-right {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stage-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.expected-outputs {
  margin-top: 8px;
}
</style>
