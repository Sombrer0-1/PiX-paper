/**
 * Minimal Semantic Scholar Graph API client (no API key; respects public rate limits).
 * https://api.semanticscholar.org/api-docs/
 */

import { fetchJson, HttpError } from "./util.ts";

const API_BASE = "https://api.semanticscholar.org/graph/v1";

const PAPER_FIELDS =
	"title,authors,abstract,year,venue,citationCount,externalIds,url,openAccessPdf,isOpenAccess,publicationTypes,journal";

export interface S2Author {
	name: string;
}

export interface S2Paper {
	paperId: string;
	title?: string;
	authors?: S2Author[];
	abstract?: string | null;
	year?: number | null;
	venue?: string | null;
	citationCount?: number | null;
	externalIds?: Record<string, string | number> | null;
	url?: string | null;
	isOpenAccess?: boolean;
	openAccessPdf?: { url?: string } | null;
	publicationTypes?: string[] | null;
	journal?: { name?: string } | null;
}

export interface PaperSummary {
	id: string;
	title: string;
	authors: string[];
	abstract: string;
	year: number | null;
	venue: string;
	citations: number;
	url: string;
	doi?: string;
	arxivId?: string;
	openAccessPdfUrl?: string;
	isOpenAccess: boolean;
	publicationTypes: string[];
	/** 1..0 by rank position in the result list. */
	relevanceScore: number;
}

export function toPaperSummary(paper: S2Paper, rank: number, total: number): PaperSummary {
	const externalIds = paper.externalIds ?? {};
	const doi = externalIds.DOI != null ? String(externalIds.DOI) : undefined;
	const arxivId = externalIds.ArXiv != null ? String(externalIds.ArXiv) : undefined;
	return {
		id: paper.paperId,
		title: paper.title ?? "(untitled)",
		authors: (paper.authors ?? []).map((a) => a.name).filter(Boolean),
		abstract: paper.abstract ?? "",
		year: paper.year ?? null,
		venue: paper.venue || paper.journal?.name || "",
		citations: paper.citationCount ?? 0,
		url: paper.url ?? (doi ? `https://doi.org/${doi}` : arxivId ? `https://arxiv.org/abs/${arxivId}` : ""),
		doi,
		arxivId,
		openAccessPdfUrl: paper.openAccessPdf?.url ?? undefined,
		isOpenAccess: paper.isOpenAccess === true,
		publicationTypes: paper.publicationTypes ?? [],
		relevanceScore: total > 0 ? Math.round(((total - rank) / total) * 100) / 100 : 0,
	};
}

interface S2SearchResponse {
	total?: number;
	data?: S2Paper[];
}

export async function searchPapers(options: {
	query: string;
	limit?: number;
	yearFrom?: number;
	yearTo?: number;
	minCitations?: number;
}): Promise<PaperSummary[]> {
	const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
	const params = new URLSearchParams({
		query: options.query,
		limit: String(limit),
		fields: PAPER_FIELDS,
	});
	if (options.yearFrom || options.yearTo) {
		params.set("year", `${options.yearFrom ?? ""}-${options.yearTo ?? ""}`);
	}
	if (options.minCitations != null && options.minCitations > 0) {
		params.set("minCitationCount", String(options.minCitations));
	}
	const response = await fetchJson<S2SearchResponse>(`${API_BASE}/paper/search?${params.toString()}`, { retries: 2 });
	const data = response.data ?? [];
	return data.map((paper, index) => toPaperSummary(paper, index, data.length));
}

export async function getPaper(id: string): Promise<PaperSummary | null> {
	// id may be an S2 paperId, "DOI:...", "ARXIV:...", "CorpusId:...", or a raw DOI/arxiv id.
	const lookup = id.trim();
	let structuredId: string | null = null;
	if (/^DOI:/i.test(lookup) || /^10\.\d{4,9}\/\S+$/i.test(lookup)) {
		structuredId = /^DOI:/i.test(lookup) ? lookup : `DOI:${lookup}`;
	} else if (/^ARXIV:/i.test(lookup) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(lookup)) {
		structuredId = /^ARXIV:/i.test(lookup) ? lookup : `ARXIV:${lookup}`;
	} else if (/^CorpusId:/i.test(lookup)) {
		structuredId = lookup;
	} else if (/^[0-9a-f]{40}$/i.test(lookup)) {
		// S2 paperId is a 40-character hex string.
		structuredId = lookup;
	}

	if (structuredId === null) {
		// Not a recognized ID - the /paper/{id} endpoint only accepts structured
		// IDs, so treat the input as a title and search for the top match.
		const results = await searchPapers({ query: lookup, limit: 1 });
		return results[0] ?? null;
	}

	try {
		const paper = await fetchJson<S2Paper>(
			`${API_BASE}/paper/${encodeURIComponent(structuredId)}?fields=${PAPER_FIELDS}`,
			{ retries: 1 },
		);
		return toPaperSummary(paper, 0, 1);
	} catch (err) {
		// Only a genuine 404 means "does not exist"; other errors (network,
		// 5xx, rate limits) are transient and must surface to the caller.
		if (err instanceof HttpError && err.status === 404) return null;
		throw err;
	}
}
