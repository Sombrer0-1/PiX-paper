/**
 * Workflow Engine
 *
 * DAG-based workflow engine for research automation.
 * Supports non-linear execution, backtracking, branching, and retry.
 */

import { EventEmitter } from 'events';
import type {
  WorkflowState,
  WorkflowNode,
  WorkflowEvent,
  WorkflowTransition,
  ApprovalRequest,
  ApprovalResponse,
  Task,
  TaskStatus,
  NodeStatus,
  QualityGate,
  QualityCheck,
  ArtifactRef,
} from './types.js';

export interface WorkflowEngineOptions {
  onEvent?: (event: WorkflowEvent) => void;
  onApprovalRequest?: (request: ApprovalRequest) => Promise<ApprovalResponse>;
  /** Timeout in ms for approval requests. Defaults to 5 minutes. */
  approvalTimeoutMs?: number;
}

export class WorkflowEngine extends EventEmitter {
  private state: WorkflowState;
  private options: WorkflowEngineOptions;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalResolvers: Map<string, (response: ApprovalResponse) => void> = new Map();

  constructor(state: WorkflowState, options: WorkflowEngineOptions = {}) {
    super();
    this.state = state;
    this.options = options;
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getState(): WorkflowState {
    return { ...this.state };
  }

  getNode(nodeId: string): WorkflowNode | undefined {
    return this.state.nodes[nodeId];
  }

  getCurrentNode(): WorkflowNode | undefined {
    if (!this.state.currentNodeId) return undefined;
    return this.state.nodes[this.state.currentNodeId];
  }

  getNodes(): WorkflowNode[] {
    return Object.values(this.state.nodes);
  }

  getPendingNodes(): WorkflowNode[] {
    return this.getNodes().filter(n => n.status === 'pending');
  }

  getBlockedNodes(): WorkflowNode[] {
    return this.getNodes().filter(n => n.status === 'blocked');
  }

  // ============================================================================
  // Node Execution
  // ============================================================================

  async startNode(nodeId: string): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Check dependencies
    const unmetDeps = this.getUnmetDependencies(nodeId);
    if (unmetDeps.length > 0) {
      throw new Error(`Unmet dependencies: ${unmetDeps.join(', ')}`);
    }

    // Update state
    node.status = 'running';
    node.startedAt = Date.now();
    this.state.currentNodeId = nodeId;
    this.state.updatedAt = Date.now();

    this.emitEvent({
      type: 'node_started',
      workflowId: this.state.id,
      nodeId,
      timestamp: Date.now(),
    });
  }

  async completeNode(nodeId: string, result?: unknown): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.status = 'completed';
    node.result = result;
    node.completedAt = Date.now();
    this.state.updatedAt = Date.now();

    this.emitEvent({
      type: 'node_completed',
      workflowId: this.state.id,
      nodeId,
      timestamp: Date.now(),
      data: result,
    });

    // Check if workflow is complete
    if (this.isWorkflowComplete()) {
      this.emitEvent({
        type: 'workflow_completed',
        workflowId: this.state.id,
        timestamp: Date.now(),
      });
    }
  }

  async failNode(nodeId: string, error: string): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.status = 'failed';
    node.error = error;
    node.completedAt = Date.now();
    this.state.updatedAt = Date.now();

    this.emitEvent({
      type: 'node_failed',
      workflowId: this.state.id,
      nodeId,
      timestamp: Date.now(),
      data: { error },
    });

    // Check retry policy with maxRetries enforcement
    if (node.retryPolicy?.retryOnFailure) {
      const currentRetries = node.retryCount ?? 0;
      const maxRetries = node.retryPolicy.maxRetries;
      if (currentRetries < maxRetries) {
        node.retryCount = currentRetries + 1;
        await this.retryNode(nodeId);
      } else {
        node.status = 'failed';
        this.emitEvent({
          type: 'node_failed',
          workflowId: this.state.id,
          nodeId,
          timestamp: Date.now(),
          data: { error: `Max retries (${maxRetries}) exhausted: ${error}` },
        });
      }
    }
  }

  async blockNode(nodeId: string, reason: string): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.status = 'blocked';
    this.state.updatedAt = Date.now();

    this.emitEvent({
      type: 'node_blocked',
      workflowId: this.state.id,
      nodeId,
      timestamp: Date.now(),
      data: { reason },
    });
  }

  async pauseNode(nodeId: string): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.status = 'paused';
    this.state.updatedAt = Date.now();

    this.emitEvent({
      type: 'node_paused',
      workflowId: this.state.id,
      nodeId,
      timestamp: Date.now(),
    });
  }

  async retryNode(nodeId: string): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (!node.retryPolicy) {
      throw new Error(`No retry policy for node: ${nodeId}`);
    }

    // Reset node state
    node.status = 'pending';
    node.error = undefined;
    node.tasks = [];
    this.state.updatedAt = Date.now();

    // Add backoff delay
    await new Promise(resolve => setTimeout(resolve, node.retryPolicy!.backoffMs));

    // Restart node
    await this.startNode(nodeId);
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  async addTask(nodeId: string, task: Task): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.tasks.push(task);
    this.state.updatedAt = Date.now();

    this.emitEvent({
      type: 'task_started',
      workflowId: this.state.id,
      nodeId,
      taskId: task.id,
      timestamp: Date.now(),
    });
  }

  async updateTaskStatus(nodeId: string, taskId: string, status: TaskStatus, result?: unknown, error?: string): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const task = node.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = status;
    if (result !== undefined) task.result = result;
    if (error) task.error = error;
    if (status === 'completed' || status === 'failed') {
      task.completedAt = Date.now();
    }

    this.state.updatedAt = Date.now();

    const eventType = status === 'completed' ? 'task_completed' : 'task_failed';
    this.emitEvent({
      type: eventType,
      workflowId: this.state.id,
      nodeId,
      taskId,
      timestamp: Date.now(),
      data: { result, error },
    });
  }

  // ============================================================================
  // Approval Flow
  // ============================================================================

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    this.pendingApprovals.set(request.id, request);

    this.emitEvent({
      type: 'approval_required',
      workflowId: this.state.id,
      nodeId: request.nodeId,
      timestamp: Date.now(),
      data: request,
    });

    // If external handler is configured, use it
    if (this.options.onApprovalRequest) {
      const response = await this.options.onApprovalRequest(request);
      this.pendingApprovals.delete(request.id);
      return response;
    }

    // Otherwise, wait for manual approval with timeout
    const timeoutMs = this.options.approvalTimeoutMs ?? 300_000; // 5 minutes default
    return new Promise<ApprovalResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.approvalResolvers.delete(request.id);
        this.pendingApprovals.delete(request.id);
        reject(new Error(`Approval request ${request.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.approvalResolvers.set(request.id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  async approveRequest(response: ApprovalResponse): Promise<void> {
    const resolver = this.approvalResolvers.get(response.requestId);
    if (!resolver) {
      throw new Error(`No pending approval: ${response.requestId}`);
    }

    this.pendingApprovals.delete(response.requestId);
    this.approvalResolvers.delete(response.requestId);
    // resolver already wraps clearTimeout via the timeout mechanism
    resolver(response);
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  // ============================================================================
  // Quality Gates
  // ============================================================================

  async runQualityGate(nodeId: string): Promise<QualityGate> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (!node.qualityGate) {
      throw new Error(`No quality gate for node: ${nodeId}`);
    }

    const gate = node.qualityGate;

    // Run checks based on actual artifact and node state
    for (const check of gate.checks) {
      check.status = this.evaluateQualityCheck(check, node);
    }

    // Determine overall status
    const hasFailed = gate.checks.some(c => c.status === 'failed');
    const hasWarning = gate.checks.some(c => c.status === 'warning');
    gate.status = hasFailed ? 'failed' : hasWarning ? 'warning' : 'passed';

    this.emitEvent({
      type: 'quality_gate_checked',
      workflowId: this.state.id,
      nodeId,
      timestamp: Date.now(),
      data: gate,
    });

    return gate;
  }

  // ============================================================================
  // Artifact Management
  // ============================================================================

  async addArtifact(nodeId: string, artifact: ArtifactRef): Promise<void> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    node.artifacts.push(artifact);
    this.state.updatedAt = Date.now();
  }

  async getArtifacts(nodeId: string): Promise<ArtifactRef[]> {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    return node.artifacts;
  }

  async getAllArtifacts(): Promise<ArtifactRef[]> {
    const artifacts: ArtifactRef[] = [];
    for (const node of this.getNodes()) {
      artifacts.push(...node.artifacts);
    }
    return artifacts;
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  async navigateTo(nodeId: string, reason: string): Promise<void> {
    const from = this.state.currentNodeId;
    if (from) {
      this.addTransition(from, nodeId, reason);
    }

    this.state.currentNodeId = nodeId;
    this.state.updatedAt = Date.now();

    // If target node is pending, start it
    const node = this.state.nodes[nodeId];
    if (node && node.status === 'pending') {
      await this.startNode(nodeId);
    }
  }

  async backtrack(nodeId: string, reason: string): Promise<void> {
    // Reset the target node and all downstream nodes
    // Note: artifacts are preserved — they are tracked globally in ArtifactManager
    // and referenced by provenance chains. Clearing them would break integrity.
    const downstream = this.getDownstreamNodes(nodeId);
    for (const id of [nodeId, ...downstream]) {
      const node = this.state.nodes[id];
      if (node) {
        node.status = 'pending';
        node.result = undefined;
        node.error = undefined;
        node.tasks = [];
        node.retryCount = 0;
        // Keep node.artifacts intact to preserve provenance references
      }
    }

    await this.navigateTo(nodeId, reason);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getUnmetDependencies(nodeId: string): string[] {
    const node = this.state.nodes[nodeId];
    if (!node) return [];

    return node.dependencies.filter(depId => {
      const dep = this.state.nodes[depId];
      return !dep || dep.status !== 'completed';
    });
  }

  private getDownstreamNodes(nodeId: string): string[] {
    const downstream: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      for (const node of this.getNodes()) {
        if (node.dependencies.includes(id)) {
          downstream.push(node.id);
          traverse(node.id);
        }
      }
    };

    traverse(nodeId);
    return downstream;
  }

  private evaluateQualityCheck(check: QualityCheck, node: WorkflowNode): 'passed' | 'warning' | 'failed' {
    // Base validation: node must have artifacts
    if (node.artifacts.length === 0) {
      check.details = 'No artifacts produced by this stage';
      return 'failed';
    }

    // Check-specific validation based on check name patterns.
    // Order from most specific to least specific to avoid false matches.
    // e.g. "paper_citation" should match writing, not literature.
    const name = check.name.toLowerCase();

    // Writing checks (most specific — includes "paper", "citation", "figure", "reference")
    if (name.includes('claim') || name.includes('citation') || name.includes('reference') || name.includes('writing')) {
      const hasPaper = node.artifacts.some(a => a.type === 'paper' || a.type === 'draft_section');
      if (!hasPaper) {
        check.details = 'Missing paper or draft_section artifact';
        return 'failed';
      }
      return 'passed';
    }

    // Reproduction checks (before method — includes "baseline")
    if (name.includes('environment') || name.includes('env') || name.includes('reproduction')) {
      const hasRepo = node.artifacts.some(a => a.type === 'repo');
      const hasLog = node.artifacts.some(a => a.type === 'reproduction_log');
      if (!hasRepo) {
        check.details = 'Missing repo artifact';
        return 'failed';
      }
      if (!hasLog) {
        check.details = 'Missing reproduction_log artifact';
        return 'warning';
      }
      return 'passed';
    }

    // Experiment checks (before method — includes "metrics", "figure")
    if (name.includes('config') || name.includes('seed') || name.includes('experiment')) {
      const hasResult = node.artifacts.some(a => a.type === 'experiment_result');
      if (!hasResult) {
        check.details = 'Missing experiment_result artifact';
        return 'failed';
      }
      return 'passed';
    }

    // Method checks
    if (name.includes('research') || name.includes('question') || name.includes('method') || name.includes('hypothesis') || name.includes('baseline') || name.includes('metric')) {
      const hasMethod = node.artifacts.some(a => a.type === 'method');
      if (!hasMethod) {
        check.details = 'Missing method artifact';
        return 'failed';
      }
      return 'passed';
    }

    // Literature checks (broad — includes "paper")
    if (name.includes('paper') || name.includes('literature') || name.includes('survey')) {
      const hasPool = node.artifacts.some(a => a.type === 'literature_pool');
      const hasSurvey = node.artifacts.some(a => a.type === 'survey');
      if (!hasPool) {
        check.details = 'Missing literature_pool artifact';
        return 'failed';
      }
      if (!hasSurvey && name.includes('survey')) {
        check.details = 'Missing survey artifact';
        return 'warning';
      }
      return 'passed';
    }

    // Default: check that artifacts exist
    return 'passed';
  }

  private isWorkflowComplete(): boolean {
    return this.getNodes().every(n => n.status === 'completed');
  }

  private addTransition(from: string, to: string, reason: string): void {
    this.state.history.push({
      from,
      to,
      reason,
      timestamp: Date.now(),
    });
  }

  private emitEvent(event: WorkflowEvent): void {
    this.options.onEvent?.(event);
    this.emit(event.type, event);
  }
}
