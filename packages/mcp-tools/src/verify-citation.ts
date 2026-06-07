/**
 * verify_claim_citation MCP Tool
 *
 * Verify that claims in paper are supported by cited references.
 */

// ============================================================================
// Tool Definition
// ============================================================================

export const VERIFY_CITATION_TOOL = {
  name: 'verify_claim_citation',
  description: 'Verify that claims are supported by cited references',
  inputSchema: {
    type: 'object' as const,
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            type: {
              type: 'string',
              enum: ['background', 'method', 'result', 'limitation', 'speculation'],
            },
            citations: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['id', 'text', 'type'],
        },
        description: 'List of claims to verify',
      },
      papers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            abstract: { type: 'string' },
          },
          required: ['id'],
        },
        description: 'Referenced papers for verification',
      },
    },
    required: ['claims'],
  },
};

// ============================================================================
// Types
// ============================================================================

export interface Claim {
  id: string;
  text: string;
  type: 'background' | 'method' | 'result' | 'limitation' | 'speculation';
  citations: string[];
  verified: boolean;
}

export interface VerificationResult {
  claimId: string;
  supported: boolean;
  confidence: number;
  evidence: string[];
  issues: string[];
}

// ============================================================================
// Verification Logic
// ============================================================================

function calculateRelevance(claimText: string, abstract: string): number {
  if (!abstract) return 0;

  const claimWords = new Set(
    claimText.toLowerCase()
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

function verifyClaim(
  claim: Claim,
  papers: Map<string, { title: string; abstract: string }>
): VerificationResult {
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

    // Check relevance
    const relevance = calculateRelevance(claim.text, paper.abstract);
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

  return {
    claimId: claim.id,
    supported,
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence,
    issues,
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class VerifyCitationTool {
  async execute(params: {
    claims: Array<{
      id: string;
      text: string;
      type: string;
      citations?: string[];
    }>;
    papers?: Array<{
      id: string;
      title?: string;
      abstract?: string;
    }>;
  }): Promise<{
    results: Map<string, VerificationResult>;
    summary: {
      total: number;
      supported: number;
      unsupported: number;
      avgConfidence: number;
    };
    report: string;
  }> {
    // Build papers map
    const papersMap = new Map<string, { title: string; abstract: string }>();
    if (params.papers) {
      for (const paper of params.papers) {
        papersMap.set(paper.id, {
          title: paper.title || '',
          abstract: paper.abstract || '',
        });
      }
    }

    // Build claims
    const claims: Claim[] = params.claims.map(c => ({
      id: c.id,
      text: c.text,
      type: c.type as Claim['type'],
      citations: c.citations || [],
      verified: false,
    }));

    // Verify claims
    const results = new Map<string, VerificationResult>();
    let supported = 0;
    let unsupported = 0;
    let totalConfidence = 0;

    for (const claim of claims) {
      const result = verifyClaim(claim, papersMap);
      results.set(claim.id, result);

      if (result.supported) {
        supported++;
      } else {
        unsupported++;
      }
      totalConfidence += result.confidence;
    }

    // Generate report
    const reportLines: string[] = ['# Verification Report\n'];
    reportLines.push(`## Summary`);
    reportLines.push(`- Total claims: ${results.size}`);
    reportLines.push(`- Supported: ${supported}`);
    reportLines.push(`- Unsupported: ${unsupported}`);
    reportLines.push(`- Support rate: ${results.size > 0 ? ((supported / results.size) * 100).toFixed(1) : 0}%\n`);

    const allIssues: string[] = [];
    for (const [claimId, result] of results) {
      if (!result.supported) {
        allIssues.push(...result.issues.map(i => `- ${claimId}: ${i}`));
      }
    }

    if (allIssues.length > 0) {
      reportLines.push(`## Issues`);
      reportLines.push(...allIssues);
    }

    return {
      results,
      summary: {
        total: results.size,
        supported,
        unsupported,
        avgConfidence: results.size > 0 ? totalConfidence / results.size : 0,
      },
      report: reportLines.join('\n'),
    };
  }
}

// ============================================================================
// MCP Handler
// ============================================================================

export async function handleVerifyCitation(params: Record<string, unknown>): Promise<unknown> {
  const tool = new VerifyCitationTool();

  const claims = params.claims as Array<{
    id: string;
    text: string;
    type: string;
    citations?: string[];
  }>;

  const papers = params.papers as Array<{
    id: string;
    title?: string;
    abstract?: string;
  }>;

  const result = await tool.execute({ claims, papers });

  // Convert Map to object for JSON serialization
  const resultsObj: Record<string, VerificationResult> = {};
  for (const [key, value] of result.results) {
    resultsObj[key] = value;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          results: resultsObj,
          summary: result.summary,
          report: result.report,
        }, null, 2),
      },
    ],
  };
}
