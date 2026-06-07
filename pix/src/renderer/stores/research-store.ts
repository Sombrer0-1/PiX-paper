/**
 * Research Store
 *
 * Manages research state for the renderer process.
 * Connected to the main process via IPC.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Paper, Library, Tag, SearchResult } from '@/types/research';

export const useResearchStore = defineStore('research', () => {
  // ============================================================================
  // State
  // ============================================================================

  const libraries = ref<Library[]>([]);
  const currentLibrary = ref<Library | null>(null);
  const searchResults = ref<Paper[]>([]);
  const selectedPaper = ref<Paper | null>(null);
  const tags = ref<Tag[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const searchQuery = ref('');

  // ============================================================================
  // Getters
  // ============================================================================

  const currentLibraryPapers = computed(() => {
    return currentLibrary.value?.papers || [];
  });

  const filteredPapers = computed(() => {
    if (!currentLibrary.value) return [];

    let papers = currentLibrary.value.papers;

    // Filter by search query
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      papers = papers.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.abstract.toLowerCase().includes(query) ||
        p.authors.some(a => a.toLowerCase().includes(query))
      );
    }

    return papers;
  });

  const papersByTag = computed(() => {
    if (!currentLibrary.value) return new Map<string, Paper[]>();

    const groups = new Map<string, Paper[]>();
    for (const paper of currentLibrary.value.papers) {
      for (const tag of paper.tags) {
        const group = groups.get(tag) || [];
        group.push(paper);
        groups.set(tag, group);
      }
    }
    return groups;
  });

  const recentPapers = computed(() => {
    if (!currentLibrary.value) return [];
    return [...currentLibrary.value.papers]
      .sort((a, b) => b.year - a.year)
      .slice(0, 10);
  });

  const topCitedPapers = computed(() => {
    if (!currentLibrary.value) return [];
    return [...currentLibrary.value.papers]
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 10);
  });

  // ============================================================================
  // Actions - Library Management
  // ============================================================================

  async function loadLibraries(): Promise<void> {
    try {
      loading.value = true;
      const result = await window.pixApi.researchGetLibraries();
      if (result.success) {
        libraries.value = result.libraries as Library[];
      }
    } catch (err) {
      console.error('[research-store] Failed to load libraries:', err);
      error.value = 'Failed to load libraries';
    } finally {
      loading.value = false;
    }
  }

  async function createLibrary(name: string): Promise<Library | null> {
    try {
      loading.value = true;
      const result = await window.pixApi.researchCreateLibrary(name);
      if (result.success) {
        const library = result.library as Library;
        libraries.value.push(library);
        return library;
      }
      return null;
    } catch (err) {
      console.error('[research-store] Failed to create library:', err);
      error.value = 'Failed to create library';
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function selectLibrary(libraryId: string): Promise<void> {
    try {
      loading.value = true;
      const result = await window.pixApi.researchGetLibrary(libraryId);
      if (result.success) {
        currentLibrary.value = result.library as Library;
        await loadTags(libraryId);
      }
    } catch (err) {
      console.error('[research-store] Failed to select library:', err);
      error.value = 'Failed to load library';
    } finally {
      loading.value = false;
    }
  }

  async function deleteLibrary(libraryId: string): Promise<boolean> {
    try {
      loading.value = true;
      const result = await window.pixApi.researchDeleteLibrary(libraryId);
      if (result.success) {
        libraries.value = libraries.value.filter(l => l.id !== libraryId);
        if (currentLibrary.value?.id === libraryId) {
          currentLibrary.value = null;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[research-store] Failed to delete library:', err);
      error.value = 'Failed to delete library';
      return false;
    } finally {
      loading.value = false;
    }
  }

  // ============================================================================
  // Actions - Paper Management
  // ============================================================================

  async function addPaper(paper: Paper): Promise<boolean> {
    if (!currentLibrary.value) return false;

    try {
      loading.value = true;
      const result = await window.pixApi.researchAddPaper(currentLibrary.value.id, paper);
      if (result.success) {
        currentLibrary.value.papers.push(paper);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[research-store] Failed to add paper:', err);
      error.value = 'Failed to add paper';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function removePaper(paperId: string): Promise<boolean> {
    if (!currentLibrary.value) return false;

    try {
      loading.value = true;
      const result = await window.pixApi.researchRemovePaper(currentLibrary.value.id, paperId);
      if (result.success) {
        currentLibrary.value.papers = currentLibrary.value.papers.filter(p => p.id !== paperId);
        if (selectedPaper.value?.id === paperId) {
          selectedPaper.value = null;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[research-store] Failed to remove paper:', err);
      error.value = 'Failed to remove paper';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function addNote(paperId: string, note: string): Promise<boolean> {
    if (!currentLibrary.value) return false;

    try {
      const result = await window.pixApi.researchAddNote(currentLibrary.value.id, paperId, note);
      if (result.success) {
        const paper = currentLibrary.value.papers.find(p => p.id === paperId);
        if (paper) {
          paper.notes = note;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[research-store] Failed to add note:', err);
      return false;
    }
  }

  async function addTag(paperId: string, tag: string): Promise<boolean> {
    if (!currentLibrary.value) return false;

    try {
      const result = await window.pixApi.researchAddTag(currentLibrary.value.id, paperId, tag);
      if (result.success) {
        const paper = currentLibrary.value.papers.find(p => p.id === paperId);
        if (paper && !paper.tags.includes(tag)) {
          paper.tags.push(tag);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[research-store] Failed to add tag:', err);
      return false;
    }
  }

  async function removeTag(paperId: string, tag: string): Promise<boolean> {
    if (!currentLibrary.value) return false;

    try {
      const result = await window.pixApi.researchRemoveTag(currentLibrary.value.id, paperId, tag);
      if (result.success) {
        const paper = currentLibrary.value.papers.find(p => p.id === paperId);
        if (paper) {
          paper.tags = paper.tags.filter(t => t !== tag);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[research-store] Failed to remove tag:', err);
      return false;
    }
  }

  // ============================================================================
  // Actions - Search
  // ============================================================================

  async function searchPapers(query: string): Promise<void> {
    try {
      loading.value = true;
      error.value = null;
      const result = await window.pixApi.researchSearch({ keywords: [query] });
      if (result.success) {
        searchResults.value = result.papers as Paper[];
      } else {
        error.value = result.error || 'Search failed';
      }
    } catch (err) {
      console.error('[research-store] Failed to search papers:', err);
      error.value = 'Failed to search papers';
    } finally {
      loading.value = false;
    }
  }

  async function getPaper(paperId: string, source: string): Promise<Paper | null> {
    try {
      const result = await window.pixApi.researchGetPaper(paperId, source);
      if (result.success) {
        return result.paper as Paper;
      }
      return null;
    } catch (err) {
      console.error('[research-store] Failed to get paper:', err);
      return null;
    }
  }

  // ============================================================================
  // Actions - Tags
  // ============================================================================

  async function loadTags(libraryId: string): Promise<void> {
    try {
      const result = await window.pixApi.researchGetTags(libraryId);
      if (result.success) {
        tags.value = result.tags as Tag[];
      }
    } catch (err) {
      console.error('[research-store] Failed to load tags:', err);
    }
  }

  async function createTag(name: string, color?: string): Promise<Tag | null> {
    if (!currentLibrary.value) return null;

    try {
      const result = await window.pixApi.researchCreateTag(currentLibrary.value.id, name, color);
      if (result.success) {
        const tag = result.tag as Tag;
        tags.value.push(tag);
        return tag;
      }
      return null;
    } catch (err) {
      console.error('[research-store] Failed to create tag:', err);
      return null;
    }
  }

  // ============================================================================
  // Actions - Selection
  // ============================================================================

  function selectPaper(paperId: string): void {
    if (!currentLibrary.value) return;
    selectedPaper.value = currentLibrary.value.papers.find(p => p.id === paperId) || null;
  }

  function clearSelection(): void {
    selectedPaper.value = null;
  }

  // ============================================================================
  // Actions - State Management
  // ============================================================================

  function setSearchQuery(query: string): void {
    searchQuery.value = query;
  }

  function clearError(): void {
    error.value = null;
  }

  function clearSearchResults(): void {
    searchResults.value = [];
  }

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // State
    libraries,
    currentLibrary,
    searchResults,
    selectedPaper,
    tags,
    loading,
    error,
    searchQuery,

    // Getters
    currentLibraryPapers,
    filteredPapers,
    papersByTag,
    recentPapers,
    topCitedPapers,

    // Actions
    loadLibraries,
    createLibrary,
    selectLibrary,
    deleteLibrary,
    addPaper,
    removePaper,
    addNote,
    addTag,
    removeTag,
    searchPapers,
    getPaper,
    loadTags,
    createTag,
    selectPaper,
    clearSelection,
    setSearchQuery,
    clearError,
    clearSearchResults,
  };
});
