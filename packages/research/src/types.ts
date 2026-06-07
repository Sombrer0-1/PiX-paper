/**
 * Research Tools Types
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

export interface SearchProvider {
  name: PaperSource;
  search(query: SearchQuery): Promise<SearchResult>;
  getPaper(paperId: string): Promise<Paper | null>;
}

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
// Deduplication Types
// ============================================================================

export interface DuplicateGroup {
  papers: Paper[];
  canonicalId: string;  // ID of the paper to keep
  reason: string;
}

export interface DeduplicationResult {
  unique: Paper[];
  duplicates: DuplicateGroup[];
  totalRemoved: number;
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
  citations: Citation[];
  evidenceRefs: string[];  // Artifact IDs
  verified: boolean;
  verificationDetails?: string;
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
// Manuscript Types
// ============================================================================

export interface DraftParagraph {
  id: string;
  content: string;
  citations: string[];             // 引用 ID
  evidenceRefs: string[];          // 支撑证据的 Artifact ID
  claimType: 'background' | 'method' | 'result' | 'limitation' | 'speculation';
}

export interface PaperSection {
  id: string;
  title: string;
  paragraphs: DraftParagraph[];
  status: 'draft' | 'review' | 'final';
}

export interface PaperManuscript {
  title: string;
  abstract: PaperSection;
  introduction: PaperSection;
  relatedWork: PaperSection;
  method: PaperSection;
  experiments: PaperSection;
  conclusion: PaperSection;
  references: Reference[];
  figures: FigureRef[];
  tables: TableRef[];
}

export interface Reference {
  id: string;
  key: string;
  type: 'article' | 'inproceedings' | 'book' | 'misc';
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  doi?: string;
  url?: string;
}

export interface FigureRef {
  id: string;
  path: string;
  caption: string;
  label: string;
}

export interface TableRef {
  id: string;
  content: string;
  caption: string;
  label: string;
}

// ============================================================================
// PDF Parsing Types
// ============================================================================

export interface PdfParseResult {
  text: string;
  pages: PdfPage[];
  metadata: PdfMetadata;
  figures: ExtractedFigure[];
  tables: ExtractedTable[];
  references: ExtractedReference[];
}

export interface PdfPage {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
}

export interface PdfMetadata {
  title?: string;
  authors?: string[];
  abstract?: string;
  keywords?: string[];
  pageCount: number;
}

export interface ExtractedFigure {
  id: string;
  pageNumber: number;
  caption: string;
  imagePath?: string;
}

export interface ExtractedTable {
  id: string;
  pageNumber: number;
  caption: string;
  content: string;
}

export interface ExtractedReference {
  id: string;
  text: string;
  parsed?: PaperReference;
}
