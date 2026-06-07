/**
 * Citation Verifier
 *
 * Verify that claims in paper are supported by cited references.
 */

import type { Paper, ClaimCitation, Citation } from './types.js';

// ============================================================================
// Claim Types
// ============================================================================

export type ClaimType = 'background' | 'method' | 'result' | 'limitation' | 'speculation';

export interface Claim {
  id: string;
  text: string;
  type: ClaimType;
  citations: string[];
  verified: boolean;
  verificationDetails?: string;
}

export interface VerificationResult {
  claimId: string;
  supported: boolean;
  confidence: number;  // 0-1
  evidence: string[];
  issues: string[];
}

// ============================================================================
// Citation Verifier
// ============================================================================

export interface CitationVerifierOptions {
  strictMode?: boolean;
  minConfidence?: number;
}

export class CitationVerifier {
  private options: CitationVerifierOptions;

  constructor(options: CitationVerifierOptions = {}) {
    this.options = {
      strictMode: false,
      minConfidence: 0.5,
      ...options,
    };
  }

  /**
   * Verify a claim against its citations
   */
  async verifyClaim(
    claim: Claim,
    papers: Map<string, Paper>
  ): Promise<VerificationResult> {
    const issues: string[] = [];
    const evidence: string[] = [];
    let supported = true;
    let confidence = 1.0;

    // Check if all citations exist
    for (const citationId of claim.citations) {
      const paper = papers.get(citationId);
      if (!paper) {
        issues.push(`Citation not found: ${citationId}`);
        supported = false;
        confidence *= 0.5;
        continue;
      }

      // Check if paper abstract contains relevant keywords
      const relevance = this.calculateRelevance(claim.text, paper.abstract);
      if (relevance < 0.1) {
        issues.push(`Citation ${citationId} may not support claim (low relevance: ${relevance.toFixed(2)})`);
        confidence *= 0.8;
      } else {
        evidence.push(`Citation ${citationId} has relevant content (relevance: ${relevance.toFixed(2)})`);
      }
    }

    // Check claim type specific rules
    if (claim.type === 'result' && claim.citations.length === 0) {
      issues.push('Result claims should have citations');
      supported = false;
    }

    if (claim.type === 'speculation' && !this.options.strictMode) {
      // Speculation doesn't need citations
      supported = true;
    }

    return {
      claimId: claim.id,
      supported,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidence,
      issues,
    };
  }

  /**
   * Verify multiple claims
   */
  async verifyClaims(
    claims: Claim[],
    papers: Map<string, Paper>
  ): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();

    for (const claim of claims) {
      const result = await this.verifyClaim(claim, papers);
      results.set(claim.id, result);
    }

    return results;
  }

  /**
   * Extract claims from text
   */
  extractClaims(text: string): Claim[] {
    const claims: Claim[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

    let claimId = 1;
    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      // Detect claim type based on keywords
      const type = this.detectClaimType(trimmed);

      // Extract citations from sentence
      const citations = this.extractCitations(trimmed);

      claims.push({
        id: `claim-${claimId++}`,
        text: trimmed,
        type,
        citations,
        verified: false,
      });
    }

    return claims;
  }

  /**
   * Detect claim type from text
   */
  private detectClaimType(text: string): ClaimType {
    const lower = text.toLowerCase();

    // Result indicators
    if (/\b(achieve|outperform|improve|result|experiment|accuracy|performance)\b/.test(lower)) {
      return 'result';
    }

    // Method indicators
    if (/\b(we propose|our method|approach|algorithm|technique|framework)\b/.test(lower)) {
      return 'method';
    }

    // Limitation indicators
    if (/\b(limitation|weakness|challenge|issue|problem|future)\b/.test(lower)) {
      return 'limitation';
    }

    // Speculation indicators
    if (/\b(may|might|could|possibly|potentially|hypothesis)\b/.test(lower)) {
      return 'speculation';
    }

    // Default to background
    return 'background';
  }

  /**
   * Extract citations from text
   */
  private extractCitations(text: string): string[] {
    const citations: string[] = [];

    // Match [1], [1,2], [1-3]
    const numericMatches = text.matchAll(/\[(\d+(?:[,-]\d+)*)\]/g);
    for (const match of numericMatches) {
      const ids = this.expandIds(match[1]);
      citations.push(...ids);
    }

    // Match (Author, 2020)
    const authorYearMatches = text.matchAll(/\(([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?),?\s+(\d{4})\)/g);
    for (const match of authorYearMatches) {
      citations.push(`${match[1]}-${match[2]}`);
    }

    return [...new Set(citations)]; // Deduplicate
  }

  /**
   * Expand citation IDs
   */
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

  /**
   * Calculate relevance between claim and paper abstract
   */
  private calculateRelevance(claim: string, abstract: string): number {
    if (!abstract) return 0;

    const claimWords = new Set(
      claim.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    const abstractWords = new Set(
      abstract.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    if (claimWords.size === 0) return 0;

    let matches = 0;
    for (const word of claimWords) {
      if (abstractWords.has(word)) {
        matches++;
      }
    }

    return matches / claimWords.size;
  }

  /**
   * Generate verification report
   */
  generateReport(results: Map<string, VerificationResult>): string {
    const lines: string[] = ['# Verification Report\n'];

    let supported = 0;
    let unsupported = 0;
    const allIssues: string[] = [];

    for (const [claimId, result] of results) {
      if (result.supported) {
        supported++;
      } else {
        unsupported++;
        allIssues.push(...result.issues.map(i => `- ${claimId}: ${i}`));
      }
    }

    lines.push(`## Summary`);
    lines.push(`- Total claims: ${results.size}`);
    lines.push(`- Supported: ${supported}`);
    lines.push(`- Unsupported: ${unsupported}`);
    lines.push(`- Support rate: ${((supported / results.size) * 100).toFixed(1)}%\n`);

    if (allIssues.length > 0) {
      lines.push(`## Issues`);
      lines.push(...allIssues);
    }

    return lines.join('\n');
  }
}
