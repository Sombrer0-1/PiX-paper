/**
 * generate_chart Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GenerateChartTool } from '../src/generate-chart.js';

describe('GenerateChartTool', () => {
  let tool: GenerateChartTool;

  beforeEach(() => {
    tool = new GenerateChartTool();
  });

  describe('execute', () => {
    it('should generate bar chart data', () => {
      const result = tool.execute({
        type: 'bar',
        title: 'Accuracy Comparison',
        experiments: [
          { name: 'Exp 1', metrics: { accuracy: 0.90, loss: 0.15 } },
          { name: 'Exp 2', metrics: { accuracy: 0.95, loss: 0.10 } },
        ],
      });

      expect(result.type).toBe('bar');
      expect(result.data.labels).toEqual(['Exp 1', 'Exp 2']);
      expect(result.data.datasets).toHaveLength(2);
      expect(result.data.datasets[0].label).toBe('accuracy');
      expect(result.data.datasets[1].label).toBe('loss');
    });

    it('should filter metrics when specified', () => {
      const result = tool.execute({
        experiments: [
          { name: 'Exp 1', metrics: { accuracy: 0.90, loss: 0.15, f1: 0.88 } },
        ],
        metrics: ['accuracy'],
      });

      expect(result.data.datasets).toHaveLength(1);
      expect(result.data.datasets[0].label).toBe('accuracy');
    });

    it('should generate HTML', () => {
      const chartData = tool.execute({
        experiments: [
          { name: 'Exp 1', metrics: { accuracy: 0.90 } },
        ],
      });

      const html = tool.generateHtml(chartData);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('chart.js');
      expect(html).toContain('canvas');
    });
  });
});
