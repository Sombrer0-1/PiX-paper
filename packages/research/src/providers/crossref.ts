/**
 * Crossref Provider
 *
 * Search academic papers via the Crossref API.
 * https://api.crossref.org/
 */

import type { Paper, PaperSource, SearchQuery, SearchResult, SearchProvider } from '../types.js';

export class CrossrefProvider implements SearchProvider {
  name: PaperSource = 'crossref';
  private baseUrl = 'https://api.crossref.org';

  async search(query: SearchQuery): Promise<SearchResult> {
    const params = new URLSearchParams({
      query: query.keywords.join(' '),
      rows: String(query.limit || 20),
      offset: String(query.offset || 0),
      select: 'DOI,title,author,abstract,published-print,container-title,is-referenced-by-count,URL',
    });

    if (query.yearFrom || query.yearTo) {
      const from = query.yearFrom || 1900;
      const to = query.yearTo || new Date().getFullYear();
      params.set('filter', `from-pub-date:${from},until-pub-date:${to}`);
    }

    const response = await fetch(`${this.baseUrl}/works?${params}`, {
      headers: { 'User-Agent': 'PiX-paper/1.0 (mailto:research@pix-paper.dev)' },
    });

    if (!response.ok) {
      throw new Error(`Crossref API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const papers: Paper[] = (data.message?.items || []).map((item: any) => this.mapPaper(item));

    return {
      papers,
      total: data.message?.totalResults || 0,
      query,
      source: this.name,
    };
  }

  async getPaper(paperId: string): Promise<Paper | null> {
    const doi = paperId.startsWith('10.') ? paperId : `10.${paperId}`;
    const response = await fetch(`${this.baseUrl}/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'PiX-paper/1.0 (mailto:research@pix-paper.dev)' },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    return this.mapPaper(data.message);
  }

  private mapPaper(item: any): Paper {
    const title = Array.isArray(item.title) ? item.title[0] : (item.title || '');
    const authors = (item.author || []).map((a: any) =>
      [a.given, a.family].filter(Boolean).join(' ')
    );

    let year = 0;
    const pubDate = item['published-print'] || item['published-online'] || item.created;
    if (pubDate?.['date-parts']?.[0]?.[0]) {
      year = pubDate['date-parts'][0][0];
    }

    const venue = Array.isArray(item['container-title'])
      ? item['container-title'][0]
      : (item['container-title'] || '');

    return {
      id: item.DOI || '',
      title,
      authors,
      abstract: item.abstract || '',
      year,
      venue,
      citations: item['is-referenced-by-count'] || 0,
      url: item.URL || `https://doi.org/${item.DOI}`,
      doi: item.DOI,
      tags: [],
      source: this.name,
      sourceId: item.DOI || '',
    };
  }
}
