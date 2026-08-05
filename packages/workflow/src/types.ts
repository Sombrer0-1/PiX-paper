/**
 * Core domain types for PiX paper projects.
 *
 * Mirrors design.md §3: Artifact, PaperProject + StageProgress, gate payloads.
 * These types are the single source of truth shared by the workflow state
 * machine, the Electron main process (stage-engine / paper-rpc) and the
 * renderer (via type-only re-exports in pix shared types).
 */

// ============================================================================
// Stages
// ============================================================================

export const STAGE_IDS = ["literature", "reproduction", "improvement", "experiment", "writing"] as const;

export const PAPER_PROGRESS_VERSION = 2 as const;

export type StageId = (typeof STAGE_IDS)[number];

export type StageStatus = "pending" | "running" | "paused" | "awaiting_gate" | "passed" | "failed" | "rework";

export interface StageState {
	status: StageStatus;
	/** Ids of artifacts produced by this stage. */
	artifacts: string[];
	/** pi session file associated with this stage (fork support, see design §3.2). */
	sessionFile?: string;
	gateDecision?: GateDecisionKind;
	reworkTarget?: StageId;
	runId?: string;
	startedAt?: number;
	finishedAt?: number;
	pausedAt?: number;
	lastActivityAt?: number;
}

export interface StageProgress {
	current: StageId;
	stages: Record<StageId, StageState>;
}

// ============================================================================
// Artifacts (design §3.1, MVP lightweight: no hash / provenance)
// ============================================================================

export const ARTIFACT_TYPES = [
	"paper",
	"paper_pdf",
	"survey",
	"method",
	"repo",
	"reproduction_log",
	"experiment_config",
	"experiment_result",
	"figure",
	"literature_pool",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type ArtifactCreator = "user" | "agent" | "tool";

export type ArtifactRelationKind = "cites" | "illustrates" | "derived_from" | "supports";

export interface ArtifactRelation {
	kind: ArtifactRelationKind;
	targetArtifactId?: string;
	targetPath?: string;
	label?: string;
}

export interface ArtifactRevision {
	id: string;
	artifactId: string;
	revision: number;
	path: string;
	createdAt: number;
	hash?: string;
	byteSize?: number;
	mimeType?: string;
	/** Project-relative immutable copy, when snapshot creation succeeded. */
	snapshotPath?: string;
	available: boolean;
	error?: string;
}

export interface Artifact {
	id: string;
	projectId: string;
	type: ArtifactType;
	/** File path, relative to the project dir when possible. */
	path: string;
	stage: StageId;
	createdBy: ArtifactCreator;
	createdAt: number;
	role?: "primary" | "supporting";
	latestRevisionId?: string;
	relations?: ArtifactRelation[];
	metadata?: Record<string, unknown>;
}

// ============================================================================
// Paper project config (.pp/config.json)
// ============================================================================

export interface PaperProjectConfig {
	id: string;
	name: string;
	/** Research topic entered by the user. */
	topic: string;
	createdAt: number;
}

// ============================================================================
// Gate (design §4.2)
// ============================================================================

export type GateDecisionKind = "rework" | "continue" | "abort";

export interface GateDecision {
	decision: GateDecisionKind;
	/** Required when decision === "rework": stage to roll back to. */
	reworkTarget?: StageId;
	/** Optional free-form reason shown to the agent. */
	reason?: string;
}

export interface QualityCheckItem {
	label: string;
	ok: boolean;
	detail?: string;
}

/** Payload shown in the GateCard while a stage awaits its human gate. */
export interface GateRequest {
	id: string;
	stage: StageId;
	/** Agent-authored summary of what the stage accomplished. */
	summary: string;
	/** Artifacts declared by the agent at review time. */
	artifacts: Artifact[];
	primaryArtifactId?: string;
	/** Quality gate results (design §4.4). */
	checks: QualityCheckItem[];
	requestedAt: number;
}

// ============================================================================
// Progress manifest (.pp/progress.json)
// ============================================================================

export interface StageUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	cost: number;
}

export interface StageRun {
	id: string;
	stage: StageId;
	sessionFile?: string;
	startedAt: number;
	finishedAt?: number;
	status: Exclude<StageStatus, "pending">;
	lastActivityAt: number;
	artifactIds: string[];
	gateId?: string;
	summary?: string;
	usage?: StageUsage;
}

export type StageActivityKind =
	| "started"
	| "resumed"
	| "paused"
	| "artifact"
	| "gate_requested"
	| "gate_decided"
	| "error";

export interface StageActivity {
	id: string;
	stage: StageId;
	kind: StageActivityKind;
	at: number;
	message: string;
	artifactIds?: string[];
	gateId?: string;
}

export interface PaperProgress {
	version: typeof PAPER_PROGRESS_VERSION;
	stage: StageProgress;
	/** Global artifact registry for the project. */
	artifacts: Artifact[];
	artifactRevisions: ArtifactRevision[];
	stageRuns: StageRun[];
	activities: StageActivity[];
	/** Persisted gate request so the UI can re-render after an app restart. */
	pendingGate?: GateRequest;
	updatedAt: number;
}

export const PAPER_INBOX_VERSION = 1 as const;

export type InboxItemKind = "gate" | "clarification" | "error" | "attention";
export type InboxItemStatus = "open" | "read" | "resolved";

export interface InboxItem {
	id: string;
	projectId: string;
	kind: InboxItemKind;
	status: InboxItemStatus;
	severity: "info" | "warning" | "error";
	title: string;
	summary: string;
	createdAt: number;
	updatedAt: number;
	stage?: StageId;
	gateId?: string;
	requestId?: string;
	errorCode?: string;
}

export interface PaperInbox {
	version: typeof PAPER_INBOX_VERSION;
	items: InboxItem[];
	updatedAt: number;
}

// ============================================================================
// Type guards
// ============================================================================

export function isStageId(value: unknown): value is StageId {
	return typeof value === "string" && (STAGE_IDS as readonly string[]).includes(value);
}

export function isArtifactType(value: unknown): value is ArtifactType {
	return typeof value === "string" && (ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function isGateDecisionKind(value: unknown): value is GateDecisionKind {
	return value === "rework" || value === "continue" || value === "abort";
}
