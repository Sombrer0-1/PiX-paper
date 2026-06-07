/**
 * MCP Server for PiX-paper
 *
 * Exposes research tools via MCP protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { SEARCH_PAPERS_TOOL, handleSearchPapers } from './search-papers.js';
import { VERIFY_CITATION_TOOL, handleVerifyCitation } from './verify-citation.js';
import { GENERATE_CHART_TOOL, handleGenerateChart } from './generate-chart.js';
import { CONVERT_PAPER_TOOL, handleConvertPaper } from './convert-paper.js';

// ============================================================================
// Tool Registry
// ============================================================================

const TOOLS = [
  SEARCH_PAPERS_TOOL,
  VERIFY_CITATION_TOOL,
  GENERATE_CHART_TOOL,
  CONVERT_PAPER_TOOL,
];

const HANDLERS: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  search_papers: handleSearchPapers,
  verify_claim_citation: handleVerifyCitation,
  generate_chart: handleGenerateChart,
  convert_paper: handleConvertPaper,
};

// ============================================================================
// Server Setup
// ============================================================================

export function createServer(): Server {
  const server = new Server(
    {
      name: 'pp-mcp-tools',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = HANDLERS[name];
    if (!handler) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await handler((args || {}) as Record<string, unknown>);
      return result as any;
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('pp-mcp-tools server started');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
