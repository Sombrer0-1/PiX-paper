import type { Artifact, ArtifactRelation, ArtifactType, StageId, StageState } from "../../shared/types";

export const PAPER_STAGES: Array<{ id: StageId; label: string; shortLabel: string; description: string }> = [
	{ id: "literature", label: "文献调研", shortLabel: "文献", description: "建立文献池并形成研究综述" },
	{ id: "reproduction", label: "代码复现", shortLabel: "复现", description: "验证基线实现与原始结果" },
	{ id: "improvement", label: "方法改进", shortLabel: "改进", description: "提出方法变化并准备实验" },
	{ id: "experiment", label: "实验执行", shortLabel: "实验", description: "运行对比实验并整理结果" },
	{ id: "writing", label: "论文撰写", shortLabel: "写作", description: "整合证据并完成论文交付" },
];

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
	paper: "论文",
	paper_pdf: "PDF",
	survey: "综述",
	method: "方法",
	repo: "代码仓库",
	reproduction_log: "复现记录",
	experiment_config: "实验配置",
	experiment_result: "实验结果",
	figure: "图表",
	literature_pool: "文献池",
};

export function stageLabel(stage: StageId): string {
	return PAPER_STAGES.find((item) => item.id === stage)?.label ?? stage;
}

export function artifactTypeLabel(type: ArtifactType): string {
	return ARTIFACT_TYPE_LABELS[type];
}

export function artifactName(path: string): string {
	return path.split(/[\\/]/).pop() || path;
}

export function formatDuration(milliseconds: number): string {
	if (milliseconds < 60_000) return "< 1 分钟";
	const minutes = Math.floor(milliseconds / 60_000);
	if (minutes < 60) return `${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function elapsedForStage(state: StageState | null | undefined, now = Date.now()): string {
	if (!state?.startedAt) return "尚未开始";
	const end = state.finishedAt ?? now;
	return formatDuration(Math.max(0, end - state.startedAt));
}

export function statusLabel(status: StageState["status"] | undefined): string {
	switch (status) {
		case "running": return "运行中";
		case "paused": return "已暂停";
		case "awaiting_gate": return "待审核";
		case "passed": return "已通过";
		case "failed": return "已终止";
		case "rework": return "返工中";
		default: return "未开始";
	}
}

export function primaryArtifact(artifacts: Artifact[]): Artifact | null {
	return artifacts.find((artifact) => artifact.role === "primary") ?? artifacts[0] ?? null;
}

export interface LiteratureEntry {
	id: string;
	citationKey?: string;
	title?: string;
	authors: string[];
	year?: number;
	venue?: string;
	abstract?: string;
	citations?: number;
	doi?: string;
	url?: string;
	localPath?: string;
	tags: string[];
	relevanceScore?: number;
	notes?: string;
}

function recordValue(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringListValue(value: unknown): string[] {
	if (typeof value === "string") return value.split(/[,;]\s*/).map((item) => item.trim()).filter(Boolean);
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

export function metadataText(artifact: Artifact, key: string, fallback = "N/A"): string {
	const value = artifact.metadata?.[key];
	if (Array.isArray(value)) {
		const text = value.filter((item): item is string => typeof item === "string").join(", ");
		return text || fallback;
	}
	if (typeof value === "string" || typeof value === "number") return String(value);
	return fallback;
}

export function metadataNumber(artifact: Artifact, key: string): number | undefined {
	return numberValue(artifact.metadata?.[key]);
}

export function parseJsonValue(text: string | undefined): unknown {
	if (!text?.trim()) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function literatureRecord(value: unknown, index: number): LiteratureEntry | null {
	const record = recordValue(value);
	if (!record) return null;
	const id = stringValue(record.id) ?? stringValue(record.paperId) ?? stringValue(record.citationKey) ?? `paper-${index + 1}`;
	return {
		id,
		citationKey: stringValue(record.citationKey) ?? stringValue(record.key),
		title: stringValue(record.title),
		authors: stringListValue(record.authors),
		year: numberValue(record.year),
		venue: stringValue(record.venue),
		abstract: stringValue(record.abstract),
		citations: numberValue(record.citations),
		doi: stringValue(record.doi),
		url: stringValue(record.url) ?? stringValue(record.pdfUrl),
		localPath: stringValue(record.localPath) ?? stringValue(record.path),
		tags: stringListValue(record.tags),
		relevanceScore: numberValue(record.relevanceScore) ?? numberValue(record.relevance),
		notes: stringValue(record.notes),
	};
}

export function parseLiteratureLibrary(value: unknown): LiteratureEntry[] {
	const root = recordValue(value);
	const collection = Array.isArray(value)
		? value
		: Array.isArray(root?.papers)
			? root.papers
			: Array.isArray(root?.items)
				? root.items
				: Array.isArray(root?.library)
					? root.library
					: [];
	return collection.map((item, index) => literatureRecord(item, index)).filter((item): item is LiteratureEntry => item !== null);
}

export function citationKey(entry: LiteratureEntry): string {
	return entry.citationKey ?? entry.id;
}

function normalizedPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

export function artifactForPath(path: string | undefined, artifacts: Artifact[]): Artifact | null {
	if (!path) return null;
	const normalized = normalizedPath(path);
	return artifacts.find((artifact) => normalizedPath(artifact.path) === normalized) ?? null;
}

export interface ResolvedArtifactRelation {
	direction: "outgoing" | "incoming";
	source: Artifact;
	target: Artifact | null;
	relation: ArtifactRelation;
}

export function relationLabel(kind: ArtifactRelation["kind"]): string {
	switch (kind) {
		case "cites": return "Cites";
		case "illustrates": return "Illustrates";
		case "derived_from": return "Derived from";
		case "supports": return "Supports";
	}
}

function relationMatchesArtifact(relation: ArtifactRelation, artifact: Artifact): boolean {
	return relation.targetArtifactId === artifact.id || normalizedPath(relation.targetPath ?? "") === normalizedPath(artifact.path);
}

function resolveRelationTarget(relation: ArtifactRelation, artifacts: Artifact[]): Artifact | null {
	if (relation.targetArtifactId) {
		return artifacts.find((artifact) => artifact.id === relation.targetArtifactId) ?? null;
	}
	return artifactForPath(relation.targetPath, artifacts);
}

export function resolveArtifactRelations(artifact: Artifact, artifacts: Artifact[]): ResolvedArtifactRelation[] {
	const outgoing = (artifact.relations ?? []).map((relation) => ({
		direction: "outgoing" as const,
		source: artifact,
		target: resolveRelationTarget(relation, artifacts),
		relation,
	}));
	const incoming = artifacts.flatMap((source) => {
		if (source.id === artifact.id) return [];
		return (source.relations ?? [])
			.filter((relation) => relationMatchesArtifact(relation, artifact))
			.map((relation) => ({
				direction: "incoming" as const,
				source,
				target: artifact,
				relation,
			}));
	});
	return [...outgoing, ...incoming];
}

export function formatDate(timestamp: number | undefined): string {
	if (!timestamp) return "暂无";
	return new Date(timestamp).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatRelative(timestamp: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
	if (seconds < 60) return "刚刚";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	return `${Math.floor(hours / 24)} 天前`;
}
