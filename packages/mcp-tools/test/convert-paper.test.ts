/**
 * convert_paper Tool Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ConvertPaperTool } from '../src/convert-paper.js';

describe('ConvertPaperTool', () => {
  let tool: ConvertPaperTool;
  const testDir = join(import.meta.dirname, '.test-convert');

  beforeEach(() => {
    tool = new ConvertPaperTool();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('toLatex', () => {
    it('should convert markdown to LaTeX', async () => {
      const inputPath = join(testDir, 'test.md');
      writeFileSync(inputPath, '# Title\n\nThis is a **bold** text.');

      const result = await tool.toLatex({ inputPath });

      expect(result.success).toBe(true);
      expect(result.format).toBe('latex');
      expect(existsSync(result.outputPath)).toBe(true);
    });

    it('should handle missing input file', async () => {
      const result = await tool.toLatex({ inputPath: '/nonexistent/file.md' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle headers', async () => {
      const inputPath = join(testDir, 'test.md');
      writeFileSync(inputPath, '# Section\n## Subsection\n### Subsubsection');

      const result = await tool.toLatex({ inputPath });

      expect(result.success).toBe(true);
    });

    it('should handle citations', async () => {
      const inputPath = join(testDir, 'test.md');
      writeFileSync(inputPath, 'This is cited [1,2,3].');

      const result = await tool.toLatex({ inputPath });

      expect(result.success).toBe(true);
    });
  });

  describe('escapeLatex', () => {
    it('should escape special characters', () => {
      // Access private method via any
      const escaped = (tool as any).escapeLatex('Test & % $ # _ { }');

      expect(escaped).toContain('\\&');
      expect(escaped).toContain('\\%');
      expect(escaped).toContain('\\$');
      expect(escaped).toContain('\\#');
      expect(escaped).toContain('\\_');
    });
  });
});
