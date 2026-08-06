<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import {
	artifactForPath,
	artifactName,
	citationKey,
	formatDate,
	parseJsonValue,
	parseLiteratureLibrary,
	type LiteratureEntry,
} from "../../utils/paper";

const router = useRouter();
const paperStore = usePaperStore();
const query = ref("");
const sortBy = ref<"relevance" | "year" | "citations" | "title">("relevance");
const selectedId = ref<string | null>(null);
const entries = ref<LiteratureEntry[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const truncated = ref(false);
let loadToken = 0;

const libraryArtifact = computed(() => paperStore.artifacts.find((artifact) => artifact.type === "literature_pool") ?? null);

const filteredEntries = computed(() => {
	const normalized = query.value.trim().toLowerCase();
	const result = entries.value.filter((entry) => {
		if (!normalized) return true;
		return [
			entry.title,
			entry.authors.join(" "),
			entry.venue,
			entry.doi,
			entry.citationKey,
			entry.tags.join(" "),
		].filter(Boolean).join(" ").toLowerCase().includes(normalized);
	});
	return [...result].sort((left, right) => {
		if (sortBy.value === "title") return (left.title ?? citationKey(left)).localeCompare(right.title ?? citationKey(right));
		if (sortBy.value === "year") return (right.year ?? 0) - (left.year ?? 0);
		if (sortBy.value === "citations") return (right.citations ?? 0) - (left.citations ?? 0);
		return (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
	});
});

const selectedEntry = computed(() => filteredEntries.value.find((entry) => entry.id === selectedId.value) ?? filteredEntries.value[0] ?? null);
const selectedPdf = computed(() => selectedEntry.value ? artifactForPath(selectedEntry.value.localPath, paperStore.artifacts) : null);

async function loadLibrary(): Promise<void> {
	const artifact = libraryArtifact.value;
	const token = ++loadToken;
	entries.value = [];
	selectedId.value = null;
	error.value = null;
	truncated.value = false;
	if (!artifact) return;
	loading.value = true;
	try {
		const content = await paperStore.readArtifact(artifact.id);
		if (token !== loadToken) return;
		if (content.kind !== "json" && content.kind !== "text") throw new Error("文献池不是可解析的 JSON 文件。");
		const rawText = content.content ?? "";
		const parsed = parseJsonValue(rawText);
		if (rawText.trim() && parsed === undefined) {
			throw new Error(content.truncated ? "文献池内容已截断，JSON 解析失败。" : "文献池 JSON 解析失败，文件可能已损坏。");
		}
		entries.value = parseLiteratureLibrary(parsed);
		if (content.truncated) truncated.value = true;
	} catch (err) {
		if (token !== loadToken) return;
		error.value = err instanceof Error ? err.message : "无法读取文献池";
	} finally {
		if (token === loadToken) loading.value = false;
	}
}

watch(libraryArtifact, () => void loadLibrary(), { immediate: true });
watch(filteredEntries, (items) => {
	if (!items.some((entry) => entry.id === selectedId.value)) selectedId.value = items[0]?.id ?? null;
}, { immediate: true });

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}

function openSource(): void {
	if (selectedPdf.value) {
		openExternal(selectedPdf.value.id);
		return;
	}
	const url = selectedEntry.value?.url;
	if (url && window.pixApi) window.pixApi.openExternal(url);
}

function sourceLabel(): string {
	if (selectedPdf.value) return "打开本地 PDF";
	if (selectedEntry.value?.url) return "打开来源链接";
	return "暂无来源文件";
}
</script>

<template>
	<div class="library-view">
		<header class="library-header">
			<div>
				<div class="eyebrow">证据库</div>
				<h1>文献池</h1>
				<p class="subtitle">按论文元数据、相关性和可用全文集中审核 agent 收集的证据。</p>
			</div>
			<div class="library-count"><strong>{{ entries.length }}</strong><span>篇记录</span></div>
		</header>

		<div class="library-toolbar">
			<label class="search-field"><span class="mdi mdi-magnify" aria-hidden="true"></span><input v-model="query" type="search" placeholder="搜索标题、作者、标签或 DOI" /></label>
			<label class="sort-field"><span>排序</span><select v-model="sortBy"><option value="relevance">相关性</option><option value="year">年份</option><option value="citations">引用量</option><option value="title">标题</option></select></label>
		</div>

		<div v-if="loading" class="library-state"><span class="spinner"></span><span>正在读取文献池...</span></div>
		<div v-else-if="error" class="library-state error"><span class="mdi mdi-alert-circle-outline" aria-hidden="true"></span><span>{{ error }}</span></div>
		<div v-else-if="entries.length === 0" class="library-state"><span class="mdi mdi-bookshelf" aria-hidden="true"></span><strong>{{ query ? "没有匹配的文献" : "文献池尚未登记" }}</strong><span>当 agent 登记 `literature/library.json` 后，论文记录会显示在这里。</span></div>
		<template v-else><div v-if="truncated" class="library-warning"><span class="mdi mdi-alert-outline" aria-hidden="true"></span> 文献池内容已截断，仅显示已加载的部分。</div>
		<div class="library-layout">
			<section class="literature-table" aria-label="文献列表">
				<div class="table-head"><span>论文</span><span>作者 / 年份</span><span>相关性</span><span></span></div>
				<button v-for="entry in filteredEntries" :key="entry.id" type="button" class="literature-row" :class="{ selected: selectedEntry?.id === entry.id }" @click="selectedId = entry.id">
					<span class="title-cell"><strong>{{ entry.title ?? citationKey(entry) }}</strong><small>{{ entry.tags.join(" · ") || "未添加标签" }}</small></span>
					<span class="author-cell">{{ entry.authors.join(", ") || "作者未知" }}<br />{{ entry.year ?? "年份未知" }}</span>
					<span class="relevance-cell">{{ entry.relevanceScore !== undefined ? entry.relevanceScore.toFixed(2) : "暂无" }}</span>
					<span class="mdi mdi-chevron-right" aria-hidden="true"></span>
				</button>
			</section>

			<aside v-if="selectedEntry" class="literature-detail">
				<div class="detail-heading"><div><span class="eyebrow">{{ citationKey(selectedEntry) }}</span><h2>{{ selectedEntry.title ?? "未命名论文" }}</h2></div><button type="button" class="icon-button" title="打开原始 JSON" aria-label="打开原始 JSON" @click="libraryArtifact && openArtifact(libraryArtifact.id)"><span class="mdi mdi-code-json" aria-hidden="true"></span></button></div>
				<p class="detail-authors">{{ selectedEntry.authors.join(", ") || "作者未知" }}<span v-if="selectedEntry.year"> · {{ selectedEntry.year }}</span><span v-if="selectedEntry.venue"> · {{ selectedEntry.venue }}</span></p>
				<div class="detail-tags"><span v-for="tag in selectedEntry.tags" :key="tag">{{ tag }}</span><span v-if="selectedEntry.doi">DOI {{ selectedEntry.doi }}</span></div>
				<p v-if="selectedEntry.abstract" class="detail-abstract">{{ selectedEntry.abstract }}</p>
				<p v-else class="detail-abstract muted">暂无摘要</p>
				<div class="detail-metrics"><div><span>引用量</span><strong>{{ selectedEntry.citations ?? "暂无" }}</strong></div><div><span>相关性</span><strong>{{ selectedEntry.relevanceScore?.toFixed(2) ?? "暂无" }}</strong></div></div>
				<div class="detail-actions"><button type="button" class="button button-primary" :disabled="!selectedPdf && !selectedEntry.url" @click="openSource"><span class="mdi mdi-file-eye-outline" aria-hidden="true"></span>{{ sourceLabel() }}</button><button v-if="selectedPdf" type="button" class="button button-quiet" @click="openArtifact(selectedPdf.id)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span>独立预览</button></div>
				<div v-if="selectedPdf" class="literature-pdf"><div class="pdf-label">本地全文预览 · {{ artifactName(selectedPdf.path) }}</div><ArtifactPreview :artifact-id="selectedPdf.id" compact @open-external="openExternal" /></div>
				<div v-else class="pdf-empty"><span class="mdi mdi-file-pdf-box-outline" aria-hidden="true"></span><span>该记录尚未关联本地 PDF。</span></div>
				<time class="detail-time">记录更新于 {{ formatDate(libraryArtifact?.createdAt) }}</time>
			</aside>
		</div>
		</template>
	</div>
</template>

<style scoped>
.library-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.library-header,
.library-toolbar,
.library-layout,
.library-warning {
	max-width: 1220px;
	margin-left: auto;
	margin-right: auto;
}

.library-header {
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
	font-size: 19px;
	line-height: 1.35;
}

.subtitle {
	max-width: 700px;
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.library-count {
	display: flex;
	align-items: baseline;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.library-count strong {
	color: var(--pix-accent);
	font-family: var(--pix-font-ui);
	font-size: 28px;
	font-weight: 500;
}

.library-toolbar {
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

.sort-field {
	display: flex;
	align-items: center;
	gap: 7px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.sort-field select {
	min-height: 30px;
	padding: 0 7px;
	border: 1px solid var(--pix-border);
	border-radius: 5px;
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
	font-size: 11px;
}

.library-layout {
	display: grid;
	grid-template-columns: minmax(0, 1.3fr) minmax(350px, 0.8fr);
	gap: 24px;
	margin-top: 24px;
	align-items: start;
}

.library-warning {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 16px;
	padding: 8px 12px;
	border: 1px solid var(--pix-warning);
	border-radius: 5px;
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
	font-size: 11px;
}

.table-head,
.literature-row {
	display: grid;
	grid-template-columns: minmax(0, 1.6fr) minmax(130px, 0.8fr) 85px 18px;
	gap: 10px;
	align-items: center;
}

.table-head {
	padding: 0 10px 8px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
}

.literature-row {
	width: 100%;
	min-height: 63px;
	padding: 8px 10px;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.literature-row:hover,
.literature-row.selected {
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.title-cell,
.author-cell {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.title-cell strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--pix-font-ui);
	font-size: 13px;
	font-weight: 500;
}

.title-cell small,
.author-cell,
.relevance-cell {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.relevance-cell {
	color: var(--pix-success);
	font-weight: 600;
}

.literature-row > .mdi {
	color: var(--pix-text-muted);
	font-size: 16px;
}

.literature-detail {
	min-width: 0;
	padding: 17px 18px 16px;
	border: 1px solid var(--pix-border-light);
	background: var(--pix-bg-subtle);
}

.detail-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.icon-button,
.button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 32px;
	padding: 0 10px;
	border-radius: 5px;
	font-size: 11px;
	font-weight: 600;
}

.icon-button {
	width: 29px;
	padding: 0;
	color: var(--pix-text-secondary);
}

.icon-button:hover,
.button-quiet:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.detail-authors,
.detail-abstract,
.detail-time {
	color: var(--pix-text-secondary);
	font-size: 11px;
	line-height: 1.55;
}

.detail-authors {
	margin-top: 9px;
}

.detail-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	margin-top: 12px;
}

.detail-tags span {
	padding: 3px 6px;
	border-radius: 4px;
	background: var(--pix-accent-light);
	color: var(--pix-text-secondary);
	font-size: 11px;
}

.detail-abstract {
	margin-top: 14px;
}

.detail-abstract.muted,
.detail-time {
	color: var(--pix-text-muted);
}

.detail-metrics {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	margin-top: 14px;
	padding: 10px 0;
	border-top: 1px solid var(--pix-border-subtle);
	border-bottom: 1px solid var(--pix-border-subtle);
}

.detail-metrics div {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.detail-metrics span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.detail-metrics strong {
	color: var(--pix-accent);
	font-size: 14px;
}

.detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 7px;
	margin-top: 14px;
}

.button-primary {
	background: var(--pix-accent);
	color: var(--pix-text-inverse);
}

.button-primary:disabled {
	background: var(--pix-border);
	color: var(--pix-text-inverse);
}

.button-quiet {
	border: 1px solid var(--pix-border);
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
}

.literature-pdf {
	min-height: 260px;
	margin-top: 16px;
	border-top: 1px solid var(--pix-border-subtle);
}

.pdf-label {
	padding: 9px 0;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.literature-pdf :deep(.artifact-preview) {
	height: 330px;
	border: 1px solid var(--pix-border-light);
}

.pdf-empty {
	display: flex;
	align-items: center;
	gap: 7px;
	margin-top: 17px;
	padding: 14px 0;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-muted);
	font-size: 11px;
}

.library-state {
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

.library-state strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 16px;
	font-weight: 500;
}

.library-state .mdi {
	font-size: 30px;
}

.library-state.error {
	color: var(--pix-error);
}

@media (max-width: 1050px) {
	.library-layout {
		grid-template-columns: 1fr;
	}

	.literature-detail {
		max-width: none;
	}
}

@media (max-width: 700px) {
	.library-view {
		padding: 24px 18px 36px;
	}

	.library-header,
	.library-toolbar {
		align-items: flex-start;
		flex-direction: column;
	}

	.library-toolbar {
		align-items: stretch;
	}

	.search-field {
		width: 100%;
	}

	.table-head {
		display: none;
	}

	.literature-row {
		display: flex;
		align-items: flex-start;
		flex-direction: column;
		gap: 5px;
	}

	.literature-row > .mdi {
		display: none;
	}
}
</style>
