/**
 * Workflow Engine Types
 *
 * DAG-based workflow for research automation.
 */

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  | 'literature'
  | 'method'
  | 'reproduction'
  | 'experiment'
  | 'writing'
  | 'review';

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'paused';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  status: NodeStatus;
  dependencies: string[];          // 依赖的节点 ID
  artifacts: ArtifactRef[];        // 产出的 Artifact
  retryPolicy?: RetryPolicy;
  retryCount?: number;             // 已重试次数
  approvalRequired: boolean;       // 是否需要人工确认
  qualityGate?: QualityGate;
  tasks: Task[];
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryOnFailure: boolean;
}

export interface ArtifactRef {
  id: string;
  type: ArtifactType;
  path: string;
  description: string;
}

export type ArtifactType =
  | 'paper'
  | 'paper_pdf'
  | 'paper_note'
  | 'survey'
  | 'method'
  | 'repo'
  | 'experiment_config'
  | 'experiment_result'
  | 'figure'
  | 'draft_section'
  | 'literature_pool'
  | 'reproduction_log';

// ============================================================================
// Quality Gate
// ============================================================================

export interface QualityGate {
  id: string;
  stageId: string;
  checks: QualityCheck[];
  status: 'pending' | 'passed' | 'warning' | 'failed';
}

export interface QualityCheck {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'passed' | 'warning' | 'failed';
  details?: string;
}

// ============================================================================
// Task
// ============================================================================

export type TaskType = 'agent' | 'tool' | 'user_input' | 'quality_check';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  nodeId: string;
  type: TaskType;
  name: string;
  description: string;
  status: TaskStatus;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// ============================================================================
// Workflow State
// ============================================================================

export interface WorkflowState {
  id: string;
  projectId: string;
  nodes: Record<string, WorkflowNode>;
  currentNodeId: string | null;
  history: WorkflowTransition[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowTransition {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

// ============================================================================
// Workflow Events
// ============================================================================

export type WorkflowEventType =
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'node_blocked'
  | 'node_paused'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'approval_required'
  | 'quality_gate_checked'
  | 'workflow_completed'
  | 'workflow_failed';

export interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  nodeId?: string;
  taskId?: string;
  timestamp: number;
  data?: unknown;
}

// ============================================================================
// User Approval
// ============================================================================

export interface ApprovalRequest {
  id: string;
  nodeId: string;
  workflowId: string;
  type: 'confirm' | 'select' | 'input';
  title: string;
  description: string;
  options?: ApprovalOption[];
  defaultValue?: unknown;
}

export interface ApprovalOption {
  id: string;
  label: string;
  description?: string;
  value: unknown;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  selectedOptionId?: string;
  value?: unknown;
  comments?: string;
}

// ============================================================================
// Artifact Types
// ============================================================================

export interface Artifact {
  id: string;
  projectId: string;
  type: ArtifactType;
  path: string;                    // 文件路径
  createdBy: 'user' | 'agent' | 'tool';
  sourceNodeId: string;            // 产出该 Artifact 的工作流节点
  hash: string;                    // 内容哈希
  metadata: Record<string, unknown>;
  provenance: Provenance[];        // 来源追溯链
  createdAt: number;
  updatedAt: number;
}

export interface Provenance {
  sourceId: string;      // 来源 Artifact ID
  relation: 'derived_from' | 'cites' | 'supports' | 'contradicts';
  description: string;
}

export interface ArtifactFilter {
  projectId?: string;
  type?: ArtifactType;
  sourceNodeId?: string;
  createdBy?: 'user' | 'agent' | 'tool';
  createdAfter?: number;
  createdBefore?: number;
}

export interface ArtifactStats {
  total: number;
  byType: Record<ArtifactType, number>;
  byNode: Record<string, number>;
  byCreator: Record<string, number>;
}

// ============================================================================
// Workflow Configuration
// ============================================================================

export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNodeConfig[];
}

export interface WorkflowNodeConfig {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  dependencies: string[];
  approvalRequired: boolean;
  qualityGateChecks?: QualityCheckConfig[];
  retryPolicy?: RetryPolicy;
}

export interface QualityCheckConfig {
  id: string;
  name: string;
  description: string;
  checkFn: string;  // function name or script path
}
