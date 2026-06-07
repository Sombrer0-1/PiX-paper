/**
 * Research Types for Renderer
 *
 * Types for literature search, PDF parsing, citation management.
 */

// ============================================================================
// Paper Types
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
  doi?: string;
  localPath?: string;
  notes?: string;
  tags: string[];
  relevanceScore?: number;
  source: PaperSource;
  sourceId: string;
}

export type PaperSource = 'semantic_scholar' | 'arxiv' | 'crossref' | 'openalex';

export interface PaperDetail extends Paper {
  references: PaperReference[];
  sections: PaperSection[];
  figures: PaperFigure[];
  tables: PaperTable[];
}

export interface PaperReference {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  citedBy: number;
}

export interface PaperSection {
  title: string;
  content: string;
  level: number;
}

export interface PaperFigure {
  id: string;
  caption: string;
  path?: string;
  pageNumber?: number;
}

export interface PaperTable {
  id: string;
  caption: string;
  content: string;
  pageNumber?: number;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchQuery {
  keywords: string[];
  yearFrom?: number;
  yearTo?: number;
  venue?: string;
  minCitations?: number;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  papers: Paper[];
  total: number;
  query: SearchQuery;
  source: PaperSource;
}

export interface SearchFilters {
  yearRange?: [number, number];
  minCitations?: number;
  venues?: string[];
  sortBy: 'relevance' | 'citations' | 'year';
  sortOrder: 'asc' | 'desc';
}

// ============================================================================
// Ranking Types
// ============================================================================

export interface RankingCriteria {
  weights: {
    relevance: number;
    citations: number;
    recency: number;
    venue: number;
  };
  topicEmbedding?: number[];
}

export interface RankedPaper extends Paper {
  rankScore: number;
  rankFactors: {
    relevanceScore: number;
    citationScore: number;
    recencyScore: number;
    venueScore: number;
  };
}

// ============================================================================
// Library Types
// ============================================================================

export interface Library {
  id: string;
  name: string;
  papers: Paper[];
  tags: Tag[];
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  paperCount: number;
}

// ============================================================================
// Citation Types
// ============================================================================

export interface Citation {
  id: string;
  paperId: string;
  text: string;
  context: string;
  location: CitationLocation;
}

export interface CitationLocation {
  section: string;
  paragraph: number;
  sentence: number;
}

export interface ClaimCitation {
  claim: string;
  citations: string[];
  evidenceRefs: string[];
  verified: boolean;
  verificationDetails?: string;
}

// ============================================================================
// Verification Types
// ============================================================================

export interface Claim {
  id: string;
  text: string;
  type: 'background' | 'method' | 'result' | 'limitation' | 'speculation';
  citations: string[];
  verified: boolean;
  verificationDetails?: string;
}

export interface VerificationResult {
  claimId: string;
  supported: boolean;
  confidence: number;
  evidence: string[];
  issues: string[];
}
