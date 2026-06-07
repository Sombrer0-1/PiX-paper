/**
 * End-to-End Tests
 *
 * Test complete research workflow from start to finish.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResearchHarness, STAGE_PROMPTS } from '../src/harness.js';
import { createDefaultResearchWorkflow } from '../src/presets.js';
import type { ApprovalResponse, Artifact } from '../src/types.js';

describe('End-to-End Research Workflow', () => {
  let harness: ResearchHarness;
  const testDir = '/tmp/e2e-test-project';

  beforeEach(() => {
    harness = new ResearchHarness({
      workflowConfig: createDefaultResearchWorkflow(),
      projectDir: testDir,
      onApprovalNeeded: async () => ({ approved: true, requestId: '' }),
      onLog: () => {},
    });
  });

  describe('Complete Workflow Execution', () => {
    it('should execute all stages in order', async () => {
      await harness.start();

      const nodes = harness.getNodes();
      
      // Verify execution order
      const nodeTypes = nodes.map(n => n.type);
      expect(nodeTypes).toEqual([
        'literature',
        'method',
        'reproduction',
        'experiment',
        'writing',
        'review',
      ]);
    });

    it('should emit stage prompts for each stage', async () => {
      const stagePrompts: any[] = [];
      harness.on('stage_prompt', (prompt) => {
        stagePrompts.push(prompt);
      });

      await harness.start();

      // Should have at least one prompt
      expect(stagePrompts.length).toBeGreaterThan(0);

      // Verify prompt structure
      for (const prompt of stagePrompts) {
        expect(prompt).toHaveProperty('nodeId');
        expect(prompt).toHaveProperty('systemPrompt');
        expect(prompt).toHaveProperty('taskDescription');
        expect(prompt).toHaveProperty('outputInstructions');
      }
    });

    it('should execute workflow without errors', async () => {
      const errorSpy = vi.fn();
      harness.on('workflow_failed', errorSpy);

      await harness.start();

      // Workflow should not fail
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Stage-Specific Behavior', () => {
    it('should have correct prompts for literature stage', async () => {
      const stagePrompts: any[] = [];
      harness.on('stage_prompt', (prompt) => {
        stagePrompts.push(prompt);
      });

      await harness.start();

      // Should have at least one prompt
      expect(stagePrompts.length).toBeGreaterThan(0);

      // The first prompt should be for literature stage
      const firstPrompt = stagePrompts[0];
      expect(firstPrompt.nodeId).toBe('literature');
      expect(firstPrompt.systemPrompt).toContain('literature survey');
      expect(firstPrompt.taskDescription).toContain('search_papers');
    });

    it('should generate stage prompts for each stage', async () => {
      // Test that we can generate prompts for each stage
      const stages = ['literature', 'method', 'reproduction', 'experiment', 'writing', 'review'];
      
      for (const stage of stages) {
        const prompt = harness.generateStagePrompt(stage);
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Quality Gates', () => {
    it('should run quality gates for each stage', async () => {
      const qualityGateSpy = vi.fn();
      harness.on('quality_gate_checked', qualityGateSpy);

      await harness.start();

      // Quality gates should be checked for each stage
      expect(qualityGateSpy).toHaveBeenCalled();
    });
  });

  describe('Artifact Management', () => {
    it('should register artifacts', async () => {
      await harness.start();

      // Register artifacts
      const artifact1 = harness.registerArtifact({
        nodeId: 'literature',
        type: 'literature_pool',
        path: '/tmp/literature/pool.json',
        metadata: { description: 'Literature pool' },
      });

      const artifact2 = harness.registerArtifact({
        nodeId: 'method',
        type: 'method',
        path: '/tmp/method/design.md',
        metadata: { description: 'Method design' },
      });

      expect(artifact1.type).toBe('literature_pool');
      expect(artifact2.type).toBe('method');

      // Verify artifacts are stored
      const allArtifacts = harness.getArtifacts();
      expect(allArtifacts.length).toBeGreaterThanOrEqual(2);
    });

    it('should get artifacts by node', async () => {
      await harness.start();

      // Register artifacts for different nodes
      harness.registerArtifact({
        nodeId: 'literature',
        type: 'literature_pool',
        path: '/tmp/literature/pool.json',
      });

      harness.registerArtifact({
        nodeId: 'literature',
        type: 'survey',
        path: '/tmp/literature/survey.md',
      });

      harness.registerArtifact({
        nodeId: 'method',
        type: 'method',
        path: '/tmp/method/design.md',
      });

      // Get artifacts for literature node
      const literatureArtifacts = harness.getNodeArtifacts('literature');
      expect(literatureArtifacts.length).toBeGreaterThanOrEqual(2);

      // Get artifacts for method node
      const methodArtifacts = harness.getNodeArtifacts('method');
      expect(methodArtifacts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Approval Flow', () => {
    it('should request approval for each stage', async () => {
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

      // Should request approval at least once
      expect(approvalSpy).toHaveBeenCalled();
    });

    it('should block stage when approval rejected', async () => {
      let approvalCount = 0;
      const harnessWithRejection = new ResearchHarness({
        workflowConfig: createDefaultResearchWorkflow(),
        projectDir: testDir,
        onApprovalNeeded: async () => {
          approvalCount++;
          // Reject the first approval
          if (approvalCount === 1) {
            return { approved: false, requestId: '' };
          }
          return { approved: true, requestId: '' };
        },
      });

      await harnessWithRejection.start();

      const nodes = harnessWithRejection.getNodes();
      const firstNode = nodes.find(n => n.dependencies.length === 0);
      expect(firstNode?.status).toBe('blocked');
    });
  });

  describe('Pause and Resume', () => {
    it('should pause and resume workflow', async () => {
      // Start in background
      const startPromise = harness.start();

      // Pause after a short delay
      setTimeout(async () => {
        await harness.pause();
      }, 100);

      await startPromise;

      // Should be paused
      expect(harness.isRunning()).toBe(false);

      // Resume
      await harness.resume();

      // Should be running again
      expect(harness.isRunning()).toBe(true);
    });
  });

  describe('Backtracking', () => {
    it('should backtrack to previous stage', async () => {
      await harness.start();

      // Backtrack to literature stage
      await harness.backtrack('literature', 'Need to search more papers');

      const nodes = harness.getNodes();
      const literatureNode = nodes.find(n => n.id === 'literature');

      // Literature node should be running (backtrack starts it)
      expect(literatureNode?.status).toBe('running');

      // Downstream nodes should be reset
      const methodNode = nodes.find(n => n.id === 'method');
      expect(methodNode?.status).toBe('pending');
    });
  });
});
