/**
 * Paper project management (design §3, §8).
 *
 * A PiX project directory is a "paper project" when it contains a `.pp/`
 * directory. This module owns the .pp/ manifest (config.json + progress.json),
 * the project skeleton (literature/ code/ experiments/ paper/) and the
 * .pi/mcp.json entry that registers the paper MCP server so McpAdapter
 * auto-discovers it as mcp__papers__<tool>.
 *
 * Filesystem I/O only: no Electron, no pi. The stage engine and paper-rpc
 * layer call into here.
 */

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import {
	PAPER_INBOX_VERSION,
	isStageId,
	type ArtifactRevision,
	type InboxItem,
	type InboxItemKind,
	type InboxItemStatus,
	type PaperProjectConfig,
	type PaperInbox,
	type PaperProgress,
	createInitialProgress,
	migratePaperProgress,
} from "pi-paper-workflow";

const moduleRequire = createRequire(import.meta.url);

const PP_DIR = ".pp";
const CONFIG_FILE = "config.json";
const PROGRESS_FILE = "progress.json";
const INBOX_FILE = "inbox.json";
const MCP_CONFIG_DIR = ".pi";
const MCP_CONFIG_FILE = "mcp.json";
const PAPERS_SERVER_NAME = "papers";

/** Skeleton directories created for every paper project (design §8). */
const PAPER_DIRS = [
	"literature/papers",
	"literature/notes",
	"code",
	"experiments/configs",
	"experiments/results",
	"experiments/figures",
	"paper/output",
];

export interface PaperProjectPaths {
	projectDir: string;
	ppDir: string;
	configFile: string;
	progressFile: string;
	inboxFile: string;
}

export function paperProjectPaths(projectDir: string): PaperProjectPaths {
	return {
		projectDir,
		ppDir: join(projectDir, PP_DIR),
		configFile: join(projectDir, PP_DIR, CONFIG_FILE),
		progressFile: join(projectDir, PP_DIR, PROGRESS_FILE),
		inboxFile: join(projectDir, PP_DIR, INBOX_FILE),
	};
}

/** A directory is a paper project when it has a `.pp/` folder. */
export function isPaperProject(projectDir: string): boolean {
	return existsSync(join(projectDir, PP_DIR));
}

/**
 * Atomically replace a manifest file: copy the current content to
 * `<target>.bak` (recovery source), write the new content to a temp file in
 * the same directory, then rename it over the target. Same-directory rename is
 * atomic on POSIX and Windows (same volume), so a crash mid-write leaves
 * either the previous file or the complete new file, never a truncated
 * manifest that would brick the project on the next load.
 */
async function writeFileAtomic(target: string, content: string): Promise<void> {
	if (existsSync(target)) {
		try {
			await copyFile(target, `${target}.bak`);
		} catch {
			// Best-effort backup; a missing .bak only removes the recovery path.
		}
	}
	const tmp = `${target}.${createId()}.tmp`;
	try {
		await writeFile(tmp, content, "utf8");
		await rename(tmp, target);
	} catch (err) {
		try {
			await rm(tmp, { force: true });
		} catch {
			// Ignore cleanup failures so the original error propagates.
		}
		throw err;
	}
}

export async function loadPaperConfig(projectDir: string): Promise<PaperProjectConfig> {
	const { configFile } = paperProjectPaths(projectDir);
	try {
		return JSON.parse(await readFile(configFile, "utf8")) as PaperProjectConfig;
	} catch {
		// Primary manifest is missing or corrupt; recover from the .bak kept by
		// writeFileAtomic so a torn write or hand-edit does not brick the project.
		try {
			return JSON.parse(await readFile(`${configFile}.bak`, "utf8")) as PaperProjectConfig;
		} catch (err) {
			throw new Error(
				`Paper project config is corrupt and could not be recovered from backup: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	}
}

export async function savePaperConfig(projectDir: string, config: PaperProjectConfig): Promise<void> {
	const { ppDir, configFile } = paperProjectPaths(projectDir);
	await mkdir(ppDir, { recursive: true });
	await writeFileAtomic(configFile, JSON.stringify(config, null, 2));
}

/**
 * Load progress, defensively filling in any missing stages so older or
 * hand-edited manifests stay forward-compatible with the state machine. A
 * corrupt or truncated manifest falls back to the .bak, then to initial
 * progress, so the project always remains openable.
 */
export async function loadPaperProgress(projectDir: string): Promise<PaperProgress> {
	const { progressFile } = paperProjectPaths(projectDir);
	try {
		const raw = await readFile(progressFile, "utf8");
		return migratePaperProgress(JSON.parse(raw) as unknown);
	} catch {
		try {
			const bak = await readFile(`${progressFile}.bak`, "utf8");
			return migratePaperProgress(JSON.parse(bak) as unknown);
		} catch {
			return createInitialProgress();
		}
	}
}

export async function savePaperProgress(projectDir: string, progress: PaperProgress): Promise<void> {
	const { ppDir, progressFile } = paperProjectPaths(projectDir);
	await mkdir(ppDir, { recursive: true });
	await writeFileAtomic(progressFile, JSON.stringify(progress, null, 2));
}

export async function loadPaperInbox(projectDir: string, projectId: string): Promise<PaperInbox> {
	const { inboxFile } = paperProjectPaths(projectDir);
	try {
		const parsed = JSON.parse(await readFile(inboxFile, "utf8")) as Partial<PaperInbox>;
		const items = Array.isArray(parsed.items)
			? parsed.items
				.map((item) => parseInboxItem(item, projectId))
				.filter((item): item is InboxItem => item !== null)
				.filter((item) => !isLowSignalToolFailure(item))
			: [];
		return {
			version: PAPER_INBOX_VERSION,
			items: items as PaperInbox["items"],
			updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
		};
	} catch {
		return { version: PAPER_INBOX_VERSION, items: [], updatedAt: Date.now() };
	}
}

function isLowSignalToolFailure(item: InboxItem): boolean {
	return item.kind === "error" && item.title.startsWith("工具执行失败:");
}

function parseInboxItem(value: unknown, projectId: string): InboxItem | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const item = value as Record<string, unknown>;
	const kinds: InboxItemKind[] = ["gate", "clarification", "error", "attention"];
	const statuses: InboxItemStatus[] = ["open", "read", "resolved"];
	const severities: InboxItem["severity"][] = ["info", "warning", "error"];
	if (
		typeof item.id !== "string" ||
		item.projectId !== projectId ||
		!kinds.includes(item.kind as InboxItemKind) ||
		!statuses.includes(item.status as InboxItemStatus) ||
		!severities.includes(item.severity as InboxItem["severity"]) ||
		typeof item.title !== "string" ||
		typeof item.summary !== "string" ||
		typeof item.createdAt !== "number" ||
		typeof item.updatedAt !== "number"
	) return null;
	return {
		id: item.id,
		projectId,
		kind: item.kind as InboxItemKind,
		status: item.status as InboxItemStatus,
		severity: item.severity as InboxItem["severity"],
		title: item.title,
		summary: item.summary,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
		stage: isStageId(item.stage) ? item.stage : undefined,
		gateId: typeof item.gateId === "string" ? item.gateId : undefined,
		requestId: typeof item.requestId === "string" ? item.requestId : undefined,
		errorCode: typeof item.errorCode === "string" ? item.errorCode : undefined,
	};
}

export async function savePaperInbox(projectDir: string, inbox: PaperInbox): Promise<void> {
	const { ppDir, inboxFile } = paperProjectPaths(projectDir);
	await mkdir(ppDir, { recursive: true });
	await writeFile(inboxFile, JSON.stringify(inbox, null, 2), "utf8");
}

function isPathInside(root: string, candidate: string): boolean {
	const relativePath = relative(root, candidate);
	return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith("..\\") && !relativePath.startsWith("../") && !isAbsolute(relativePath));
}

function mimeForPath(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".md":
		case ".markdown": return "text/markdown";
		case ".json": return "application/json";
		case ".csv": return "text/csv";
		case ".tsv": return "text/tab-separated-values";
		case ".bib": return "text/x-bibtex";
		case ".txt": return "text/plain";
		case ".png": return "image/png";
		case ".jpg":
		case ".jpeg": return "image/jpeg";
		case ".pdf": return "application/pdf";
		default: return "application/octet-stream";
	}
}

/** Normalize agent-declared paths to project-relative paths and reject escapes. */
export async function normalizePaperArtifactPath(projectDir: string, artifactPath: string): Promise<string> {
	const root = await realpath(projectDir);
	const candidate = isAbsolute(artifactPath) ? resolve(artifactPath) : resolve(root, artifactPath);
	if (!isPathInside(root, candidate)) throw new Error(`Artifact path is outside the paper project: ${artifactPath}`);
	try {
		const actual = await realpath(candidate);
		if (!isPathInside(root, actual)) throw new Error(`Artifact path resolves outside the paper project: ${artifactPath}`);
		return relative(root, actual).replace(/\\/g, "/");
	} catch (err) {
		if (err instanceof Error && err.message.includes("outside the paper project")) throw err;
		return relative(root, candidate).replace(/\\/g, "/");
	}
}

async function captureArtifactRevision(projectDir: string, revision: ArtifactRevision): Promise<ArtifactRevision> {
	const root = await realpath(projectDir);
	const source = resolve(root, revision.path);
	if (!isPathInside(root, source)) {
		return { ...revision, available: false, error: "Revision path is outside the paper project." };
	}
	try {
		const actual = await realpath(source);
		if (!isPathInside(root, actual)) {
			return { ...revision, available: false, error: "Revision path resolves outside the paper project." };
		}
		const info = await stat(actual);
		if (!info.isFile()) return { ...revision, available: false, error: "Revision path is not a file." };
		const bytes = await readFile(actual);
		const snapshotPath = `.pp/snapshots/${revision.artifactId}/r${revision.revision}${extname(actual)}`.replace(/\\/g, "/");
		const snapshotAbsolute = resolve(root, snapshotPath);
		await mkdir(join(root, ".pp", "snapshots", revision.artifactId), { recursive: true });
		await copyFile(actual, snapshotAbsolute);
		return {
			...revision,
			path: relative(root, actual).replace(/\\/g, "/"),
			snapshotPath,
			hash: createHash("sha256").update(bytes).digest("hex"),
			byteSize: info.size,
			mimeType: mimeForPath(actual),
			available: true,
			error: undefined,
		};
	} catch (err) {
		return { ...revision, available: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Capture all revisions that have not yet been snapshotted. */
export async function captureArtifactRevisions(projectDir: string, progress: PaperProgress): Promise<PaperProgress> {
	let next = progress;
	for (const revision of progress.artifactRevisions ?? []) {
		if (revision.available && revision.snapshotPath) continue;
		const captured = await captureArtifactRevision(projectDir, revision);
		next = {
			...next,
			artifactRevisions: next.artifactRevisions.map((candidate) => candidate.id === captured.id ? captured : candidate),
		};
	}
	return next;
}

function createId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreatePaperProjectOptions {
	name: string;
	topic: string;
}

export interface CreatedPaperProject {
	config: PaperProjectConfig;
	progress: PaperProgress;
	paths: PaperProjectPaths;
}

/**
 * Initialize a paper project in `projectDir`: skeleton dirs, seeded files,
 * .pp/config.json + progress.json, and .pi/mcp.json registering the paper
 * MCP server. Existing `.pp/` projects are rejected by the caller.
 */
export async function createPaperProject(
	projectDir: string,
	options: CreatePaperProjectOptions,
): Promise<CreatedPaperProject> {
	const paths = paperProjectPaths(projectDir);
	if (existsSync(paths.ppDir)) {
		throw new Error("A Paper project already exists in this directory.");
	}

	await mkdir(paths.ppDir, { recursive: true });
	for (const sub of PAPER_DIRS) {
		await mkdir(join(projectDir, sub), { recursive: true });
	}

	// Seed empty files so the agent has concrete targets to write into.
	await writeFile(join(projectDir, "literature", "library.json"), "[]", "utf8");
	await writeFile(
		join(projectDir, "paper", "manuscript.md"),
		`# ${options.topic}\n\n> 待撰写。agent 会在论文撰写阶段填充本文件。\n`,
		"utf8",
	);
	await writeFile(join(projectDir, "paper", "references.bib"), "", "utf8");

	const config: PaperProjectConfig = {
		id: createId(),
		name: options.name,
		topic: options.topic,
		createdAt: Date.now(),
	};
	const progress = createInitialProgress();
	await savePaperConfig(projectDir, config);
	await savePaperProgress(projectDir, progress);
	await savePaperInbox(projectDir, { version: PAPER_INBOX_VERSION, items: [], updatedAt: Date.now() });
	await writePaperMcpConfig(projectDir);

	return { config, progress, paths };
}

export interface PaperMcpCommand {
	command: string;
	args: string[];
	env?: Record<string, string>;
}

/**
 * Resolve the command that launches the paper MCP server (stdio).
 *
 * Primary: Node module resolution of `pi-paper-mcp`. The package is a direct
 * pix production dependency so electron-builder includes it and its runtime
 * dependencies in packaged builds; the workspace symlink keeps dev mode
 * working as well.
 *
 * `process.execPath` is the Electron binary; ELECTRON_RUN_AS_NODE=1 makes it
 * behave as plain Node so the server speaks JSON-RPC over stdio instead of
 * launching as a GUI app (which breaks the MCP handshake). Last resort: a
 * `pi-paper-mcp` bin on PATH, which keeps manually installed development
 * environments usable when the workspace dependencies have not been linked.
 */
export function resolvePaperMcpCommand(): PaperMcpCommand {
	let entry: string | null = null;
	try {
		entry = moduleRequire.resolve("pi-paper-mcp");
	} catch {
		entry = null;
	}
	if (entry) {
		return {
			command: process.execPath,
			args: [entry],
			env: { ELECTRON_RUN_AS_NODE: "1" },
		};
	}
	return { command: "pi-paper-mcp", args: [] };
}

interface McpConfigFile {
	mcpServers?: Record<string, unknown>;
	servers?: Record<string, unknown>;
}

/**
 * Write .pi/mcp.json registering the `papers` MCP server. Preserves any
 * existing servers, only injecting/replacing the `papers` entry. Safe to call
 * on every project open to refresh a stale launch command.
 */
export async function writePaperMcpConfig(projectDir: string): Promise<void> {
	const mcpDir = join(projectDir, MCP_CONFIG_DIR);
	const mcpFile = join(mcpDir, MCP_CONFIG_FILE);
	const cmd = resolvePaperMcpCommand();

	let existing: McpConfigFile = {};
	if (existsSync(mcpFile)) {
		try {
			existing = JSON.parse(await readFile(mcpFile, "utf8")) as McpConfigFile;
		} catch {
			existing = {};
		}
	}
	const servers: Record<string, unknown> = {
		...(existing.mcpServers ?? existing.servers ?? {}),
		[PAPERS_SERVER_NAME]: {
			command: cmd.command,
			args: cmd.args,
			env: cmd.env,
			transport: "stdio",
		},
	};
	await mkdir(mcpDir, { recursive: true });
	await writeFile(mcpFile, JSON.stringify({ mcpServers: servers }, null, 2), "utf8");
}
