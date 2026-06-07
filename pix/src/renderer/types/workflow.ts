/**
 * Workflow Types for Renderer
 *
 * Mirror of packages/workflow types for frontend use.
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
  dependencies: string[];
  artifacts: ArtifactRef[];
  retryPolicy?: RetryPolicy;
  approvalRequired: boolean;
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
// Artifact Types
// ============================================================================

export interface Artifact {
  id: string;
  projectId: string;
  type: ArtifactType;
  path: string;
  createdBy: 'user' | 'agent' | 'tool';
  sourceNodeId: string;
  hash: string;
  metadata: Record<string, unknown>;
  provenance: Provenance[];
  createdAt: number;
  updatedAt: number;
}

export interface Provenance {
  sourceId: string;
  relation: 'derived_from' | 'cites' | 'supports' | 'contradicts';
  description: string;
}

// ============================================================================
// Quality Gate Types
// ============================================================================

export interface QualityGate {
  id: string;
  stageId: string;
  checks: QualityCheck[];
  status: 'passed' | 'warning' | 'failed';
}

export interface QualityCheck {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'warning' | 'failed';
  details?: string;
}

// ============================================================================
// Task Types
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
// Approval Types
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
// Tool Types
// ============================================================================

export type ToolCategory =
  | 'literature'
  | 'code'
  | 'experiment'
  | 'writing'
  | 'utility';

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  parameters: ToolParameter[];
  returnType?: string;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}
