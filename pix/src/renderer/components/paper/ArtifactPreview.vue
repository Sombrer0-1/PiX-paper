<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePaperStore } from "../../stores/paper-store";
import { renderMarkdown } from "../../utils/markdown";
import type { PaperArtifactContent } from "../../../shared/types";

const props = defineProps<{
	artifactId: string;
	revisionId?: string;
	compact?: boolean;
}>();

const emit = defineEmits<{
	openExternal: [artifactId: string];
}>();

const paperStore = usePaperStore();
const loading = ref(false);
const error = ref<string | null>(null);
const content = ref<PaperArtifactContent | null>(null);
const expanded = ref(false);
let loadToken = 0;

const PREVIEW_MAX_CHARS = 12_000;
const PREVIEW_MAX_LINES = 180;

const textContent = computed(() => content.value?.content ?? "");
const isTruncated = computed(() => content.value?.truncated === true);
const textStats = computed(() => {
	const text = textContent.value;
	return {
		characters: text.length,
		lines: text ? text.split(/\r?\n/).length : 0,
	};
});
const isLongText = computed(() =>
	textStats.value.characters > PREVIEW_MAX_CHARS || textStats.value.lines > PREVIEW_MAX_LINES,
);
const displayText = computed(() => {
	const text = textContent.value;
	if (expanded.value || !isLongText.value) return text;

	const lines = text.split(/\r?\n/);
	let preview = lines.slice(0, PREVIEW_MAX_LINES).join("\n");
	if (preview.length > PREVIEW_MAX_CHARS) preview = preview.slice(0, PREVIEW_MAX_CHARS);
	return `${preview.trimEnd()}\n\n...`;
});
const hiddenTextSummary = computed(() => {
	if (textStats.value.lines > PREVIEW_MAX_LINES) {
		return `已显示前 ${PREVIEW_MAX_LINES} 行，剩余约 ${textStats.value.lines - PREVIEW_MAX_LINES} 行`;
	}
	return `已显示前 ${PREVIEW_MAX_CHARS.toLocaleString()} 个字符，剩余约 ${Math.max(0, textStats.value.characters - PREVIEW_MAX_CHARS).toLocaleString()} 个字符`;
});

async function load(): Promise<void> {
	const token = ++loadToken;
	loading.value = true;
	error.value = null;
	try {
		const nextContent = await paperStore.readArtifact(props.artifactId, props.revisionId);
		if (token !== loadToken) return;
		content.value = nextContent;
	} catch (err) {
		if (token !== loadToken) return;
		content.value = null;
		error.value = err instanceof Error ? err.message : "读取产物失败";
	} finally {
		if (token === loadToken) loading.value = false;
	}
}

function handleExternalLink(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof HTMLAnchorElement)) return;
	const href = target.getAttribute("href");
	if (!href || !/^https?:|^mailto:/i.test(href)) return;
	event.preventDefault();
	if (window.pixApi) window.pixApi.openExternal(href);
}

function toggleExpanded(): void {
	expanded.value = !expanded.value;
}

watch(() => [props.artifactId, props.revisionId], () => {
	expanded.value = false;
	void load();
}, { immediate: true });
</script>

<template>
	<section class="artifact-preview" :class="{ compact }" aria-live="polite">
		<div class="preview-toolbar">
			<div class="preview-path">{{ content?.path ?? artifactId }}</div>
			<button type="button" class="icon-button" title="刷新预览" aria-label="刷新预览" :disabled="loading" @click="load"><span class="mdi mdi-refresh" aria-hidden="true"></span></button>
			<button type="button" class="icon-button" title="用系统程序打开" aria-label="用系统程序打开" @click="emit('openExternal', artifactId)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span></button>
		</div>

		<div v-if="loading" class="preview-state">正在读取产物...</div>
		<div v-else-if="error" class="preview-state error-state">{{ error }}</div>
		<div v-else-if="!content" class="preview-state">暂无可用预览。</div>
		<div v-else-if="content.kind === 'text' || content.kind === 'json'" class="preview-text">
			<div v-if="content.truncated" class="preview-warning">文件较大，预览内容已截断。</div>
			<div v-if="isLongText" class="preview-summary">
				<span>{{ expanded ? `已${isTruncated ? '展开预览' : '展开'} ${textStats.characters.toLocaleString()} 个字符` : `${hiddenTextSummary}。` }}</span>
				<button type="button" class="preview-toggle" :aria-expanded="expanded" @click="toggleExpanded">
					<span class="mdi" :class="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" aria-hidden="true"></span>
					{{ expanded ? (isTruncated ? '收起预览' : '收起全文') : (isTruncated ? '展开预览' : '展开全文') }}
				</button>
			</div>
			<div v-if="content.mimeType === 'text/markdown'" class="markdown-body" v-html="renderMarkdown(displayText)" @click="handleExternalLink"></div>
			<pre v-else>{{ displayText }}</pre>
		</div>
		<img v-else-if="content.kind === 'image' && content.dataUrl" class="preview-image" :src="content.dataUrl" :alt="content.path" />
		<iframe v-else-if="content.kind === 'pdf' && content.dataUrl" class="preview-pdf" :src="content.dataUrl" :title="content.path"></iframe>
		<div v-else class="preview-state">
			<p>PiX-paper 暂不支持预览此文件类型。</p>
			<button type="button" class="text-button" @click="emit('openExternal', artifactId)">用系统程序打开</button>
		</div>
	</section>
</template>

<style scoped>
.artifact-preview {
	display: flex;
	flex-direction: column;
	min-height: 0;
	height: 100%;
	background: var(--pix-bg-content);
}

.artifact-preview.compact {
	min-height: 0;
}

.artifact-preview.compact .preview-toolbar {
	min-height: 30px;
	padding: 0 8px;
}

.artifact-preview.compact .preview-text {
	max-height: min(260px, 34vh);
	padding: 10px;
}

.artifact-preview.compact .preview-summary {
	margin: -10px -10px 8px;
}

.artifact-preview.compact .preview-image {
	max-height: 180px;
}

.preview-toolbar {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 38px;
	padding: 0 var(--pix-space-md);
	border-bottom: 1px solid var(--pix-border-light);
	flex-shrink: 0;
}

.preview-path {
	flex: 1;
	min-width: 0;
	font-size: var(--pix-text-xs);
	color: var(--pix-text-secondary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--pix-font-mono);
}

.icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border: 1px solid transparent;
	border-radius: var(--pix-radius-sm);
	background: transparent;
	color: var(--pix-text-secondary);
	cursor: pointer;
}

.icon-button:hover:not(:disabled) {
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.icon-button:disabled {
	opacity: 0.45;
	cursor: wait;
}

.preview-state {
	display: grid;
	place-items: center;
	gap: var(--pix-space-sm);
	min-height: 160px;
	padding: var(--pix-space-lg);
	color: var(--pix-text-muted);
	text-align: center;
}

.error-state {
	color: var(--pix-error);
}

.preview-warning {
	padding: var(--pix-space-sm) var(--pix-space-md);
	flex-shrink: 0;
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
	font-size: var(--pix-text-xs);
}

.preview-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-height: 0;
	max-height: min(620px, 58vh);
	overflow: auto;
	padding: var(--pix-space-xl);
}

.preview-summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-shrink: 0;
	margin: calc(var(--pix-space-xl) * -1) calc(var(--pix-space-xl) * -1) var(--pix-space-md);
	padding: 8px var(--pix-space-md);
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-bg-subtle);
	color: var(--pix-text-muted);
	font-size: var(--pix-text-xs);
}

.preview-toggle {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	flex-shrink: 0;
	color: var(--pix-accent);
	font-size: var(--pix-text-xs);
	font-weight: 600;
}

.preview-toggle:hover {
	color: var(--pix-text-primary);
}

.preview-text pre {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	font-family: var(--pix-font-mono);
	font-size: var(--pix-text-xs);
	line-height: var(--pix-leading-base);
	color: var(--pix-text-primary);
}

.preview-image {
	display: block;
	max-width: 100%;
	max-height: 100%;
	margin: auto;
	object-fit: contain;
}

.preview-pdf {
	width: 100%;
	height: 100%;
	border: 0;
}

.text-button {
	padding: 6px 10px;
	border: 1px solid var(--pix-border);
	border-radius: var(--pix-radius-sm);
	background: var(--pix-bg-content);
	color: var(--pix-accent);
	cursor: pointer;
}
</style>
