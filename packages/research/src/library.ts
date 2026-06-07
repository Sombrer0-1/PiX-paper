/**
 * Literature Library
 *
 * Manage a collection of papers with tags, notes, and search.
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { Paper, Library, Tag } from './types.js';

// ============================================================================
// Library Manager
// ============================================================================

export interface LibraryManagerOptions {
  storagePath: string;
  autoSave?: boolean;
}

export class LibraryManager {
  private libraries: Map<string, Library> = new Map();
  private options: LibraryManagerOptions;

  constructor(options: LibraryManagerOptions) {
    this.options = {
      autoSave: true,
      ...options,
    };
    this.load();
  }

  // ============================================================================
  // Library CRUD
  // ============================================================================

  createLibrary(name: string): Library {
    const id = this.generateId();
    const library: Library = {
      id,
      name,
      papers: [],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.libraries.set(id, library);

    if (this.options.autoSave) {
      this.save();
    }

    return library;
  }

  getLibrary(id: string): Library | undefined {
    return this.libraries.get(id);
  }

  getAllLibraries(): Library[] {
    return Array.from(this.libraries.values());
  }

  deleteLibrary(id: string): boolean {
    const deleted = this.libraries.delete(id);
    if (deleted && this.options.autoSave) {
      this.save();
    }
    return deleted;
  }

  // ============================================================================
  // Paper Operations
  // ============================================================================

  addPaper(libraryId: string, paper: Paper): Paper | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    // Check for duplicate
    const exists = library.papers.some(p =>
      p.id === paper.id ||
      (p.title.toLowerCase() === paper.title.toLowerCase() && p.year === paper.year)
    );

    if (exists) {
      return library.papers.find(p => p.id === paper.id || p.title.toLowerCase() === paper.title.toLowerCase());
    }

    library.papers.push(paper);
    library.updatedAt = Date.now();

    if (this.options.autoSave) {
      this.save();
    }

    return paper;
  }

  removePaper(libraryId: string, paperId: string): boolean {
    const library = this.libraries.get(libraryId);
    if (!library) return false;

    const index = library.papers.findIndex(p => p.id === paperId);
    if (index === -1) return false;

    library.papers.splice(index, 1);
    library.updatedAt = Date.now();

    if (this.options.autoSave) {
      this.save();
    }

    return true;
  }

  getPaper(libraryId: string, paperId: string): Paper | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    return library.papers.find(p => p.id === paperId);
  }

  updatePaper(libraryId: string, paperId: string, updates: Partial<Paper>): Paper | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    const paper = library.papers.find(p => p.id === paperId);
    if (!paper) return undefined;

    Object.assign(paper, updates);
    library.updatedAt = Date.now();

    if (this.options.autoSave) {
      this.save();
    }

    return paper;
  }

  // ============================================================================
  // Tag Operations
  // ============================================================================

  createTag(libraryId: string, name: string, color?: string): Tag | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    // Check for duplicate
    if (library.tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      return library.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    }

    const tag: Tag = {
      id: this.generateId(),
      name,
      color,
      paperCount: 0,
    };

    library.tags.push(tag);
    library.updatedAt = Date.now();

    if (this.options.autoSave) {
      this.save();
    }

    return tag;
  }

  deleteTag(libraryId: string, tagId: string): boolean {
    const library = this.libraries.get(libraryId);
    if (!library) return false;

    const index = library.tags.findIndex(t => t.id === tagId);
    if (index === -1) return false;

    // Remove tag from all papers
    const tagName = library.tags[index].name;
    for (const paper of library.papers) {
      paper.tags = paper.tags.filter(t => t !== tagName);
    }

    library.tags.splice(index, 1);
    library.updatedAt = Date.now();

    if (this.options.autoSave) {
      this.save();
    }

    return true;
  }

  addTagToPaper(libraryId: string, paperId: string, tagName: string): boolean {
    const library = this.libraries.get(libraryId);
    if (!library) return false;

    const paper = library.papers.find(p => p.id === paperId);
    if (!paper) return false;

    // Create tag if it doesn't exist
    if (!library.tags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
      this.createTag(libraryId, tagName);
    }

    // Add tag to paper
    if (!paper.tags.includes(tagName)) {
      paper.tags.push(tagName);
      library.updatedAt = Date.now();

      // Update tag count
      const tag = library.tags.find(t => t.name === tagName);
      if (tag) {
        tag.paperCount = library.papers.filter(p => p.tags.includes(tagName)).length;
      }

      if (this.options.autoSave) {
        this.save();
      }
    }

    return true;
  }

  removeTagFromPaper(libraryId: string, paperId: string, tagName: string): boolean {
    const library = this.libraries.get(libraryId);
    if (!library) return false;

    const paper = library.papers.find(p => p.id === paperId);
    if (!paper) return false;

    const index = paper.tags.indexOf(tagName);
    if (index === -1) return false;

    paper.tags.splice(index, 1);
    library.updatedAt = Date.now();

    // Update tag count
    const tag = library.tags.find(t => t.name === tagName);
    if (tag) {
      tag.paperCount = library.papers.filter(p => p.tags.includes(tagName)).length;
    }

    if (this.options.autoSave) {
      this.save();
    }

    return true;
  }

  // ============================================================================
  // Search & Filter
  // ============================================================================

  searchPapers(libraryId: string, query: string): Paper[] {
    const library = this.libraries.get(libraryId);
    if (!library) return [];

    const lowerQuery = query.toLowerCase();

    return library.papers.filter(paper => {
      const searchableText = [
        paper.title,
        paper.abstract,
        ...paper.authors,
        paper.venue,
        ...paper.tags,
      ].join(' ').toLowerCase();

      return searchableText.includes(lowerQuery);
    });
  }

  filterPapers(libraryId: string, filters: {
    tags?: string[];
    yearFrom?: number;
    yearTo?: number;
    minCitations?: number;
    venue?: string;
  }): Paper[] {
    const library = this.libraries.get(libraryId);
    if (!library) return [];

    return library.papers.filter(paper => {
      if (filters.tags && filters.tags.length > 0) {
        if (!filters.tags.some(tag => paper.tags.includes(tag))) {
          return false;
        }
      }

      if (filters.yearFrom !== undefined && paper.year < filters.yearFrom) {
        return false;
      }

      if (filters.yearTo !== undefined && paper.year > filters.yearTo) {
        return false;
      }

      if (filters.minCitations !== undefined && paper.citations < filters.minCitations) {
        return false;
      }

      if (filters.venue && !paper.venue.toLowerCase().includes(filters.venue.toLowerCase())) {
        return false;
      }

      return true;
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(libraryId: string): {
    totalPapers: number;
    totalTags: number;
    yearDistribution: Record<number, number>;
    venueDistribution: Record<string, number>;
    topPapers: Paper[];
  } | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    const yearDistribution: Record<number, number> = {};
    const venueDistribution: Record<string, number> = {};

    for (const paper of library.papers) {
      // Year distribution
      yearDistribution[paper.year] = (yearDistribution[paper.year] || 0) + 1;

      // Venue distribution
      if (paper.venue) {
        venueDistribution[paper.venue] = (venueDistribution[paper.venue] || 0) + 1;
      }
    }

    // Top papers by citations
    const topPapers = [...library.papers]
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 10);

    return {
      totalPapers: library.papers.length,
      totalTags: library.tags.length,
      yearDistribution,
      venueDistribution,
      topPapers,
    };
  }

  // ============================================================================
  // Notes
  // ============================================================================

  addNote(libraryId: string, paperId: string, note: string): boolean {
    const library = this.libraries.get(libraryId);
    if (!library) return false;

    const paper = library.papers.find(p => p.id === paperId);
    if (!paper) return false;

    paper.notes = note;
    library.updatedAt = Date.now();

    if (this.options.autoSave) {
      this.save();
    }

    return true;
  }

  getNote(libraryId: string, paperId: string): string | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    const paper = library.papers.find(p => p.id === paperId);
    return paper?.notes;
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private load(): void {
    if (!existsSync(this.options.storagePath)) {
      return;
    }

    try {
      const data = readFileSync(this.options.storagePath, 'utf-8');
      const libraries = JSON.parse(data) as Library[];
      for (const library of libraries) {
        this.libraries.set(library.id, library);
      }
    } catch (error) {
      console.error('Failed to load libraries:', error);
    }
  }

  save(): void {
    try {
      const dir = dirname(this.options.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.options.storagePath, JSON.stringify(Array.from(this.libraries.values()), null, 2));
    } catch (error) {
      console.error('Failed to save libraries:', error);
    }
  }

  // ============================================================================
  // Export / Import
  // ============================================================================

  exportLibrary(libraryId: string): string | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    return JSON.stringify(library, null, 2);
  }

  importLibrary(json: string): Library | undefined {
    try {
      const library = JSON.parse(json) as Library;

      // Validate structure
      if (!library.id || !library.name || !Array.isArray(library.papers)) {
        return undefined;
      }

      // Check for duplicate
      if (this.libraries.has(library.id)) {
        // Merge: add papers from imported library that don't already exist
        const existing = this.libraries.get(library.id)!;
        for (const paper of library.papers) {
          const isDuplicate = existing.papers.some(p =>
            p.id === paper.id ||
            (p.title.toLowerCase() === paper.title.toLowerCase() && p.year === paper.year)
          );
          if (!isDuplicate) {
            existing.papers.push(paper);
          }
        }
        // Merge tags
        for (const tag of library.tags) {
          if (!existing.tags.some(t => t.name.toLowerCase() === tag.name.toLowerCase())) {
            existing.tags.push(tag);
          }
        }
        existing.updatedAt = Date.now();
      } else {
        // Add new
        this.libraries.set(library.id, library);
      }

      if (this.options.autoSave) {
        this.save();
      }

      return library;
    } catch {
      return undefined;
    }
  }

  exportBibTeX(libraryId: string): string | undefined {
    const library = this.libraries.get(libraryId);
    if (!library) return undefined;

    const entries: string[] = [];

    for (const paper of library.papers) {
      const key = this.generateBibTeXKey(paper);
      const entry = [
        `@article{${key},`,
        `  title = {${paper.title}},`,
        `  author = {${paper.authors.join(' and ')}},`,
        `  year = {${paper.year}},`,
        `  journal = {${paper.venue}},`,
        paper.doi ? `  doi = {${paper.doi}},` : '',
        paper.url ? `  url = {${paper.url}},` : '',
        `}`,
      ].filter(Boolean).join('\n');

      entries.push(entry);
    }

    return entries.join('\n\n');
  }

  private generateBibTeXKey(paper: Paper): string {
    const firstAuthor = paper.authors[0]?.split(' ').pop() || 'unknown';
    const year = paper.year || '0000';
    const titleWord = paper.title.split(' ')[0]?.toLowerCase() || 'paper';

    return `${firstAuthor}${year}${titleWord}`;
  }

  // ============================================================================
  // Helper
  // ============================================================================

  private generateId(): string {
    return `lib_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
