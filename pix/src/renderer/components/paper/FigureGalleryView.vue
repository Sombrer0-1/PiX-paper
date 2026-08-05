<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import {
	artifactName,
	artifactTypeLabel,
	formatDate,
	metadataText,
	resolveArtifactRelations,
	stageLabel,
} from "../../utils/paper";

const router = useRouter();
const paperStore = usePaperStore();
const query = ref("");
const selectedId = ref<string | null>(null);

const figures = computed(() => {
	const normalized = query.value.trim().toLowerCase();
	return paperStore.artifacts
		.filter((artifact) => artifact.type === "figure")
		.filter((artifact) => !normalized || `${artifact.path} ${metadataText(artifact, "caption", "")} ${metadataText(artifact, "title", "")}`.toLowerCase().includes(normalized))
		.sort((left, right) => right.createdAt - left.createdAt);
});

const selectedFigure = computed(() => figures.value.find((figure) => figure.id === selectedId.value) ?? figures.value[0] ?? null);
const selectedRelations = computed(() => selectedFigure.value ? resolveArtifactRelations(selectedFigure.value, paperStore.artifacts) : []);
const sourceRelations = computed(() => selectedRelations.value.filter((item) =>
	(item.direction === "incoming" && (item.relation.kind === "derived_from" || item.relation.kind === "supports")) ||
	(item.direction === "outgoing" && item.relation.kind === "derived_from"),
));

watch(figures, (items) => {
	if (!items.some((item) => item.id === selectedId.value)) selectedId.value = items[0]?.id ?? null;
}, { immediate: true });

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}

function caption(figure: typeof selectedFigure.value): string {
	return figure ? metadataText(figure, "caption", artifactName(figure.path)) : "";
}
</script>

<template>
	<div class="figure-view">
		<header class="figure-header">
			<div><div class="eyebrow">实验产物</div><h1>图表画廊</h1><p class="subtitle">按 caption、来源结果和图像预览审核实验图表。</p></div>
			<div class="figure-count"><strong>{{ figures.length }}</strong><span>张图表</span></div>
		</header>
		<div class="figure-toolbar"><label class="search-field"><span class="mdi mdi-magnify" aria-hidden="true"></span><input v-model="query" type="search" placeholder="搜索 caption 或文件名" /></label><span class="toolbar-note">图表来源由 artifact relation 提供</span></div>
		<div v-if="figures.length > 0" class="figure-layout">
			<section class="figure-grid" aria-label="图表列表">
				<article v-for="figure in figures" :key="figure.id" class="figure-card" :class="{ selected: selectedFigure?.id === figure.id }" tabindex="0" @click="selectedId = figure.id" @keydown.enter="selectedId = figure.id">
					<div class="figure-thumb"><ArtifactPreview :artifact-id="figure.id" compact @open-external="openExternal" /></div>
					<div class="figure-copy"><strong>{{ caption(figure) }}</strong><small>{{ stageLabel(figure.stage) }} · {{ formatDate(figure.createdAt) }}</small><span>{{ metadataText(figure, "source", "未标注来源") }}</span></div>
				</article>
			</section>
			<aside v-if="selectedFigure" class="figure-detail">
				<div class="detail-heading"><div><span class="eyebrow">{{ artifactTypeLabel(selectedFigure.type) }}</span><h2>{{ caption(selectedFigure) }}</h2><p>{{ selectedFigure.path }}</p></div><button type="button" class="icon-button" title="独立查看图表" aria-label="独立查看图表" @click="openArtifact(selectedFigure.id)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span></button></div>
				<div class="large-preview"><ArtifactPreview :artifact-id="selectedFigure.id" @open-external="openExternal" /></div>
				<div class="figure-metadata"><div><span>阶段</span><strong>{{ stageLabel(selectedFigure.stage) }}</strong></div><div><span>创建时间</span><strong>{{ formatDate(selectedFigure.createdAt) }}</strong></div><div><span>来源</span><strong>{{ metadataText(selectedFigure, "source", "未标注") }}</strong></div></div>
				<section class="source-section"><span class="section-label">结果来源</span><button v-for="item in sourceRelations" :key="`${item.direction}-${item.source.id}-${item.relation.kind}-${item.relation.targetPath ?? ''}`" type="button" class="source-row" @click="item.direction === 'incoming' ? openArtifact(item.source.id) : item.target && openArtifact(item.target.id)"><span class="mdi mdi-link-variant" aria-hidden="true"></span><span><strong>{{ item.direction === 'incoming' ? artifactName(item.source.path) : item.target ? artifactName(item.target.path) : item.relation.targetPath ?? "未登记来源" }}</strong><small>{{ item.relation.label || "实验结果" }}</small></span><span class="mdi mdi-arrow-top-right" aria-hidden="true"></span></button><div v-if="sourceRelations.length === 0" class="source-empty">尚未登记结果来源关系。</div></section>
			</aside>
		</div>
		<div v-else class="figure-empty"><span class="mdi mdi-chart-box-outline" aria-hidden="true"></span><strong>{{ query ? "没有匹配的图表" : "尚无图表产物" }}</strong><span>实验阶段登记 PNG、JPEG、SVG 或 PDF 后，图表会在这里展示。</span></div>
	</div>
</template>

<style scoped>
.figure-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.figure-header,
.figure-toolbar,
.figure-layout {
	max-width: 1220px;
	margin: 0 auto;
}

.figure-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
}

.eyebrow,
.section-label {
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
	font-size: 20px;
	line-height: 1.35;
}

.subtitle {
	max-width: 700px;
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.figure-count {
	display: flex;
	align-items: baseline;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.figure-count strong {
	color: var(--pix-accent);
	font-family: var(--pix-font-ui);
	font-size: 28px;
	font-weight: 500;
}

.figure-toolbar {
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
	width: min(390px, 100%);
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

.figure-layout {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
	gap: 22px;
	margin-top: 24px;
	align-items: start;
}

.figure-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
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

.figure-thumb {
	height: 170px;
	min-height: 170px;
	background: var(--pix-accent-light);
	overflow: hidden;
}

.figure-thumb :deep(.artifact-preview) {
	background: transparent;
}

.figure-thumb :deep(.preview-path),
.figure-thumb :deep(.preview-toolbar .icon-button) {
	display: none;
}

.figure-thumb :deep(.preview-toolbar) {
	min-height: 0;
	height: 0;
	padding: 0;
	border: 0;
}

.figure-thumb :deep(.preview-image) {
	width: 100%;
	height: 170px;
	max-height: 170px;
	object-fit: contain;
}

.figure-thumb :deep(.preview-pdf) {
	height: 170px;
}

.figure-thumb :deep(.preview-text) {
	max-height: 170px;
	padding: 10px;
}

.figure-copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 9px 3px 3px;
}

.figure-copy strong,
.figure-copy small,
.figure-copy span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.figure-copy strong {
	font-family: var(--pix-font-ui);
	font-size: 13px;
	font-weight: 500;
}

.figure-copy small,
.figure-copy span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.figure-detail {
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

.large-preview {
	height: 420px;
	margin-top: 15px;
	border: 1px solid var(--pix-border-light);
	background: var(--pix-bg-content);
}

.large-preview :deep(.preview-image) {
	max-height: 380px;
}

.figure-metadata {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
	margin-top: 15px;
	padding: 10px 0;
	border-top: 1px solid var(--pix-border-subtle);
	border-bottom: 1px solid var(--pix-border-subtle);
}

.figure-metadata div {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.figure-metadata span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.figure-metadata strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 11px;
	font-weight: 600;
}

.source-section {
	margin-top: 16px;
}

.source-row {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 0;
	border-bottom: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.source-row:hover {
	color: var(--pix-accent);
}

.source-row > span:nth-child(2) {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	flex: 1;
}

.source-row strong,
.source-row small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.source-row strong {
	font-size: 11px;
	font-weight: 600;
}

.source-row small,
.source-empty {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.source-empty {
	padding: 10px 0;
}

.figure-empty {
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

.figure-empty .mdi {
	font-size: 30px;
}

.figure-empty strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 16px;
	font-weight: 500;
}

@media (max-width: 1060px) {
	.figure-layout {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 700px) {
	.figure-view {
		padding: 24px 18px 36px;
	}

	.figure-header,
	.figure-toolbar {
		align-items: flex-start;
		flex-direction: column;
	}

	.figure-toolbar {
		align-items: stretch;
	}

	.search-field {
		width: 100%;
	}

	.figure-grid {
		grid-template-columns: 1fr;
	}
}
</style>
