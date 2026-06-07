/**
 * Artifact Manager
 *
 * Core abstraction for managing research artifacts.
 * Supports CRUD operations, provenance tracking, and querying.
 */

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { dirname, join } from 'path';
import type {
  Artifact,
  ArtifactType,
  ArtifactFilter,
  ArtifactStats,
  Provenance,
} from './types.js';

// ============================================================================
// Artifact Manager
// ============================================================================

export interface ArtifactManagerOptions {
  storagePath: string;  // Path to artifacts.json
  autoSave?: boolean;   // Auto-save after mutations
}

export class ArtifactManager {
  private artifacts: Map<string, Artifact> = new Map();
  private options: ArtifactManagerOptions;
  private loadPromise: Promise<void>;

  constructor(options: ArtifactManagerOptions) {
    this.options = {
      autoSave: true,
      ...options,
    };
    this.loadPromise = this.load();
  }

  /** Wait for initial load to complete before performing operations. */
  async ready(): Promise<void> {
    await this.loadPromise;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async create(params: {
    projectId: string;
    type: ArtifactType;
    path: string;
    createdBy: 'user' | 'agent' | 'tool';
    sourceNodeId: string;
    metadata?: Record<string, unknown>;
    provenance?: Provenance[];
  }): Promise<Artifact> {
    await this.loadPromise;
    const id = this.generateId();
    const now = Date.now();

    // Calculate hash if file exists
    const hash = await this.calculateHash(params.path);

    const artifact: Artifact = {
      id,
      projectId: params.projectId,
      type: params.type,
      path: params.path,
      createdBy: params.createdBy,
      sourceNodeId: params.sourceNodeId,
      hash,
      metadata: params.metadata || {},
      provenance: params.provenance || [],
      createdAt: now,
      updatedAt: now,
    };

    this.artifacts.set(id, artifact);

    if (this.options.autoSave) {
      await this.save();
    }

    return artifact;
  }

  get(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  getAll(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  async update(id: string, updates: Partial<Omit<Artifact, 'id' | 'createdAt'>>): Promise<Artifact | undefined> {
    await this.loadPromise;
    const artifact = this.artifacts.get(id);
    if (!artifact) return undefined;

    const updated: Artifact = {
      ...artifact,
      ...updates,
      updatedAt: Date.now(),
    };

    // Recalculate hash if path changed
    if (updates.path && updates.path !== artifact.path) {
      updated.hash = await this.calculateHash(updates.path);
    }

    this.artifacts.set(id, updated);

    if (this.options.autoSave) {
      await this.save();
    }

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.loadPromise;
    const deleted = this.artifacts.delete(id);
    if (deleted && this.options.autoSave) {
      await this.save();
    }
    return deleted;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  filter(filter: ArtifactFilter): Artifact[] {
    return this.getAll().filter(artifact => {
      if (filter.projectId && artifact.projectId !== filter.projectId) return false;
      if (filter.type && artifact.type !== filter.type) return false;
      if (filter.sourceNodeId && artifact.sourceNodeId !== filter.sourceNodeId) return false;
      if (filter.createdBy && artifact.createdBy !== filter.createdBy) return false;
      if (filter.createdAfter && artifact.createdAt < filter.createdAfter) return false;
      if (filter.createdBefore && artifact.createdAt > filter.createdBefore) return false;
      return true;
    });
  }

  getByProject(projectId: string): Artifact[] {
    return this.filter({ projectId });
  }

  getByType(type: ArtifactType): Artifact[] {
    return this.filter({ type });
  }

  getByNode(sourceNodeId: string): Artifact[] {
    return this.filter({ sourceNodeId });
  }

  // ============================================================================
  // Provenance Operations
  // ============================================================================

  async addProvenance(artifactId: string, provenance: Provenance): Promise<Artifact | undefined> {
    await this.loadPromise;
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return undefined;

    // Check for duplicate
    const exists = artifact.provenance.some(
      p => p.sourceId === provenance.sourceId && p.relation === provenance.relation
    );
    if (exists) return artifact;

    artifact.provenance.push(provenance);
    artifact.updatedAt = Date.now();

    if (this.options.autoSave) {
      await this.save();
    }

    return artifact;
  }

  async removeProvenance(artifactId: string, sourceId: string, relation: string): Promise<Artifact | undefined> {
    await this.loadPromise;
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return undefined;

    artifact.provenance = artifact.provenance.filter(
      p => !(p.sourceId === sourceId && p.relation === relation)
    );
    artifact.updatedAt = Date.now();

    if (this.options.autoSave) {
      await this.save();
    }

    return artifact;
  }

  getProvenanceChain(artifactId: string, depth: number = 10): Artifact[] {
    const chain: Artifact[] = [];
    const visited = new Set<string>();

    const traverse = (id: string, currentDepth: number) => {
      if (currentDepth >= depth || visited.has(id)) return;
      visited.add(id);

      const artifact = this.artifacts.get(id);
      if (!artifact) return;

      chain.push(artifact);

      for (const prov of artifact.provenance) {
        traverse(prov.sourceId, currentDepth + 1);
      }
    };

    traverse(artifactId, 0);
    return chain;
  }

  getDerivedArtifacts(artifactId: string): Artifact[] {
    return this.getAll().filter(artifact =>
      artifact.provenance.some(p => p.sourceId === artifactId)
    );
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(projectId?: string): ArtifactStats {
    const artifacts = projectId ? this.getByProject(projectId) : this.getAll();

    const stats: ArtifactStats = {
      total: artifacts.length,
      byType: {} as Record<ArtifactType, number>,
      byNode: {},
      byCreator: {},
    };

    for (const artifact of artifacts) {
      // By type
      stats.byType[artifact.type] = (stats.byType[artifact.type] || 0) + 1;

      // By node
      stats.byNode[artifact.sourceNodeId] = (stats.byNode[artifact.sourceNodeId] || 0) + 1;

      // By creator
      stats.byCreator[artifact.createdBy] = (stats.byCreator[artifact.createdBy] || 0) + 1;
    }

    return stats;
  }

  // ============================================================================
  // Integrity Checks
  // ============================================================================

  async verifyIntegrity(artifactId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      return { valid: false, issues: ['Artifact not found'] };
    }

    const issues: string[] = [];

    // Check file exists
    if (!existsSync(artifact.path)) {
      issues.push(`File not found: ${artifact.path}`);
    }

    // Check hash matches
    const currentHash = await this.calculateHash(artifact.path);
    if (currentHash !== artifact.hash) {
      issues.push(`Hash mismatch: expected ${artifact.hash}, got ${currentHash}`);
    }

    // Check provenance references exist
    for (const prov of artifact.provenance) {
      if (!this.artifacts.has(prov.sourceId)) {
        issues.push(`Provenance source not found: ${prov.sourceId}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  async verifyAllIntegrity(projectId?: string): Promise<Map<string, { valid: boolean; issues: string[] }>> {
    const artifacts = projectId ? this.getByProject(projectId) : this.getAll();
    const results = new Map<string, { valid: boolean; issues: string[] }>();

    for (const artifact of artifacts) {
      results.set(artifact.id, await this.verifyIntegrity(artifact.id));
    }

    return results;
  }

  // ============================================================================
  // Export / Import
  // ============================================================================

  exportToJson(projectId?: string): string {
    const artifacts = projectId ? this.getByProject(projectId) : this.getAll();
    return JSON.stringify(artifacts, null, 2);
  }

  async importFromJson(json: string): Promise<number> {
    await this.loadPromise;
    const artifacts = JSON.parse(json) as Artifact[];
    let imported = 0;

    for (const artifact of artifacts) {
      if (!this.artifacts.has(artifact.id)) {
        this.artifacts.set(artifact.id, artifact);
        imported++;
      }
    }

    if (imported > 0 && this.options.autoSave) {
      await this.save();
    }

    return imported;
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private async load(): Promise<void> {
    if (!existsSync(this.options.storagePath)) {
      return;
    }

    try {
      const data = await readFile(this.options.storagePath, 'utf-8');
      const artifacts = JSON.parse(data) as Artifact[];
      for (const artifact of artifacts) {
        this.artifacts.set(artifact.id, artifact);
      }
    } catch (error) {
      console.error('Failed to load artifacts, attempting backup recovery:', error);
      // Try to recover from backup
      const backupPath = this.options.storagePath + '.bak';
      if (existsSync(backupPath)) {
        try {
          const backupData = await readFile(backupPath, 'utf-8');
          const artifacts = JSON.parse(backupData) as Artifact[];
          for (const artifact of artifacts) {
            this.artifacts.set(artifact.id, artifact);
          }
          console.error('Recovered artifacts from backup');
        } catch (backupError) {
          console.error('Backup recovery also failed:', backupError);
        }
      }
    }
  }

  async save(): Promise<void> {
    try {
      const dir = dirname(this.options.storagePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      const backupPath = this.options.storagePath + '.bak';
      // Write to backup first, then atomically rename
      if (existsSync(this.options.storagePath)) {
        await rename(this.options.storagePath, backupPath).catch(() => {});
      }
      await writeFile(this.options.storagePath, this.exportToJson());
    } catch (error) {
      console.error('Failed to save artifacts:', error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateId(): string {
    return `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private async calculateHash(filePath: string): Promise<string> {
    if (!existsSync(filePath)) {
      return '';
    }

    try {
      const content = await readFile(filePath);
      return createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch {
      return '';
    }
  }
}
