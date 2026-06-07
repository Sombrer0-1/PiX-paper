/**
 * OpenAlex Provider
 *
 * Search academic papers via the OpenAlex API.
 * https://docs.openalex.org/
 */

import type { Paper, PaperSource, SearchQuery, SearchResult, SearchProvider } from '../types.js';

export class OpenAlexProvider implements SearchProvider {
  name: PaperSource = 'openalex';
  private baseUrl = 'https://api.openalex.org';

  async search(query: SearchQuery): Promise<SearchResult> {
    const params = new URLSearchParams({
      search: query.keywords.join(' '),
      per_page: String(query.limit || 20),
      page: String(Math.floor((query.offset || 0) / (query.limit || 20)) + 1),
      select: 'id,doi,title,authorships,publication_year,primary_location,cited_by_count,abstract_inverted_index',
    });

    if (query.yearFrom || query.yearTo) {
      const filters: string[] = [];
      if (query.yearFrom) filters.push(`from_publication_date:${query.yearFrom}-01-01`);
      if (query.yearTo) filters.push(`to_publication_date:${query.yearTo}-12-31`);
      params.set('filter', filters.join(','));
    }

    const response = await fetch(`${this.baseUrl}/works?${params}`, {
      headers: { 'User-Agent': 'PiX-paper/1.0 (mailto:research@pix-paper.dev)' },
    });

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const papers: Paper[] = (data.results || []).map((item: any) => this.mapPaper(item));

    return {
      papers,
      total: data.meta?.count || 0,
      query,
      source: this.name,
    };
  }

  async getPaper(paperId: string): Promise<Paper | null> {
    // OpenAlex IDs start with https://openalex.org/
    const id = paperId.startsWith('https://') ? paperId : `https://openalex.org/${paperId}`;
    const response = await fetch(`${this.baseUrl}/works/${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': 'PiX-paper/1.0 (mailto:research@pix-paper.dev)' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return this.mapPaper(data);
  }

  private mapPaper(item: any): Paper {
    const authors = (item.authorships || []).map((a: any) => a.author?.display_name || '').filter(Boolean);

    const venue = item.primary_location?.source?.display_name || '';
    const url = item.primary_location?.landing_page_url || item.doi || '';

    // Reconstruct abstract from inverted index
    const abstract = this.reconstructAbstract(item.abstract_inverted_index);

    return {
      id: item.id || item.doi || '',
      title: item.title || '',
      authors,
      abstract,
      year: item.publication_year || 0,
      venue,
      citations: item.cited_by_count || 0,
      url,
      doi: item.doi?.replace('https://doi.org/', ''),
      tags: [],
      source: this.name,
      sourceId: item.id || '',
    };
  }

  /**
   * OpenAlex returns abstract as an inverted index: { word: [positions] }.
   * Reconstruct the original text from it.
   */
  private reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string {
    if (!invertedIndex || typeof invertedIndex !== 'object') return '';

    const words: Array<[number, string]> = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
      if (Array.isArray(positions)) {
        for (const pos of positions) {
          words.push([pos, word]);
        }
      }
    }

    return words.sort((a, b) => a[0] - b[0]).map(([_, w]) => w).join(' ');
  }
}
