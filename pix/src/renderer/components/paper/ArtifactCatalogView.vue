<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import LiteraturePoolView from "./LiteraturePoolView.vue";
import FigureGalleryView from "./FigureGalleryView.vue";
import ExperimentResultsView from "./ExperimentResultsView.vue";
import { ARTIFACT_TYPE_LABELS, artifactName, artifactTypeLabel, formatDate, stageLabel } from "../../utils/paper";
import type { Artifact, ArtifactType } from "../../../shared/types";

const props = defineProps<{ kind: "library" | "figures" | "results" }>();

const router = useRouter();
const paperStore = usePaperStore();
const selectedArtifactId = ref<string | null>(null);
const query = ref("");
const sortBy = ref<"created" | "name" | "type">("created");

const config = computed(() => {
	switch (props.kind) {
		case "library": return { title: "文献池", eyebrow: "证据库", description: "集中查看 agent 收集的论文、标签和研究笔记。", types: ["literature_pool"] as ArtifactType[] };
		case "figures": return { title: "图表画廊", eyebrow: "实验产物", description: "按图表查看实验结果，caption 和来源会逐步补充到产物元数据。", types: ["figure"] as ArtifactType[] };
		default: return { title: "实验结果", eyebrow: "实验产物", description: "查看配置、指标和结果文件，比较不同运行的证据。", types: ["experiment_result", "experiment_config"] as ArtifactType[] };
	}
});

const artifacts = computed(() => {
	const normalized = query.value.trim().toLowerCase();
	const filtered = paperStore.artifacts.filter((artifact) => {
		if (!config.value.types.includes(artifact.type)) return false;
		if (!normalized) return true;
		return `${artifact.path} ${artifact.metadata?.title ?? ""} ${artifact.metadata?.authors ?? ""}`.toLowerCase().includes(normalized);
	});
	return filtered.sort((a, b) => {
		if (sortBy.value === "name") return artifactName(a.path).localeCompare(artifactName(b.path));
		if (sortBy.value === "type") return a.type.localeCompare(b.type);
		return b.createdAt - a.createdAt;
	});
});

const selectedArtifact = computed(() => artifacts.value.find((artifact) => artifact.id === selectedArtifactId.value) ?? artifacts.value[0] ?? null);

watch(artifacts, (items) => {
	if (!items.some((item) => item.id === selectedArtifactId.value)) selectedArtifactId.value = items[0]?.id ?? null;
}, { immediate: true });

function selectArtifact(artifact: Artifact): void {
	selectedArtifactId.value = artifact.id;
	paperStore.selectArtifact(artifact.id);
}

function openArtifactRoute(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}

function metadataText(artifact: Artifact, key: string): string {
	const value = artifact.metadata?.[key];
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ");
	if (typeof value === "string" || typeof value === "number") return String(value);
	return "暂无";
}

function metricText(artifact: Artifact): string {
	const metric = metadataText(artifact, "metric");
	const value = metadataText(artifact, "value");
	return metric !== "暂无" && value !== "暂无" ? `${metric}: ${value}` : metadataText(artifact, "summary");
}
</script>

<template>
	<div class="paper-view catalog-view" :class="{ 'library-mode': props.kind === 'library' }">
		<LiteraturePoolView v-if="props.kind === 'library'" />
		<FigureGalleryView v-else-if="props.kind === 'figures'" />
		<ExperimentResultsView v-else-if="props.kind === 'results'" />
		<template v-else>
		<header class="view-header">
			<div>
				<div class="eyebrow">{{ config.eyebrow }}</div>
				<h1>{{ config.title }}</h1>
				<p class="view-subtitle">{{ config.description }}</p>
			</div>
			<div class="catalog-count"><strong>{{ artifacts.length }}</strong><span>项产物</span></div>
		</header>

		<div v-if="props.kind !== 'library'" class="catalog-toolbar">
			<label class="search-field"><span class="mdi mdi-magnify" aria-hidden="true"></span><input v-model="query" type="search" :placeholder="`搜索${config.title}...`" /></label>
			<label class="sort-field"><span>排序</span><select v-model="sortBy"><option value="created">最近更新</option><option value="name">名称</option><option value="type">类型</option></select></label>
		</div>

		<div v-if="props.kind !== 'library' && artifacts.length > 0" class="catalog-layout">
			<section class="catalog-list-section">
				<div v-if="props.kind === 'library'" class="literature-table">
					<div class="table-head"><span>论文</span><span>作者 / 年份</span><span>相关性</span><span></span></div>
					<button v-for="artifact in artifacts" :key="artifact.id" type="button" class="literature-row" :class="{ selected: selectedArtifact?.id === artifact.id }" @click="selectArtifact(artifact)">
						<span class="literature-title"><strong>{{ metadataText(artifact, 'title') !== '暂无' ? metadataText(artifact, 'title') : artifactName(artifact.path) }}</strong><small>{{ metadataText(artifact, 'tags') }}</small></span>
						<span class="literature-meta">{{ metadataText(artifact, 'authors') }}<br />{{ metadataText(artifact, 'year') }}</span>
						<span class="relevance-value">{{ metadataText(artifact, 'relevance') }}</span>
						<span class="mdi mdi-chevron-right row-arrow" aria-hidden="true"></span>
					</button>
				</div>
				<div v-else-if="props.kind === 'figures'" class="figure-grid">
					<button v-for="artifact in artifacts" :key="artifact.id" type="button" class="figure-card" :class="{ selected: selectedArtifact?.id === artifact.id }" @click="selectArtifact(artifact)">
						<div class="figure-placeholder"><span class="mdi mdi-chart-box-outline" aria-hidden="true"></span><span>{{ artifactName(artifact.path) }}</span></div>
						<div class="figure-card-copy"><strong>{{ metadataText(artifact, 'caption') !== '暂无' ? metadataText(artifact, 'caption') : artifactName(artifact.path) }}</strong><small>{{ stageLabel(artifact.stage) }} · {{ formatDate(artifact.createdAt) }}</small></div>
					</button>
				</div>
				<div v-else class="results-table">
					<div class="table-head"><span>结果文件</span><span>指标</span><span>阶段</span><span>更新时间</span></div>
					<button v-for="artifact in artifacts" :key="artifact.id" type="button" class="result-row" :class="{ selected: selectedArtifact?.id === artifact.id }" @click="selectArtifact(artifact)">
						<span><strong>{{ artifactName(artifact.path) }}</strong><small>{{ artifactTypeLabel(artifact.type) }}</small></span><span>{{ metricText(artifact) }}</span><span>{{ stageLabel(artifact.stage) }}</span><span>{{ formatDate(artifact.createdAt) }}</span>
					</button>
				</div>
			</section>

			<section v-if="selectedArtifact" class="catalog-preview">
				<div class="catalog-preview-heading"><div><span class="eyebrow">预览</span><h2>{{ artifactName(selectedArtifact.path) }}</h2><p>{{ ARTIFACT_TYPE_LABELS[selectedArtifact.type] }} · {{ stageLabel(selectedArtifact.stage) }}</p></div><button type="button" class="icon-button" title="在独立页面查看" aria-label="在独立页面查看" @click="openArtifactRoute(selectedArtifact.id)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span></button></div>
				<div class="catalog-preview-body"><ArtifactPreview :artifact-id="selectedArtifact.id" @open-external="openExternal" /></div>
			</section>
		</div>
		<div v-else class="empty-catalog"><span class="mdi" :class="props.kind === 'library' ? 'mdi-bookshelf' : props.kind === 'figures' ? 'mdi-chart-box-outline' : 'mdi-table-large'" aria-hidden="true"></span><strong>{{ query ? '没有匹配的产物' : `尚无${config.title}` }}</strong><span>{{ query ? '调整关键词后再试。' : 'agent 产出并登记后，这里会自动出现结构化视图。' }}</span></div>
		</template>
	</div>
</template>

<style scoped>
.catalog-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.catalog-view.library-mode > .empty-catalog {
	display: none;
}

.view-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
	max-width: 1220px;
	margin: 0 auto;
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
	line-height: 1.2;
}

h2 {
	margin-top: 5px;
	font-size: 18px;
}

.view-subtitle {
	max-width: 720px;
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.catalog-count {
	display: flex;
	align-items: baseline;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.catalog-count strong {
	color: var(--pix-accent);
	font-family: var(--pix-font-ui);
	font-size: 28px;
	font-weight: 500;
}

.catalog-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	max-width: 1220px;
	margin: 28px auto 0;
	padding: 10px 0;
	border-top: 1px solid var(--pix-border-light);
	border-bottom: 1px solid var(--pix-border-light);
}

.search-field {
	display: flex;
	align-items: center;
	gap: 7px;
	width: min(360px, 100%);
	padding: 0 8px;
	border: 1px solid var(--pix-border);
	border-radius: 5px;
	background: var(--pix-bg-content);
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

.catalog-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(370px, 0.8fr);
	gap: 24px;
	max-width: 1220px;
	margin: 24px auto 0;
	align-items: start;
}

.catalog-list-section {
	min-width: 0;
}

.table-head {
	display: grid;
	grid-template-columns: minmax(0, 1.6fr) minmax(120px, 0.8fr) 100px 20px;
	gap: 10px;
	padding: 0 10px 8px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.03em;
}

.literature-row,
.result-row {
	display: grid;
	align-items: center;
	width: 100%;
	gap: 10px;
	min-height: 58px;
	padding: 8px 10px;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.literature-row {
	grid-template-columns: minmax(0, 1.6fr) minmax(120px, 0.8fr) 100px 20px;
}

.result-row {
	grid-template-columns: minmax(0, 1.5fr) minmax(100px, 0.8fr) 100px 120px;
}

.literature-row:hover,
.literature-row.selected,
.result-row:hover,
.result-row.selected {
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.literature-title,
.result-row > span:first-child,
.figure-card-copy {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.literature-title strong,
.result-row strong,
.figure-card-copy strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--pix-font-ui);
	font-size: 13px;
	font-weight: 500;
}

.literature-title small,
.result-row small,
.literature-meta,
.relevance-value,
.result-row > span:not(:first-child),
.figure-card-copy small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.relevance-value {
	color: var(--pix-success);
	font-weight: 600;
}

.row-arrow {
	color: var(--pix-text-muted);
	font-size: 16px;
}

.figure-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.figure-card {
	min-width: 0;
	padding: 8px;
	border: 1px solid var(--pix-border-light);
	border-radius: 7px;
	background: var(--pix-bg-content);
	text-align: left;
}

.figure-card:hover,
.figure-card.selected {
	border-color: var(--pix-accent-soft);
	background: var(--pix-bg-hover);
}

.figure-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 5px;
	min-height: 130px;
	border-radius: 5px;
	background: var(--pix-accent-light);
	color: var(--pix-accent);
	font-size: 11px;
	text-align: center;
}

.figure-placeholder .mdi {
	font-size: 30px;
}

.figure-card-copy {
	padding: 9px 3px 3px;
}

.results-table .table-head {
	grid-template-columns: minmax(0, 1.5fr) minmax(100px, 0.8fr) 100px 120px;
}

.catalog-preview {
	display: flex;
	flex-direction: column;
	min-height: 520px;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-subtle);
	overflow: hidden;
}

.catalog-preview-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding: 14px 16px;
	border-bottom: 1px solid var(--pix-border-light);
}

.catalog-preview-heading p {
	margin-top: 4px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 5px;
	color: var(--pix-text-secondary);
}

.icon-button:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.catalog-preview-body {
	display: flex;
	min-height: 0;
	flex: 1;
}

.catalog-preview-body :deep(.artifact-preview) {
	width: 100%;
	min-height: 0;
	flex: 1;
}

.empty-catalog {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 8px;
	max-width: 1220px;
	min-height: 260px;
	margin: 24px auto 0;
	border: 1px dashed var(--pix-border);
	border-radius: 8px;
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.empty-catalog .mdi {
	color: var(--pix-text-muted);
	font-size: 30px;
}

.empty-catalog strong {
	color: var(--pix-text-secondary);
	font-size: 14px;
}

@media (max-width: 1060px) {
	.catalog-layout {
		grid-template-columns: 1fr;
	}

	.catalog-preview {
		min-height: 430px;
	}
}

@media (max-width: 700px) {
	.catalog-view {
		padding: 24px 18px 36px;
	}

	.view-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.catalog-toolbar {
		align-items: stretch;
		flex-direction: column;
	}

	.search-field {
		width: 100%;
	}

	.figure-grid {
		grid-template-columns: 1fr;
	}

	.table-head {
		display: none;
	}

	.literature-row,
	.result-row {
		display: flex;
		align-items: flex-start;
		flex-direction: column;
		gap: 4px;
	}

	.row-arrow {
		display: none;
	}
}
</style>
