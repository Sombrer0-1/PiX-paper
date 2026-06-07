/**
 * Research Tools
 *
 * Tools that can be registered with an LLM Agent to enable research capabilities.
 * These wrap pp-research's functionality into agent-callable tools.
 */

import {
  MultiSourceSearch,
  SemanticScholarProvider,
  ArxivProvider,
  CrossrefProvider,
  OpenAlexProvider,
  LibraryManager,
  PdfParser,
  CitationVerifier,
  ChartGenerator,
  PaperConverter,
  type Paper,
  type SearchQuery,
} from 'pp-research';

/**
 * Research tool context — shared state across all research tools.
 */
export interface ResearchToolContext {
  projectDir: string;
  libraryManager: LibraryManager;
  search: MultiSourceSearch;
  pdfParser: PdfParser;
  citationVerifier: CitationVerifier;
  chartGenerator: ChartGenerator;
  paperConverter: PaperConverter;
}

/**
 * Create a research tool context for a project.
 */
export function createResearchToolContext(projectDir: string): ResearchToolContext {
  const libraryManager = new LibraryManager({
    storagePath: `${projectDir}/.pp/libraries.json`,
    autoSave: true,
  });

  // Ensure a default library exists
  if (libraryManager.getAllLibraries().length === 0) {
    libraryManager.createLibrary('Default');
  }

  return {
    projectDir,
    libraryManager,
    search: new MultiSourceSearch([
      new SemanticScholarProvider(),
      new ArxivProvider(),
      new CrossrefProvider(),
      new OpenAlexProvider(),
    ]),
    pdfParser: new PdfParser(),
    citationVerifier: new CitationVerifier(),
    chartGenerator: new ChartGenerator(),
    paperConverter: new PaperConverter(),
  };
}

/**
 * Tool: search_papers
 *
 * Search for academic papers across multiple sources (Semantic Scholar, arXiv).
 */
export function createSearchPapersTool(ctx: ResearchToolContext) {
  return {
    name: 'search_papers',
    description: `Search for academic papers across Semantic Scholar and arXiv.
Returns a list of papers with title, authors, abstract, year, venue, citations, and URL.
Use this to find relevant literature for your research topic.
Results are automatically deduplicated across sources.`,
    parameters: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keywords, topic, or paper title)',
        },
        year_from: {
          type: 'number',
          description: 'Minimum publication year (optional)',
        },
        year_to: {
          type: 'number',
          description: 'Maximum publication year (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20)',
        },
      },
      required: ['query'],
    },
    async execute(args: { query: string; year_from?: number; year_to?: number; limit?: number }) {
      const searchQuery: SearchQuery = {
        keywords: args.query.split(/\s+/),
        yearFrom: args.year_from,
        yearTo: args.year_to,
        limit: args.limit || 20,
      };

      const papers = await ctx.search.searchAll(searchQuery);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            total: papers.length,
            papers: papers.map(p => ({
              id: p.id,
              title: p.title,
              authors: p.authors,
              abstract: p.abstract?.substring(0, 300) + (p.abstract && p.abstract.length > 300 ? '...' : ''),
              year: p.year,
              venue: p.venue,
              citations: p.citations,
              url: p.url,
              source: p.source,
            })),
          }, null, 2),
        }],
      };
    },
  };
}

/**
 * Tool: get_paper_details
 *
 * Get detailed information about a specific paper.
 */
export function createGetPaperDetailsTool(ctx: ResearchToolContext) {
  return {
    name: 'get_paper_details',
    description: `Get detailed information about a specific paper by ID.
Returns full abstract, all authors, DOI, and other metadata.`,
    parameters: {
      type: 'object' as const,
      properties: {
        paper_id: {
          type: 'string',
          description: 'Paper ID (from search results)',
        },
        source: {
          type: 'string',
          description: 'Paper source: "semantic_scholar" or "arxiv"',
        },
      },
      required: ['paper_id', 'source'],
    },
    async execute(args: { paper_id: string; source: string }) {
      let paper: Paper | null = null;

      if (args.source === 'semantic_scholar') {
        const provider = new SemanticScholarProvider();
        paper = await provider.getPaper(args.paper_id);
      } else if (args.source === 'arxiv') {
        const provider = new ArxivProvider();
        paper = await provider.getPaper(args.paper_id);
      }

      if (!paper) {
        return { content: [{ type: 'text' as const, text: 'Paper not found.' }] };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(paper, null, 2),
        }],
      };
    },
  };
}

/**
 * Tool: add_to_library
 *
 * Add a paper to the project's literature library.
 */
export function createAddToLibraryTool(ctx: ResearchToolContext) {
  return {
    name: 'add_to_library',
    description: `Add a paper to the project's literature library.
Papers are persisted and can be referenced later in the writing stage.
You can add tags for categorization.`,
    parameters: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Paper title' },
        authors: { type: 'array', items: { type: 'string' }, description: 'List of author names' },
        abstract: { type: 'string', description: 'Paper abstract' },
        year: { type: 'number', description: 'Publication year' },
        venue: { type: 'string', description: 'Publication venue (journal/conference)' },
        url: { type: 'string', description: 'Paper URL' },
        doi: { type: 'string', description: 'DOI (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization (optional)' },
        notes: { type: 'string', description: 'Reading notes (optional)' },
      },
      required: ['title', 'authors', 'year'],
    },
    async execute(args: {
      title: string;
      authors: string[];
      abstract?: string;
      year: number;
      venue?: string;
      url?: string;
      doi?: string;
      tags?: string[];
      notes?: string;
    }) {
      const library = ctx.libraryManager.getAllLibraries()[0];
      if (!library) {
        return { content: [{ type: 'text' as const, text: 'No library found. Create one first.' }] };
      }

      const paper: Paper = {
        id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: args.title,
        authors: args.authors,
        abstract: args.abstract || '',
        year: args.year,
        venue: args.venue || '',
        citations: 0,
        url: args.url || '',
        doi: args.doi,
        tags: args.tags || [],
        notes: args.notes,
        source: 'manual' as any,
        sourceId: '',
      };

      const added = ctx.libraryManager.addPaper(library.id, paper);

      // Add tags
      if (args.tags) {
        for (const tag of args.tags) {
          ctx.libraryManager.addTagToPaper(library.id, added!.id, tag);
        }
      }

      // Add notes
      if (args.notes) {
        ctx.libraryManager.addNote(library.id, added!.id, args.notes);
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Added "${args.title}" to library "${library.name}". Total papers: ${library.papers.length}`,
        }],
      };
    },
  };
}

/**
 * Tool: list_library
 *
 * List papers in the project's literature library.
 */
export function createListLibraryTool(ctx: ResearchToolContext) {
  return {
    name: 'list_library',
    description: `List all papers in the project's literature library.
Returns paper titles, authors, years, and tags.`,
    parameters: {
      type: 'object' as const,
      properties: {
        filter_tag: {
          type: 'string',
          description: 'Filter by tag (optional)',
        },
      },
    },
    async execute(args: { filter_tag?: string }) {
      const library = ctx.libraryManager.getAllLibraries()[0];
      if (!library) {
        return { content: [{ type: 'text' as const, text: 'No library found.' }] };
      }

      let papers = library.papers;
      if (args.filter_tag) {
        papers = papers.filter(p => p.tags.includes(args.filter_tag!));
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            library: library.name,
            total: papers.length,
            papers: papers.map(p => ({
              id: p.id,
              title: p.title,
              authors: p.authors,
              year: p.year,
              venue: p.venue,
              tags: p.tags,
              has_notes: !!p.notes,
            })),
          }, null, 2),
        }],
      };
    },
  };
}

/**
 * Tool: verify_citation
 *
 * Verify that a claim is supported by cited references.
 */
export function createVerifyCitationTool(ctx: ResearchToolContext) {
  return {
    name: 'verify_citation',
    description: `Verify that a claim in the paper is supported by cited references.
Checks if the cited papers exist and if their content is relevant to the claim.
Returns a confidence score and any issues found.`,
    parameters: {
      type: 'object' as const,
      properties: {
        claim: { type: 'string', description: 'The claim text' },
        citation_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of cited papers' },
      },
      required: ['claim', 'citation_ids'],
    },
    async execute(args: { claim: string; citation_ids: string[] }) {
      // Build paper map from library
      const library = ctx.libraryManager.getAllLibraries()[0];
      const paperMap = new Map<string, Paper>();
      if (library) {
        for (const paper of library.papers) {
          paperMap.set(paper.id, paper);
        }
      }

      const claimObj = {
        id: `claim-${Date.now()}`,
        text: args.claim,
        type: 'background' as const,
        citations: args.citation_ids,
        verified: false,
      };

      const result = await ctx.citationVerifier.verifyClaim(claimObj, paperMap);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            supported: result.supported,
            confidence: result.confidence,
            evidence: result.evidence,
            issues: result.issues,
          }, null, 2),
        }],
      };
    },
  };
}

/**
 * Tool: generate_chart
 *
 * Generate experiment result charts (bar, line, radar, etc.).
 */
export function createGenerateChartTool(ctx: ResearchToolContext) {
  return {
    name: 'generate_chart',
    description: `Generate charts for experiment results.
Supports: bar (comparison), line (training curves), radar (multi-dimensional).
Returns Chart.js-compatible JSON that can be rendered by the frontend.
Also generates a Markdown comparison table.`,
    parameters: {
      type: 'object' as const,
      properties: {
        chart_type: {
          type: 'string',
          enum: ['bar', 'line', 'radar'],
          description: 'Type of chart to generate',
        },
        title: { type: 'string', description: 'Chart title' },
        methods: { type: 'array', items: { type: 'string' }, description: 'Method names (for bar/radar)' },
        metrics: {
          type: 'object',
          description: 'Metric values: { metric_name: [value_for_each_method] }',
        },
        x_label: { type: 'string', description: 'X-axis label (for line charts)' },
        y_label: { type: 'string', description: 'Y-axis label (for line charts)' },
        epochs: { type: 'array', items: { type: 'number' }, description: 'Epoch numbers (for line charts)' },
        curves: {
          type: 'object',
          description: 'Training curves: { curve_name: [value_at_each_epoch] }',
        },
        output_path: { type: 'string', description: 'Output file path (optional)' },
      },
      required: ['chart_type', 'title'],
    },
    async execute(args: {
      chart_type: string;
      title: string;
      methods?: string[];
      metrics?: Record<string, number[]>;
      x_label?: string;
      y_label?: string;
      epochs?: number[];
      curves?: Record<string, number[]>;
      output_path?: string;
    }) {
      let result: any;

      if (args.chart_type === 'bar' && args.methods && args.metrics) {
        result = ctx.chartGenerator.generateComparisonChart({
          title: args.title,
          methods: args.methods,
          metrics: args.metrics,
          outputPath: args.output_path,
        });

        // Also generate table
        const table = ctx.chartGenerator.generateComparisonTable({
          methods: args.methods,
          metrics: args.metrics,
        });
        result.comparisonTable = table;
      } else if (args.chart_type === 'line' && args.epochs && args.curves) {
        result = ctx.chartGenerator.generateTrainingCurve({
          title: args.title,
          epochs: args.epochs,
          curves: args.curves,
          xLabel: args.x_label,
          yLabel: args.y_label,
          outputPath: args.output_path,
        });
      } else if (args.chart_type === 'radar' && args.methods && args.metrics) {
        const dimensions = Object.keys(args.metrics);
        result = ctx.chartGenerator.generateRadarChart({
          title: args.title,
          methods: args.methods,
          dimensions,
          values: args.methods.reduce((acc, m, i) => {
            acc[m] = dimensions.map(d => args.metrics![d]?.[i] || 0);
            return acc;
          }, {} as Record<string, number[]>),
          outputPath: args.output_path,
        });
      } else {
        return { content: [{ type: 'text' as const, text: 'Invalid chart configuration. Check required parameters.' }] };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            chartType: args.chart_type,
            title: args.title,
            chartjsConfig: result.chartjsConfig,
            comparisonTable: result.comparisonTable,
            outputPath: result.config?.outputPath,
          }, null, 2),
        }],
      };
    },
  };
}

/**
 * Tool: convert_paper
 *
 * Convert paper manuscript between formats (Markdown, LaTeX, HTML).
 */
export function createConvertPaperTool(ctx: ResearchToolContext) {
  return {
    name: 'convert_paper',
    description: `Convert a paper manuscript between formats.
Supports: markdown, latex, html, pdf (via pandoc).
Reads from a JSON manuscript file or Markdown file, and outputs the specified format.`,
    parameters: {
      type: 'object' as const,
      properties: {
        input_path: { type: 'string', description: 'Path to input file (Markdown or JSON manuscript)' },
        output_format: {
          type: 'string',
          enum: ['markdown', 'latex', 'html', 'pdf'],
          description: 'Desired output format',
        },
        output_path: { type: 'string', description: 'Output file path (optional, auto-generated if omitted)' },
      },
      required: ['input_path', 'output_format'],
    },
    async execute(args: { input_path: string; output_format: string; output_path?: string }) {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');

      if (!existsSync(args.input_path)) {
        return { content: [{ type: 'text' as const, text: `Input file not found: ${args.input_path}` }] };
      }

      const content = readFileSync(args.input_path, 'utf-8');

      // Parse input
      let manuscript: any;
      if (args.input_path.endsWith('.json')) {
        manuscript = JSON.parse(content);
      } else {
        manuscript = ctx.paperConverter.parseMarkdown(content);
      }

      // Determine output path
      const outputPath = args.output_path || args.input_path.replace(/\.[^.]+$/, `.${args.output_format === 'latex' ? 'tex' : args.output_format}`);

      const result = ctx.paperConverter.save(manuscript, args.output_format as any, outputPath);

      return {
        content: [{
          type: 'text' as const,
          text: result.success
            ? `Converted to ${args.output_format}: ${result.outputPath}`
            : `Conversion failed: ${result.error}`,
        }],
      };
    },
  };
}

/**
 * Get all research tools for a project.
 */
export function createResearchTools(projectDir: string) {
  const ctx = createResearchToolContext(projectDir);

  return {
    context: ctx,
    tools: [
      createSearchPapersTool(ctx),
      createGetPaperDetailsTool(ctx),
      createAddToLibraryTool(ctx),
      createListLibraryTool(ctx),
      createVerifyCitationTool(ctx),
      createGenerateChartTool(ctx),
      createConvertPaperTool(ctx),
    ],
  };
}
