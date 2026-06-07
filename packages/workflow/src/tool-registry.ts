/**
 * Tool Registry
 *
 * Central registry for managing research tools.
 * Supports tool discovery, validation, and execution.
 */

import type { Task, TaskType } from './types.js';

// ============================================================================
// Tool Types
// ============================================================================

export type ToolCategory =
  | 'literature'
  | 'code'
  | 'experiment'
  | 'writing'
  | 'utility';

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  parameters: ToolParameter[];
  returnType?: string;
  examples?: ToolExample[];
  requiredPermissions?: string[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

export interface ToolExample {
  description: string;
  input: Record<string, unknown>;
  output: unknown;
}

export interface ToolExecutionContext {
  projectId: string;
  nodeId: string;
  taskId: string;
  workingDirectory: string;
  env: Record<string, string>;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  artifacts?: string[];  // Created artifact paths
}

export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

// ============================================================================
// Tool Registry
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();

  // ============================================================================
  // Registration
  // ============================================================================

  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool already registered: ${definition.name}`);
    }

    this.tools.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  unregister(name: string): boolean {
    const deleted = this.tools.delete(name);
    this.handlers.delete(name);
    return deleted;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  search(query: string): ToolDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery)
    );
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validateParams(name: string, params: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const definition = this.tools.get(name);
    if (!definition) {
      return { valid: false, errors: [`Tool not found: ${name}`] };
    }

    const errors: string[] = [];

    // Check required parameters
    for (const param of definition.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
    }

    // Check parameter types
    for (const [key, value] of Object.entries(params)) {
      const param = definition.parameters.find(p => p.name === key);
      if (!param) {
        errors.push(`Unknown parameter: ${key}`);
        continue;
      }

      if (!this.validateType(value, param.type)) {
        errors.push(`Invalid type for ${key}: expected ${param.type}, got ${typeof value}`);
      }

      if (param.enum && !param.enum.includes(value)) {
        errors.push(`Invalid value for ${key}: must be one of ${param.enum.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array': return Array.isArray(value);
      default: return true;
    }
  }

  // ============================================================================
  // Execution
  // ============================================================================

  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
        duration: 0,
      };
    }

    // Validate parameters
    const validation = this.validateParams(name, params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid parameters: ${validation.errors.join(', ')}`,
        duration: 0,
      };
    }

    // Apply defaults
    const definition = this.tools.get(name)!;
    const paramsWithDefaults = { ...params };
    for (const param of definition.parameters) {
      if (!(param.name in paramsWithDefaults) && param.default !== undefined) {
        paramsWithDefaults[param.name] = param.default;
      }
    }

    // Execute
    const startTime = Date.now();
    try {
      const result = await handler(paramsWithDefaults, context);
      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // Export / Import
  // ============================================================================

  exportDefinitions(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  importDefinitions(json: string): number {
    const definitions = JSON.parse(json) as ToolDefinition[];
    let imported = 0;

    for (const def of definitions) {
      if (!this.tools.has(def.name)) {
        // Note: Handlers cannot be imported from JSON
        this.tools.set(def.name, def);
        imported++;
      }
    }

    return imported;
  }
}

// ============================================================================
// Built-in Tools
// ============================================================================

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Literature tools
  registry.register(
    {
      name: 'search_papers',
      category: 'literature',
      description: 'Search for academic papers across multiple sources',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'limit', type: 'number', description: 'Max results', required: false, default: 20 },
        { name: 'sources', type: 'array', description: 'Data sources', required: false, default: ['semantic_scholar', 'arxiv'] },
      ],
    },
    async (params, context) => {
      // Placeholder implementation
      return {
        success: true,
        output: { papers: [], total: 0 },
        duration: 0,
      };
    }
  );

  registry.register(
    {
      name: 'download_paper',
      category: 'literature',
      description: 'Download a paper PDF',
      parameters: [
        { name: 'url', type: 'string', description: 'Paper URL', required: true },
        { name: 'savePath', type: 'string', description: 'Save path', required: true },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { path: params.savePath },
        duration: 0,
        artifacts: [params.savePath as string],
      };
    }
  );

  // Code tools
  registry.register(
    {
      name: 'clone_repo',
      category: 'code',
      description: 'Clone a Git repository',
      parameters: [
        { name: 'url', type: 'string', description: 'Repository URL', required: true },
        { name: 'path', type: 'string', description: 'Local path', required: true },
        { name: 'branch', type: 'string', description: 'Branch name', required: false },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { path: params.path },
        duration: 0,
        artifacts: [params.path as string],
      };
    }
  );

  registry.register(
    {
      name: 'run_script',
      category: 'code',
      description: 'Run a Python script',
      parameters: [
        { name: 'script', type: 'string', description: 'Script path', required: true },
        { name: 'args', type: 'array', description: 'Script arguments', required: false, default: [] },
        { name: 'env', type: 'object', description: 'Environment variables', required: false },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { exitCode: 0, stdout: '', stderr: '' },
        duration: 0,
      };
    }
  );

  // Experiment tools
  registry.register(
    {
      name: 'run_experiment',
      category: 'experiment',
      description: 'Run an experiment with configuration',
      parameters: [
        { name: 'config', type: 'object', description: 'Experiment configuration', required: true },
        { name: 'outputDir', type: 'string', description: 'Output directory', required: true },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { metrics: {}, duration: 0 },
        duration: 0,
        artifacts: [`${params.outputDir}/results.json`],
      };
    }
  );

  registry.register(
    {
      name: 'generate_chart',
      category: 'experiment',
      description: 'Generate comparison charts',
      parameters: [
        { name: 'data', type: 'object', description: 'Chart data', required: true },
        { name: 'type', type: 'string', description: 'Chart type', required: true, enum: ['bar', 'line', 'scatter'] },
        { name: 'outputPath', type: 'string', description: 'Output path', required: true },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { path: params.outputPath },
        duration: 0,
        artifacts: [params.outputPath as string],
      };
    }
  );

  // Writing tools
  registry.register(
    {
      name: 'generate_outline',
      category: 'writing',
      description: 'Generate paper outline',
      parameters: [
        { name: 'topic', type: 'string', description: 'Research topic', required: true },
        { name: 'sections', type: 'array', description: 'Required sections', required: false, default: ['abstract', 'introduction', 'method', 'experiments', 'conclusion'] },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { outline: {} },
        duration: 0,
      };
    }
  );

  registry.register(
    {
      name: 'write_section',
      category: 'writing',
      description: 'Write a paper section',
      parameters: [
        { name: 'section', type: 'string', description: 'Section name', required: true },
        { name: 'context', type: 'object', description: 'Writing context', required: true },
        { name: 'outputPath', type: 'string', description: 'Output path', required: true },
      ],
    },
    async (params, context) => {
      return {
        success: true,
        output: { path: params.outputPath },
        duration: 0,
        artifacts: [params.outputPath as string],
      };
    }
  );

  return registry;
}
