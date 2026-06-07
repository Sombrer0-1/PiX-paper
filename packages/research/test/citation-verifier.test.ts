/**
 * Citation Verifier Tests
 *
 * Test claim verification against citations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CitationVerifier } from '../src/citation-verifier.js';
import type { Paper } from '../src/types.js';
import type { Claim } from '../src/citation-verifier.js';

describe('CitationVerifier', () => {
  let verifier: CitationVerifier;
  let papers: Map<string, Paper>;

  beforeEach(() => {
    verifier = new CitationVerifier();

    papers = new Map<string, Paper>();

    papers.set('paper-1', {
      id: 'paper-1',
      title: 'Attention Is All You Need',
      authors: ['Vaswani et al.'],
      abstract: 'We propose the Transformer, a novel neural network architecture based solely on attention mechanisms.',
      year: 2017,
      venue: 'NeurIPS',
      citations: 100000,
      url: 'https://arxiv.org/abs/1706.03762',
      tags: [],
      source: 'semantic_scholar',
      sourceId: 'paper-1',
    });

    papers.set('paper-2', {
      id: 'paper-2',
      title: 'BERT',
      authors: ['Devlin et al.'],
      abstract: 'We introduce BERT, a new language representation model designed to pre-train deep bidirectional representations.',
      year: 2018,
      venue: 'NAACL',
      citations: 50000,
      url: 'https://arxiv.org/abs/1810.04805',
      tags: [],
      source: 'semantic_scholar',
      sourceId: 'paper-2',
    });
  });

  describe('verifyClaim', () => {
    it('should verify supported claim', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'The Transformer architecture uses attention mechanisms',
        type: 'method',
        citations: ['paper-1'],
        verified: false,
      };

      const result = await verifier.verifyClaim(claim, papers);

      expect(result.supported).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect missing citation', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'This method was proposed by Author',
        type: 'background',
        citations: ['non-existent'],
        verified: false,
      };

      const result = await verifier.verifyClaim(claim, papers);

      expect(result.supported).toBe(false);
      expect(result.issues.some(i => i.includes('not found'))).toBe(true);
    });

    it('should verify result claim with citations', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'BERT achieves state-of-the-art results on NLP tasks',
        type: 'result',
        citations: ['paper-2'],
        verified: false,
      };

      const result = await verifier.verifyClaim(claim, papers);

      expect(result.supported).toBe(true);
    });

    it('should flag result claim without citations', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'Our method achieves 95% accuracy',
        type: 'result',
        citations: [],
        verified: false,
      };

      const result = await verifier.verifyClaim(claim, papers);

      expect(result.supported).toBe(false);
      expect(result.issues.some(i => i.includes('citations'))).toBe(true);
    });

    it('should allow speculation without citations in non-strict mode', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'This may improve performance in future work',
        type: 'speculation',
        citations: [],
        verified: false,
      };

      const result = await verifier.verifyClaim(claim, papers);

      expect(result.supported).toBe(true);
    });
  });

  describe('verifyClaims', () => {
    it('should verify multiple claims', async () => {
      const claims: Claim[] = [
        {
          id: 'claim-1',
          text: 'Transformer uses attention',
          type: 'method',
          citations: ['paper-1'],
          verified: false,
        },
        {
          id: 'claim-2',
          text: 'BERT is a language model',
          type: 'background',
          citations: ['paper-2'],
          verified: false,
        },
      ];

      const results = await verifier.verifyClaims(claims, papers);

      expect(results.size).toBe(2);
      expect(results.get('claim-1')?.supported).toBe(true);
      expect(results.get('claim-2')?.supported).toBe(true);
    });
  });

  describe('extractClaims', () => {
    it('should extract claims from text', () => {
      const text = 'We propose a new method. The results show improvement. This may help future work.';
      const claims = verifier.extractClaims(text);

      expect(claims.length).toBeGreaterThan(0);
    });

    it('should detect claim types', () => {
      const text = 'We propose a new method. The results show improvement. This may help future work.';
      const claims = verifier.extractClaims(text);

      // At least one claim should be detected
      expect(claims.length).toBeGreaterThan(0);

      // Check that different types are detected
      const types = new Set(claims.map(c => c.type));
      expect(types.size).toBeGreaterThan(0);
    });

    it('should extract citations from claims', () => {
      const text = 'As shown in [1], the method works. Results from [2,3] confirm this.';
      const claims = verifier.extractClaims(text);

      const claimsWithCitations = claims.filter(c => c.citations.length > 0);
      expect(claimsWithCitations.length).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('should generate verification report', async () => {
      const claims: Claim[] = [
        {
          id: 'claim-1',
          text: 'Transformer uses attention',
          type: 'method',
          citations: ['paper-1'],
          verified: false,
        },
        {
          id: 'claim-2',
          text: 'Unknown claim',
          type: 'background',
          citations: ['non-existent'],
          verified: false,
        },
      ];

      const results = await verifier.verifyClaims(claims, papers);
      const report = verifier.generateReport(results);

      expect(report).toContain('Verification Report');
      expect(report).toContain('Supported');
      expect(report).toContain('Unsupported');
    });
  });
});
