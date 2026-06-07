/**
 * ToolRegistry Tests
 *
 * Test tool registration and execution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry, createDefaultToolRegistry } from '../src/tool-registry.js';
import type { ToolDefinition, ToolHandler, ToolExecutionContext } from '../src/tool-registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Registration', () => {
    it('should register a tool', () => {
      const definition: ToolDefinition = {
        name: 'test_tool',
        category: 'utility',
        description: 'A test tool',
        parameters: [
          { name: 'input', type: 'string', description: 'Input value', required: true },
        ],
      };

      const handler: ToolHandler = async (params) => ({
        success: true,
        output: params.input,
        duration: 0,
      });

      registry.register(definition, handler);

      const retrieved = registry.get('test_tool');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test_tool');
    });

    it('should throw error when registering duplicate tool', () => {
      const definition: ToolDefinition = {
        name: 'test_tool',
        category: 'utility',
        description: 'A test tool',
        parameters: [],
      };

      const handler: ToolHandler = async () => ({ success: true, duration: 0 });

      registry.register(definition, handler);

      expect(() => registry.register(definition, handler)).toThrow('already registered');
    });

    it('should unregister a tool', () => {
      const definition: ToolDefinition = {
        name: 'test_tool',
        category: 'utility',
        description: 'A test tool',
        parameters: [],
      };

      const handler: ToolHandler = async () => ({ success: true, duration: 0 });

      registry.register(definition, handler);
      const deleted = registry.unregister('test_tool');

      expect(deleted).toBe(true);
      expect(registry.get('test_tool')).toBeUndefined();
    });

    it('should return false when unregistering non-existent tool', () => {
      const deleted = registry.unregister('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Discovery', () => {
    beforeEach(() => {
      registry.register(
        {
          name: 'search_papers',
          category: 'literature',
          description: 'Search for papers',
          parameters: [],
        },
        async () => ({ success: true, duration: 0 })
      );

      registry.register(
        {
          name: 'run_experiment',
          category: 'experiment',
          description: 'Run experiment',
          parameters: [],
        },
        async () => ({ success: true, duration: 0 })
      );

      registry.register(
        {
          name: 'generate_chart',
          category: 'experiment',
          description: 'Generate chart',
          parameters: [],
        },
        async () => ({ success: true, duration: 0 })
      );
    });

    it('should get all tools', () => {
      const tools = registry.getAll();
      expect(tools).toHaveLength(3);
    });

    it('should get tools by category', () => {
      const experimentTools = registry.getByCategory('experiment');
      expect(experimentTools).toHaveLength(2);
    });

    it('should search tools by name', () => {
      const results = registry.search('paper');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('search_papers');
    });

    it('should search tools by description', () => {
      const results = registry.search('chart');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('generate_chart');
    });

    it('should return empty array for no matches', () => {
      const results = registry.search('non-existent');
      expect(results).toHaveLength(0);
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      registry.register(
        {
          name: 'test_tool',
          category: 'utility',
          description: 'A test tool',
          parameters: [
            { name: 'required_param', type: 'string', description: 'Required', required: true },
            { name: 'optional_param', type: 'number', description: 'Optional', required: false, default: 42 },
            { name: 'enum_param', type: 'string', description: 'Enum', required: false, enum: ['a', 'b', 'c'] },
          ],
        },
        async () => ({ success: true, duration: 0 })
      );
    });

    it('should validate required parameters', () => {
      const result = registry.validateParams('test_tool', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('required_param');
    });

    it('should accept valid parameters', () => {
      const result = registry.validateParams('test_tool', {
        required_param: 'value',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unknown parameters', () => {
      const result = registry.validateParams('test_tool', {
        required_param: 'value',
        unknown_param: 'value',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('unknown_param');
    });

    it('should validate parameter types', () => {
      const result = registry.validateParams('test_tool', {
        required_param: 123, // Should be string
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid type');
    });

    it('should validate enum values', () => {
      const result = registry.validateParams('test_tool', {
        required_param: 'value',
        enum_param: 'd', // Not in enum
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should return error for non-existent tool', () => {
      const result = registry.validateParams('non-existent', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });
  });

  describe('Execution', () => {
    it('should execute a tool successfully', async () => {
      const handler: ToolHandler = async (params) => ({
        success: true,
        output: { result: params.input },
        duration: 0,
      });

      registry.register(
        {
          name: 'test_tool',
          category: 'utility',
          description: 'A test tool',
          parameters: [
            { name: 'input', type: 'string', description: 'Input', required: true },
          ],
        },
        handler
      );

      const context: ToolExecutionContext = {
        projectId: 'project-1',
        nodeId: 'node-1',
        taskId: 'task-1',
        workingDirectory: '/tmp',
        env: {},
      };

      const result = await registry.execute('test_tool', { input: 'test' }, context);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'test' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should fail on invalid parameters', async () => {
      registry.register(
        {
          name: 'test_tool',
          category: 'utility',
          description: 'A test tool',
          parameters: [
            { name: 'required', type: 'string', description: 'Required', required: true },
          ],
        },
        async () => ({ success: true, duration: 0 })
      );

      const context: ToolExecutionContext = {
        projectId: 'project-1',
        nodeId: 'node-1',
        taskId: 'task-1',
        workingDirectory: '/tmp',
        env: {},
      };

      const result = await registry.execute('test_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid parameters');
    });

    it('should fail for non-existent tool', async () => {
      const context: ToolExecutionContext = {
        projectId: 'project-1',
        nodeId: 'node-1',
        taskId: 'task-1',
        workingDirectory: '/tmp',
        env: {},
      };

      const result = await registry.execute('non-existent', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle handler errors', async () => {
      registry.register(
        {
          name: 'failing_tool',
          category: 'utility',
          description: 'A failing tool',
          parameters: [],
        },
        async () => {
          throw new Error('Tool failed');
        }
      );

      const context: ToolExecutionContext = {
        projectId: 'project-1',
        nodeId: 'node-1',
        taskId: 'task-1',
        workingDirectory: '/tmp',
        env: {},
      };

      const result = await registry.execute('failing_tool', {}, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool failed');
    });

    it('should apply default values', async () => {
      let receivedParams: Record<string, unknown> = {};

      registry.register(
        {
          name: 'test_tool',
          category: 'utility',
          description: 'A test tool',
          parameters: [
            { name: 'input', type: 'string', description: 'Input', required: false, default: 'default' },
          ],
        },
        async (params) => {
          receivedParams = params;
          return { success: true, duration: 0 };
        }
      );

      const context: ToolExecutionContext = {
        projectId: 'project-1',
        nodeId: 'node-1',
        taskId: 'task-1',
        workingDirectory: '/tmp',
        env: {},
      };

      await registry.execute('test_tool', {}, context);

      expect(receivedParams.input).toBe('default');
    });
  });

  describe('Import/Export', () => {
    it('should export definitions', () => {
      registry.register(
        {
          name: 'test_tool',
          category: 'utility',
          description: 'A test tool',
          parameters: [],
        },
        async () => ({ success: true, duration: 0 })
      );

      const exported = registry.exportDefinitions();
      const parsed = JSON.parse(exported);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('test_tool');
    });

    it('should import definitions', () => {
      const definitions = [
        {
          name: 'imported_tool',
          category: 'utility',
          description: 'An imported tool',
          parameters: [],
        },
      ];

      const imported = registry.importDefinitions(JSON.stringify(definitions));
      expect(imported).toBe(1);

      const retrieved = registry.get('imported_tool');
      expect(retrieved).toBeDefined();
    });

    it('should not import duplicate definitions', () => {
      registry.register(
        {
          name: 'test_tool',
          category: 'utility',
          description: 'A test tool',
          parameters: [],
        },
        async () => ({ success: true, duration: 0 })
      );

      const definitions = [
        {
          name: 'test_tool',
          category: 'utility',
          description: 'Duplicate',
          parameters: [],
        },
      ];

      const imported = registry.importDefinitions(JSON.stringify(definitions));
      expect(imported).toBe(0);
    });
  });

  describe('Default Registry', () => {
    it('should create default registry with built-in tools', () => {
      const defaultRegistry = createDefaultToolRegistry();
      const tools = defaultRegistry.getAll();

      expect(tools.length).toBeGreaterThan(0);

      // Check some built-in tools
      expect(defaultRegistry.get('search_papers')).toBeDefined();
      expect(defaultRegistry.get('download_paper')).toBeDefined();
      expect(defaultRegistry.get('clone_repo')).toBeDefined();
      expect(defaultRegistry.get('run_experiment')).toBeDefined();
      expect(defaultRegistry.get('generate_chart')).toBeDefined();
      expect(defaultRegistry.get('generate_outline')).toBeDefined();
      expect(defaultRegistry.get('write_section')).toBeDefined();
    });

    it('should have correct categories', () => {
      const defaultRegistry = createDefaultToolRegistry();

      const literatureTools = defaultRegistry.getByCategory('literature');
      expect(literatureTools.length).toBeGreaterThan(0);

      const codeTools = defaultRegistry.getByCategory('code');
      expect(codeTools.length).toBeGreaterThan(0);

      const experimentTools = defaultRegistry.getByCategory('experiment');
      expect(experimentTools.length).toBeGreaterThan(0);

      const writingTools = defaultRegistry.getByCategory('writing');
      expect(writingTools.length).toBeGreaterThan(0);
    });
  });
});
