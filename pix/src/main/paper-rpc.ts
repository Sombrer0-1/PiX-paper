/**
 * Paper-specific IPC handlers (design §5.3, §9).
 *
 * Registers handlers for the paper project lifecycle (create / get-state /
 * start-stage / respond-gate / list-artifacts / open-artifact). Gate requests
 * and progress changes are forwarded to the renderer by ipc-handlers via the
 * `paper-gate` and `paper-state-changed` channels (set up in
 * setCurrentStageEngine), not here.
 */

import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { ipcMain, shell, type BrowserWindow } from "electron";
import type { GateDecision, StageId } from "pi-paper-workflow";
import { isGateDecisionKind, isStageId } from "pi-paper-workflow";
import type { StageEngine } from "./stage-engine.js";
import { createPaperProject, isPaperProject } from "./paper-project.js";
import type {
	Artifact,
	ArtifactRevision,
	PaperArtifactContent,
	PaperStateSnapshot,
} from "../shared/types.js";

export interface PaperRpcDeps {
	/** Accessor for the currently active stage engine (null in coding mode). */
	getStageEngine: () => StageEngine | null;
	/** Accessor for the window to receive forwarded events. */
	getWin: () => BrowserWindow | null;
}

function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCreatePayload(payload: unknown): { projectDir: string; name: string; topic: string } {
	if (!isRecord(payload)) throw new Error("Invalid payload");
	const projectDir = typeof payload.projectDir === "string" ? payload.projectDir : "";
	const name = typeof payload.name === "string" ? payload.name : "";
	const topic = typeof payload.topic === "string" ? payload.topic : "";
	if (!projectDir || !name || !topic) {
		throw new Error("projectDir, name and topic are required");
	}
	return { projectDir, name, topic };
}

function parseStage(payload: unknown): StageId | null {
	if (!isRecord(payload)) return null;
	const stage = payload.stage;
	return typeof stage === "string" && isStageId(stage) ? stage : null;
}

function parseOptionalStage(payload: unknown): StageId | null {
	if (!isRecord(payload)) return null;
	const stage = payload.stage;
	if (stage === undefined || stage === null) return null;
	return typeof stage === "string" && isStageId(stage) ? stage : null;
}

function parseDecision(payload: unknown): GateDecision | null {
	if (!isRecord(payload)) return null;
	const decision = payload.decision;
	if (typeof decision !== "string" || !isGateDecisionKind(decision)) return null;
	const result: GateDecision = { decision };
	if (decision === "rework") {
		const target = payload.reworkTarget;
		if (typeof target === "string" && isStageId(target)) {
			result.reworkTarget = target;
		}
	}
	if (typeof payload.reason === "string" && payload.reason.trim()) {
		result.reason = payload.reason;
	}
	return result;
}

function parseInboxUpdate(payload: unknown): { itemId: string; status: "open" | "read" | "resolved" } | null {
	if (!isRecord(payload) || typeof payload.itemId !== "string") return null;
	if (payload.status !== "open" && payload.status !== "read" && payload.status !== "resolved") return null;
	return { itemId: payload.itemId, status: payload.status };
}

function parseOpenPayload(payload: unknown): { path?: string; artifactId?: string; revisionId?: string } | null {
	if (!isRecord(payload)) return null;
	const path = typeof payload.path === "string" && payload.path.trim() ? payload.path : undefined;
	const artifactId = typeof payload.artifactId === "string" && payload.artifactId.trim() ? payload.artifactId : undefined;
	const revisionId = typeof payload.revisionId === "string" && payload.revisionId.trim() ? payload.revisionId : undefined;
	return path || artifactId ? { path, artifactId, revisionId } : null;
}

function isPathInside(root: string, candidate: string): boolean {
	const relativePath = relative(root, candidate);
	return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !relativePath.startsWith(`..${"\\"}`) && !isAbsolute(relativePath));
}

function mimeForExtension(extension: string): string {
	switch (extension) {
		case ".md":
		case ".markdown": return "text/markdown";
		case ".json": return "application/json";
		case ".jsonl": return "application/jsonl";
		case ".csv": return "text/csv";
		case ".tsv": return "text/tab-separated-values";
		case ".bib": return "text/x-bibtex";
		case ".txt": return "text/plain";
		case ".png": return "image/png";
		case ".jpg":
		case ".jpeg": return "image/jpeg";
		case ".gif": return "image/gif";
		case ".webp": return "image/webp";
		case ".pdf": return "application/pdf";
		default: return "application/octet-stream";
	}
}

function isTextExtension(extension: string): boolean {
	return [".md", ".markdown", ".json", ".jsonl", ".csv", ".tsv", ".bib", ".txt", ".log", ".tex", ".yaml", ".yml"].includes(extension);
}

interface ResolvedArtifactFile {
	artifact: Artifact;
	revision?: ArtifactRevision;
	projectRelativePath: string;
	absPath: string;
}

async function resolveArtifactFile(engine: StageEngine, payload: { artifactId?: string; revisionId?: string; path?: string }): Promise<ResolvedArtifactFile> {
	const root = await realpath(engine.projectDir);
	let artifact = payload.artifactId
		? engine.progress.artifacts.find((candidate) => candidate.id === payload.artifactId)
		: undefined;
	if (!artifact && payload.path) {
		artifact = engine.progress.artifacts.find((candidate) => candidate.path === payload.path);
	}
	if (!artifact) throw new Error("Artifact was not found in the active paper project.");

	const revision = payload.revisionId
		? engine.progress.artifactRevisions.find((candidate) => candidate.id === payload.revisionId && candidate.artifactId === artifact?.id)
		: artifact.latestRevisionId
			? engine.progress.artifactRevisions.find((candidate) => candidate.id === artifact?.latestRevisionId)
			: undefined;
	const requestedPath = revision?.snapshotPath ?? revision?.path ?? artifact.path;
	const candidatePath = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(root, requestedPath);
	if (!isPathInside(root, candidatePath)) throw new Error("Artifact path is outside the paper project.");
	const absolutePath = await realpath(candidatePath);
	if (!isPathInside(root, absolutePath)) throw new Error("Artifact path resolves outside the paper project.");
	const projectRelativePath = relative(root, absolutePath).replace(/\\/g, "/");
	return { artifact, revision, projectRelativePath, absPath: absolutePath };
}

async function readArtifactContent(engine: StageEngine, payload: { artifactId: string; revisionId?: string }): Promise<PaperArtifactContent> {
	const resolved = await resolveArtifactFile(engine, payload);
	const fileInfo = await stat(resolved.absPath);
	if (!fileInfo.isFile()) throw new Error("Artifact path is not a file.");
	const extension = extname(resolved.absPath).toLowerCase();
	const mimeType = mimeForExtension(extension);
	const textLimit = 4 * 1024 * 1024;
	const binaryLimit = 16 * 1024 * 1024;
	const limit = isTextExtension(extension) ? textLimit : binaryLimit;
	const bytes = await readFile(resolved.absPath);
	const truncated = bytes.byteLength > limit;
	const data = truncated ? bytes.subarray(0, limit) : bytes;
	if (isTextExtension(extension)) {
		return {
			artifactId: resolved.artifact.id,
			revisionId: resolved.revision?.id,
			path: resolved.projectRelativePath,
			mimeType,
			kind: extension === ".json" ? "json" : "text",
			content: new TextDecoder("utf-8", { fatal: false }).decode(data),
			byteSize: fileInfo.size,
			truncated,
		};
	}
	if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension) && !truncated) {
		return {
			artifactId: resolved.artifact.id,
			revisionId: resolved.revision?.id,
			path: resolved.projectRelativePath,
			mimeType,
			kind: "image",
			dataUrl: `data:${mimeType};base64,${data.toString("base64")}`,
			byteSize: fileInfo.size,
		};
	}
	if (extension === ".pdf" && !truncated) {
		return {
			artifactId: resolved.artifact.id,
			revisionId: resolved.revision?.id,
			path: resolved.projectRelativePath,
			mimeType,
			kind: "pdf",
			dataUrl: `data:${mimeType};base64,${data.toString("base64")}`,
			byteSize: fileInfo.size,
		};
	}
	return {
		artifactId: resolved.artifact.id,
		revisionId: resolved.revision?.id,
		path: resolved.projectRelativePath,
		mimeType,
		kind: "unsupported",
		byteSize: fileInfo.size,
		truncated,
	};
}

export function registerPaperRpcHandlers(deps: PaperRpcDeps): void {
	ipcMain.handle("paper-validate-project-dir", async (_event, payload: unknown) => {
		try {
			if (!isRecord(payload) || typeof payload.projectDir !== "string" || !payload.projectDir.trim()) {
				return { success: false, error: "Project directory is required." };
			}
			const projectDir = resolve(payload.projectDir.trim());
			const directory = await stat(projectDir);
			if (!directory.isDirectory()) {
				return { success: true, exists: false, writable: false, hasPaperProject: false, error: "Path is not a directory." };
			}
			let writable = true;
			try {
				await access(projectDir, constants.W_OK);
			} catch {
				writable = false;
			}
			return {
				success: true,
				exists: true,
				writable,
				hasPaperProject: isPaperProject(projectDir),
				error: writable ? undefined : "Project directory is not writable.",
			};
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	// Initialize a paper project directory (no session yet). Called from the
	// HomePage create-paper dialog, before start-pi.
	ipcMain.handle("paper-create-project", async (_event, payload: unknown) => {
		try {
			const { projectDir, name, topic } = parseCreatePayload(payload);
			const directory = await stat(resolve(projectDir));
			if (!directory.isDirectory()) throw new Error("Project path is not a directory.");
			await access(resolve(projectDir), constants.W_OK);
			if (isPaperProject(projectDir)) throw new Error("A Paper project already exists in this directory.");
			await createPaperProject(projectDir, { name, topic });
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-get-state", async () => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		return {
			success: true,
			data: {
				config: engine.config,
				progress: engine.progress,
				pendingGate: engine.pendingGate,
				inbox: engine.inbox,
			} satisfies PaperStateSnapshot,
		};
	});

	ipcMain.handle("paper-start-stage", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const stage = parseStage(payload);
		if (!stage) return { success: false, error: "Invalid stage." };
		try {
			await engine.startStage(stage);
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-pause-stage", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const stage = parseStage(payload);
		if (!stage) return { success: false, error: "Invalid stage." };
		try {
			const reason = isRecord(payload) && typeof payload.reason === "string" ? payload.reason : undefined;
			await engine.pauseStage(stage, reason);
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-resume-stage", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const stage = parseStage(payload);
		if (!stage) return { success: false, error: "Invalid stage." };
		try {
			await engine.resumeStage(stage);
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-respond-gate", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const decision = parseDecision(payload);
		if (!decision) return { success: false, error: "Invalid gate decision." };
		try {
			await engine.respondGate(decision);
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-list-artifacts", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const stage = parseOptionalStage(payload);
		return { success: true, data: engine.listArtifacts(stage ?? undefined) };
	});

	ipcMain.handle("paper-read-artifact", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		if (!isRecord(payload) || typeof payload.artifactId !== "string" || !payload.artifactId.trim()) {
			return { success: false, error: "Invalid artifact id." };
		}
		try {
			return { success: true, data: await readArtifactContent(engine, {
				artifactId: payload.artifactId,
				revisionId: typeof payload.revisionId === "string" ? payload.revisionId : undefined,
			}) };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-mark-inbox-item", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const update = parseInboxUpdate(payload);
		if (!update) return { success: false, error: "Invalid inbox update." };
		try {
			await engine.markInboxItem(update.itemId, update.status);
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-open-artifact", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const request = parseOpenPayload(payload);
		if (!request) return { success: false, error: "Invalid artifact reference." };
		try {
			const resolved = await resolveArtifactFile(engine, request);
			const result = await shell.openPath(resolved.absPath);
			return { success: result === "" , error: result || undefined };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	ipcMain.handle("paper-open-in-folder", async (_event, payload: unknown) => {
		const engine = deps.getStageEngine();
		if (!engine) return { success: false, error: "No active paper project." };
		const request = parseOpenPayload(payload);
		if (!request) return { success: false, error: "Invalid artifact reference." };
		try {
			const resolved = await resolveArtifactFile(engine, request);
			shell.showItemInFolder(resolved.absPath);
			return { success: true };
		} catch (err) {
			return { success: false, error: errMsg(err) };
		}
	});

	// Whether a directory is a paper project (has .pp/). Used by the home page
	// to validate "open paper project" and to filter the recent-projects list.
	ipcMain.handle("paper-check-project", (_event, dir: unknown): boolean => {
		return typeof dir === "string" && isPaperProject(dir);
	});
}
