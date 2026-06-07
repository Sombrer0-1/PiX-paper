/**
 * PDF Parser
 *
 * Parse PDF files to extract text, figures, tables, and references.
 * Uses binary-level parsing for text extraction without external dependencies.
 */

import { readFileSync, existsSync } from 'fs';
import type {
  PdfParseResult,
  PdfPage,
  PdfMetadata,
  ExtractedFigure,
  ExtractedTable,
  ExtractedReference,
} from './types.js';

// ============================================================================
// PDF Parser Interface
// ============================================================================

export interface PdfParserOptions {
  extractFigures?: boolean;
  extractTables?: boolean;
  extractReferences?: boolean;
  maxPages?: number;
}

export class PdfParser {
  private options: PdfParserOptions;

  constructor(options: PdfParserOptions = {}) {
    this.options = {
      extractFigures: true,
      extractTables: true,
      extractReferences: true,
      maxPages: 100,
      ...options,
    };
  }

  /**
   * Parse a PDF file and extract text, metadata, and references.
   */
  async parse(filePath: string): Promise<PdfParseResult> {
    if (!existsSync(filePath)) {
      return {
        text: '',
        pages: [],
        metadata: { pageCount: 0 },
        figures: [],
        tables: [],
        references: [],
      };
    }

    try {
      const buffer = readFileSync(filePath);
      const content = buffer.toString('latin1');

      const metadata = this.extractMetadataFromBuffer(content);
      const pages = this.extractPagesFromBuffer(content, metadata.pageCount);
      const fullText = pages.map(p => p.text).join('\n\n');
      const references = this.options.extractReferences
        ? this.extractReferencesFromText(fullText)
        : [];

      return {
        text: fullText,
        pages,
        metadata,
        figures: [],
        tables: [],
        references,
      };
    } catch (error) {
      console.error('PDF parse error:', error);
      return {
        text: '',
        pages: [],
        metadata: { pageCount: 0 },
        figures: [],
        tables: [],
        references: [],
      };
    }
  }

  /**
   * Extract metadata from PDF buffer content.
   */
  private extractMetadataFromBuffer(content: string): PdfMetadata {
    const pageCount = this.countPages(content);

    // Try to extract title from /Title field
    const titleMatch = content.match(/\/Title\s*\(([^)]+)\)/);
    const title = titleMatch ? this.decodePdfString(titleMatch[1]) : undefined;

    // Try to extract author from /Author field
    const authorMatch = content.match(/\/Author\s*\(([^)]+)\)/);
    const authors = authorMatch
      ? this.decodePdfString(authorMatch[1]).split(/[,;]/).map(a => a.trim()).filter(Boolean)
      : undefined;

    // Try to extract keywords
    const keywordsMatch = content.match(/\/Keywords\s*\(([^)]+)\)/);
    const keywords = keywordsMatch
      ? this.decodePdfString(keywordsMatch[1]).split(/[,;]/).map(k => k.trim()).filter(Boolean)
      : undefined;

    // Try to extract abstract from /Subject or first page text
    const subjectMatch = content.match(/\/Subject\s*\(([^)]+)\)/);
    const abstract = subjectMatch ? this.decodePdfString(subjectMatch[1]) : undefined;

    return {
      title,
      authors,
      abstract,
      keywords,
      pageCount,
    };
  }

  /**
   * Count pages in PDF by counting /Type /Page entries.
   */
  private countPages(content: string): number {
    // Count page objects (excluding /Pages which is the page tree)
    const pageMatches = content.match(/\/Type\s*\/Page\b(?!s)/g);
    return pageMatches ? Math.min(pageMatches.length, this.options.maxPages || 100) : 0;
  }

  /**
   * Extract text from each page in the PDF buffer.
   * Uses BT...ET (text block) extraction from content streams.
   */
  private extractPagesFromBuffer(content: string, pageCount: number): PdfPage[] {
    const pages: PdfPage[] = [];
    const maxPages = Math.min(pageCount, this.options.maxPages || 100);

    // Split content by page objects
    const pageChunks = this.splitByPages(content);

    for (let i = 0; i < Math.min(pageChunks.length, maxPages); i++) {
      const chunk = pageChunks[i];
      const text = this.extractTextFromStream(chunk);

      pages.push({
        pageNumber: i + 1,
        text: text.trim(),
        width: 612,  // Default US Letter width in points
        height: 792, // Default US Letter height in points
      });
    }

    // If page splitting didn't work well, try a fallback approach
    if (pages.length === 0 && pageCount > 0) {
      const allText = this.extractAllTextBlocks(content);
      const textChunks = this.splitTextByPages(allText, pageCount);

      for (let i = 0; i < textChunks.length; i++) {
        pages.push({
          pageNumber: i + 1,
          text: textChunks[i].trim(),
          width: 612,
          height: 792,
        });
      }
    }

    return pages;
  }

  /**
   * Split PDF content into page-level chunks.
   */
  private splitByPages(content: string): string[] {
    const chunks: string[] = [];

    // Find stream content between BT and ET markers
    const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamPattern.exec(content)) !== null) {
      const streamContent = match[1];
      if (streamContent.includes('BT') && streamContent.includes('ET')) {
        chunks.push(streamContent);
      }
    }

    // If no streams found, try splitting by page markers
    if (chunks.length === 0) {
      const pagePattern = /\/Type\s*\/Page\b(?!s)/g;
      const pagePositions: number[] = [];
      let pageMatch;

      while ((pageMatch = pagePattern.exec(content)) !== null) {
        pagePositions.push(pageMatch.index);
      }

      for (let i = 0; i < pagePositions.length; i++) {
        const start = pagePositions[i];
        const end = i + 1 < pagePositions.length ? pagePositions[i + 1] : content.length;
        chunks.push(content.substring(start, end));
      }
    }

    return chunks;
  }

  /**
   * Extract text from a PDF content stream.
   * Handles BT...ET blocks and Tj/TJ operators.
   */
  private extractTextFromStream(stream: string): string {
    const textParts: string[] = [];

    // Extract text from BT...ET blocks
    const btPattern = /BT\s*([\s\S]*?)\s*ET/g;
    let btMatch;

    while ((btMatch = btPattern.exec(stream)) !== null) {
      const block = btMatch[1];

      // Match Tj operator: (text) Tj
      const tjPattern = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjPattern.exec(block)) !== null) {
        textParts.push(this.decodePdfString(tjMatch[1]));
      }

      // Match TJ operator: [(text) spacing (text)] TJ
      const tjArrayPattern = /\[(.*?)\]\s*TJ/g;
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayPattern.exec(block)) !== null) {
        const arrayContent = tjArrayMatch[1];
        const stringPattern = /\(([^)]*)\)/g;
        let strMatch;
        while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
          textParts.push(this.decodePdfString(strMatch[1]));
        }
      }
    }

    return textParts.join(' ');
  }

  /**
   * Fallback: extract all text blocks from the entire PDF content.
   */
  private extractAllTextBlocks(content: string): string {
    const textParts: string[] = [];

    // Match all (text) Tj patterns
    const tjPattern = /\(([^)]{2,})\)\s*Tj/g;
    let match;
    while ((match = tjPattern.exec(content)) !== null) {
      const text = this.decodePdfString(match[1]);
      if (text.length > 1 && /[\w\s]/.test(text)) {
        textParts.push(text);
      }
    }

    return textParts.join(' ');
  }

  /**
   * Split a single text blob into approximate pages.
   */
  private splitTextByPages(text: string, pageCount: number): string[] {
    if (pageCount <= 1) return [text];

    const lines = text.split('\n');
    const linesPerPage = Math.ceil(lines.length / pageCount);
    const pages: string[] = [];

    for (let i = 0; i < pageCount; i++) {
      const start = i * linesPerPage;
      const end = Math.min(start + linesPerPage, lines.length);
      pages.push(lines.slice(start, end).join('\n'));
    }

    return pages;
  }

  /**
   * Decode PDF string escapes.
   */
  private decodePdfString(str: string): string {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')');
  }

  /**
   * Extract references from text using common academic patterns.
   */
  private extractReferencesFromText(text: string): ExtractedReference[] {
    const references: ExtractedReference[] = [];

    // Find references section
    const refSectionMatch = text.match(/(?:References|Bibliography|REFERENCES|BIBLIOGRAPHY)\s*\n([\s\S]+)$/i);
    if (!refSectionMatch) return references;

    const refSection = refSectionMatch[1];

    // Match numbered references: [1] or 1. or 1)
    const refPattern = /\[?(\d{1,3})\]?\s*[.)]\s*(.+?)(?=\n\[?\d{1,3}\]?\s*[.)]|\n\n|$)/gs;
    let match;
    let refId = 1;

    while ((match = refPattern.exec(refSection)) !== null) {
      const text = match[2].trim();
      if (text.length > 10) {
        references.push({
          id: String(refId++),
          text,
          parsed: this.parseReferenceText(text),
        });
      }
    }

    // Fallback: split by lines and look for author-year patterns
    if (references.length === 0) {
      const lines = refSection.split('\n').filter(l => l.trim().length > 10);
      for (const line of lines.slice(0, 50)) {
        references.push({
          id: String(refId++),
          text: line.trim(),
          parsed: this.parseReferenceText(line.trim()),
        });
      }
    }

    return references;
  }

  /**
   * Parse a single reference string into structured data.
   */
  private parseReferenceText(text: string): { id: string; title: string; authors: string[]; year: number; citedBy: number } | undefined {
    if (!text || text.length < 10) return undefined;

    // Extract year
    const yearMatch = text.match(/\((\d{4})\)|,\s*(\d{4})\b|\b(\d{4})\b/);
    const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[2] || yearMatch[3]) : 0;

    // Extract authors (before year or first period)
    let authors: string[] = [];
    const authorEnd = yearMatch ? text.indexOf(yearMatch[0]) : text.indexOf('.');
    if (authorEnd > 0) {
      const authorStr = text.substring(0, authorEnd).trim();
      if (authorStr.length > 2 && authorStr.length < 200) {
        authors = authorStr
          .split(/,|\band\b|&/)
          .map(a => a.trim())
          .filter(a => a.length > 1);
      }
    }

    // Extract title (after year, before next period)
    let title = '';
    if (yearMatch) {
      const afterYear = text.substring(text.indexOf(yearMatch[0]) + yearMatch[0].length);
      const cleaned = afterYear.replace(/^[.,)\s]+/, '');
      const titleEnd = cleaned.indexOf('.');
      title = titleEnd > 0 ? cleaned.substring(0, titleEnd).trim() : cleaned.substring(0, 100).trim();
    }
    if (!title) title = text.substring(0, 100);

    return { id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, authors, year, citedBy: 0 };
  }

  /**
   * Extract metadata from PDF
   */
  async extractMetadata(filePath: string): Promise<PdfMetadata> {
    const result = await this.parse(filePath);
    return result.metadata;
  }

  /**
   * Extract text from specific pages
   */
  async extractText(filePath: string, pageRange?: [number, number]): Promise<string> {
    const result = await this.parse(filePath);

    if (!pageRange) {
      return result.text;
    }

    const [start, end] = pageRange;
    return result.pages
      .filter(p => p.pageNumber >= start && p.pageNumber <= end)
      .map(p => p.text)
      .join('\n\n');
  }

  /**
   * Extract references from PDF
   */
  async extractReferences(filePath: string): Promise<ExtractedReference[]> {
    const result = await this.parse(filePath);
    return result.references;
  }

  /**
   * Extract figures with captions
   */
  async extractFigures(filePath: string): Promise<ExtractedFigure[]> {
    const result = await this.parse(filePath);
    return result.figures;
  }

  /**
   * Extract tables
   */
  async extractTables(filePath: string): Promise<ExtractedTable[]> {
    const result = await this.parse(filePath);
    return result.tables;
  }
}

// ============================================================================
// Reference Parser
// ============================================================================

export interface ParsedReference {
  id: string;
  authors: string[];
  title: string;
  venue?: string;
  year?: number;
  pages?: string;
  doi?: string;
  url?: string;
}

export class ReferenceParser {
  /**
   * Parse a reference string into structured data
   */
  parse(referenceText: string): ParsedReference | null {
    const text = referenceText.trim();
    if (!text) return null;

    const idMatch = text.match(/^\[(\d+)\]/);
    const id = idMatch ? idMatch[1] : `ref-${Date.now()}`;

    const yearMatch = text.match(/\((\d{4})\)/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;

    let authors: string[] = [];
    const authorEnd = yearMatch ? text.indexOf(yearMatch[0]) : text.indexOf('.');
    if (authorEnd > 0) {
      const authorStr = text.substring(0, authorEnd);
      authors = this.parseAuthors(authorStr);
    }

    let title = '';
    if (yearMatch) {
      const titleStart = text.indexOf(').', yearMatch.index!) + 2;
      const titleEnd = text.indexOf('.', titleStart);
      if (titleEnd > titleStart) {
        title = text.substring(titleStart, titleEnd).trim();
      }
    }

    let venue: string | undefined;
    if (title) {
      const venueStart = text.indexOf('.', text.indexOf(title)) + 1;
      const venueEnd = text.indexOf(',', venueStart);
      if (venueEnd > venueStart) {
        venue = text.substring(venueStart, venueEnd).trim();
      }
    }

    const doiMatch = text.match(/doi:\s*(10\.\d{4,}\/[^\s]+)/i);
    const doi = doiMatch ? doiMatch[1] : undefined;

    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : undefined;

    return {
      id,
      authors,
      title: title || text.substring(0, 100),
      venue,
      year,
      doi,
      url,
    };
  }

  private parseAuthors(authorStr: string): string[] {
    const cleaned = authorStr.replace(/^\[?\d+\]?\s*/, '').trim();
    return cleaned
      .split(/(?:,\s*|\s*&\s*|\s*and\s*)/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
  }

  parseSection(referencesText: string): ParsedReference[] {
    const lines = referencesText.split('\n');
    const references: ParsedReference[] = [];
    let currentRef = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\[\d+\]/.test(trimmed) || /\(\d{4}\)/.test(trimmed)) {
        if (currentRef) {
          const parsed = this.parse(currentRef);
          if (parsed) references.push(parsed);
        }
        currentRef = trimmed;
      } else if (currentRef) {
        currentRef += ' ' + trimmed;
      }
    }

    if (currentRef) {
      const parsed = this.parse(currentRef);
      if (parsed) references.push(parsed);
    }

    return references;
  }
}

// ============================================================================
// Citation Extractor
// ============================================================================

export interface ExtractedCitation {
  text: string;
  referenceId: string;
  context: string;
  location: {
    paragraph: number;
    sentence: number;
  };
}

export class CitationExtractor {
  extract(text: string): ExtractedCitation[] {
    const citations: ExtractedCitation[] = [];
    const paragraphs = text.split('\n\n');

    paragraphs.forEach((paragraph, paraIndex) => {
      const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim());

      sentences.forEach((sentence, sentIndex) => {
        const numericMatches = sentence.matchAll(/\[(\d+(?:[,-]\d+)*)\]/g);
        for (const match of numericMatches) {
          const ids = this.expandIds(match[1]);
          for (const id of ids) {
            citations.push({
              text: match[0],
              referenceId: id,
              context: sentence.trim(),
              location: { paragraph: paraIndex, sentence: sentIndex },
            });
          }
        }

        const authorYearMatches = sentence.matchAll(/\(([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?),?\s+(\d{4})\)/g);
        for (const match of authorYearMatches) {
          citations.push({
            text: match[0],
            referenceId: `${match[1]}-${match[2]}`,
            context: sentence.trim(),
            location: { paragraph: paraIndex, sentence: sentIndex },
          });
        }
      });
    });

    return citations;
  }

  private expandIds(idStr: string): string[] {
    const ids: string[] = [];
    const parts = idStr.split(',');

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          ids.push(String(i));
        }
      } else {
        ids.push(part.trim());
      }
    }

    return ids;
  }
}
