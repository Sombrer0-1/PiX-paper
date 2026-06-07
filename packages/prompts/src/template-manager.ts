/**
 * Template Manager
 *
 * Manages prompt templates for each stage of the research workflow.
 */

import type { StageType, PromptTemplate, PromptContext } from './types.js';
import { LITERATURE_TEMPLATE } from './stages/literature.js';
import { METHOD_TEMPLATE } from './stages/method.js';
import { REPRODUCTION_TEMPLATE } from './stages/reproduction.js';
import { EXPERIMENT_TEMPLATE } from './stages/experiment.js';
import { WRITING_TEMPLATE } from './stages/writing.js';
import { REVIEW_TEMPLATE, generateQualityGatePrompt } from './quality-checks.js';

// ============================================================================
// Template Registry
// ============================================================================

const TEMPLATES: Record<StageType, PromptTemplate> = {
  literature: LITERATURE_TEMPLATE,
  method: METHOD_TEMPLATE,
  reproduction: REPRODUCTION_TEMPLATE,
  experiment: EXPERIMENT_TEMPLATE,
  writing: WRITING_TEMPLATE,
  review: REVIEW_TEMPLATE as PromptTemplate,
};

// ============================================================================
// Template Manager
// ============================================================================

export class TemplateManager {
  /**
   * Get template for a specific stage
   */
  getTemplate(stage: StageType): PromptTemplate {
    const template = TEMPLATES[stage];
    if (!template) {
      throw new Error(`No template found for stage: ${stage}`);
    }
    return template;
  }

  /**
   * Get system prompt for a stage
   */
  getSystemPrompt(stage: StageType): string {
    return this.getTemplate(stage).system;
  }

  /**
   * Get task prompt with context variables replaced
   */
  getTaskPrompt(stage: StageType, context: PromptContext): string {
    const template = this.getTemplate(stage);
    let task = template.task;

    // Replace template variables
    task = task.replace(/\{\{topic\}\}/g, context.topic || '');
    task = task.replace(/\{\{stage\}\}/g, context.stage || stage);

    // Replace custom variables
    if (context.previousOutputs) {
      task = task.replace(/\{\{previous_outputs\}\}/g, context.previousOutputs.join('\n\n'));
    }

    if (context.artifacts) {
      task = task.replace(/\{\{artifacts\}\}/g, context.artifacts.join('\n'));
    }

    // Replace any remaining placeholders with context-specific values
    const placeholders = task.match(/\{\{(\w+)\}\}/g);
    if (placeholders) {
      for (const placeholder of placeholders) {
        const key = placeholder.replace(/\{\{|\}\}/g, '');
        if (context.constraints?.includes(key)) {
          task = task.replace(placeholder, `[${key}]`);
        }
      }
    }

    return task;
  }

  /**
   * Get output format description
   */
  getOutputFormat(stage: StageType): string {
    return this.getTemplate(stage).outputFormat;
  }

  /**
   * Get quality check prompts
   */
  getQualityChecks(stage: StageType): string[] {
    return this.getTemplate(stage).qualityChecks;
  }

  /**
   * Generate complete prompt for a stage
   */
  generatePrompt(stage: StageType, context: PromptContext): string {
    const template = this.getTemplate(stage);

    const parts: string[] = [
      '# Research Assistant',
      '',
      template.system,
      '',
      '---',
      '',
      this.getTaskPrompt(stage, context),
      '',
      '---',
      '',
      template.outputFormat,
    ];

    return parts.join('\n');
  }

  /**
   * Generate quality gate prompt
   */
  generateQualityGate(stage: StageType, artifacts: string[]): string {
    return generateQualityGatePrompt(stage, artifacts);
  }

  /**
   * Get all available stages
   */
  getAvailableStages(): StageType[] {
    return Object.keys(TEMPLATES) as StageType[];
  }

  /**
   * Check if a stage has a template
   */
  hasTemplate(stage: StageType): boolean {
    return stage in TEMPLATES;
  }
}
