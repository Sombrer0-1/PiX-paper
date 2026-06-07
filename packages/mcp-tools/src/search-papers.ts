/**
 * search_papers MCP Tool
 *
 * Search for academic papers across multiple sources.
 */

// ============================================================================
// Tool Definition
// ============================================================================

export const SEARCH_PAPERS_TOOL = {
  name: 'search_papers',
  description: 'Search for academic papers across Semantic Scholar and arXiv',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query keywords',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of keywords to search',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20)',
      },
      yearFrom: {
        type: 'number',
        description: 'Filter papers from this year',
      },
      yearTo: {
        type: 'number',
        description: 'Filter papers up to this year',
      },
      minCitations: {
        type: 'number',
        description: 'Minimum citation count',
      },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['semantic_scholar', 'arxiv'] },
        description: 'Data sources to search (default: all)',
      },
    },
    required: [],
  },
};

// ============================================================================
// Types
// ============================================================================

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  venue: string;
  citations: number;
  url: string;
}

export interface SearchQuery {
  keywords: string[];
  limit?: number;
  yearFrom?: number;
  yearTo?: number;
  minCitations?: number;
}

export interface SearchResult {
  papers: Paper[];
  total: number;
  query: string;
}

// ============================================================================
// API Clients
// ============================================================================

async function searchSemanticScholar(query: SearchQuery): Promise<Paper[]> {
  const params = new URLSearchParams({
    query: query.keywords.join(' '),
    limit: String(query.limit || 20),
    fields: 'paperId,title,authors,abstract,year,venue,citationCount,url',
  });

  if (query.yearFrom) params.set('year', `${query.yearFrom}-${query.yearTo || ''}`);
  if (query.minCitations) params.set('minCitationCount', String(query.minCitations));

  try {
    const response = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`);
    if (!response.ok) return [];

    const data = await response.json() as any;
    return (data.data || []).map((item: any) => ({
      id: item.paperId,
      title: item.title || '',
      authors: (item.authors || []).map((a: any) => a.name || ''),
      abstract: item.abstract || '',
      year: item.year || 0,
      venue: item.venue || '',
      citations: item.citationCount || 0,
      url: item.url || `https://www.semanticscholar.org/paper/${item.paperId}`,
    }));
  } catch {
    return [];
  }
}

async function searchArxiv(query: SearchQuery): Promise<Paper[]> {
  const searchTerms = query.keywords.map(k => `all:${k}`).join('+AND+');
  const params = new URLSearchParams({
    search_query: searchTerms,
    max_results: String(query.limit || 20),
    sortBy: 'relevance',
    sortOrder: 'descending',
  });

  try {
    const response = await fetch(`https://export.arxiv.org/api/query?${params}`);
    if (!response.ok) return [];

    const xml = await response.text();
    return parseArxivXml(xml);
  } catch {
    return [];
  }
}

function parseArxivXml(xml: string): Paper[] {
  const papers: Paper[] = [];
  const entries = xml.split('<entry>').slice(1);

  for (const entry of entries) {
    const id = extractTag(entry, 'id') || '';
    const title = extractTag(entry, 'title')?.replace(/\n/g, ' ').trim() || '';
    const abstract = extractTag(entry, 'summary')?.replace(/\n/g, ' ').trim() || '';
    const published = extractTag(entry, 'published') || '';
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
      citations: 0,
      url: id,
    });
  }

  return papers;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
  return match ? match[1].trim() : null;
}

// ============================================================================
// Deduplication
// ============================================================================

function deduplicatePapers(papers: Paper[]): Paper[] {
  const seen = new Map<string, Paper>();

  for (const paper of papers) {
    const normalizedTitle = paper.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

    if (!seen.has(normalizedTitle)) {
      seen.set(normalizedTitle, paper);
    } else {
      // Keep the one with more citations
      const existing = seen.get(normalizedTitle)!;
      if (paper.citations > existing.citations) {
        seen.set(normalizedTitle, paper);
      }
    }
  }

  return Array.from(seen.values());
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class SearchPapersTool {
  async execute(params: {
    query?: string;
    keywords?: string[];
    limit?: number;
    yearFrom?: number;
    yearTo?: number;
    minCitations?: number;
    sources?: string[];
  }): Promise<SearchResult> {
    // Build keywords from query or keywords array
    const keywords = params.keywords || (params.query ? params.query.split(/\s+/) : []);

    if (keywords.length === 0) {
      throw new Error('Either query or keywords must be provided');
    }

    // Build search query
    const searchQuery: SearchQuery = {
      keywords,
      limit: params.limit || 20,
      yearFrom: params.yearFrom,
      yearTo: params.yearTo,
      minCitations: params.minCitations,
    };

    // Determine sources
    const sources = params.sources || ['semantic_scholar', 'arxiv'];

    // Search in parallel
    const results = await Promise.allSettled(
      sources.map(source => {
        switch (source) {
          case 'semantic_scholar':
            return searchSemanticScholar(searchQuery);
          case 'arxiv':
            return searchArxiv(searchQuery);
          default:
            return Promise.resolve([]);
        }
      })
    );

    // Merge results
    const allPapers: Paper[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPapers.push(...result.value);
      }
    }

    // Deduplicate
    const uniquePapers = deduplicatePapers(allPapers);

    // Sort by citations (simple ranking)
    uniquePapers.sort((a, b) => b.citations - a.citations);

    return {
      papers: uniquePapers.slice(0, params.limit || 20),
      total: uniquePapers.length,
      query: keywords.join(' '),
    };
  }
}

// ============================================================================
// MCP Handler
// ============================================================================

export async function handleSearchPapers(params: Record<string, unknown>): Promise<unknown> {
  const tool = new SearchPapersTool();

  const result = await tool.execute({
    query: params.query as string,
    keywords: params.keywords as string[],
    limit: params.limit as number,
    yearFrom: params.yearFrom as number,
    yearTo: params.yearTo as number,
    minCitations: params.minCitations as number,
    sources: params.sources as string[],
  });

  // Format for MCP response
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          papers: result.papers.map(p => ({
            id: p.id,
            title: p.title,
            authors: p.authors,
            year: p.year,
            venue: p.venue,
            citations: p.citations,
            url: p.url,
            abstract: p.abstract?.substring(0, 200) + '...',
          })),
          total: result.total,
          query: result.query,
        }, null, 2),
      },
    ],
  };
}
