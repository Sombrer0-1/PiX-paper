/**
 * Research Harness
 *
 * Orchestrates LLM Agent execution through research workflow stages.
 * Manages state, quality gates, approvals, and artifact tracking.
 */

import { EventEmitter } from 'events';
import { WorkflowEngine } from './engine.js';
import { ArtifactManager } from './artifact-manager.js';
import { ToolRegistry, createDefaultToolRegistry } from './tool-registry.js';
import type { AgentRunner, AgentResult } from './agent-runner.js';
import type {
  WorkflowState,
  WorkflowNode,
  WorkflowConfig,
  Artifact,
  ArtifactType,
  QualityGate,
  ApprovalRequest,
  ApprovalResponse,
  Task,
} from './types.js';

// ============================================================================
// Stage Prompt Templates
// ============================================================================

export interface StagePrompt {
  systemPrompt: string;
  taskDescription: string;
  outputInstructions: string;
  qualityChecks: string[];
}

export const STAGE_PROMPTS: Record<string, StagePrompt> = {
  literature: {
    systemPrompt: `You are a research assistant conducting a literature survey.
Your goal is to find relevant papers, analyze them, and identify research gaps.`,
    taskDescription: `Conduct a literature survey on the given topic:
1. Use search_papers to find relevant papers
2. Read and analyze the top papers
3. Identify key findings, methods, and limitations
4. Synthesize a literature review
5. Identify research gaps and opportunities`,
    outputInstructions: `Output your findings as:
- literature_pool.json: Structured list of papers with metadata
- survey.md: Literature review document
- gaps.md: Identified research gaps`,
    qualityChecks: [
      'At least 10 relevant papers found',
      'Each paper has abstract, year, source, URL',
      'No duplicate papers',
      'Research gaps clearly identified',
    ],
  },
  method: {
    systemPrompt: `You are a research method designer.
Your goal is to design a novel method based on the literature survey findings.`,
    taskDescription: `Design a research method:
1. Analyze the research gaps from literature survey
2. Formulate a clear research question
3. Propose a novel method/approach
4. Define evaluation metrics
5. Plan experiments to validate the method`,
    outputInstructions: `Output your design as:
- method.md: Detailed method description
- research_question.md: Clear research question
- experiment_plan.md: Experiment design`,
    qualityChecks: [
      'Clear research question defined',
      'Novel contribution identified',
      'Evaluation metrics defined',
      'Baseline methods identified',
    ],
  },
  reproduction: {
    systemPrompt: `You are a research engineer reproducing baseline methods.
Your goal is to clone repositories, set up environments, and reproduce baseline results.`,
    taskDescription: `Reproduce baseline methods:
1. Find and clone the baseline code repository
2. Set up the required environment (conda/venv/pip)
3. Run the baseline experiments
4. Verify results match the paper
5. Document the reproduction process`,
    outputInstructions: `Output your work as:
- reproduction_log.md: Step-by-step reproduction notes
- baseline_results.json: Baseline metrics
- environment.yml: Environment configuration`,
    qualityChecks: [
      'Repository successfully cloned',
      'Environment properly configured',
      'Baseline results reproduced',
      'Results match paper claims',
    ],
  },
  experiment: {
    systemPrompt: `You are a research experimenter.
Your goal is to implement the proposed method and run comparison experiments.`,
    taskDescription: `Run experiments:
1. Implement the proposed method
2. Prepare datasets
3. Run comparison experiments
4. Collect metrics
5. Generate comparison charts`,
    outputInstructions: `Output your results as:
- our_code/: Implementation code
- experiment_results/: Raw results
- figures/: Comparison charts
- analysis.md: Results analysis`,
    qualityChecks: [
      'Method successfully implemented',
      'All experiments completed',
      'Metrics properly collected',
      'Statistical significance checked',
    ],
  },
  writing: {
    systemPrompt: `You are an academic paper writer.
Your goal is to write a complete research paper based on the conducted research.`,
    taskDescription: `Write the research paper:
1. Create paper outline
2. Write each section:
   - Abstract
   - Introduction
   - Related Work
   - Method
   - Experiments
   - Conclusion
3. Add citations and references
4. Insert figures and tables`,
    outputInstructions: `Output your paper as:
- paper.md: Complete paper in Markdown
- references.json: Bibliography
- figures/: Paper figures`,
    qualityChecks: [
      'All sections complete',
      'Claims supported by citations',
      'Figures properly referenced',
      'References complete',
    ],
  },
  review: {
    systemPrompt: `You are a research quality reviewer.
Your goal is to review the entire research process and ensure quality.`,
    taskDescription: `Review the research:
1. Check all stage outputs
2. Verify quality gates passed
3. Ensure artifacts are complete
4. Validate paper quality
5. Provide final approval`,
    outputInstructions: `Output your review as:
- review.md: Review summary
- quality_report.md: Quality assessment`,
    qualityChecks: [
      'All stages completed',
      'Quality gates passed',
      'Artifacts complete',
      'Paper meets standards',
    ],
  },
};

// ============================================================================
// Harness Options
// ============================================================================

export interface HarnessOptions {
  workflowConfig: WorkflowConfig;
  projectDir: string;
  toolRegistry?: ToolRegistry;
  /** Agent runner for executing LLM tasks. If omitted, stages complete without agent execution. */
  agentRunner?: AgentRunner;
  onStageStart?: (nodeId: string) => void;
  onStageComplete?: (nodeId: string, artifacts: Artifact[]) => void;
  onApprovalNeeded?: (request: ApprovalRequest) => Promise<ApprovalResponse>;
  onQualityGate?: (nodeId: string, gate: QualityGate) => void;
  onLog?: (message: string) => void;
  /** Callback for streaming agent output */
  onAgentOutput?: (nodeId: string, text: string) => void;
  /** Callback for agent tool calls */
  onAgentToolCall?: (nodeId: string, name: string, args: Record<string, unknown>) => void;
}

// ============================================================================
// Research Harness
// ============================================================================

export class ResearchHarness extends EventEmitter {
  private workflowEngine: WorkflowEngine;
  private artifactManager: ArtifactManager;
  private toolRegistry: ToolRegistry;
  private options: HarnessOptions;
  private running = false;

  constructor(options: HarnessOptions) {
    super();
    this.options = options;

    // Initialize workflow state
    const workflowState: WorkflowState = {
      id: `workflow-${Date.now()}`,
      projectId: options.projectDir,
      nodes: this.createNodesFromConfig(options.workflowConfig),
      currentNodeId: null,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workflowEngine = new WorkflowEngine(workflowState, {
      onEvent: (event) => this.emit(event.type, event),
      onApprovalRequest: options.onApprovalNeeded,
    });

    this.artifactManager = new ArtifactManager({
      storagePath: `${options.projectDir}/.pp/artifacts.json`,
      autoSave: true,
    });

    this.toolRegistry = options.toolRegistry || createDefaultToolRegistry();
  }

  // ============================================================================
  // Node Creation
  // ============================================================================

  private createNodesFromConfig(config: WorkflowConfig): Record<string, WorkflowNode> {
    const nodes: Record<string, WorkflowNode> = {};

    for (const nodeConfig of config.nodes) {
      nodes[nodeConfig.id] = {
        id: nodeConfig.id,
        type: nodeConfig.type,
        name: nodeConfig.name,
        description: nodeConfig.description,
        status: 'pending',
        dependencies: nodeConfig.dependencies,
        artifacts: [],
        retryPolicy: nodeConfig.retryPolicy,
        approvalRequired: nodeConfig.approvalRequired,
        qualityGate: nodeConfig.qualityGateChecks ? {
          id: `gate-${nodeConfig.id}`,
          stageId: nodeConfig.id,
          checks: nodeConfig.qualityGateChecks.map(check => ({
            id: check.id,
            name: check.name,
            description: check.description,
            status: 'pending',
          })),
          status: 'pending',
        } : undefined,
        tasks: [],
      };
    }

    return nodes;
  }

  // ============================================================================
  // Execution
  // ============================================================================

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Harness is already running');
    }

    this.running = true;
    this.log('Starting research harness');

    try {
      // Find first executable node
      const firstNode = this.findNextNode();
      if (!firstNode) {
        throw new Error('No executable node found');
      }

      await this.executeNode(firstNode.id);
    } catch (error) {
      this.running = false;
      throw error;
    }
  }

  async executeNode(nodeId: string): Promise<void> {
    const node = this.workflowEngine.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    this.log(`Executing stage: ${node.name}`);
    this.options.onStageStart?.(nodeId);

    // Start node
    await this.workflowEngine.startNode(nodeId);

    // Request approval if needed
    if (node.approvalRequired) {
      const approved = await this.requestApproval(node);
      if (!approved) {
        await this.workflowEngine.blockNode(nodeId, 'User rejected');
        return;
      }
    }

    // Get stage prompt
    const prompt = STAGE_PROMPTS[node.type];
    if (!prompt) {
      throw new Error(`No prompt template for stage: ${node.type}`);
    }

    // Execute stage tasks
    await this.executeStageTasks(node, prompt);

    // Run quality gate
    if (node.qualityGate) {
      const gateResult = await this.runQualityGate(node);
      this.options.onQualityGate?.(nodeId, gateResult);

      if (gateResult.status === 'failed') {
        await this.workflowEngine.failNode(nodeId, 'Quality gate failed');
        return;
      }
    }

    // Complete node
    await this.workflowEngine.completeNode(nodeId);
    const artifacts = this.artifactManager.getByNode(nodeId);
    this.options.onStageComplete?.(nodeId, artifacts);

    this.log(`Completed stage: ${node.name}`);

    // Find and execute next node
    if (this.running) {
      const nextNode = this.findNextNode();
      if (nextNode) {
        await this.executeNode(nextNode.id);
      } else {
        this.running = false;
        this.log('All stages completed');
        this.emit('workflow_complete');
      }
    }
  }

  // ============================================================================
  // Stage Execution
  // ============================================================================

  private async executeStageTasks(node: WorkflowNode, prompt: StagePrompt): Promise<void> {
    // Create task for LLM execution
    const task: Task = {
      id: `task-${Date.now()}`,
      nodeId: node.id,
      type: 'agent',
      name: `Execute ${node.name}`,
      description: prompt.taskDescription,
      status: 'running',
      startedAt: Date.now(),
    };

    await this.workflowEngine.addTask(node.id, task);

    // Emit stage prompt event (for UI display)
    this.emit('stage_prompt', {
      nodeId: node.id,
      systemPrompt: prompt.systemPrompt,
      taskDescription: prompt.taskDescription,
      outputInstructions: prompt.outputInstructions,
    });

    // If we have an agent runner, execute the stage with the LLM
    if (this.options.agentRunner) {
      const fullPrompt = this.buildStagePrompt(node, prompt);

      try {
        const result = await this.options.agentRunner.run({
          systemPrompt: prompt.systemPrompt,
          userPrompt: fullPrompt,
          cwd: this.options.projectDir,
          onOutput: (text) => {
            this.options.onAgentOutput?.(node.id, text);
            this.emit('agent_output', { nodeId: node.id, text });
          },
          onToolCall: (name, args) => {
            this.options.onAgentToolCall?.(node.id, name, args);
            this.emit('agent_tool_call', { nodeId: node.id, name, args });
          },
        });

        // Register any files the agent wrote as artifacts
        if (result.filesWritten.length > 0) {
          for (const file of result.filesWritten) {
            this.registerArtifact({
              nodeId: node.id,
              type: this.inferArtifactType(file.path, node.type),
              path: file.path,
              metadata: { summary: file.summary },
            });
          }
        }

        // Store the agent result on the task
        task.result = result.output;
        await this.workflowEngine.updateTaskStatus(node.id, task.id, 'completed', result.output);

        this.log(`Agent completed stage "${node.name}" — ${result.filesWritten.length} files written`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await this.workflowEngine.updateTaskStatus(node.id, task.id, 'failed', undefined, errorMsg);
        throw error;
      }
    } else {
      // No agent runner — mark task as completed (development/testing mode)
      await this.workflowEngine.updateTaskStatus(node.id, task.id, 'completed');
    }
  }

  /**
   * Build a complete prompt for a stage, including context from previous stages.
   */
  private buildStagePrompt(node: WorkflowNode, prompt: StagePrompt): string {
    const previousArtifacts = this.getPreviousArtifacts(node.id);

    let contextSection = '';
    if (previousArtifacts.length > 0) {
      contextSection = `\n\n## Previous Stage Outputs\n\nThe following artifacts were produced by previous stages. Use them as context:\n\n${
        previousArtifacts.map(a => `- **${a.type}**: ${a.path}`).join('\n')
      }`;
    }

    return `${prompt.taskDescription}${contextSection}

## Output Instructions

${prompt.outputInstructions}

## Quality Requirements

${prompt.qualityChecks.map(c => `- ${c}`).join('\n')}

## Important

- Write all output files to the project directory: ${this.options.projectDir}
- Use the available tools (search_papers, add_to_library, etc.) when needed
- After completing your work, summarize what you produced
`;
  }

  /**
   * Infer artifact type from file path and node type.
   */
  private inferArtifactType(filePath: string, nodeType: string): ArtifactType {
    const basename = filePath.split(/[/\\]/).pop() || '';

    if (basename.includes('literature_pool') || basename.includes('library')) return 'literature_pool';
    if (basename.includes('survey')) return 'survey';
    if (basename.includes('method')) return 'method';
    if (basename.includes('reproduction') || basename.includes('baseline')) return 'reproduction_log';
    if (basename.includes('experiment')) return 'experiment_result';
    if (basename.includes('figure') || basename.endsWith('.png') || basename.endsWith('.svg')) return 'figure';
    if (basename.includes('paper') || basename.endsWith('.md') || basename.endsWith('.tex')) return 'paper';
    if (basename.includes('config')) return 'experiment_config';

    // Fallback based on node type
    switch (nodeType) {
      case 'literature': return 'literature_pool';
      case 'method': return 'method';
      case 'reproduction': return 'reproduction_log';
      case 'experiment': return 'experiment_result';
      case 'writing': return 'paper';
      default: return 'paper';
    }
  }

  // ============================================================================
  // Approval
  // ============================================================================

  private async requestApproval(node: WorkflowNode): Promise<boolean> {
    const request: ApprovalRequest = {
      id: `approval-${Date.now()}`,
      nodeId: node.id,
      workflowId: this.workflowEngine.getState().id,
      type: 'confirm',
      title: `Proceed with ${node.name}?`,
      description: `Stage "${node.name}" requires your approval to continue.\n\n${node.description}`,
    };

    this.emit('approval_needed', request);

    if (this.options.onApprovalNeeded) {
      const response = await this.options.onApprovalNeeded(request);
      return response.approved;
    }

    // Default: auto-approve
    return true;
  }

  // ============================================================================
  // Quality Gate
  // ============================================================================

  private async runQualityGate(node: WorkflowNode): Promise<QualityGate> {
    this.log(`Running quality gate for: ${node.name}`);

    // Delegate to the engine's quality gate which performs actual artifact-based checks
    const gate = await this.workflowEngine.runQualityGate(node.id);

    return gate;
  }

  // ============================================================================
  // Artifact Registration
  // ============================================================================

  registerArtifact(params: {
    nodeId: string;
    type: ArtifactType;
    path: string;
    metadata?: Record<string, unknown>;
  }): Artifact {
    const artifact = this.artifactManager.create({
      projectId: this.options.projectDir,
      type: params.type,
      path: params.path,
      createdBy: 'agent',
      sourceNodeId: params.nodeId,
      metadata: params.metadata,
    });

    // Add to workflow node
    this.workflowEngine.addArtifact(params.nodeId, {
      id: artifact.id,
      type: artifact.type,
      path: artifact.path,
      description: artifact.metadata.description as string || '',
    });

    this.log(`Registered artifact: ${artifact.type} at ${artifact.path}`);
    return artifact;
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  private findNextNode(): WorkflowNode | undefined {
    const nodes = this.workflowEngine.getNodes();

    // Find first pending node whose dependencies are all completed
    for (const node of nodes) {
      if (node.status !== 'pending') continue;

      const depsCompleted = node.dependencies.every(depId => {
        const dep = this.workflowEngine.getNode(depId);
        return dep?.status === 'completed';
      });

      if (depsCompleted) {
        return node;
      }
    }

    return undefined;
  }

  async backtrack(nodeId: string, reason: string): Promise<void> {
    this.log(`Backtracking to: ${nodeId} (${reason})`);
    this.running = false;
    await this.workflowEngine.backtrack(nodeId, reason);
  }

  async pause(): Promise<void> {
    this.running = false;
    const currentNode = this.workflowEngine.getCurrentNode();
    if (currentNode) {
      await this.workflowEngine.pauseNode(currentNode.id);
    }
    this.log('Harness paused');
  }

  async resume(): Promise<void> {
    this.running = true;
    const currentNode = this.workflowEngine.getCurrentNode();
    if (currentNode && currentNode.status === 'paused') {
      await this.executeNode(currentNode.id);
    }
    this.log('Harness resumed');
  }

  // ============================================================================
  // State Access
  // ============================================================================

  getState(): WorkflowState {
    return this.workflowEngine.getState();
  }

  getCurrentNode(): WorkflowNode | undefined {
    return this.workflowEngine.getCurrentNode();
  }

  getNodes(): WorkflowNode[] {
    return this.workflowEngine.getNodes();
  }

  getArtifacts(): Artifact[] {
    return this.artifactManager.getAll();
  }

  getNodeArtifacts(nodeId: string): Artifact[] {
    return this.artifactManager.getByNode(nodeId);
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Prompt Generation
  // ============================================================================

  generateStagePrompt(nodeId: string): string {
    const node = this.workflowEngine.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const prompt = STAGE_PROMPTS[node.type];
    if (!prompt) {
      throw new Error(`No prompt template for stage: ${node.type}`);
    }

    // Get previous stage artifacts for context
    const previousArtifacts = this.getPreviousArtifacts(nodeId);

    return `${prompt.systemPrompt}

## Current Task

${prompt.taskDescription}

## Previous Stage Outputs

${previousArtifacts.length > 0
  ? previousArtifacts.map(a => `- ${a.type}: ${a.path}`).join('\n')
  : 'No previous outputs'}

## Output Instructions

${prompt.outputInstructions}

## Quality Requirements

${prompt.qualityChecks.map(c => `- ${c}`).join('\n')}
`;
  }

  private getPreviousArtifacts(nodeId: string): Artifact[] {
    const node = this.workflowEngine.getNode(nodeId);
    if (!node) return [];

    const artifacts: Artifact[] = [];
    for (const depId of node.dependencies) {
      artifacts.push(...this.artifactManager.getByNode(depId));
    }

    return artifacts;
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(message: string): void {
    this.options.onLog?.(message);
    this.emit('log', message);
  }
}
