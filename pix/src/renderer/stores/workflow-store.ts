/**
 * Workflow Store
 *
 * Manages workflow state for the renderer process.
 * Connected to the main process WorkflowBridge via IPC.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  WorkflowState,
  WorkflowNode,
  Artifact,
  QualityGate,
  ApprovalRequest,
} from '@/types/workflow';

export const useWorkflowStore = defineStore('workflow', () => {
  // ============================================================================
  // State
  // ============================================================================

  const workflowState = ref<WorkflowState | null>(null);
  const artifacts = ref<Artifact[]>([]);
  const currentQualityGate = ref<QualityGate | null>(null);
  const pendingApproval = ref<ApprovalRequest | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const running = ref(false);

  // Persisted user inputs (survive navigation)
  const researchTopic = ref('');
  const selectedTemplate = ref('default');

  // ============================================================================
  // Getters
  // ============================================================================

  const currentNode = computed((): WorkflowNode | undefined => {
    if (!workflowState.value) return undefined;
    const nodeId = selectedNodeId.value || workflowState.value.currentNodeId;
    if (!nodeId) return undefined;
    return workflowState.value.nodes[nodeId];
  });

  const activeNode = computed((): WorkflowNode | undefined => {
    if (!workflowState.value) return undefined;
    const nodeId = workflowState.value.currentNodeId;
    if (!nodeId) return undefined;
    return workflowState.value.nodes[nodeId];
  });

  const nodes = computed((): WorkflowNode[] => {
    if (!workflowState.value) return [];
    return Object.values(workflowState.value.nodes);
  });

  const completedNodes = computed(() =>
    nodes.value.filter(n => n.status === 'completed')
  );

  const progress = computed(() => {
    if (nodes.value.length === 0) return 0;
    return Math.round((completedNodes.value.length / nodes.value.length) * 100);
  });

  const isRunning = computed(() => running.value);

  const hasFailed = computed(() =>
    nodes.value.some(n => n.status === 'failed')
  );

  const artifactsByType = computed(() => {
    const groups = new Map<string, Artifact[]>();
    for (const artifact of artifacts.value) {
      const group = groups.get(artifact.type) || [];
      group.push(artifact);
      groups.set(artifact.type, group);
    }
    return groups;
  });

  // ============================================================================
  // Actions - State Refresh
  // ============================================================================

  async function refreshState(): Promise<void> {
    try {
      loading.value = true;
      const state = await window.pixApi.workflowGetState();
      if (state) {
        workflowState.value = state as WorkflowState;
      }

      const arts = await window.pixApi.workflowGetArtifacts();
      if (Array.isArray(arts)) {
        artifacts.value = arts as Artifact[];
      }

      const isWfRunning = await window.pixApi.workflowIsRunning();
      running.value = isWfRunning;
    } catch (err) {
      console.error('[workflow-store] Failed to refresh state:', err);
    } finally {
      loading.value = false;
    }
  }

  // ============================================================================
  // Actions - Event Handling
  // ============================================================================

  function handleWorkflowEvent(event: any): void {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'node_started':
      case 'node_completed':
      case 'node_failed':
      case 'node_blocked':
      case 'node_paused':
        // Refresh full state on node status changes
        void refreshState();
        break;

      case 'quality_gate_checked':
        if (event.data) {
          currentQualityGate.value = event.data as QualityGate;
        }
        break;

      case 'approval_required':
        if (event.data) {
          pendingApproval.value = event.data as ApprovalRequest;
        }
        break;

      case 'workflow_completed':
        running.value = false;
        void refreshState();
        break;

      case 'workflow_failed':
        running.value = false;
        void refreshState();
        break;

      case 'task_started':
      case 'task_completed':
      case 'task_failed':
        // Task events don't need full state refresh
        break;
    }
  }

  // ============================================================================
  // Actions - Navigation
  // ============================================================================

  function selectNode(nodeId: string): void {
    selectedNodeId.value = nodeId;
    // Also update quality gate for the selected node
    const node = workflowState.value?.nodes[nodeId];
    if (node?.qualityGate) {
      currentQualityGate.value = node.qualityGate;
    }
  }

  // ============================================================================
  // Actions - State Mutations
  // ============================================================================

  function setRunning(value: boolean): void {
    running.value = value;
  }

  // ============================================================================
  // Actions - Per-Stage Execution (MVP)
  // ============================================================================

  const stageRunning = ref<string | null>(null);
  const stageError = ref<string | null>(null);
  const stageOutput = ref<string>('');

  async function startStage(stageId: string): Promise<{ success: boolean; error?: string }> {
    stageRunning.value = stageId;
    stageError.value = null;
    stageOutput.value = '';
    running.value = true;

    try {
      const result = await (window.pixApi as any).stageStart(stageId);
      if (result.success) {
        await refreshState();
        return { success: true };
      } else {
        stageError.value = result.error || 'Stage failed';
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stageError.value = errorMsg;
      return { success: false, error: errorMsg };
    } finally {
      stageRunning.value = null;
      running.value = false;
    }
  }

  function clearWorkflow(): void {
    workflowState.value = null;
    artifacts.value = [];
    currentQualityGate.value = null;
    pendingApproval.value = null;
    selectedNodeId.value = null;
    running.value = false;
    error.value = null;
    // Note: researchTopic and selectedTemplate are intentionally NOT cleared
    // so the user doesn't have to re-enter them when navigating back.
  }

  function setResearchTopic(topic: string): void {
    researchTopic.value = topic;
  }

  function setSelectedTemplate(template: string): void {
    selectedTemplate.value = template;
  }

  return {
    // State
    workflowState,
    artifacts,
    currentQualityGate,
    pendingApproval,
    selectedNodeId,
    loading,
    error,
    running,
    researchTopic,
    selectedTemplate,
    stageRunning,
    stageError,
    stageOutput,

    // Getters
    currentNode,
    activeNode,
    nodes,
    completedNodes,
    progress,
    isRunning,
    hasFailed,
    artifactsByType,

    // Actions
    refreshState,
    handleWorkflowEvent,
    selectNode,
    setRunning,
    clearWorkflow,
    setResearchTopic,
    setSelectedTemplate,
    startStage,
  };
});
