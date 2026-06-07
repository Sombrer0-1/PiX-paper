/**
 * Types Tests
 *
 * Verify type definitions are correct and consistent.
 */

import { describe, it, expect } from 'vitest';
import type {
  WorkflowNode,
  WorkflowState,
  Artifact,
  Provenance,
  QualityGate,
  QualityCheck,
  Task,
  ApprovalRequest,
} from '../src/types.js';

describe('Workflow Types', () => {
  describe('WorkflowNode', () => {
    it('should create a valid node', () => {
      const node: WorkflowNode = {
        id: 'test-node',
        type: 'literature',
        name: 'Literature Survey',
        description: 'Search and analyze papers',
        status: 'pending',
        dependencies: [],
        artifacts: [],
        approvalRequired: true,
        tasks: [],
      };

      expect(node.id).toBe('test-node');
      expect(node.type).toBe('literature');
      expect(node.status).toBe('pending');
      expect(node.dependencies).toEqual([]);
      expect(node.artifacts).toEqual([]);
      expect(node.approvalRequired).toBe(true);
    });

    it('should support all node types', () => {
      const types = ['literature', 'method', 'reproduction', 'experiment', 'writing', 'review'];

      for (const type of types) {
        const node: WorkflowNode = {
          id: `node-${type}`,
          type: type as any,
          name: type,
          description: '',
          status: 'pending',
          dependencies: [],
          artifacts: [],
          approvalRequired: false,
          tasks: [],
        };
        expect(node.type).toBe(type);
      }
    });

    it('should support all node statuses', () => {
      const statuses = ['pending', 'running', 'completed', 'failed', 'blocked', 'paused'];

      for (const status of statuses) {
        const node: WorkflowNode = {
          id: 'test',
          type: 'literature',
          name: 'Test',
          description: '',
          status: status as any,
          dependencies: [],
          artifacts: [],
          approvalRequired: false,
          tasks: [],
        };
        expect(node.status).toBe(status);
      }
    });
  });

  describe('Artifact', () => {
    it('should create a valid artifact', () => {
      const artifact: Artifact = {
        id: 'artifact-1',
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
        hash: 'abc123',
        metadata: { title: 'Survey' },
        provenance: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(artifact.id).toBe('artifact-1');
      expect(artifact.type).toBe('survey');
      expect(artifact.createdBy).toBe('agent');
    });

    it('should support all artifact types', () => {
      const types = [
        'paper', 'paper_pdf', 'paper_note', 'survey', 'method',
        'repo', 'experiment_config', 'experiment_result', 'figure',
        'draft_section', 'literature_pool', 'reproduction_log',
      ];

      for (const type of types) {
        const artifact: Artifact = {
          id: `artifact-${type}`,
          projectId: 'project-1',
          type: type as any,
          path: `/path/to/${type}`,
          createdBy: 'agent',
          sourceNodeId: 'node-1',
          hash: 'abc123',
          metadata: {},
          provenance: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        expect(artifact.type).toBe(type);
      }
    });
  });

  describe('Provenance', () => {
    it('should create valid provenance', () => {
      const provenance: Provenance = {
        sourceId: 'artifact-1',
        relation: 'derived_from',
        description: 'Created based on survey',
      };

      expect(provenance.sourceId).toBe('artifact-1');
      expect(provenance.relation).toBe('derived_from');
    });

    it('should support all relation types', () => {
      const relations = ['derived_from', 'cites', 'supports', 'contradicts'];

      for (const relation of relations) {
        const provenance: Provenance = {
          sourceId: 'artifact-1',
          relation: relation as any,
          description: '',
        };
        expect(provenance.relation).toBe(relation);
      }
    });
  });

  describe('QualityGate', () => {
    it('should create a valid quality gate', () => {
      const gate: QualityGate = {
        id: 'gate-1',
        stageId: 'literature',
        checks: [
          {
            id: 'check-1',
            name: 'Min Papers',
            description: 'At least 10 papers',
            status: 'passed',
          },
        ],
        status: 'passed',
      };

      expect(gate.id).toBe('gate-1');
      expect(gate.checks).toHaveLength(1);
      expect(gate.status).toBe('passed');
    });
  });

  describe('Task', () => {
    it('should create a valid task', () => {
      const task: Task = {
        id: 'task-1',
        nodeId: 'node-1',
        type: 'tool',
        name: 'Search Papers',
        description: 'Search for papers',
        status: 'pending',
        toolName: 'search_papers',
        toolArgs: { query: 'transformer' },
      };

      expect(task.id).toBe('task-1');
      expect(task.type).toBe('tool');
      expect(task.status).toBe('pending');
    });
  });

  describe('ApprovalRequest', () => {
    it('should create a valid approval request', () => {
      const request: ApprovalRequest = {
        id: 'approval-1',
        nodeId: 'node-1',
        workflowId: 'workflow-1',
        type: 'select',
        title: 'Select Baseline',
        description: 'Choose a baseline method',
        options: [
          { id: 'opt-1', label: 'BERT', value: 'bert' },
          { id: 'opt-2', label: 'GPT', value: 'gpt' },
        ],
      };

      expect(request.id).toBe('approval-1');
      expect(request.type).toBe('select');
      expect(request.options).toHaveLength(2);
    });
  });
});
