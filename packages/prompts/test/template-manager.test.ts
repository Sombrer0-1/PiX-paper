/**
 * Template Manager Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateManager } from '../src/template-manager.js';
import type { StageType, PromptContext } from '../src/types.js';

describe('TemplateManager', () => {
  let manager: TemplateManager;

  beforeEach(() => {
    manager = new TemplateManager();
  });

  describe('getTemplate', () => {
    it('should return template for literature stage', () => {
      const template = manager.getTemplate('literature');
      expect(template).toBeDefined();
      expect(template.system).toBeDefined();
      expect(template.task).toBeDefined();
      expect(template.outputFormat).toBeDefined();
    });

    it('should return template for method stage', () => {
      const template = manager.getTemplate('method');
      expect(template).toBeDefined();
    });

    it('should return template for reproduction stage', () => {
      const template = manager.getTemplate('reproduction');
      expect(template).toBeDefined();
    });

    it('should return template for experiment stage', () => {
      const template = manager.getTemplate('experiment');
      expect(template).toBeDefined();
    });

    it('should return template for writing stage', () => {
      const template = manager.getTemplate('writing');
      expect(template).toBeDefined();
    });

    it('should return template for review stage', () => {
      const template = manager.getTemplate('review');
      expect(template).toBeDefined();
    });

    it('should throw error for unknown stage', () => {
      expect(() => manager.getTemplate('unknown' as StageType)).toThrow('No template found');
    });
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt for each stage', () => {
      const stages: StageType[] = ['literature', 'method', 'reproduction', 'experiment', 'writing', 'review'];

      for (const stage of stages) {
        const prompt = manager.getSystemPrompt(stage);
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getTaskPrompt', () => {
    it('should replace topic placeholder', () => {
      const context: PromptContext = {
        topic: 'Transformer Attention Mechanisms',
        stage: 'literature',
      };

      const prompt = manager.getTaskPrompt('literature', context);
      expect(prompt).toContain('Transformer Attention Mechanisms');
    });

    it('should handle missing placeholders gracefully', () => {
      const context: PromptContext = {
        topic: 'Test Topic',
        stage: 'literature',
      };

      const prompt = manager.getTaskPrompt('literature', context);
      expect(prompt).toBeDefined();
    });
  });

  describe('getOutputFormat', () => {
    it('should return output format for each stage', () => {
      const stages: StageType[] = ['literature', 'method', 'reproduction', 'experiment', 'writing'];

      for (const stage of stages) {
        const format = manager.getOutputFormat(stage);
        expect(format).toBeDefined();
        expect(format.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getQualityChecks', () => {
    it('should return quality checks for each stage', () => {
      const stages: StageType[] = ['literature', 'method', 'reproduction', 'experiment', 'writing'];

      for (const stage of stages) {
        const checks = manager.getQualityChecks(stage);
        expect(Array.isArray(checks)).toBe(true);
        expect(checks.length).toBeGreaterThan(0);
      }
    });

    it('should return empty array for review stage', () => {
      const checks = manager.getQualityChecks('review');
      expect(checks).toEqual([]);
    });
  });

  describe('generatePrompt', () => {
    it('should generate complete prompt', () => {
      const context: PromptContext = {
        topic: 'Test Topic',
        stage: 'literature',
      };

      const prompt = manager.generatePrompt('literature', context);
      expect(prompt).toContain('# Research Assistant');
      expect(prompt).toContain('Test Topic');
      expect(prompt).toContain('Output Format');
    });
  });

  describe('generateQualityGate', () => {
    it('should generate quality gate prompt', () => {
      const prompt = manager.generateQualityGate('literature', ['literature_pool.json', 'survey.md']);
      expect(prompt).toContain('Quality Gate');
      expect(prompt).toContain('literature_pool.json');
      expect(prompt).toContain('survey.md');
    });
  });

  describe('getAvailableStages', () => {
    it('should return all available stages', () => {
      const stages = manager.getAvailableStages();
      expect(stages).toContain('literature');
      expect(stages).toContain('method');
      expect(stages).toContain('reproduction');
      expect(stages).toContain('experiment');
      expect(stages).toContain('writing');
      expect(stages).toContain('review');
    });
  });

  describe('hasTemplate', () => {
    it('should return true for valid stages', () => {
      expect(manager.hasTemplate('literature')).toBe(true);
      expect(manager.hasTemplate('method')).toBe(true);
    });

    it('should return false for invalid stages', () => {
      expect(manager.hasTemplate('unknown' as StageType)).toBe(false);
    });
  });
});
