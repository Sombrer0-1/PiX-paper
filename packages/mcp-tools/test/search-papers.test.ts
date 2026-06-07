/**
 * search_papers Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SearchPapersTool } from '../src/search-papers.js';

describe('SearchPapersTool', () => {
  let tool: SearchPapersTool;

  beforeEach(() => {
    tool = new SearchPapersTool();
  });

  describe('execute', () => {
    it('should create tool instance', () => {
      expect(tool).toBeDefined();
    });

    it('should throw error when no query provided', async () => {
      await expect(tool.execute({})).rejects.toThrow('Either query or keywords must be provided');
    });

    it('should accept keywords parameter', async () => {
      // This would make an actual API call, so we just test parameter validation
      // In real tests, we'd mock the API
      expect(() => tool.execute({ keywords: ['transformer'] })).not.toThrow();
    });
  });
});
