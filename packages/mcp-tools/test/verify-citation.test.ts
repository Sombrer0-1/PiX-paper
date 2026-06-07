/**
 * verify_claim_citation Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VerifyCitationTool } from '../src/verify-citation.js';

describe('VerifyCitationTool', () => {
  let tool: VerifyCitationTool;

  beforeEach(() => {
    tool = new VerifyCitationTool();
  });

  describe('execute', () => {
    it('should create tool instance', () => {
      expect(tool).toBeDefined();
    });

    it('should verify claims with citations', async () => {
      const result = await tool.execute({
        claims: [
          {
            id: 'claim-1',
            text: 'Transformer uses attention mechanisms',
            type: 'method',
            citations: ['paper-1'],
          },
        ],
        papers: [
          {
            id: 'paper-1',
            title: 'Attention Is All You Need',
            abstract: 'We propose the Transformer architecture based on attention mechanisms.',
          },
        ],
      });

      expect(result.results).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBe(1);
    });

    it('should detect missing citations', async () => {
      const result = await tool.execute({
        claims: [
          {
            id: 'claim-1',
            text: 'This method was proposed',
            type: 'background',
            citations: ['non-existent'],
          },
        ],
      });

      expect(result.results.get('claim-1')?.supported).toBe(false);
    });
  });
});
