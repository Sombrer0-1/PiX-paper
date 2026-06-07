/**
 * ArtifactManager Tests
 *
 * Test artifact management functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ArtifactManager } from '../src/artifact-manager.js';

describe('ArtifactManager', () => {
  let manager: ArtifactManager;
  const testDir = join(import.meta.dirname, '.test-artifacts');
  const storagePath = join(testDir, 'artifacts.json');

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    manager = new ArtifactManager({
      storagePath,
      autoSave: true,
    });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('CRUD Operations', () => {
    it('should create an artifact', () => {
      const artifact = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
        metadata: { title: 'Survey' },
      });

      expect(artifact.id).toBeDefined();
      expect(artifact.projectId).toBe('project-1');
      expect(artifact.type).toBe('survey');
      expect(artifact.createdBy).toBe('agent');
      expect(artifact.createdAt).toBeDefined();
      expect(artifact.updatedAt).toBeDefined();
    });

    it('should get an artifact by id', () => {
      const created = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const retrieved = manager.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent artifact', () => {
      const result = manager.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should get all artifacts', () => {
      manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/1',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/2',
        createdBy: 'agent',
        sourceNodeId: 'method',
      });

      const all = manager.getAll();
      expect(all).toHaveLength(2);
    });

    it('should update an artifact', () => {
      const created = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
        metadata: { version: 1 },
      });

      const updated = manager.update(created.id, {
        metadata: { version: 2 },
      });

      expect(updated).toBeDefined();
      expect(updated?.metadata.version).toBe(2);
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('should return undefined when updating non-existent artifact', () => {
      const result = manager.update('non-existent', { metadata: {} });
      expect(result).toBeUndefined();
    });

    it('should delete an artifact', () => {
      const created = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const deleted = manager.delete(created.id);
      expect(deleted).toBe(true);

      const retrieved = manager.get(created.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting non-existent artifact', () => {
      const deleted = manager.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/1',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/2',
        createdBy: 'agent',
        sourceNodeId: 'method',
      });

      manager.create({
        projectId: 'project-2',
        type: 'survey',
        path: '/path/3',
        createdBy: 'user',
        sourceNodeId: 'literature',
      });
    });

    it('should filter by project', () => {
      const results = manager.filter({ projectId: 'project-1' });
      expect(results).toHaveLength(2);
    });

    it('should filter by type', () => {
      const results = manager.filter({ type: 'survey' });
      expect(results).toHaveLength(2);
    });

    it('should filter by source node', () => {
      const results = manager.filter({ sourceNodeId: 'literature' });
      expect(results).toHaveLength(2);
    });

    it('should filter by creator', () => {
      const results = manager.filter({ createdBy: 'user' });
      expect(results).toHaveLength(1);
    });

    it('should filter by time range', () => {
      const now = Date.now();
      const results = manager.filter({
        createdAfter: now - 1000,
        createdBefore: now + 1000,
      });
      expect(results).toHaveLength(3);
    });

    it('should combine filters', () => {
      const results = manager.filter({
        projectId: 'project-1',
        type: 'survey',
      });
      expect(results).toHaveLength(1);
    });

    it('should get by project', () => {
      const results = manager.getByProject('project-1');
      expect(results).toHaveLength(2);
    });

    it('should get by type', () => {
      const results = manager.getByType('survey');
      expect(results).toHaveLength(2);
    });

    it('should get by node', () => {
      const results = manager.getByNode('literature');
      expect(results).toHaveLength(2);
    });
  });

  describe('Provenance Operations', () => {
    it('should add provenance', () => {
      const artifact = manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/to/method.md',
        createdBy: 'agent',
        sourceNodeId: 'method',
      });

      const source = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const updated = manager.addProvenance(artifact.id, {
        sourceId: source.id,
        relation: 'derived_from',
        description: 'Method derived from survey',
      });

      expect(updated?.provenance).toHaveLength(1);
      expect(updated?.provenance[0].sourceId).toBe(source.id);
    });

    it('should not add duplicate provenance', () => {
      const artifact = manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/to/method.md',
        createdBy: 'agent',
        sourceNodeId: 'method',
      });

      const source = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      manager.addProvenance(artifact.id, {
        sourceId: source.id,
        relation: 'derived_from',
        description: 'First',
      });

      const updated = manager.addProvenance(artifact.id, {
        sourceId: source.id,
        relation: 'derived_from',
        description: 'Duplicate',
      });

      expect(updated?.provenance).toHaveLength(1);
    });

    it('should remove provenance', () => {
      const artifact = manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/to/method.md',
        createdBy: 'agent',
        sourceNodeId: 'method',
      });

      const source = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      manager.addProvenance(artifact.id, {
        sourceId: source.id,
        relation: 'derived_from',
        description: 'Method derived from survey',
      });

      const updated = manager.removeProvenance(artifact.id, source.id, 'derived_from');
      expect(updated?.provenance).toHaveLength(0);
    });

    it('should get provenance chain', () => {
      const survey = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/survey',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const method = manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/method',
        createdBy: 'agent',
        sourceNodeId: 'method',
        provenance: [{ sourceId: survey.id, relation: 'derived_from', description: '' }],
      });

      const experiment = manager.create({
        projectId: 'project-1',
        type: 'experiment_result',
        path: '/path/result',
        createdBy: 'tool',
        sourceNodeId: 'experiment',
        provenance: [{ sourceId: method.id, relation: 'supports', description: '' }],
      });

      const chain = manager.getProvenanceChain(experiment.id);
      expect(chain).toHaveLength(3);
      expect(chain[0].id).toBe(experiment.id);
      expect(chain[1].id).toBe(method.id);
      expect(chain[2].id).toBe(survey.id);
    });

    it('should get derived artifacts', () => {
      const survey = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/survey',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/method',
        createdBy: 'agent',
        sourceNodeId: 'method',
        provenance: [{ sourceId: survey.id, relation: 'derived_from', description: '' }],
      });

      manager.create({
        projectId: 'project-1',
        type: 'paper',
        path: '/path/paper',
        createdBy: 'agent',
        sourceNodeId: 'writing',
        provenance: [{ sourceId: survey.id, relation: 'cites', description: '' }],
      });

      const derived = manager.getDerivedArtifacts(survey.id);
      expect(derived).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    it('should get stats', () => {
      manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/1',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      manager.create({
        projectId: 'project-1',
        type: 'method',
        path: '/path/2',
        createdBy: 'agent',
        sourceNodeId: 'method',
      });

      manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/3',
        createdBy: 'user',
        sourceNodeId: 'literature',
      });

      const stats = manager.getStats('project-1');
      expect(stats.total).toBe(3);
      expect(stats.byType.survey).toBe(2);
      expect(stats.byType.method).toBe(1);
      expect(stats.byNode.literature).toBe(2);
      expect(stats.byNode.method).toBe(1);
      expect(stats.byCreator.agent).toBe(2);
      expect(stats.byCreator.user).toBe(1);
    });
  });

  describe('Persistence', () => {
    it('should save and load artifacts', () => {
      manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      // Create new manager with same storage path
      const manager2 = new ArtifactManager({
        storagePath,
        autoSave: true,
      });

      const all = manager2.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].type).toBe('survey');
    });

    it('should export to JSON', () => {
      manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const json = manager.exportToJson();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
    });

    it('should import from JSON', () => {
      const json = JSON.stringify([
        {
          id: 'imported-1',
          projectId: 'project-1',
          type: 'survey',
          path: '/path/to/survey.md',
          createdBy: 'agent',
          sourceNodeId: 'literature',
          hash: 'abc123',
          metadata: {},
          provenance: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const imported = manager.importFromJson(json);
      expect(imported).toBe(1);

      const all = manager.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('imported-1');
    });

    it('should not import duplicates', () => {
      const artifact = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/path/to/survey.md',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const json = JSON.stringify([artifact]);
      const imported = manager.importFromJson(json);
      expect(imported).toBe(0);
    });
  });

  describe('Integrity Checks', () => {
    it('should verify integrity with valid artifact', () => {
      // Create a test file
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, 'test content');

      const artifact = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: testFile,
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const result = manager.verifyIntegrity(artifact.id);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing file', () => {
      const artifact = manager.create({
        projectId: 'project-1',
        type: 'survey',
        path: '/non/existent/path',
        createdBy: 'agent',
        sourceNodeId: 'literature',
      });

      const result = manager.verifyIntegrity(artifact.id);
      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('File not found');
    });

    it('should detect invalid provenance reference', () => {
      // Create a real file for the artifact
      const testFile = join(testDir, 'method.md');
      writeFileSync(testFile, 'method content');

      const artifact = manager.create({
        projectId: 'project-1',
        type: 'method',
        path: testFile,
        createdBy: 'agent',
        sourceNodeId: 'method',
        provenance: [{ sourceId: 'non-existent', relation: 'derived_from', description: '' }],
      });

      const result = manager.verifyIntegrity(artifact.id);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Provenance source not found'))).toBe(true);
    });
  });
});
