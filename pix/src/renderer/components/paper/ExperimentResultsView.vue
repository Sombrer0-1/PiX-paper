<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import { artifactName, artifactTypeLabel, metadataText, parseJsonValue, stageLabel } from "../../utils/paper";
import type { Artifact } from "../../../shared/types";

interface MetricRow {
	id: string;
	artifact: Artifact;
	config: string;
	seed: string;
	metric: string;
	value: string;
	split: string;
	status: string;
	command: string;
}

const router = useRouter();
const paperStore = usePaperStore();
const query = ref("");
const selectedId = ref<string | null>(null);
const rows = ref<MetricRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let loadToken = 0;

const resultArtifacts = computed(() => paperStore.artifacts.filter((artifact) => artifact.type === "experiment_result" || artifact.type === "experiment_config"));

function recordValue(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textValue(value: unknown, fallback = "暂无"): string {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value && typeof value === "object") {
		try { return JSON.stringify(value); } catch { return fallback; }
	}
	return fallback;
}

function parseCsvRows(text: string): string[][] {
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let inQuotes = false;
	let rowHasContent = false;
	const pushField = (): void => { row.push(field); field = ""; };
	const pushRow = (): void => {
		if (rowHasContent) rows.push(row);
		row = [];
		rowHasContent = false;
	};
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; }
				else inQuotes = false;
			} else {
				field += char;
			}
			rowHasContent = true;
		} else if (char === '"') {
			inQuotes = true;
			rowHasContent = true;
		} else if (char === ",") {
			pushField();
			rowHasContent = true;
		} else if (char === "\n") {
			pushField();
			pushRow();
		} else if (char !== "\r") {
			field += char;
			rowHasContent = true;
		}
	}
	if (rowHasContent || field !== "" || row.length > 0) {
		pushField();
		rows.push(row);
	}
	return rows;
}

function csvRecords(text: string): Record<string, unknown>[] {
	const rows = parseCsvRows(text);
	if (rows.length < 2) return [];
	const headers = rows[0].map((header) => header.trim());
	return rows.slice(1)
		.filter((row) => row.some((field) => field.trim() !== ""))
		.map((row) => headers.reduce<Record<string, unknown>>((record, header, index) => {
			record[header] = row[index]?.trim() ?? "";
			return record;
		}, {}));
}

function recordsFromContent(content: { content?: string; path: string; mimeType: string }): unknown[] {
	if (content.mimeType === "text/csv" || content.path.toLowerCase().endsWith(".csv")) return csvRecords(content.content ?? "");
	const value = parseJsonValue(content.content);
	if (Array.isArray(value)) return value;
	const root = recordValue(value);
	if (Array.isArray(root?.results)) return root.results;
	if (Array.isArray(root?.metrics)) return root.metrics;
	return value === undefined ? [] : [value];
}

function rowsFromRecord(record: unknown, artifact: Artifact, index: number): MetricRow[] {
	const value = recordValue(record);
	const metadata = artifact.metadata;
	if (!value) {
		return [{ id: `${artifact.id}-${index}`, artifact, config: metadataText(artifact, "config"), seed: metadataText(artifact, "seed"), metric: metadataText(artifact, "metric"), value: textValue(record), split: metadataText(artifact, "split"), status: metadataText(artifact, "status"), command: metadataText(artifact, "command", "暂无") }];
	}
	const nestedMetrics = value.metrics;
	if (nestedMetrics && typeof nestedMetrics === "object" && !Array.isArray(nestedMetrics)) {
		return Object.entries(nestedMetrics as Record<string, unknown>).map(([metric, metricValue], metricIndex) => ({
			id: `${artifact.id}-${index}-${metricIndex}`,
			artifact,
			config: textValue(value.config ?? value.configuration ?? metadata?.config),
			seed: textValue(value.seed ?? metadata?.seed),
			metric,
			value: textValue(metricValue),
			split: textValue(value.split ?? metadata?.split),
			status: textValue(value.status ?? metadata?.status),
			command: textValue(value.command ?? metadata?.command),
		}));
	}
	return [{
		id: `${artifact.id}-${index}`,
		artifact,
		config: textValue(value.config ?? value.configuration ?? metadata?.config),
		seed: textValue(value.seed ?? metadata?.seed),
		metric: textValue(value.metric ?? value.name ?? metadata?.metric),
		value: textValue(value.value ?? value.score ?? value.result ?? value.metrics),
		split: textValue(value.split ?? metadata?.split),
		status: textValue(value.status ?? metadata?.status),
		command: textValue(value.command ?? metadata?.command),
	}];
}

async function loadResults(): Promise<void> {
	const token = ++loadToken;
	rows.value = [];
	error.value = null;
	if (resultArtifacts.value.length === 0) return;
	loading.value = true;
	try {
		const loaded = await Promise.all(resultArtifacts.value.map(async (artifact) => {
			try {
				const content = await paperStore.readArtifact(artifact.id);
				return { artifact, content };
			} catch {
				return null;
			}
		}));
		if (token !== loadToken) return;
		rows.value = loaded.flatMap((entry) => entry
			? recordsFromContent(entry.content).flatMap((record, index) => rowsFromRecord(record, entry.artifact, index))
			: []);
		if (rows.value.length === 0) {
			rows.value = resultArtifacts.value.map((artifact) => ({
				id: artifact.id,
				artifact,
				config: metadataText(artifact, "config"),
				seed: metadataText(artifact, "seed"),
				metric: metadataText(artifact, "metric"),
				value: metadataText(artifact, "value"),
				split: metadataText(artifact, "split"),
				status: metadataText(artifact, "status"),
				command: metadataText(artifact, "command", "暂无"),
			}));
		}
	} catch (err) {
		if (token !== loadToken) return;
		error.value = err instanceof Error ? err.message : "无法读取实验结果";
	} finally {
		if (token === loadToken) loading.value = false;
	}
}

const filteredRows = computed(() => {
	const normalized = query.value.trim().toLowerCase();
	return rows.value.filter((row) => !normalized || `${row.config} ${row.seed} ${row.metric} ${row.value} ${row.artifact.path}`.toLowerCase().includes(normalized));
});

const selectedRow = computed(() => filteredRows.value.find((row) => row.id === selectedId.value) ?? filteredRows.value[0] ?? null);

watch(resultArtifacts, () => void loadResults(), { immediate: true });
watch(filteredRows, (items) => {
	if (!items.some((row) => row.id === selectedId.value)) selectedId.value = items[0]?.id ?? null;
}, { immediate: true });

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}
</script>

<template>
	<div class="results-view">
		<header class="results-header"><div><div class="eyebrow">实验证据</div><h1>实验结果</h1><p class="subtitle">把 config、seed、metric 和数值放在同一张可比较的结果表中。</p></div><div class="result-count"><strong>{{ filteredRows.length }}</strong><span>条指标</span></div></header>
		<div class="results-toolbar"><label class="search-field"><span class="mdi mdi-magnify" aria-hidden="true"></span><input v-model="query" type="search" placeholder="搜索 config、seed、metric 或结果文件" /></label><span class="toolbar-note">{{ resultArtifacts.length }} 个结果文件</span></div>
		<div v-if="loading" class="results-state"><span class="spinner"></span><span>正在读取实验结果...</span></div>
		<div v-else-if="error" class="results-state error"><span class="mdi mdi-alert-circle-outline" aria-hidden="true"></span><span>{{ error }}</span></div>
		<div v-else-if="filteredRows.length === 0" class="results-state"><span class="mdi mdi-table-large" aria-hidden="true"></span><strong>{{ query ? "没有匹配的结果" : "尚无实验结果" }}</strong><span>实验阶段登记 JSON、CSV 或 Markdown 结果后，结构化指标会显示在这里。</span></div>
		<div v-else class="results-layout">
			<section class="metrics-table" aria-label="实验指标表">
				<div class="table-head"><span>配置</span><span>Seed</span><span>指标</span><span>数值</span><span>文件</span></div>
				<button v-for="row in filteredRows" :key="row.id" type="button" class="metric-row" :class="{ selected: selectedRow?.id === row.id }" @click="selectedId = row.id"><span><strong>{{ row.config }}</strong><small>{{ row.split }}</small></span><span>{{ row.seed }}</span><span>{{ row.metric }}</span><strong class="metric-value">{{ row.value }}</strong><span class="metric-file">{{ artifactName(row.artifact.path) }}</span></button>
			</section>
			<aside v-if="selectedRow" class="result-detail"><div class="detail-heading"><div><span class="eyebrow">{{ selectedRow.metric }}</span><h2>{{ selectedRow.value }}</h2><p>{{ selectedRow.artifact.path }}</p></div><button type="button" class="icon-button" title="独立查看结果文件" aria-label="独立查看结果文件" @click="openArtifact(selectedRow.artifact.id)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span></button></div><div class="result-facts"><div><span>Config</span><strong>{{ selectedRow.config }}</strong></div><div><span>Seed</span><strong>{{ selectedRow.seed }}</strong></div><div><span>Split</span><strong>{{ selectedRow.split }}</strong></div><div><span>Status</span><strong>{{ selectedRow.status }}</strong></div><div><span>Stage</span><strong>{{ stageLabel(selectedRow.artifact.stage) }}</strong></div><div><span>Type</span><strong>{{ artifactTypeLabel(selectedRow.artifact.type) }}</strong></div></div><p v-if="selectedRow.command !== '暂无'" class="command-line">{{ selectedRow.command }}</p><div class="result-preview"><ArtifactPreview :artifact-id="selectedRow.artifact.id" @open-external="openExternal" /></div></aside>
		</div>
	</div>
</template>

<style scoped>
.results-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.results-header,
.results-toolbar,
.results-layout {
	max-width: 1220px;
	margin: 0 auto;
}

.results-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
}

.eyebrow {
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

h1,
h2 {
	font-family: var(--pix-font-ui);
	font-weight: 500;
	letter-spacing: 0;
}

h1 {
	margin-top: 7px;
	font-size: 32px;
}

h2 {
	margin-top: 6px;
	font-size: 25px;
}

.subtitle {
	max-width: 700px;
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.result-count {
	display: flex;
	align-items: baseline;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.result-count strong {
	color: var(--pix-accent);
	font-family: var(--pix-font-ui);
	font-size: 28px;
	font-weight: 500;
}

.results-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-top: 28px;
	padding: 10px 0;
	border-top: 1px solid var(--pix-border-light);
	border-bottom: 1px solid var(--pix-border-light);
}

.search-field {
	display: flex;
	align-items: center;
	gap: 7px;
	width: min(430px, 100%);
	padding: 0 8px;
	border: 1px solid var(--pix-border);
	border-radius: 5px;
}

.search-field .mdi {
	color: var(--pix-text-muted);
	font-size: 16px;
}

.search-field input {
	width: 100%;
	min-height: 30px;
	border: 0;
	outline: 0;
	background: transparent;
	font-size: 12px;
}

.toolbar-note {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.results-layout {
	display: grid;
	grid-template-columns: minmax(0, 1.35fr) minmax(370px, 0.75fr);
	gap: 22px;
	margin-top: 24px;
	align-items: start;
}

.table-head,
.metric-row {
	display: grid;
	grid-template-columns: minmax(100px, 1.2fr) 70px minmax(90px, 0.8fr) minmax(80px, 0.7fr) minmax(110px, 1fr);
	gap: 10px;
	align-items: center;
}

.table-head {
	padding: 0 10px 8px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
}

.metric-row {
	width: 100%;
	min-height: 58px;
	padding: 8px 10px;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.metric-row:hover,
.metric-row.selected {
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.metric-row > span:first-child {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.metric-row strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 11px;
	font-weight: 600;
}

.metric-row small,
.metric-file {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.metric-value {
	color: var(--pix-accent);
}

.result-detail {
	min-width: 0;
	padding: 16px;
	border: 1px solid var(--pix-border-light);
	background: var(--pix-bg-subtle);
}

.detail-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.detail-heading p {
	margin-top: 5px;
	color: var(--pix-text-muted);
	font-family: var(--pix-font-mono);
	font-size: 11px;
}

.icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 29px;
	height: 29px;
	border-radius: 5px;
	color: var(--pix-text-secondary);
}

.icon-button:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.result-facts {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	margin-top: 16px;
	padding: 12px 0;
	border-top: 1px solid var(--pix-border-subtle);
	border-bottom: 1px solid var(--pix-border-subtle);
}

.result-facts div {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.result-facts span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.result-facts strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 11px;
	font-weight: 600;
}

.command-line {
	margin-top: 12px;
	padding: 8px;
	background: var(--pix-bg-code);
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-mono);
	font-size: 11px;
	line-height: 1.45;
	word-break: break-word;
}

.result-preview {
	height: 360px;
	margin-top: 14px;
	border: 1px solid var(--pix-border-light);
	background: var(--pix-bg-content);
}

.results-state {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 8px;
	max-width: 1220px;
	min-height: 270px;
	margin: 24px auto 0;
	border: 1px dashed var(--pix-border);
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.results-state strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 16px;
	font-weight: 500;
}

.results-state .mdi {
	font-size: 30px;
}

.results-state.error {
	color: var(--pix-error);
}

@media (max-width: 1060px) {
	.results-layout {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 750px) {
	.results-view {
		padding: 24px 18px 36px;
	}

	.results-header,
	.results-toolbar {
		align-items: flex-start;
		flex-direction: column;
	}

	.results-toolbar {
		align-items: stretch;
	}

	.search-field {
		width: 100%;
	}

	.table-head {
		display: none;
	}

	.metric-row {
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		gap: 5px 10px;
	}

	.metric-row > span:first-child {
		width: 100%;
	}

	.metric-file {
		width: 100%;
	}
}
</style>
