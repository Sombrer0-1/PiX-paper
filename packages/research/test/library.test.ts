/**
 * Library Tests
 *
 * Test literature library management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { LibraryManager } from '../src/library.js';
import type { Paper } from '../src/types.js';

describe('LibraryManager', () => {
  let manager: LibraryManager;
  const testDir = join(import.meta.dirname, '.test-library');
  const storagePath = join(testDir, 'libraries.json');

  const samplePaper: Paper = {
    id: 'paper-1',
    title: 'Attention Is All You Need',
    authors: ['Vaswani et al.'],
    abstract: 'We propose the Transformer architecture.',
    year: 2017,
    venue: 'NeurIPS',
    citations: 100000,
    url: 'https://arxiv.org/abs/1706.03762',
    tags: [],
    source: 'semantic_scholar',
    sourceId: 'paper-1',
  };

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    manager = new LibraryManager({
      storagePath,
      autoSave: true,
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('Library CRUD', () => {
    it('should create a library', () => {
      const library = manager.createLibrary('My Library');
      expect(library.id).toBeDefined();
      expect(library.name).toBe('My Library');
      expect(library.papers).toHaveLength(0);
    });

    it('should get a library', () => {
      const created = manager.createLibrary('Test');
      const retrieved = manager.getLibrary(created.id);
      expect(retrieved?.name).toBe('Test');
    });

    it('should get all libraries', () => {
      manager.createLibrary('Lib 1');
      manager.createLibrary('Lib 2');
      expect(manager.getAllLibraries()).toHaveLength(2);
    });

    it('should delete a library', () => {
      const library = manager.createLibrary('Test');
      const deleted = manager.deleteLibrary(library.id);
      expect(deleted).toBe(true);
      expect(manager.getLibrary(library.id)).toBeUndefined();
    });
  });

  describe('Paper Operations', () => {
    it('should add a paper', () => {
      const library = manager.createLibrary('Test');
      const paper = manager.addPaper(library.id, samplePaper);

      expect(paper).toBeDefined();
      expect(paper?.id).toBe('paper-1');
    });

    it('should not add duplicate paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);
      const duplicate = manager.addPaper(library.id, samplePaper);

      expect(duplicate?.id).toBe('paper-1');
      expect(manager.getLibrary(library.id)?.papers).toHaveLength(1);
    });

    it('should remove a paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const removed = manager.removePaper(library.id, 'paper-1');
      expect(removed).toBe(true);
      expect(manager.getLibrary(library.id)?.papers).toHaveLength(0);
    });

    it('should get a paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const paper = manager.getPaper(library.id, 'paper-1');
      expect(paper?.title).toBe('Attention Is All You Need');
    });

    it('should update a paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const updated = manager.updatePaper(library.id, 'paper-1', { notes: 'Important paper' });
      expect(updated?.notes).toBe('Important paper');
    });
  });

  describe('Tag Operations', () => {
    it('should create a tag', () => {
      const library = manager.createLibrary('Test');
      const tag = manager.createTag(library.id, 'transformer', '#ff0000');

      expect(tag?.name).toBe('transformer');
      expect(tag?.color).toBe('#ff0000');
    });

    it('should not create duplicate tag', () => {
      const library = manager.createLibrary('Test');
      manager.createTag(library.id, 'transformer');
      const duplicate = manager.createTag(library.id, 'transformer');

      expect(duplicate?.name).toBe('transformer');
      expect(manager.getLibrary(library.id)?.tags).toHaveLength(1);
    });

    it('should delete a tag', () => {
      const library = manager.createLibrary('Test');
      const tag = manager.createTag(library.id, 'test');

      const deleted = manager.deleteTag(library.id, tag!.id);
      expect(deleted).toBe(true);
      expect(manager.getLibrary(library.id)?.tags).toHaveLength(0);
    });

    it('should add tag to paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const result = manager.addTagToPaper(library.id, 'paper-1', 'transformer');
      expect(result).toBe(true);

      const paper = manager.getPaper(library.id, 'paper-1');
      expect(paper?.tags).toContain('transformer');
    });

    it('should remove tag from paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);
      manager.addTagToPaper(library.id, 'paper-1', 'transformer');

      const result = manager.removeTagFromPaper(library.id, 'paper-1', 'transformer');
      expect(result).toBe(true);

      const paper = manager.getPaper(library.id, 'paper-1');
      expect(paper?.tags).not.toContain('transformer');
    });

    it('should update tag count', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);
      manager.addTagToPaper(library.id, 'paper-1', 'transformer');

      const lib = manager.getLibrary(library.id);
      const tag = lib?.tags.find(t => t.name === 'transformer');
      expect(tag?.paperCount).toBe(1);
    });
  });

  describe('Search & Filter', () => {
    beforeEach(() => {
      const library = manager.createLibrary('Test');

      manager.addPaper(library.id, {
        ...samplePaper,
        id: 'paper-1',
        title: 'Attention Is All You Need',
        tags: ['transformer'],
      });

      manager.addPaper(library.id, {
        ...samplePaper,
        id: 'paper-2',
        title: 'BERT: Pre-training',
        year: 2018,
        tags: ['nlp'],
      });
    });

    it('should search papers by title', () => {
      const library = manager.getAllLibraries()[0];
      const results = manager.searchPapers(library.id, 'attention');
      expect(results).toHaveLength(1);
    });

    it('should search papers by author', () => {
      const library = manager.getAllLibraries()[0];
      const results = manager.searchPapers(library.id, 'vaswani');
      expect(results).toHaveLength(2);
    });

    it('should filter by tag', () => {
      const library = manager.getAllLibraries()[0];
      const results = manager.filterPapers(library.id, { tags: ['transformer'] });
      expect(results).toHaveLength(1);
    });

    it('should filter by year', () => {
      const library = manager.getAllLibraries()[0];
      const results = manager.filterPapers(library.id, { yearFrom: 2018 });
      expect(results).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should get library stats', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);
      manager.addTagToPaper(library.id, 'paper-1', 'transformer');

      const stats = manager.getStats(library.id);
      expect(stats?.totalPapers).toBe(1);
      expect(stats?.totalTags).toBe(1);
    });
  });

  describe('Notes', () => {
    it('should add note to paper', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const result = manager.addNote(library.id, 'paper-1', 'Important paper');
      expect(result).toBe(true);

      const note = manager.getNote(library.id, 'paper-1');
      expect(note).toBe('Important paper');
    });
  });

  describe('Persistence', () => {
    it('should save and load libraries', () => {
      manager.createLibrary('Test');
      manager.addPaper(manager.getAllLibraries()[0].id, samplePaper);

      const manager2 = new LibraryManager({ storagePath });
      expect(manager2.getAllLibraries()).toHaveLength(1);
      expect(manager2.getAllLibraries()[0].papers).toHaveLength(1);
    });

    it('should export library', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const exported = manager.exportLibrary(library.id);
      expect(exported).toBeDefined();
      expect(exported).toContain('Attention Is All You Need');
    });

    it('should export BibTeX', () => {
      const library = manager.createLibrary('Test');
      manager.addPaper(library.id, samplePaper);

      const bibtex = manager.exportBibTeX(library.id);
      expect(bibtex).toContain('@article');
      expect(bibtex).toContain('Attention Is All You Need');
    });
  });
});
