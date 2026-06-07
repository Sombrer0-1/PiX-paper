/**
 * Workflow Engine Bridge
 *
 * Exposes pp-workflow's ResearchHarness to the renderer via IPC.
 * Manages the lifecycle of research workflows.
 */

import {
  WorkflowEngine,
  ArtifactManager,
  ResearchHarness,
  createDefaultResearchWorkflow,
  createQuickSurveyWorkflow,
  createExperimentOnlyWorkflow,
  type WorkflowState,
  type WorkflowNode,
  type WorkflowConfig,
  type Artifact,
  type ArtifactType,
  type QualityGate,
  type ApprovalRequest,
  type ApprovalResponse,
  type WorkflowEvent,
  type AgentRunner,
  type AgentResult,
} from 'pp-workflow';
import { initResearchProject } from './project-init.js';
import type { BrowserWindow } from 'electron';

export interface WorkflowBridgeOptions {
  projectDir: string;
  getWin: () => BrowserWindow | null;
  /** Agent runner for executing LLM tasks */
  agentRunner?: AgentRunner;
}

export class WorkflowBridge {
  private harness: ResearchHarness | null = null;
  private options: WorkflowBridgeOptions;
  private artifactManager: ArtifactManager | null = null;

  constructor(options: WorkflowBridgeOptions) {
    this.options = options;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async startWorkflow(templateId: string = 'default', topic?: string): Promise<void> {
    if (this.harness) {
      await this.stopWorkflow();
    }

    // Initialize project directory structure
    initResearchProject({
      projectDir: this.options.projectDir,
      topic: topic || 'Research Project',
      templateId,
    });

    const config = this.getWorkflowConfig(templateId);

    this.harness = new ResearchHarness({
      workflowConfig: config,
      projectDir: this.options.projectDir,
      agentRunner: this.options.agentRunner,
      onStageStart: (nodeId: string) => this.sendToRenderer('workflow-stage-start', { nodeId }),
      onStageComplete: (nodeId: string, stageArtifacts: Artifact[]) => this.sendToRenderer('workflow-stage-complete', { nodeId, artifacts: stageArtifacts }),
      onApprovalNeeded: (request: ApprovalRequest) => this.handleApprovalRequest(request),
      onQualityGate: (nodeId: string, gate: QualityGate) => this.sendToRenderer('workflow-quality-gate', { nodeId, gate }),
      onLog: (message: string) => this.sendToRenderer('workflow-log', { message }),
      onAgentOutput: (nodeId: string, text: string) => this.sendToRenderer('workflow-agent-output', { nodeId, text }),
      onAgentToolCall: (nodeId: string, name: string, args: Record<string, unknown>) => this.sendToRenderer('workflow-agent-tool-call', { nodeId, name, args }),
    });

    // Forward all workflow events to renderer
    const forwardEvent = (event: WorkflowEvent) => this.sendToRenderer('workflow-event', event);
    this.harness.on('node_started', forwardEvent);
    this.harness.on('node_completed', forwardEvent);
    this.harness.on('node_failed', forwardEvent);
    this.harness.on('node_blocked', forwardEvent);
    this.harness.on('node_paused', forwardEvent);
    this.harness.on('task_started', forwardEvent);
    this.harness.on('task_completed', forwardEvent);
    this.harness.on('task_failed', forwardEvent);
    this.harness.on('approval_required', forwardEvent);
    this.harness.on('quality_gate_checked', forwardEvent);
    this.harness.on('workflow_completed', forwardEvent);
    this.harness.on('workflow_failed', forwardEvent);
    this.harness.on('stage_prompt', (data: unknown) => this.sendToRenderer('workflow-stage-prompt', data));
    this.harness.on('workflow_complete', () => this.sendToRenderer('workflow-complete', {}));
    this.harness.on('agent_output', (data: unknown) => this.sendToRenderer('workflow-agent-output', data));
    this.harness.on('agent_tool_call', (data: unknown) => this.sendToRenderer('workflow-agent-tool-call', data));

    await this.harness.start();
  }

  async stopWorkflow(): Promise<void> {
    if (this.harness) {
      await this.harness.pause();
      this.harness = null;
    }
  }

  // =========================================================================
  // State Queries
  // =========================================================================

  getWorkflowState(): WorkflowState | null {
    return this.harness?.getState() ?? null;
  }

  getNodes(): WorkflowNode[] {
    return this.harness?.getNodes() ?? [];
  }

  getCurrentNode(): WorkflowNode | undefined {
    return this.harness?.getCurrentNode();
  }

  getArtifacts(): Artifact[] {
    return this.harness?.getArtifacts() ?? [];
  }

  getNodeArtifacts(nodeId: string): Artifact[] {
    return this.harness?.getNodeArtifacts(nodeId) ?? [];
  }

  isRunning(): boolean {
    return this.harness?.isRunning() ?? false;
  }

  // =========================================================================
  // Actions
  // =========================================================================

  async approveNode(requestId: string, approved: boolean, comments?: string): Promise<void> {
    if (!this.harness) throw new Error('No active workflow');
    // The approval is handled through the harness's approval flow
    this.sendToRenderer('workflow-approval-response', { requestId, approved, comments });
  }

  async backtrackToNode(nodeId: string, reason: string): Promise<void> {
    if (!this.harness) throw new Error('No active workflow');
    await this.harness.backtrack(nodeId, reason);
  }

  async pauseWorkflow(): Promise<void> {
    if (!this.harness) throw new Error('No active workflow');
    await this.harness.pause();
  }

  async resumeWorkflow(): Promise<void> {
    if (!this.harness) throw new Error('No active workflow');
    await this.harness.resume();
  }

  async registerArtifact(params: {
    nodeId: string;
    type: ArtifactType;
    path: string;
    metadata?: Record<string, unknown>;
  }): Promise<Artifact> {
    if (!this.harness) throw new Error('No active workflow');
    return this.harness.registerArtifact(params);
  }

  generateStagePrompt(nodeId: string): string {
    if (!this.harness) throw new Error('No active workflow');
    return this.harness.generateStagePrompt(nodeId);
  }

  // =========================================================================
  // Workflow Templates
  // =========================================================================

  getAvailableTemplates(): Array<{ id: string; name: string; description: string }> {
    return [
      { id: 'default', name: '完整研究流程', description: '文献调研 → 方法设计 → 代码复现 → 实验执行 → 论文撰写 → 质量审查' },
      { id: 'quick-survey', name: '快速综述', description: '文献调研 → 综述撰写' },
      { id: 'experiment-only', name: '仅实验', description: '代码搭建 → 实验执行' },
    ];
  }

  private getWorkflowConfig(templateId: string): WorkflowConfig {
    switch (templateId) {
      case 'quick-survey':
        return createQuickSurveyWorkflow();
      case 'experiment-only':
        return createExperimentOnlyWorkflow();
      default:
        return createDefaultResearchWorkflow();
    }
  }

  // =========================================================================
  // Approval Flow
  // =========================================================================

  private approvalResolvers: Map<string, (response: ApprovalResponse) => void> = new Map();

  private handleApprovalRequest(request: ApprovalRequest): Promise<ApprovalResponse> {
    this.sendToRenderer('workflow-approval-request', request);

    return new Promise<ApprovalResponse>((resolve) => {
      this.approvalResolvers.set(request.id, resolve);
    });
  }

  respondApproval(response: ApprovalResponse): void {
    const resolver = this.approvalResolvers.get(response.requestId);
    if (!resolver) {
      throw new Error(`No pending approval: ${response.requestId}`);
    }
    this.approvalResolvers.delete(response.requestId);
    resolver(response);
  }

  // =========================================================================
  // Communication
  // =========================================================================

  private sendToRenderer(channel: string, data: unknown): void {
    const win = this.options.getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }

  async dispose(): Promise<void> {
    await this.stopWorkflow();
    this.approvalResolvers.clear();
  }
}
