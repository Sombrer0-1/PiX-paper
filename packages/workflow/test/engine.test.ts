/**
 * WorkflowEngine Tests
 *
 * Test DAG workflow engine functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine } from '../src/engine.js';
import type { WorkflowState, WorkflowNode, WorkflowEvent } from '../src/types.js';

describe('WorkflowEngine', () => {
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
        },
      },
      currentNodeId: null,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    engine = new WorkflowEngine(state);
  });

  describe('State Access', () => {
    it('should return current state', () => {
      const currentState = engine.getState();
      expect(currentState.id).toBe('test-workflow');
      expect(currentState.projectId).toBe('test-project');
    });

    it('should get node by id', () => {
      const node = engine.getNode('literature');
      expect(node).toBeDefined();
      expect(node?.name).toBe('Literature Survey');
    });

    it('should return undefined for non-existent node', () => {
      const node = engine.getNode('non-existent');
      expect(node).toBeUndefined();
    });

    it('should get current node', () => {
      expect(engine.getCurrentNode()).toBeUndefined();

      state.currentNodeId = 'literature';
      expect(engine.getCurrentNode()).toBeDefined();
      expect(engine.getCurrentNode()?.id).toBe('literature');
    });

    it('should get all nodes', () => {
      const nodes = engine.getNodes();
      expect(nodes).toHaveLength(3);
    });

    it('should get pending nodes', () => {
      const pending = engine.getPendingNodes();
      expect(pending).toHaveLength(3);

      state.nodes.literature.status = 'completed';
      const pendingAfter = engine.getPendingNodes();
      expect(pendingAfter).toHaveLength(2);
    });
  });

  describe('Node Execution', () => {
    it('should start a node with no dependencies', async () => {
      const eventSpy = vi.fn();
      engine.on('node_started', eventSpy);

      await engine.startNode('literature');

      const node = engine.getNode('literature');
      expect(node?.status).toBe('running');
      expect(node?.startedAt).toBeDefined();
      expect(engine.getCurrentNode()?.id).toBe('literature');
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should fail to start node with unmet dependencies', async () => {
      await expect(engine.startNode('method')).rejects.toThrow('Unmet dependencies');
    });

    it('should start node after dependencies are completed', async () => {
      await engine.startNode('literature');
      await engine.completeNode('literature');

      await engine.startNode('method');

      const node = engine.getNode('method');
      expect(node?.status).toBe('running');
    });

    it('should complete a node', async () => {
      await engine.startNode('literature');

      const eventSpy = vi.fn();
      engine.on('node_completed', eventSpy);

      await engine.completeNode('literature', { papers: 10 });

      const node = engine.getNode('literature');
      expect(node?.status).toBe('completed');
      expect(node?.result).toEqual({ papers: 10 });
      expect(node?.completedAt).toBeDefined();
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should fail a node', async () => {
      await engine.startNode('literature');

      const eventSpy = vi.fn();
      engine.on('node_failed', eventSpy);

      await engine.failNode('literature', 'API error');

      const node = engine.getNode('literature');
      expect(node?.status).toBe('failed');
      expect(node?.error).toBe('API error');
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should block a node', async () => {
      const eventSpy = vi.fn();
      engine.on('node_blocked', eventSpy);

      await engine.blockNode('literature', 'Waiting for approval');

      const node = engine.getNode('literature');
      expect(node?.status).toBe('blocked');
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should pause a node', async () => {
      await engine.startNode('literature');

      const eventSpy = vi.fn();
      engine.on('node_paused', eventSpy);

      await engine.pauseNode('literature');

      const node = engine.getNode('literature');
      expect(node?.status).toBe('paused');
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should throw error for non-existent node', async () => {
      await expect(engine.startNode('non-existent')).rejects.toThrow('Node not found');
    });
  });

  describe('Task Management', () => {
    it('should add a task to a node', async () => {
      await engine.startNode('literature');

      const task = {
        id: 'task-1',
        nodeId: 'literature',
        type: 'tool' as const,
        name: 'Search Papers',
        description: 'Search for papers',
        status: 'pending' as const,
      };

      const eventSpy = vi.fn();
      engine.on('task_started', eventSpy);

      await engine.addTask('literature', task);

      const node = engine.getNode('literature');
      expect(node?.tasks).toHaveLength(1);
      expect(node?.tasks[0].id).toBe('task-1');
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should update task status', async () => {
      await engine.startNode('literature');

      const task = {
        id: 'task-1',
        nodeId: 'literature',
        type: 'tool' as const,
        name: 'Search Papers',
        description: 'Search for papers',
        status: 'pending' as const,
      };

      await engine.addTask('literature', task);

      const eventSpy = vi.fn();
      engine.on('task_completed', eventSpy);

      await engine.updateTaskStatus('literature', 'task-1', 'completed', { papers: 5 });

      const node = engine.getNode('literature');
      const updatedTask = node?.tasks.find(t => t.id === 'task-1');
      expect(updatedTask?.status).toBe('completed');
      expect(updatedTask?.result).toEqual({ papers: 5 });
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should fail task with error', async () => {
      await engine.startNode('literature');

      const task = {
        id: 'task-1',
        nodeId: 'literature',
        type: 'tool' as const,
        name: 'Search Papers',
        description: 'Search for papers',
        status: 'pending' as const,
      };

      await engine.addTask('literature', task);

      const eventSpy = vi.fn();
      engine.on('task_failed', eventSpy);

      await engine.updateTaskStatus('literature', 'task-1', 'failed', undefined, 'Network error');

      const node = engine.getNode('literature');
      const updatedTask = node?.tasks.find(t => t.id === 'task-1');
      expect(updatedTask?.status).toBe('failed');
      expect(updatedTask?.error).toBe('Network error');
    });
  });

  describe('Quality Gates', () => {
    it('should run quality gate', async () => {
      // Start the node and add artifacts first
      await engine.startNode('literature');
      
      // Add artifacts to the node
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

      state.nodes.literature.qualityGate = {
        id: 'gate-1',
        stageId: 'literature',
        checks: [
          {
            id: 'check-1',
            name: 'Min Papers',
            description: 'At least 10 papers',
            status: 'pending',
          },
        ],
        status: 'pending',
      };

      const eventSpy = vi.fn();
      engine.on('quality_gate_checked', eventSpy);

      const gate = await engine.runQualityGate('literature');

      expect(gate.status).toBe('passed');
      expect(gate.checks[0].status).toBe('passed');
      expect(eventSpy).toHaveBeenCalledOnce();
    });

    it('should throw error if no quality gate defined', async () => {
      await expect(engine.runQualityGate('method')).rejects.toThrow('No quality gate');
    });
  });

  describe('Artifact Management', () => {
    it('should add artifact to node', async () => {
      await engine.startNode('literature');

      const artifact = {
        id: 'artifact-1',
        type: 'survey' as const,
        path: '/path/to/survey.md',
        description: 'Literature survey',
      };

      await engine.addArtifact('literature', artifact);

      const node = engine.getNode('literature');
      expect(node?.artifacts).toHaveLength(1);
      expect(node?.artifacts[0].id).toBe('artifact-1');
    });

    it('should get artifacts for a node', async () => {
      await engine.startNode('literature');

      const artifact = {
        id: 'artifact-1',
        type: 'survey' as const,
        path: '/path/to/survey.md',
        description: 'Literature survey',
      };

      await engine.addArtifact('literature', artifact);

      const artifacts = await engine.getArtifacts('literature');
      expect(artifacts).toHaveLength(1);
    });

    it('should get all artifacts', async () => {
      await engine.startNode('literature');
      await engine.addArtifact('literature', {
        id: 'artifact-1',
        type: 'survey',
        path: '/path/1',
        description: 'Survey',
      });

      await engine.completeNode('literature');
      await engine.startNode('method');
      await engine.addArtifact('method', {
        id: 'artifact-2',
        type: 'method',
        path: '/path/2',
        description: 'Method',
      });

      const allArtifacts = await engine.getAllArtifacts();
      expect(allArtifacts).toHaveLength(2);
    });
  });

  describe('Navigation', () => {
    it('should navigate to a node', async () => {
      await engine.startNode('literature');
      await engine.completeNode('literature');

      const eventSpy = vi.fn();
      engine.on('node_started', eventSpy);

      await engine.navigateTo('method', 'Proceeding to method design');

      expect(engine.getCurrentNode()?.id).toBe('method');
      // History includes completeNode transition + navigateTo transition
      expect(state.history.length).toBeGreaterThanOrEqual(1);
      const lastTransition = state.history[state.history.length - 1];
      expect(lastTransition.from).toBe('literature');
      expect(lastTransition.to).toBe('method');
    });

    it('should backtrack to a node', async () => {
      await engine.startNode('literature');
      await engine.completeNode('literature');
      await engine.startNode('method');
      await engine.completeNode('method');

      await engine.backtrack('literature', 'Need to review literature');

      const literature = engine.getNode('literature');
      const method = engine.getNode('method');

      expect(literature?.status).toBe('running');
      expect(method?.status).toBe('pending');
      expect(engine.getCurrentNode()?.id).toBe('literature');
    });
  });

  describe('Workflow Completion', () => {
    it('should emit workflow_completed when all nodes are done', async () => {
      const eventSpy = vi.fn();
      engine.on('workflow_completed', eventSpy);

      await engine.startNode('literature');
      await engine.completeNode('literature');

      await engine.startNode('method');
      await engine.completeNode('method');

      await engine.startNode('experiment');
      await engine.completeNode('experiment');

      expect(eventSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Event Handling', () => {
    it('should emit events via onEvent callback', async () => {
      const events: WorkflowEvent[] = [];
      const engineWithCallback = new WorkflowEngine(state, {
        onEvent: (event) => events.push(event),
      });

      await engineWithCallback.startNode('literature');
      await engineWithCallback.completeNode('literature');

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('node_started');
      expect(events[1].type).toBe('node_completed');
    });
  });
});
