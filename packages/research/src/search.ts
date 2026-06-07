/**
 * Literature Search Tools
 *
 * Multi-source paper search with deduplication and ranking.
 */

import type {
  Paper,
  PaperSource,
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchFilters,
  RankedPaper,
  RankingCriteria,
  DeduplicationResult,
  DuplicateGroup,
} from './types.js';

// ============================================================================
// Search Providers
// ============================================================================

// Semantic Scholar Provider
export class SemanticScholarProvider implements SearchProvider {
  name: PaperSource = 'semantic_scholar';
  private baseUrl = 'https://api.semanticscholar.org/graph/v1';

  async search(query: SearchQuery): Promise<SearchResult> {
    const params = new URLSearchParams({
      query: query.keywords.join(' '),
      limit: String(query.limit || 20),
      offset: String(query.offset || 0),
      fields: 'paperId,title,authors,abstract,year,venue,citationCount,url,externalIds',
    });

    if (query.yearFrom) params.set('year', `${query.yearFrom}-${query.yearTo || ''}`);
    if (query.minCitations) params.set('minCitationCount', String(query.minCitations));

    const response = await fetch(`${this.baseUrl}/paper/search?${params}`);
    if (!response.ok) {
      throw new Error(`Semantic Scholar API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const papers: Paper[] = (data.data || []).map((item: any) => this.mapPaper(item));

    return {
      papers,
      total: data.total || 0,
      query,
      source: this.name,
    };
  }

  async getPaper(paperId: string): Promise<Paper | null> {
    const response = await fetch(
      `${this.baseUrl}/paper/${paperId}?fields=paperId,title,authors,abstract,year,venue,citationCount,url,externalIds`
    );
    if (!response.ok) return null;

    const data = await response.json();
    return this.mapPaper(data);
  }

  private mapPaper(item: any): Paper {
    return {
      id: item.paperId,
      title: item.title || '',
      authors: (item.authors || []).map((a: any) => a.name || ''),
      abstract: item.abstract || '',
      year: item.year || 0,
      venue: item.venue || '',
      citations: item.citationCount || 0,
      url: item.url || `https://www.semanticscholar.org/paper/${item.paperId}`,
      doi: item.externalIds?.DOI,
      tags: [],
      source: this.name,
      sourceId: item.paperId,
    };
  }
}

// arXiv Provider
export class ArxivProvider implements SearchProvider {
  name: PaperSource = 'arxiv';

  async search(query: SearchQuery): Promise<SearchResult> {
    const searchTerms = query.keywords.map(k => `all:${k}`).join('+AND+');
    const params = new URLSearchParams({
      search_query: searchTerms,
      start: String(query.offset || 0),
      max_results: String(query.limit || 20),
      sortBy: 'relevance',
      sortOrder: 'descending',
    });

    const response = await fetch(`https://export.arxiv.org/api/query?${params}`);
    if (!response.ok) {
      throw new Error(`arXiv API error: ${response.status}`);
    }

    const xml = await response.text();
    const papers = this.parseXml(xml);

    return {
      papers,
      total: papers.length,
      query,
      source: this.name,
    };
  }

  async getPaper(paperId: string): Promise<Paper | null> {
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${paperId}`);
    if (!response.ok) return null;

    const xml = await response.text();
    const papers = this.parseXml(xml);
    return papers[0] || null;
  }

  private parseXml(xml: string): Paper[] {
    // Simple XML parsing for arXiv response
    const papers: Paper[] = [];
    const entries = xml.split('<entry>').slice(1);

    for (const entry of entries) {
      const id = this.extractTag(entry, 'id') || '';
      const title = this.extractTag(entry, 'title')?.replace(/\n/g, ' ').trim() || '';
      const abstract = this.extractTag(entry, 'summary')?.replace(/\n/g, ' ').trim() || '';
      const published = this.extractTag(entry, 'published') || '';
      const year = published ? parseInt(published.substring(0, 4)) : 0;

      const authors: string[] = [];
      const authorMatches = entry.matchAll(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g);
      for (const match of authorMatches) {
        authors.push(match[1].trim());
      }

      papers.push({
        id: id.split('/').pop() || id,
        title,
        authors,
        abstract,
        year,
        venue: 'arXiv',
        citations: 0,  // arXiv doesn't provide citation count
        url: id,
        tags: [],
        source: this.name,
        sourceId: id,
      });
    }

    return papers;
  }

  private extractTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
    return match ? match[1].trim() : null;
  }
}

// ============================================================================
// Multi-Source Search
// ============================================================================

export class MultiSourceSearch {
  private providers: SearchProvider[];

  constructor(providers?: SearchProvider[]) {
    this.providers = providers || [
      new SemanticScholarProvider(),
      new ArxivProvider(),
    ];
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results = await Promise.allSettled(
      this.providers.map(p => p.search(query))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  async searchAll(query: SearchQuery): Promise<Paper[]> {
    const results = await this.search(query);
    const allPapers = results.flatMap(r => r.papers);
    return this.deduplicate(allPapers).unique;
  }

  deduplicate(papers: Paper[]): DeduplicationResult {
    const groups = new Map<string, Paper[]>();
    const canonical = new Map<string, Paper>();

    // Group by title similarity (simple approach)
    for (const paper of papers) {
      const normalizedTitle = this.normalizeTitle(paper.title);
      const existing = groups.get(normalizedTitle);

      if (existing) {
        existing.push(paper);
      } else {
        groups.set(normalizedTitle, [paper]);
        canonical.set(normalizedTitle, paper);
      }
    }

    const unique: Paper[] = [];
    const duplicates: DuplicateGroup[] = [];

    for (const [normalizedTitle, group] of groups) {
      if (group.length === 1) {
        unique.push(group[0]);
      } else {
        // Keep the one with most citations or most complete metadata
        const best = this.selectBestPaper(group);
        unique.push(best);
        duplicates.push({
          papers: group,
          canonicalId: best.id,
          reason: `Duplicate title: "${group[0].title}"`,
        });
      }
    }

    return {
      unique,
      duplicates,
      totalRemoved: papers.length - unique.length,
    };
  }

  rank(papers: Paper[], topic: string, criteria?: RankingCriteria): RankedPaper[] {
    const defaultCriteria: RankingCriteria = {
      weights: {
        relevance: 0.4,
        citations: 0.3,
        recency: 0.2,
        venue: 0.1,
      },
    };

    const c = criteria || defaultCriteria;
    const maxCitations = Math.max(...papers.map(p => p.citations), 1);
    const currentYear = new Date().getFullYear();

    const ranked: RankedPaper[] = papers.map(paper => {
      // Simple relevance score based on keyword matching
      const relevanceScore = this.calculateRelevance(paper, topic);

      // Citation score (normalized)
      const citationScore = paper.citations / maxCitations;

      // Recency score (more recent = higher)
      const yearsOld = currentYear - paper.year;
      const recencyScore = Math.max(0, 1 - yearsOld / 10);

      // Venue score (simplified)
      const venueScore = this.calculateVenueScore(paper.venue);

      const rankScore =
        c.weights.relevance * relevanceScore +
        c.weights.citations * citationScore +
        c.weights.recency * recencyScore +
        c.weights.venue * venueScore;

      return {
        ...paper,
        relevanceScore,
        rankScore,
        rankFactors: {
          relevanceScore,
          citationScore,
          recencyScore,
          venueScore,
        },
      };
    });

    return ranked.sort((a, b) => b.rankScore - a.rankScore);
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private selectBestPaper(papers: Paper[]): Paper {
    // Select by: 1) most citations, 2) has DOI, 3) has abstract
    return papers.sort((a, b) => {
      if (a.citations !== b.citations) return b.citations - a.citations;
      if (!!a.doi !== !!b.doi) return a.doi ? -1 : 1;
      if (!!a.abstract !== !!b.abstract) return a.abstract ? -1 : 1;
      return 0;
    })[0];
  }

  private calculateRelevance(paper: Paper, topic: string): number {
    const topicWords = topic.toLowerCase().split(/\s+/);
    const text = `${paper.title} ${paper.abstract}`.toLowerCase();
    const matches = topicWords.filter(w => text.includes(w));
    return matches.length / topicWords.length;
  }

  private calculateVenueScore(venue: string): number {
    const topVenues = ['neurips', 'icml', 'iclr', 'cvpr', 'iccv', 'acl', 'emnlp', 'aaai', 'ijcai'];
    const normalized = venue.toLowerCase();
    return topVenues.some(v => normalized.includes(v)) ? 1.0 : 0.5;
  }
}
