<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import ArtifactRelationsPanel from "./ArtifactRelationsPanel.vue";
import {
	artifactName,
	artifactTypeLabel,
	citationKey,
	parseJsonValue,
	parseLiteratureLibrary,
	stageLabel,
	type LiteratureEntry,
} from "../../utils/paper";
import { renderMarkdown as renderMarkdownContent } from "../../utils/markdown";
import type { PaperArtifactContent } from "../../../shared/types";

const router = useRouter();
const paperStore = usePaperStore();

const manuscript = computed(() => paperStore.artifacts.find((artifact) => artifact.type === "paper") ?? null);
const pdf = computed(() => paperStore.artifacts.find((artifact) => artifact.type === "paper_pdf") ?? null);
const figures = computed(() => paperStore.artifacts.filter((artifact) => artifact.type === "figure"));
const references = computed(() => paperStore.artifacts.filter((artifact) => artifact.type === "literature_pool" || artifact.type === "survey"));
const manuscriptContent = ref<PaperArtifactContent | null>(null);
const literatureEntries = ref<LiteratureEntry[]>([]);
const imageSources = ref<Map<string, string>>(new Map());
const citationKeys = computed(() => new Set(literatureEntries.value.map((entry) => citationKey(entry))));
const citedKeys = computed(() => {
	const text = manuscriptContent.value?.content ?? "";
	const keys = new Set<string>();
	const pattern = /\[@([A-Za-z0-9][A-Za-z0-9_.:-]*)\]/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) keys.add(match[1]);
	return keys;
});
const loading = ref(false);
const loadError = ref<string | null>(null);
let loadToken = 0;

const renderedManuscript = computed(() => {
	const content = manuscriptContent.value?.content;
	return content ? renderMarkdownContent(content, { citationKeys: citationKeys.value, imageSources: imageSources.value }) : "";
});

async function loadManuscript(): Promise<void> {
	const artifact = manuscript.value;
	const token = ++loadToken;
	manuscriptContent.value = null;
	literatureEntries.value = [];
	imageSources.value = new Map();
	loadError.value = null;
	if (!artifact) return;
	loading.value = true;
	try {
		const manuscriptResult = await paperStore.readArtifact(artifact.id);
		const library = paperStore.artifacts.find((candidate) => candidate.type === "literature_pool");
		const figureResults = await Promise.all(figures.value.map(async (figure) => {
			try {
				return { figure, content: await paperStore.readArtifact(figure.id) };
			} catch {
				return null;
			}
		}));
		if (token !== loadToken) return;
		manuscriptContent.value = manuscriptResult;
		if (library) {
			try {
				const libraryContent = await paperStore.readArtifact(library.id);
				literatureEntries.value = parseLiteratureLibrary(parseJsonValue(libraryContent.content));
			} catch {
				literatureEntries.value = [];
			}
		}
		const sources = new Map<string, string>();
		for (const result of figureResults) {
			if (!result) continue;
			const { figure, content } = result;
			if (content.kind !== "image" || !content.dataUrl) continue;
			sources.set(figure.path, content.dataUrl);
			sources.set(artifactName(figure.path), content.dataUrl);
		}
		imageSources.value = sources;
	} catch (err) {
		if (token !== loadToken) return;
		loadError.value = err instanceof Error ? err.message : "无法读取论文正文";
	} finally {
		if (token === loadToken) loading.value = false;
	}
}

watch(manuscript, () => void loadManuscript(), { immediate: true });

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}

function handleDocumentClick(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof HTMLAnchorElement)) return;
	const href = target.getAttribute("href");
	if (href?.startsWith("#citation-")) {
		event.preventDefault();
		const key = href.slice("#citation-".length);
		document.getElementById(`reference-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
		return;
	}
	if (href && /^https?:|^mailto:/i.test(href)) {
		event.preventDefault();
		if (window.pixApi) window.pixApi.openExternal(href);
	}
}

function openReference(entry: LiteratureEntry): void {
	const encodedKey = encodeURIComponent(citationKey(entry));
	const citation = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
		.find((anchor) => anchor.getAttribute("href") === `#citation-${encodedKey}`);
	citation?.scrollIntoView({ behavior: "smooth", block: "center" });
}
</script>

<template>
	<div class="paper-view manuscript-view">
		<header class="view-header">
			<div>
				<div class="eyebrow">最终交付物</div>
				<h1>论文中心</h1>
				<p class="view-subtitle">论文是研究项目的家。文献、图表和实验结果会作为支撑材料停靠在旁边。</p>
			</div>
			<div class="manuscript-actions">
				<button v-if="pdf" type="button" class="button button-quiet" @click="openExternal(pdf.id)"><span class="mdi mdi-file-pdf-box" aria-hidden="true"></span> 打开 PDF</button>
				<button v-if="manuscript" type="button" class="button button-primary" @click="openArtifact(manuscript.id)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span> 独立查看</button>
			</div>
		</header>

		<div v-if="manuscript" class="manuscript-layout">
			<main class="manuscript-document">
				<div class="document-heading"><div><span class="document-kicker">{{ paperStore.config?.topic }}</span><h2>{{ artifactName(manuscript.path) }}</h2><p>{{ artifactTypeLabel(manuscript.type) }} · {{ stageLabel(manuscript.stage) }}</p></div><span class="mdi mdi-file-document-edit-outline document-icon" aria-hidden="true"></span></div>
				<div class="manuscript-preview" @click="handleDocumentClick">
					<div v-if="loading" class="document-state"><span class="spinner"></span><span>正在读取论文正文...</span></div>
					<div v-else-if="loadError" class="document-state error"><span class="mdi mdi-alert-circle-outline" aria-hidden="true"></span><span>{{ loadError }}</span></div>
					<div v-else-if="manuscriptContent?.kind === 'text' || manuscriptContent?.kind === 'json'" class="markdown-body" v-html="renderedManuscript"></div>
					<ArtifactPreview v-else :artifact-id="manuscript.id" @open-external="openExternal" />
				</div>
			</main>
			<aside class="support-rail">
				<section v-if="literatureEntries.length > 0" class="support-section citation-section"><div class="section-label">参考文献</div><h3>{{ literatureEntries.length }} 条可跳转引用</h3><div class="support-list"><button v-for="entry in literatureEntries" :id="`reference-${encodeURIComponent(citationKey(entry))}`" :key="citationKey(entry)" type="button" class="support-item" :class="{ 'support-item-disabled': !citedKeys.has(citationKey(entry)) }" :disabled="!citedKeys.has(citationKey(entry))" :title="citedKeys.has(citationKey(entry)) ? '跳转到正文引用' : '未在正文中引用'" @click="openReference(entry)"><span class="citation-key">[{{ citationKey(entry) }}]</span><span><strong>{{ entry.title ?? "未命名论文" }}</strong><small>{{ entry.authors.join(", ") || "作者未知" }}<span v-if="entry.year"> · {{ entry.year }}</span></small></span><span class="mdi mdi-arrow-down-left" aria-hidden="true"></span></button></div></section>
				<section class="support-section"><div class="section-label">论文证据</div><h3>{{ references.length }} 个文献产物</h3><div class="support-list"><button v-for="artifact in references" :key="artifact.id" type="button" class="support-item" @click="openArtifact(artifact.id)"><span class="mdi mdi-book-open-outline" aria-hidden="true"></span><span><strong>{{ artifactName(artifact.path) }}</strong><small>{{ artifactTypeLabel(artifact.type) }}</small></span><span class="mdi mdi-chevron-right" aria-hidden="true"></span></button></div><div v-if="references.length === 0" class="support-empty">文献产物会显示在这里。</div></section>
				<section class="support-section"><div class="section-label">内联图表</div><h3>{{ figures.length }} 个图表产物</h3><div class="support-list"><button v-for="artifact in figures" :key="artifact.id" type="button" class="support-item" @click="openArtifact(artifact.id)"><span class="mdi mdi-chart-box-outline" aria-hidden="true"></span><span><strong>{{ artifactName(artifact.path) }}</strong><small>{{ artifact.metadata?.caption ? String(artifact.metadata.caption) : '未提供 caption' }}</small></span><span class="mdi mdi-chevron-right" aria-hidden="true"></span></button></div><div v-if="figures.length === 0" class="support-empty">实验图表会显示在这里。</div></section>
				<section class="support-section manuscript-note"><span class="mdi mdi-link-variant" aria-hidden="true"></span><p>引用和图表的联动依赖 agent 在产物注册时提供关系信息。当前没有关系时，仍可从支撑面板打开对应产物。</p></section>
				<ArtifactRelationsPanel v-if="manuscript" :artifact="manuscript" :artifacts="paperStore.artifacts" compact @open-artifact="openArtifact" />
			</aside>
		</div>
		<div v-else class="manuscript-empty"><span class="mdi mdi-file-document-alert-outline" aria-hidden="true"></span><strong>论文尚未登记</strong><span>写作阶段生成并提交 manuscript 后，论文会在这里成为中心文档。</span><button type="button" class="button button-quiet" @click="router.push('/workspace/stage/writing')">查看写作阶段</button></div>
	</div>
</template>

<style scoped>
.manuscript-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-app);
}

.view-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
	max-width: 1220px;
	margin: 0 auto;
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
h2,
h3 {
	font-family: var(--pix-font-ui);
	font-weight: 500;
	letter-spacing: 0;
}

h1 {
	margin-top: 7px;
	font-size: 32px;
}

.view-subtitle {
	max-width: 700px;
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.manuscript-actions {
	display: flex;
	gap: 8px;
}

.button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 34px;
	padding: 0 11px;
	border-radius: 6px;
	font-size: 12px;
	font-weight: 600;
}

.button-primary {
	background: var(--pix-accent);
	color: var(--pix-text-inverse);
}

.button-primary:hover {
	background: var(--pix-accent-hover);
}

.button-quiet {
	border: 1px solid var(--pix-border);
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
}

.button-quiet:hover {
	background: var(--pix-bg-hover);
}

.manuscript-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 270px;
	gap: 22px;
	max-width: 1220px;
	margin: 30px auto 0;
	align-items: start;
}

.manuscript-document {
	display: flex;
	flex-direction: column;
	min-height: 650px;
	border: 1px solid var(--pix-border);
	background: var(--pix-bg-content);
	box-shadow: none;
}

.document-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 28px 36px 22px;
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-bg-subtle);
}

.document-kicker {
	color: var(--pix-text-muted);
	font-family: var(--pix-font-ui);
	font-size: 13px;
	line-height: 1.45;
}

.document-heading h2 {
	margin-top: 10px;
	font-size: 25px;
}

.document-heading p {
	margin-top: 6px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.document-icon {
	color: var(--pix-text-muted);
	font-size: 26px;
}

.manuscript-preview {
	min-height: 570px;
	flex: 1;
	display: flex;
	flex-direction: column;
}

.document-state {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	min-height: 360px;
	gap: 8px;
	padding: 28px;
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.document-state.error {
	color: var(--pix-error);
}

.manuscript-preview :deep(.artifact-preview) {
	background: var(--pix-bg-content);
}

.manuscript-preview :deep(.preview-toolbar) {
	background: var(--pix-bg-subtle);
}

.manuscript-preview :deep(.preview-text) {
	max-width: 820px;
	margin: 0 auto;
	padding: 34px 54px 60px;
}

.manuscript-preview :deep(.markdown-body) {
	color: var(--pix-text-primary);
	font-family: var(--pix-font-ui);
	font-size: 16px;
	line-height: 1.85;
}

.manuscript-preview :deep(.markdown-body h1) {
	font-size: 30px;
	font-weight: 500;
}

.manuscript-preview :deep(.markdown-body h2) {
	margin-top: 30px;
	font-size: 22px;
	font-weight: 500;
}

.manuscript-preview :deep(.markdown-body h3) {
	margin-top: 24px;
	font-size: 18px;
	font-weight: 600;
}

.manuscript-preview :deep(.markdown-body p) {
	margin: 0 0 16px;
}

.manuscript-preview :deep(.markdown-body ul),
.manuscript-preview :deep(.markdown-body ol) {
	margin: 0 0 16px;
	padding-left: 26px;
}

.manuscript-preview :deep(.markdown-body blockquote) {
	margin: 18px 0;
	padding: 4px 0 4px 18px;
	border-left: 3px solid var(--pix-accent-soft);
	color: var(--pix-text-secondary);
}

.manuscript-preview :deep(.markdown-body table) {
	width: 100%;
	margin: 20px 0;
	border-collapse: collapse;
	font-family: var(--pix-font-ui);
	font-size: 12px;
}

.manuscript-preview :deep(.markdown-body th),
.manuscript-preview :deep(.markdown-body td) {
	padding: 8px 10px;
	border: 1px solid var(--pix-border-light);
	text-align: left;
}

.manuscript-preview :deep(.markdown-body th) {
	background: var(--pix-bg-subtle);
	font-weight: 700;
}

.manuscript-preview :deep(.markdown-body img) {
	display: block;
	max-width: 100%;
	max-height: 540px;
	margin: 22px auto;
	object-fit: contain;
}

.manuscript-preview :deep(.markdown-body a) {
	color: var(--pix-accent);
	text-decoration: underline;
	text-decoration-color: var(--pix-accent-soft);
	text-underline-offset: 2px;
}

.manuscript-preview :deep(.markdown-body code) {
	padding: 1px 4px;
	background: var(--pix-bg-code);
	font-family: var(--pix-font-mono);
	font-size: 0.88em;
}

.support-rail {
	display: flex;
	flex-direction: column;
	gap: 18px;
}

.support-section {
	padding-bottom: 18px;
	border-bottom: 1px solid var(--pix-border);
}

.support-section h3 {
	margin-top: 7px;
	font-size: 17px;
}

.support-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	min-height: 45px;
	padding: 7px 0;
	border-bottom: 1px solid var(--pix-border-light);
	color: var(--pix-text-secondary);
	text-align: left;
}

.support-item:hover {
	color: var(--pix-accent);
}

.support-list {
	max-height: 240px;
	overflow-y: auto;
}

.support-item:disabled,
.support-item.support-item-disabled {
	color: var(--pix-text-muted);
	cursor: default;
	opacity: 0.55;
}

.support-item:disabled:hover,
.support-item.support-item-disabled:hover {
	color: var(--pix-text-muted);
}

.support-item > span:nth-child(2) {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	flex: 1;
}

.support-item strong,
.support-item small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.support-item strong {
	font-size: 11px;
	font-weight: 600;
}

.support-item small,
.support-empty {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.support-empty {
	padding-top: 10px;
}

.manuscript-note {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	border-bottom: 0;
	color: var(--pix-text-muted);
	font-size: 11px;
	line-height: 1.55;
}

.manuscript-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 9px;
	max-width: 1220px;
	min-height: 330px;
	margin: 30px auto 0;
	border: 1px dashed var(--pix-border);
	background: var(--pix-bg-content);
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.manuscript-empty .mdi {
	color: var(--pix-text-muted);
	font-size: 33px;
}

.manuscript-empty strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 17px;
	font-weight: 500;
}

@media (max-width: 980px) {
	.manuscript-layout {
		grid-template-columns: 1fr;
	}

	.support-rail {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
}

@media (max-width: 680px) {
	.manuscript-view {
		padding: 24px 18px 36px;
	}

	.view-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.document-heading {
		padding: 22px 20px 18px;
	}

	.manuscript-preview :deep(.preview-text) {
		padding: 26px 20px 46px;
	}

	.support-rail {
		display: flex;
	}
}
</style>
