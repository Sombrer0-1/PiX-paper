/**
 * Shared helpers: HTTP with timeout/UA, JSON fetching, text utilities.
 */

export const USER_AGENT = "PiX-paper-mcp/0.1 (research assistant; contact: local-user)";

export class HttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}

export async function fetchJson<T>(url: string, options: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {}): Promise<T> {
	const { timeoutMs = 20_000, retries = 1, headers = {} } = options;
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await fetch(url, {
				headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (response.status === 429 && attempt < retries) {
				await sleep(2_500);
				continue;
			}
			if (!response.ok) {
				throw new HttpError(response.status, `GET ${url} failed with HTTP ${response.status}`);
			}
			return (await response.json()) as T;
		} catch (err) {
			lastError = err;
			if (err instanceof HttpError) throw err;
			if (attempt < retries) await sleep(1_000 * (attempt + 1));
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchBinary(url: string, options: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<Uint8Array> {
	const { timeoutMs = 60_000, headers = {} } = options;
	const response = await fetch(url, {
		headers: { "User-Agent": USER_AGENT, ...headers },
		signal: AbortSignal.timeout(timeoutMs),
		redirect: "follow",
	});
	if (!response.ok) {
		throw new HttpError(response.status, `GET ${url} failed with HTTP ${response.status}`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitizeFilename(name: string, maxLength = 80): string {
	const cleaned = name
		.replace(/[<>:"/\\|?*]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/ /g, "_");
	return (cleaned || "paper").slice(0, maxLength);
}

/** Split text into sentences (best effort, EN + ZH). */
export function splitSentences(text: string): string[] {
	return text
		.replace(/\s+/g, " ")
		.split(/(?<=[.!?。!?])\s+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 20);
}

const STOP_WORDS = new Set([
	"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "is", "are", "was", "were", "be", "been",
	"we", "our", "this", "that", "these", "those", "it", "its", "as", "at", "from", "into", "via", "using", "use", "used",
	"can", "could", "may", "might", "show", "shows", "shown", "propose", "proposed", "present", "presented", "based",
]);

export function keywordsOf(text: string): string[] {
	const words = text
		.toLowerCase()
		.replace(/[^a-z0-9一-鿿]+/g, " ")
		.split(/\s+/)
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
	return [...new Set(words)];
}
