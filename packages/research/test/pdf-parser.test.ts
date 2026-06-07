/**
 * PDF Parser Tests
 *
 * Test PDF parsing and reference extraction.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceParser, CitationExtractor } from '../src/pdf-parser.js';

describe('ReferenceParser', () => {
  let parser: ReferenceParser;

  beforeEach(() => {
    parser = new ReferenceParser();
  });

  describe('parse', () => {
    it('should parse reference with ID', () => {
      const ref = '[1] Vaswani et al. (2017). Attention Is All You Need. NeurIPS.';
      const result = parser.parse(ref);

      expect(result).toBeDefined();
      expect(result?.id).toBe('1');
      expect(result?.year).toBe(2017);
      expect(result?.authors.length).toBeGreaterThan(0);
    });

    it('should parse reference without ID', () => {
      const ref = 'Devlin et al. (2018). BERT: Pre-training of Deep Bidirectional Transformers. NAACL.';
      const result = parser.parse(ref);

      expect(result).toBeDefined();
      expect(result?.year).toBe(2018);
    });

    it('should extract DOI', () => {
      const ref = '[1] Author (2020). Title. Journal. doi: 10.1234/abcd';
      const result = parser.parse(ref);

      expect(result?.doi).toBe('10.1234/abcd');
    });

    it('should extract URL', () => {
      const ref = '[1] Author (2020). Title. https://example.com/paper';
      const result = parser.parse(ref);

      expect(result?.url).toBe('https://example.com/paper');
    });

    it('should handle empty string', () => {
      const result = parser.parse('');
      expect(result).toBeNull();
    });
  });

  describe('parseSection', () => {
    it('should parse multiple references', () => {
      const text = `[1] Vaswani et al. (2017). Attention Is All You Need. NeurIPS.
[2] Devlin et al. (2018). BERT. NAACL.
[3] Brown et al. (2020). GPT-3. NeurIPS.`;

      const results = parser.parseSection(text);
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('1');
      expect(results[1].id).toBe('2');
      expect(results[2].id).toBe('3');
    });

    it('should handle multi-line references', () => {
      const text = `[1] Author et al. (2020).
Title of the paper.
Journal Name.`;

      const results = parser.parseSection(text);
      expect(results).toHaveLength(1);
    });
  });
});

describe('CitationExtractor', () => {
  let extractor: CitationExtractor;

  beforeEach(() => {
    extractor = new CitationExtractor();
  });

  describe('extract', () => {
    it('should extract numeric citations', () => {
      const text = 'This method was proposed in [1] and improved in [2].';
      const citations = extractor.extract(text);

      expect(citations).toHaveLength(2);
      expect(citations[0].referenceId).toBe('1');
      expect(citations[1].referenceId).toBe('2');
    });

    it('should extract multiple citations in brackets', () => {
      const text = 'Related work includes [1,2,3] and [4-6].';
      const citations = extractor.extract(text);

      expect(citations.length).toBeGreaterThanOrEqual(6);
    });

    it('should extract author-year citations', () => {
      const text = 'As shown by (Vaswani, 2017) and (Devlin, 2018).';
      const citations = extractor.extract(text);

      expect(citations).toHaveLength(2);
      expect(citations[0].referenceId).toContain('Vaswani');
      expect(citations[1].referenceId).toContain('Devlin');
    });

    it('should track citation location', () => {
      const text = 'First paragraph.\n\nSecond paragraph with [1] citation.';
      const citations = extractor.extract(text);

      expect(citations[0].location.paragraph).toBe(1);
    });

    it('should handle no citations', () => {
      const text = 'No citations here.';
      const citations = extractor.extract(text);

      expect(citations).toHaveLength(0);
    });
  });
});
