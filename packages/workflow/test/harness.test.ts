/**
 * Research Harness Tests
 *
 * Test harness orchestration functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchHarness, STAGE_PROMPTS } from '../src/harness.js';
import { createDefaultResearchWorkflow } from '../src/presets.js';
import type { ApprovalResponse } from '../src/types.js';

describe('ResearchHarness', () => {
  let harness: ResearchHarness;
  const testDir = '/tmp/test-project';

  beforeEach(() => {
    const config = createDefaultResearchWorkflow();

    harness = new ResearchHarness({
      workflowConfig: config,
      projectDir: testDir,
      onApprovalNeeded: async () => ({ approved: true, requestId: '' }),
      onLog: () => {},
    });
  });

  describe('Initialization', () => {
    it('should create harness with workflow nodes', () => {
      const nodes = harness.getNodes();
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('should have all default stages', () => {
      const nodes = harness.getNodes();
      const types = nodes.map(n => n.type);

      expect(types).toContain('literature');
      expect(types).toContain('method');
      expect(types).toContain('reproduction');
      expect(types).toContain('experiment');
      expect(types).toContain('writing');
    });

    it('should not be running initially', () => {
      expect(harness.isRunning()).toBe(false);
    });
  });

  describe('Stage Prompts', () => {
    it('should have prompts for all stages', () => {
      expect(STAGE_PROMPTS.literature).toBeDefined();
      expect(STAGE_PROMPTS.method).toBeDefined();
      expect(STAGE_PROMPTS.reproduction).toBeDefined();
      expect(STAGE_PROMPTS.experiment).toBeDefined();
      expect(STAGE_PROMPTS.writing).toBeDefined();
    });

    it('should generate stage prompt', () => {
      const prompt = harness.generateStagePrompt('literature');
      expect(prompt).toContain('literature survey');
      expect(prompt).toContain('search_papers');
    });
  });

  describe('Node Execution', () => {
    it('should execute first node', async () => {
      const stageStartSpy = vi.fn();
      harness.on('stage_prompt', stageStartSpy);

      await harness.start();

      expect(stageStartSpy).toHaveBeenCalled();
      // Harness should be running since it executes all nodes
      expect(harness.isRunning()).toBe(true);
    });

    it('should emit stage_prompt with correct structure', async () => {
      let receivedPrompt: any = null;
      harness.on('stage_prompt', (prompt) => {
        receivedPrompt = prompt;
      });

      await harness.start();

      expect(receivedPrompt).toBeDefined();
      expect(receivedPrompt.systemPrompt).toBeDefined();
      expect(receivedPrompt.taskDescription).toBeDefined();
      expect(receivedPrompt.outputInstructions).toBeDefined();
    });
  });

  describe('Artifact Registration', () => {
    it('should register artifact', async () => {
      await harness.start();

      const currentNode = harness.getCurrentNode();
      if (currentNode) {
        const artifact = harness.registerArtifact({
          nodeId: currentNode.id,
          type: 'survey',
          path: '/tmp/survey.md',
          metadata: { title: 'Survey' },
        });

        expect(artifact.type).toBe('survey');
        expect(artifact.path).toBe('/tmp/survey.md');
      }
    });
  });

  describe('State Access', () => {
    it('should get workflow state', () => {
      const state = harness.getState();
      expect(state.id).toBeDefined();
      expect(state.nodes).toBeDefined();
    });

    it('should get current node', () => {
      const node = harness.getCurrentNode();
      // Initially no current node
      expect(node).toBeUndefined();
    });

    it('should get all artifacts', () => {
      const artifacts = harness.getArtifacts();
      expect(Array.isArray(artifacts)).toBe(true);
    });
  });

  describe('Approval Flow', () => {
    it('should request approval when needed', async () => {
      const approvalSpy = vi.fn().mockResolvedValue({
        approved: true,
        requestId: '',
      } as ApprovalResponse);

      const harnessWithApproval = new ResearchHarness({
        workflowConfig: createDefaultResearchWorkflow(),
        projectDir: testDir,
        onApprovalNeeded: approvalSpy,
      });

      await harnessWithApproval.start();

      // First node (literature) requires approval
      expect(approvalSpy).toHaveBeenCalled();
    });

    it('should block node when approval rejected', async () => {
      const harnessWithRejection = new ResearchHarness({
        workflowConfig: createDefaultResearchWorkflow(),
        projectDir: testDir,
        onApprovalNeeded: async () => ({
          approved: false,
          requestId: '',
        }),
      });

      await harnessWithRejection.start();

      const nodes = harnessWithRejection.getNodes();
      const firstNode = nodes.find(n => n.dependencies.length === 0);
      expect(firstNode?.status).toBe('blocked');
    });
  });

  describe('Pause and Resume', () => {
    it('should pause execution', async () => {
      // Start in background
      const startPromise = harness.start();

      // Pause immediately
      await harness.pause();

      expect(harness.isRunning()).toBe(false);
    });
  });
});
