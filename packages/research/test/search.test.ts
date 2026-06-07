/**
 * Search Tests
 *
 * Test multi-source paper search functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MultiSourceSearch,
  SemanticScholarProvider,
  ArxivProvider,
} from '../src/search.js';
import type { Paper, SearchQuery } from '../src/types.js';

describe('MultiSourceSearch', () => {
  let search: MultiSourceSearch;

  beforeEach(() => {
    search = new MultiSourceSearch([]);
  });

  describe('Deduplication', () => {
    it('should deduplicate papers with same title', () => {
      const papers: Paper[] = [
        {
          id: 'paper-1',
          title: 'Attention Is All You Need',
          authors: ['Vaswani et al.'],
          abstract: 'We propose...',
          year: 2017,
          venue: 'NeurIPS',
          citations: 100000,
          url: 'https://arxiv.org/abs/1706.03762',
          tags: [],
          source: 'semantic_scholar',
          sourceId: 'paper-1',
        },
        {
          id: 'paper-2',
          title: 'Attention Is All You Need',
          authors: ['Vaswani et al.'],
          abstract: 'We propose...',
          year: 2017,
          venue: 'NeurIPS',
          citations: 99000,
          url: 'https://arxiv.org/abs/1706.03762v2',
          tags: [],
          source: 'arxiv',
          sourceId: 'paper-2',
        },
        {
          id: 'paper-3',
          title: 'BERT: Pre-training of Deep Bidirectional Transformers',
          authors: ['Devlin et al.'],
          abstract: 'We introduce...',
          year: 2018,
          venue: 'NAACL',
          citations: 50000,
          url: 'https://arxiv.org/abs/1810.04805',
          tags: [],
          source: 'semantic_scholar',
          sourceId: 'paper-3',
        },
      ];

      const result = search.deduplicate(papers);

      expect(result.unique).toHaveLength(2);
      expect(result.duplicates).toHaveLength(1);
      expect(result.totalRemoved).toBe(1);

      // Should keep the one with more citations
      const keptPaper = result.unique.find(p => p.title === 'Attention Is All You Need');
      expect(keptPaper?.id).toBe('paper-1');
    });

    it('should handle case-insensitive deduplication', () => {
      const papers: Paper[] = [
        {
          id: 'paper-1',
          title: 'Attention Is All You Need',
          authors: [],
          abstract: '',
          year: 2017,
          venue: '',
          citations: 100,
          url: '',
          tags: [],
          source: 'semantic_scholar',
          sourceId: 'paper-1',
        },
        {
          id: 'paper-2',
          title: 'attention is all you need',
          authors: [],
          abstract: '',
          year: 2017,
          venue: '',
          citations: 90,
          url: '',
          tags: [],
          source: 'arxiv',
          sourceId: 'paper-2',
        },
      ];

      const result = search.deduplicate(papers);
      expect(result.unique).toHaveLength(1);
    });

    it('should handle empty input', () => {
      const result = search.deduplicate([]);
      expect(result.unique).toHaveLength(0);
      expect(result.duplicates).toHaveLength(0);
      expect(result.totalRemoved).toBe(0);
    });

    it('should keep all unique papers', () => {
      const papers: Paper[] = [
        {
          id: 'paper-1',
          title: 'Paper A',
          authors: [],
          abstract: '',
          year: 2020,
          venue: '',
          citations: 10,
          url: '',
          tags: [],
          source: 'semantic_scholar',
          sourceId: 'paper-1',
        },
        {
          id: 'paper-2',
          title: 'Paper B',
          authors: [],
          abstract: '',
          year: 2021,
          venue: '',
          citations: 20,
          url: '',
          tags: [],
          source: 'arxiv',
          sourceId: 'paper-2',
        },
      ];

      const result = search.deduplicate(papers);
      expect(result.unique).toHaveLength(2);
      expect(result.duplicates).toHaveLength(0);
    });
  });

  describe('Ranking', () => {
    const papers: Paper[] = [
      {
        id: 'paper-1',
        title: 'Transformer Architecture',
        authors: [],
        abstract: 'We propose transformer for attention',
        year: 2023,
        venue: 'NeurIPS',
        citations: 1000,
        url: '',
        tags: [],
        source: 'semantic_scholar',
        sourceId: 'paper-1',
      },
      {
        id: 'paper-2',
        title: 'Old Paper',
        authors: [],
        abstract: 'Some old method',
        year: 2010,
        venue: 'Unknown',
        citations: 50,
        url: '',
        tags: [],
        source: 'arxiv',
        sourceId: 'paper-2',
      },
      {
        id: 'paper-3',
        title: 'Recent Transformer Work',
        authors: [],
        abstract: 'Improving transformer attention',
        year: 2024,
        venue: 'ICML',
        citations: 100,
        url: '',
        tags: [],
        source: 'semantic_scholar',
        sourceId: 'paper-3',
      },
    ];

    it('should rank papers by relevance', () => {
      const ranked = search.rank(papers, 'transformer attention');

      expect(ranked).toHaveLength(3);

      // Paper with high relevance should rank higher than irrelevant paper
      const paper3Rank = ranked.find(p => p.id === 'paper-3');
      const paper2Rank = ranked.find(p => p.id === 'paper-2');
      expect(paper3Rank?.rankScore).toBeGreaterThan(paper2Rank?.rankScore || 0);
    });

    it('should rank higher citations higher', () => {
      const ranked = search.rank(papers, 'paper');

      // Paper with most citations should rank higher
      const paper1Rank = ranked.find(p => p.id === 'paper-1');
      const paper2Rank = ranked.find(p => p.id === 'paper-2');

      expect(paper1Rank?.rankScore).toBeGreaterThan(paper2Rank?.rankScore || 0);
    });

    it('should rank recent papers higher', () => {
      const ranked = search.rank(papers, '');

      const paper1Rank = ranked.find(p => p.id === 'paper-1');
      const paper2Rank = ranked.find(p => p.id === 'paper-2');

      // 2023 paper should rank higher than 2010 paper
      expect(paper1Rank?.rankScore).toBeGreaterThan(paper2Rank?.rankScore || 0);
    });

    it('should rank top venue papers higher', () => {
      const ranked = search.rank(papers, '');

      const paper1Rank = ranked.find(p => p.id === 'paper-1'); // NeurIPS
      const paper2Rank = ranked.find(p => p.id === 'paper-2'); // Unknown

      expect(paper1Rank?.rankFactors.venueScore).toBeGreaterThan(
        paper2Rank?.rankFactors.venueScore || 0
      );
    });

    it('should handle custom criteria', () => {
      const ranked = search.rank(papers, 'transformer', {
        weights: {
          relevance: 0.8,
          citations: 0.1,
          recency: 0.05,
          venue: 0.05,
        },
      });

      // With high relevance weight, relevant paper should rank higher than irrelevant
      const paper3Rank = ranked.find(p => p.id === 'paper-3');
      const paper2Rank = ranked.find(p => p.id === 'paper-2');
      expect(paper3Rank?.rankScore).toBeGreaterThan(paper2Rank?.rankScore || 0);
    });

    it('should handle empty query', () => {
      const ranked = search.rank(papers, '');
      expect(ranked).toHaveLength(3);
    });
  });
});

describe('SemanticScholarProvider', () => {
  it('should have correct name', () => {
    const provider = new SemanticScholarProvider();
    expect(provider.name).toBe('semantic_scholar');
  });
});

describe('ArxivProvider', () => {
  it('should have correct name', () => {
    const provider = new ArxivProvider();
    expect(provider.name).toBe('arxiv');
  });
});
