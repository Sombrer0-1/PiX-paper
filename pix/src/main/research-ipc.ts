/**
 * Research IPC Handlers
 *
 * Registers IPC handlers for research operations:
 * - Literature search
 * - PDF parsing
 * - Citation verification
 * - Library management
 */

import { ipcMain } from 'electron';
import {
  SemanticScholarProvider,
  ArxivProvider,
  LibraryManager,
  PdfParser,
  CitationVerifier,
  type Paper,
  type SearchQuery,
  type SearchResult,
  type Library,
  type Tag,
  type PdfParseResult,
  type ClaimCitation,
} from 'pp-research';

let handlersRegistered = false;

export function registerResearchIpcHandlers(projectDir: string): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  // Initialize managers
  const libraryManager = new LibraryManager({
    storagePath: `${projectDir}/.pp/libraries.json`,
    autoSave: true,
  });

  const pdfParser = new PdfParser();
  const citationVerifier = new CitationVerifier();
  const semanticScholar = new SemanticScholarProvider();
  const arxiv = new ArxivProvider();

  // =========================================================================
  // Literature Search
  // =========================================================================

  ipcMain.handle('research-search', async (_event, query: SearchQuery) => {
    try {
      const results: SearchResult[] = [];

      // Search from multiple sources
      const [scholarResult, arxivResult] = await Promise.allSettled([
        semanticScholar.search(query),
        arxiv.search(query),
      ]);

      if (scholarResult.status === 'fulfilled') {
        results.push(scholarResult.value);
      }
      if (arxivResult.status === 'fulfilled') {
        results.push(arxivResult.value);
      }

      // Combine and deduplicate results
      const allPapers: Paper[] = [];
      const seenIds = new Set<string>();

      for (const result of results) {
        for (const paper of result.papers) {
          if (!seenIds.has(paper.id)) {
            seenIds.add(paper.id);
            allPapers.push(paper);
          }
        }
      }

      return { success: true, papers: allPapers, total: allPapers.length };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-get-paper', async (_event, paperId: string, source: string) => {
    try {
      let paper: Paper | null = null;

      if (source === 'semantic_scholar') {
        paper = await semanticScholar.getPaper(paperId);
      } else if (source === 'arxiv') {
        paper = await arxiv.getPaper(paperId);
      }

      if (!paper) {
        return { success: false, error: 'Paper not found' };
      }

      return { success: true, paper };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // PDF Parsing
  // =========================================================================

  ipcMain.handle('research-parse-pdf', async (_event, filePath: string) => {
    try {
      const result: PdfParseResult = await pdfParser.parse(filePath);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Citation Verification
  // =========================================================================

  ipcMain.handle('research-verify-citation', async (_event, claim: string, citations: string[]) => {
    try {
      const claimObj = {
        id: `claim-${Date.now()}`,
        text: claim,
        type: 'background' as const,
        citations,
        verified: false,
      };
      // Build paper map from all libraries so the verifier can look up cited papers
      const papers = new Map<string, Paper>();
      for (const library of libraryManager.getAllLibraries()) {
        for (const paper of library.papers) {
          papers.set(paper.id, paper);
        }
      }
      const result = await citationVerifier.verifyClaim(claimObj, papers);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Library Management
  // =========================================================================

  ipcMain.handle('research-get-libraries', () => {
    try {
      const libraries = libraryManager.getAllLibraries();
      return { success: true, libraries };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-create-library', (_event, name: string) => {
    try {
      const library = libraryManager.createLibrary(name);
      return { success: true, library };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-get-library', (_event, libraryId: string) => {
    try {
      const library = libraryManager.getLibrary(libraryId);
      if (!library) {
        return { success: false, error: 'Library not found' };
      }
      return { success: true, library };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-delete-library', (_event, libraryId: string) => {
    try {
      libraryManager.deleteLibrary(libraryId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Paper Management
  // =========================================================================

  ipcMain.handle('research-add-paper', async (_event, libraryId: string, paper: Paper) => {
    try {
      libraryManager.addPaper(libraryId, paper);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-remove-paper', async (_event, libraryId: string, paperId: string) => {
    try {
      libraryManager.removePaper(libraryId, paperId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-add-note', async (_event, libraryId: string, paperId: string, note: string) => {
    try {
      libraryManager.addNote(libraryId, paperId, note);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-add-tag', async (_event, libraryId: string, paperId: string, tag: string) => {
    try {
      libraryManager.addTagToPaper(libraryId, paperId, tag);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-remove-tag', async (_event, libraryId: string, paperId: string, tag: string) => {
    try {
      libraryManager.removeTagFromPaper(libraryId, paperId, tag);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Tag Management
  // =========================================================================

  ipcMain.handle('research-get-tags', (_event, libraryId: string) => {
    try {
      const library = libraryManager.getLibrary(libraryId);
      if (!library) {
        return { success: false, error: 'Library not found' };
      }
      return { success: true, tags: library.tags };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('research-create-tag', (_event, libraryId: string, name: string, color?: string) => {
    try {
      const tag = libraryManager.createTag(libraryId, name, color);
      return { success: true, tag };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Search Filters
  // =========================================================================

  ipcMain.handle('research-filter-papers', (_event, libraryId: string, filters: {
    query?: string;
    tags?: string[];
    yearFrom?: number;
    yearTo?: number;
    minCitations?: number;
  }) => {
    try {
      const papers = libraryManager.filterPapers(libraryId, filters);
      return { success: true, papers };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
