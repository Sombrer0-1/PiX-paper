/**
 * BibTeX generation: DOI content negotiation when possible, otherwise
 * composed from Semantic Scholar metadata.
 */

import { getPaper, type PaperSummary } from "./semantic-scholar.ts";
import { fetchBinary, HttpError } from "./util.ts";

export interface BibtexResult {
	bibtex: string;
	citeKey: string;
	source: "doi.org" | "semantic-scholar";
	paper?: PaperSummary;
}

function escapeBibtex(value: string): string {
	return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

export function suggestCiteKey(paper: PaperSummary): string {
	const firstAuthor = paper.authors[0]?.split(" ").pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "anon";
	const year = paper.year ?? "nd";
	const firstWord = paper.title
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, "")
		.split(/\s+/)
		.find((w) => w.length >= 4 && !["with", "from", "using", "via", "for", "and", "the"].includes(w));
	return `${firstAuthor}${year}${firstWord ?? ""}`;
}

function composeBibtex(paper: PaperSummary, citeKey: string): string {
	const isConference = (paper.publicationTypes ?? []).some((t) => /conference|workshop/i.test(t));
	const entryType = isConference ? "inproceedings" : "article";
	const venueField = isConference ? "booktitle" : "journal";
	const lines = [
		`  title = {${escapeBibtex(paper.title)}}`,
		`  author = {${paper.authors.map(escapeBibtex).join(" and ")}}`,
	];
	if (paper.year != null) lines.push(`  year = {${paper.year}}`);
	if (paper.venue) lines.push(`  ${venueField} = {${escapeBibtex(paper.venue)}}`);
	if (paper.doi) lines.push(`  doi = {${paper.doi}}`);
	if (paper.url) lines.push(`  url = {${paper.url}}`);
	return `@${entryType}{${citeKey},\n${lines.join(",\n")}\n}`;
}

async function fetchDoiBibtex(doi: string): Promise<string | null> {
	try {
		const bytes = await fetchBinary(`https://doi.org/${encodeURIComponent(doi)}`, {
			headers: { Accept: "application/x-bibtex" },
			timeoutMs: 20_000,
		});
		const text = new TextDecoder("utf-8").decode(bytes).trim();
		return text.startsWith("@") ? text : null;
	} catch (err) {
		if (err instanceof HttpError) return null;
		throw err;
	}
}

export async function generateBibtex(options: {
	doi?: string;
	arxivId?: string;
	s2PaperId?: string;
	title?: string;
	citeKey?: string;
}): Promise<BibtexResult> {
	// DOI content negotiation yields publisher-quality BibTeX.
	if (options.doi) {
		const viaDoi = await fetchDoiBibtex(options.doi);
		if (viaDoi) {
			const keyMatch = viaDoi.match(/^@\w+\{([^,]+),/);
			return { bibtex: viaDoi, citeKey: options.citeKey ?? keyMatch?.[1] ?? "ref", source: "doi.org" };
		}
	}

	const lookup = options.s2PaperId ?? options.doi ?? options.arxivId ?? options.title;
	if (!lookup) {
		throw new Error("generate_bibtex requires one of: doi, arxivId, s2PaperId, title");
	}
	const paper = await getPaper(lookup);
	if (!paper) {
		throw new Error(`No paper found for: ${lookup}`);
	}
	const citeKey = options.citeKey ?? suggestCiteKey(paper);
	return { bibtex: composeBibtex(paper, citeKey), citeKey, source: "semantic-scholar", paper };
}
