#!/usr/bin/env node
/**
 * pi-paper-mcp — paper-focused MCP server for PiX paper projects.
 *
 * Exposes the tools LLMs cannot do themselves (design §5.2):
 *   search_papers / fetch_fulltext / parse_pdf / extract_figures /
 *   generate_bibtex / check_citation_support
 *
 * Registered through pi-mcp-adapter as mcp__papers__<tool> when configured in
 * the project's .pi/mcp.json. Speaks MCP over stdio; logs go to stderr only.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generateBibtex } from "./bibtex.ts";
import { extractPdfFigures, parsePdfText } from "./pdf.ts";
import { getPaper, searchPapers } from "./semantic-scholar.ts";
import { fetchBinary, keywordsOf, sanitizeFilename, splitSentences } from "./util.ts";

function jsonResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
	return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
	const message = err instanceof Error ? err.message : String(err);
	return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const server = new McpServer({ name: "papers", version: "0.1.0" });

// ============================================================================
// search_papers
// ============================================================================

server.registerTool(
	"search_papers",
	{
		title: "Search academic papers",
		description:
			"Search academic papers via Semantic Scholar. Returns title, authors, abstract, year, venue, citation count, DOI/arXiv ids, open-access PDF link and a relevance score.",
		inputSchema: {
			query: z.string().describe("Search query, e.g. keywords from the research topic."),
			limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10, max 50)."),
			yearFrom: z.number().int().optional().describe("Earliest publication year."),
			yearTo: z.number().int().optional().describe("Latest publication year."),
			minCitations: z.number().int().optional().describe("Minimum citation count."),
		},
	},
	async ({ query, limit, yearFrom, yearTo, minCitations }) => {
		try {
			const papers = await searchPapers({ query, limit, yearFrom, yearTo, minCitations });
			return jsonResult({ query, count: papers.length, papers });
		} catch (err) {
			return errorResult(err);
		}
	},
);

// ============================================================================
// fetch_fulltext
// ============================================================================

server.registerTool(
	"fetch_fulltext",
	{
		title: "Fetch paper fulltext PDF",
		description:
			"Download a paper's open-access PDF to a local directory. Accepts a direct PDF URL, DOI, arXiv id or Semantic Scholar paper id. Paywalled papers report that only the abstract is available.",
		inputSchema: {
			url: z.string().optional().describe("Direct PDF URL."),
			doi: z.string().optional().describe("DOI of the paper."),
			arxivId: z.string().optional().describe("arXiv id, e.g. 2103.00020."),
			s2PaperId: z.string().optional().describe("Semantic Scholar paper id."),
			outDir: z.string().describe("Directory to save the PDF into (created if missing)."),
			filename: z.string().optional().describe("Optional output filename without extension."),
		},
	},
	async ({ url, doi, arxivId, s2PaperId, outDir, filename }) => {
		try {
			let pdfUrl = url;
			let titleHint = filename;
			if (!pdfUrl && arxivId) {
				pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
				titleHint ??= arxivId;
			}
			if (!pdfUrl) {
				const lookup = s2PaperId ?? doi ?? arxivId;
				if (!lookup) throw new Error("Provide one of: url, doi, arxivId, s2PaperId");
				const paper = await getPaper(lookup);
				if (!paper) throw new Error(`Paper not found: ${lookup}`);
				titleHint ??= paper.title;
				if (paper.openAccessPdfUrl) {
					pdfUrl = paper.openAccessPdfUrl;
				} else if (paper.arxivId) {
					pdfUrl = `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
				} else {
					return jsonResult({
						downloaded: false,
						reason: "No open-access PDF available (paywalled). Only the abstract can be used.",
						abstract: paper.abstract,
						paper,
					});
				}
			}

			const bytes = await fetchBinary(pdfUrl);
			if (bytes.length < 1024 || new TextDecoder("latin1").decode(bytes.slice(0, 5)) !== "%PDF-") {
				throw new Error(`Response from ${pdfUrl} is not a PDF (${bytes.length} bytes)`);
			}
			await mkdir(outDir, { recursive: true });
			const file = join(outDir, `${sanitizeFilename(titleHint ?? "paper")}.pdf`);
			await writeFile(file, bytes);
			return jsonResult({ downloaded: true, path: resolve(file), bytes: bytes.length, sourceUrl: pdfUrl });
		} catch (err) {
			return errorResult(err);
		}
	},
);

// ============================================================================
// parse_pdf
// ============================================================================

server.registerTool(
	"parse_pdf",
	{
		title: "Parse PDF text and structure",
		description:
			"Extract text and structure from a local PDF. The full text is saved to a .txt file next to the PDF (or saveTextTo); returns page count, metadata, section outline and a preview.",
		inputSchema: {
			path: z.string().describe("Local path to the PDF file."),
			maxPages: z.number().int().min(1).optional().describe("Limit extraction to the first N pages."),
			saveTextTo: z.string().optional().describe("Where to save the extracted text (default: <path>.txt)."),
		},
	},
	async ({ path, maxPages, saveTextTo }) => {
		try {
			return jsonResult(await parsePdfText(path, { maxPages, saveTextTo }));
		} catch (err) {
			return errorResult(err);
		}
	},
);

// ============================================================================
// extract_figures
// ============================================================================

server.registerTool(
	"extract_figures",
	{
		title: "Extract figures from PDF",
		description:
			"Extract embedded raster figures from a local PDF into PNG files (for later visual analysis). Vector-drawn figures cannot be extracted and are reported in notes.",
		inputSchema: {
			path: z.string().describe("Local path to the PDF file."),
			outDir: z.string().describe("Directory to save extracted PNGs into (created if missing)."),
			pages: z.array(z.number().int().min(1)).optional().describe("1-based page numbers to scan (default: all)."),
			maxFigures: z.number().int().min(1).max(200).optional().describe("Cap on extracted figures (default 50)."),
		},
	},
	async ({ path, outDir, pages, maxFigures }) => {
		try {
			await mkdir(outDir, { recursive: true });
			return jsonResult(await extractPdfFigures(path, { outDir, pages, maxFigures }));
		} catch (err) {
			return errorResult(err);
		}
	},
);

// ============================================================================
// generate_bibtex
// ============================================================================

server.registerTool(
	"generate_bibtex",
	{
		title: "Generate BibTeX entry",
		description:
			"Generate a BibTeX entry for a paper. With a DOI, publisher-quality BibTeX is fetched via doi.org content negotiation; otherwise the entry is composed from Semantic Scholar metadata.",
		inputSchema: {
			doi: z.string().optional(),
			arxivId: z.string().optional(),
			s2PaperId: z.string().optional(),
			title: z.string().optional().describe("Paper title (used for lookup when no id is given)."),
			citeKey: z.string().optional().describe("Desired citation key (auto-suggested when omitted)."),
		},
	},
	async ({ doi, arxivId, s2PaperId, title, citeKey }) => {
		try {
			return jsonResult(await generateBibtex({ doi, arxivId, s2PaperId, title, citeKey }));
		} catch (err) {
			return errorResult(err);
		}
	},
);

// ============================================================================
// check_citation_support (best-effort, NOT a hard gate — design §4.4)
// ============================================================================

server.registerTool(
	"check_citation_support",
	{
		title: "Check citation support (best-effort)",
		description:
			"Best-effort check of whether a source supports a claim: returns the most relevant passages from the source (abstract or parsed PDF text) for a human/agent to judge. This is a hint, not a pass/fail verdict.",
		inputSchema: {
			claim: z.string().describe("The claim made in the manuscript."),
			pdfPath: z.string().optional().describe("Local parsed PDF (or .pdf whose .txt exists) to check against."),
			doi: z.string().optional().describe("DOI of the cited source (abstract-based check)."),
			title: z.string().optional().describe("Title of the cited source (abstract-based check)."),
			maxSnippets: z.number().int().min(1).max(10).optional().describe("Max evidence snippets (default 5)."),
		},
	},
	async ({ claim, pdfPath, doi, title, maxSnippets }) => {
		try {
			let sourceText = "";
			let sourceTitle = title ?? pdfPath ?? doi ?? "unknown";
			if (pdfPath) {
				const textPath = `${pdfPath}.txt`;
				let reuseExisting = false;
				try {
					const [txtStat, pdfStat] = await Promise.all([stat(textPath), stat(pdfPath)]);
					reuseExisting = txtStat.mtimeMs >= pdfStat.mtimeMs;
				} catch {
					// .txt missing or stat failed -> fall through to parse.
				}
				if (reuseExisting) {
					sourceText = await readFile(textPath, "utf8");
				} else {
					const parsed = await parsePdfText(pdfPath, {});
					sourceText = await readFile(parsed.textPath, "utf8");
					sourceTitle = parsed.title ?? sourceTitle;
				}
			} else if (doi || title) {
				const paper = await getPaper(doi ?? title!);
				if (!paper) throw new Error(`Source not found: ${doi ?? title}`);
				sourceText = paper.abstract;
				sourceTitle = paper.title;
			} else {
				throw new Error("Provide one of: pdfPath, doi, title");
			}

			const keywords = keywordsOf(claim);
			const scored = splitSentences(sourceText)
				.map((sentence) => {
					const lower = sentence.toLowerCase();
					const hits = keywords.filter((k) => lower.includes(k)).length;
					return { sentence, score: keywords.length > 0 ? hits / keywords.length : 0 };
				})
				.filter((s) => s.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, maxSnippets ?? 5);

			return jsonResult({
				bestEffort: true,
				note: "Best-effort hint only: keyword-overlap evidence retrieval. A human must judge whether the citation truly supports the claim; do not treat as pass/fail.",
				claim,
				sourceTitle,
				evidence: scored,
				verdictHint:
					scored.length === 0 ? "no-overlap-found" : scored[0].score >= 0.4 ? "plausible-overlap" : "weak-overlap",
			});
		} catch (err) {
			return errorResult(err);
		}
	},
);

// ============================================================================
// Bootstrap
// ============================================================================

async function main(): Promise<void> {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("[pi-paper-mcp] papers MCP server running on stdio");
}

main().catch((err) => {
	console.error("[pi-paper-mcp] fatal:", err);
	process.exit(1);
});
