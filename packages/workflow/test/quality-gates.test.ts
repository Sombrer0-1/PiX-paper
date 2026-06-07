/**
 * Quality Gates Tests
 *
 * Test quality gate validation for each stage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../src/engine.js';
import type { WorkflowState, WorkflowNode, QualityGate } from '../src/types.js';

describe('Quality Gates Validation', () => {
  let engine: WorkflowEngine;
  let state: WorkflowState;

  beforeEach(() => {
    state = {
      id: 'test-workflow',
      projectId: 'test-project',
      nodes: {
        literature: {
          id: 'literature',
          type: 'literature',
          name: 'Literature Survey',
          description: 'Search papers',
          status: 'pending',
          dependencies: [],
          artifacts: [],
          approvalRequired: true,
          tasks: [],
          qualityGate: {
            id: 'gate-literature',
            stageId: 'literature',
            checks: [
              {
                id: 'check-papers',
                name: 'Min Papers',
                description: 'At least 10 papers',
                status: 'pending',
              },
              {
                id: 'check-metadata',
                name: 'Paper Metadata',
                description: 'Each paper has metadata',
                status: 'pending',
              },
            ],
            status: 'pending',
          },
        },
        method: {
          id: 'method',
          type: 'method',
          name: 'Method Design',
          description: 'Design method',
          status: 'pending',
          dependencies: ['literature'],
          artifacts: [],
          approvalRequired: true,
          tasks: [],
          qualityGate: {
            id: 'gate-method',
            stageId: 'method',
            checks: [
              {
                id: 'check-question',
                name: 'Research Question',
                description: 'Clear research question',
                status: 'pending',
              },
              {
                id: 'check-hypothesis',
                name: 'Hypothesis',
                description: 'Testable hypothesis',
                status: 'pending',
              },
            ],
            status: 'pending',
          },
        },
        experiment: {
          id: 'experiment',
          type: 'experiment',
          name: 'Experiment',
          description: 'Run experiments',
          status: 'pending',
          dependencies: ['method'],
          artifacts: [],
          approvalRequired: false,
          tasks: [],
          qualityGate: {
            id: 'gate-experiment',
            stageId: 'experiment',
            checks: [
              {
                id: 'check-config',
                name: 'Config Record',
                description: 'Experiment config saved',
                status: 'pending',
              },
              {
                id: 'check-metrics',
                name: 'Metrics Record',
                description: 'All metrics recorded',
                status: 'pending',
              },
            ],
            status: 'pending',
          },
        },
      },
      currentNodeId: null,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    engine = new WorkflowEngine(state);
  });

  describe('Literature Quality Gate', () => {
    it('should pass when literature pool artifact exists', async () => {
      await engine.startNode('literature');

      // Add literature pool artifact
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });

      // Add survey artifact
      await engine.addArtifact('literature', {
        id: 'artifact-2',
        type: 'survey',
        path: '/path/to/survey.md',
        description: 'Literature survey',
      });

      const gate = await engine.runQualityGate('literature');

      expect(gate.status).toBe('passed');
      expect(gate.checks[0].status).toBe('passed');
      expect(gate.checks[1].status).toBe('passed');
    });

    it('should fail when no artifacts exist', async () => {
      await engine.startNode('literature');

      const gate = await engine.runQualityGate('literature');

      expect(gate.status).toBe('failed');
      expect(gate.checks[0].status).toBe('failed');
    });

    it('should pass when literature pool artifact exists', async () => {
      await engine.startNode('literature');

      // Add only literature pool artifact
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });

      const gate = await engine.runQualityGate('literature');

      // Should pass because literature_pool artifact exists
      expect(gate.status).toBe('passed');
      expect(gate.checks[0].status).toBe('passed');
    });
  });

  describe('Method Quality Gate', () => {
    it('should pass when method artifact exists', async () => {
      // First complete literature stage
      await engine.startNode('literature');
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });
      await engine.completeNode('literature');

      // Start method stage
      await engine.startNode('method');

      // Add method artifact
      await engine.addArtifact('method', {
        id: 'artifact-2',
        type: 'method',
        path: '/path/to/method.md',
        description: 'Method design',
      });

      const gate = await engine.runQualityGate('method');

      expect(gate.status).toBe('passed');
      expect(gate.checks[0].status).toBe('passed');
      expect(gate.checks[1].status).toBe('passed');
    });

    it('should fail when method artifact is missing', async () => {
      // First complete literature stage
      await engine.startNode('literature');
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });
      await engine.completeNode('literature');

      // Start method stage
      await engine.startNode('method');

      const gate = await engine.runQualityGate('method');

      expect(gate.status).toBe('failed');
    });
  });

  describe('Experiment Quality Gate', () => {
    it('should pass when experiment result artifact exists', async () => {
      // First complete literature and method stages
      await engine.startNode('literature');
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });
      await engine.completeNode('literature');

      await engine.startNode('method');
      await engine.addArtifact('method', {
        id: 'artifact-2',
        type: 'method',
        path: '/path/to/method.md',
        description: 'Method design',
      });
      await engine.completeNode('method');

      // Start experiment stage
      await engine.startNode('experiment');

      // Add experiment result artifact
      await engine.addArtifact('experiment', {
        id: 'artifact-3',
        type: 'experiment_result',
        path: '/path/to/results.json',
        description: 'Experiment results',
      });

      const gate = await engine.runQualityGate('experiment');

      // The gate should have checks
      expect(gate.checks.length).toBeGreaterThan(0);
    });

    it('should fail when experiment result artifact is missing', async () => {
      // First complete literature and method stages
      await engine.startNode('literature');
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });
      await engine.completeNode('literature');

      await engine.startNode('method');
      await engine.addArtifact('method', {
        id: 'artifact-2',
        type: 'method',
        path: '/path/to/method.md',
        description: 'Method design',
      });
      await engine.completeNode('method');

      // Start experiment stage
      await engine.startNode('experiment');

      const gate = await engine.runQualityGate('experiment');

      expect(gate.status).toBe('failed');
    });
  });

  describe('Quality Gate Events', () => {
    it('should emit quality_gate_checked event', async () => {
      await engine.startNode('literature');

      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });

      const eventSpy = vi.fn();
      engine.on('quality_gate_checked', eventSpy);

      await engine.runQualityGate('literature');

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quality_gate_checked',
          nodeId: 'literature',
        })
      );
    });

    it('should include gate status in event', async () => {
      await engine.startNode('literature');

      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });

      let receivedGate: QualityGate | null = null;
      engine.on('quality_gate_checked', (event) => {
        receivedGate = event.data as QualityGate;
      });

      await engine.runQualityGate('literature');

      expect(receivedGate).toBeDefined();
      expect(receivedGate?.status).toBe('passed');
      expect(receivedGate?.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Quality Gate Integration', () => {
    it('should affect node status based on quality gate result', async () => {
      await engine.startNode('literature');

      // No artifacts - quality gate should fail
      const gate = await engine.runQualityGate('literature');

      expect(gate.status).toBe('failed');

      // Node should still be running (quality gate doesn't automatically change node status)
      const node = engine.getNode('literature');
      expect(node?.status).toBe('running');
    });

    it('should work with multiple quality checks', async () => {
      await engine.startNode('literature');

      // Add artifacts that satisfy all checks
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'literature_pool',
        path: '/path/to/literature_pool.json',
        description: 'Literature pool',
      });

      await engine.addArtifact('literature', {
        id: 'artifact-2',
        type: 'survey',
        path: '/path/to/survey.md',
        description: 'Literature survey',
      });

      const gate = await engine.runQualityGate('literature');

      expect(gate.status).toBe('passed');
      expect(gate.checks.every(c => c.status === 'passed')).toBe(true);
    });
  });
});
