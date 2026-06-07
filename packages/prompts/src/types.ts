/**
 * Prompt Types
 */

export type StageType = 'literature' | 'method' | 'reproduction' | 'experiment' | 'writing' | 'review';

export interface PromptTemplate {
  system: string;
  task: string;
  outputFormat: string;
  qualityChecks: string[];
  examples?: string[];
}

export interface QualityCheckPrompt {
  stage: StageType;
  checks: QualityCheck[];
}

export interface QualityCheck {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface OutputFormat {
  type: string;
  schema: Record<string, unknown>;
  example: string;
}

export interface PromptContext {
  topic: string;
  stage: StageType;
  previousOutputs?: string[];
  artifacts?: string[];
  constraints?: string[];
}
