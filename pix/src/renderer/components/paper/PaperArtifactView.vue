<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import ArtifactRelationsPanel from "./ArtifactRelationsPanel.vue";
import { artifactName, artifactTypeLabel, formatDate, stageLabel } from "../../utils/paper";
import type { ArtifactRevision } from "../../../shared/types";

const route = useRoute();
const router = useRouter();
const paperStore = usePaperStore();

const artifactId = computed(() => typeof route.params.artifactId === "string" ? route.params.artifactId : paperStore.selectedArtifactId);
const artifact = computed(() => artifactId.value ? paperStore.artifacts.find((candidate) => candidate.id === artifactId.value) ?? null : null);
const revisions = computed(() => artifact.value ? paperStore.progress?.artifactRevisions.filter((revision) => revision.artifactId === artifact.value?.id).sort((a, b) => b.revision - a.revision) ?? [] : []);
const selectedRevisionId = ref<string | null>(null);
const compareRevisionId = ref<string | null>(null);
const compareOpen = ref(false);
const previewRevision = computed<ArtifactRevision | undefined>(() => revisions.value.find((revision) => revision.id === selectedRevisionId.value) ?? revisions.value[0]);
const compareRevision = computed<ArtifactRevision | undefined>(() => revisions.value.find((revision) => revision.id === compareRevisionId.value && revision.id !== previewRevision.value?.id));
const revisionSignature = computed(() => `${artifact.value?.id ?? ""}:${revisions.value.map((revision) => revision.id).join(",")}`);

watch(revisionSignature, () => {
	const items = revisions.value;
	const latest = items[0];
	selectedRevisionId.value = latest?.id ?? null;
	const fallback = items.find((revision) => revision.revision < (latest?.revision ?? Number.POSITIVE_INFINITY)) ?? items[1];
	compareRevisionId.value = fallback?.id ?? null;
	compareOpen.value = false;
}, { immediate: true });

function openExternal(): void {
	if (artifact.value) void paperStore.openArtifact(artifact.value.id);
}

function openFolder(): void {
	if (artifact.value) void paperStore.openInFolder(artifact.value.id);
}

function selectRevision(event: Event): void {
	const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
	const selected = revisions.value.find((revision) => revision.id === value) ?? revisions.value[0];
	selectedRevisionId.value = selected?.id ?? null;
	const fallback = revisions.value.find((revision) => revision.revision < (selected?.revision ?? Number.POSITIVE_INFINITY)) ?? revisions.value.find((revision) => revision.id !== selected?.id);
	compareRevisionId.value = fallback?.id ?? null;
}

function toggleCompare(): void {
	if (!compareRevision.value) return;
	compareOpen.value = !compareOpen.value;
}
</script>

<template>
	<div v-if="artifact" class="paper-view artifact-view">
		<header class="artifact-header">
			<div>
				<button type="button" class="back-link" @click="router.push(`/workspace/stage/${artifact.stage}`)"><span class="mdi mdi-arrow-left" aria-hidden="true"></span> 返回 {{ stageLabel(artifact.stage) }}</button>
				<div class="eyebrow">{{ artifactTypeLabel(artifact.type) }}</div>
				<h1>{{ artifactName(artifact.path) }}</h1>
				<p>{{ artifact.path }} · 创建于 {{ formatDate(artifact.createdAt) }}</p>
			</div>
			<div class="artifact-actions"><button type="button" class="icon-button" title="在文件夹中显示" aria-label="在文件夹中显示" @click="openFolder"><span class="mdi mdi-folder-open-outline" aria-hidden="true"></span></button><button type="button" class="button button-quiet" @click="openExternal"><span class="mdi mdi-open-in-new" aria-hidden="true"></span> 用系统程序打开</button></div>
		</header>
		<div class="artifact-meta-strip"><span>{{ artifact.role === 'primary' ? '主产物' : '支撑产物' }}</span><span>{{ revisions.length }} 个修订</span><span v-if="artifact.relations?.length">{{ artifact.relations.length }} 个关系</span></div>
		<div class="artifact-relations-wrap"><ArtifactRelationsPanel :artifact="artifact" :artifacts="paperStore.artifacts" @open-artifact="(id) => router.push(`/workspace/artifact/${id}`)" /></div>
		<section class="artifact-document">
			<div class="document-toolbar">
				<div><span class="mdi mdi-eye-outline" aria-hidden="true"></span> 应用内预览</div>
				<div class="revision-controls" v-if="revisions.length > 0">
					<label><span>版本</span><select :value="previewRevision?.id ?? ''" @change="selectRevision"><option v-for="revision in revisions" :key="revision.id" :value="revision.id">修订 {{ revision.revision }} · {{ formatDate(revision.createdAt) }}</option></select></label>
					<button v-if="compareRevision" type="button" class="text-button" @click="toggleCompare"><span class="mdi mdi-source-branch" aria-hidden="true"></span>{{ compareOpen ? '关闭对比' : '对比修订' }}</button>
				</div>
				<span v-if="previewRevision?.hash">SHA-256 {{ previewRevision.hash.slice(0, 12) }}...</span>
			</div>
			<div class="document-body">
				<div v-if="compareOpen && compareRevision && previewRevision" class="revision-compare">
					<div class="revision-pane"><div class="revision-label">修订 {{ compareRevision.revision }} · 对比版本</div><ArtifactPreview :artifact-id="artifact.id" :revision-id="compareRevision.id" @open-external="openExternal" /></div>
					<div class="revision-pane"><div class="revision-label">修订 {{ previewRevision.revision }} · 当前预览</div><ArtifactPreview :artifact-id="artifact.id" :revision-id="previewRevision.id" @open-external="openExternal" /></div>
				</div>
				<ArtifactPreview v-else :artifact-id="artifact.id" :revision-id="previewRevision?.id" @open-external="openExternal" />
			</div>
		</section>
	</div>
	<div v-else class="paper-view artifact-missing"><span class="mdi mdi-file-question-outline" aria-hidden="true"></span><strong>找不到这个产物</strong><span>它可能已经被移除，或当前项目状态还没有同步。</span><button type="button" class="button button-quiet" @click="router.push('/workspace/dashboard')">返回项目概览</button></div>
</template>

<style scoped>
.artifact-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.artifact-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
	max-width: 1220px;
	margin: 0 auto;
}

.back-link {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-bottom: 18px;
	color: var(--pix-text-secondary);
	font-size: 12px;
}

.back-link:hover {
	color: var(--pix-accent-hover);
}

.eyebrow {
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

h1 {
	margin-top: 7px;
	font-family: var(--pix-font-ui);
	font-size: 32px;
	font-weight: 500;
	letter-spacing: 0;
}

.artifact-header p {
	margin-top: 7px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-family: var(--pix-font-mono);
}

.artifact-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.button,
.icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 34px;
	padding: 0 11px;
	border-radius: 6px;
	font-size: 12px;
	font-weight: 600;
}

.icon-button {
	width: 32px;
	padding: 0;
	border: 1px solid var(--pix-border);
	color: var(--pix-text-secondary);
}

.icon-button:hover,
.button-quiet:hover {
	background: var(--pix-bg-hover);
	color: var(--pix-accent);
}

.button-quiet {
	border: 1px solid var(--pix-border);
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
}

.artifact-meta-strip {
	display: flex;
	align-items: center;
	gap: 15px;
	max-width: 1220px;
	margin: 26px auto 0;
	padding: 10px 0;
	border-top: 1px solid var(--pix-border-light);
	border-bottom: 1px solid var(--pix-border-light);
	color: var(--pix-text-muted);
	font-size: 11px;
}

.artifact-meta-strip span + span {
	padding-left: 15px;
	border-left: 1px solid var(--pix-border);
}

.artifact-document {
	display: flex;
	flex-direction: column;
	max-width: 1220px;
	min-height: 620px;
	margin: 24px auto 0;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-subtle);
	overflow: hidden;
}

.artifact-relations-wrap {
	max-width: 1220px;
	margin: 18px auto 0;
}

.artifact-relations-wrap :deep(.relations-panel) {
	padding-top: 0;
	border-bottom: 0;
}

.document-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-height: 39px;
	padding: 0 14px;
	border-bottom: 1px solid var(--pix-border-light);
	color: var(--pix-text-muted);
	font-size: 11px;
}

.revision-controls {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.revision-controls label {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	color: var(--pix-text-muted);
}

.revision-controls select {
	max-width: 220px;
	min-height: 27px;
	padding: 0 6px;
	border: 1px solid var(--pix-border);
	border-radius: 4px;
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
	font-size: 11px;
}

.text-button {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-height: 27px;
	padding: 0 7px;
	border: 1px solid var(--pix-border);
	border-radius: 4px;
	background: var(--pix-bg-content);
	color: var(--pix-accent);
	font-size: 11px;
}

.text-button:hover {
	background: var(--pix-accent-light);
}

.document-toolbar > div {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: var(--pix-text-secondary);
	font-weight: 600;
}

.document-body {
	display: flex;
	min-height: 0;
	flex: 1;
}

.document-body > .artifact-preview {
	min-height: 580px;
}

.revision-compare {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	width: 100%;
	height: min(700px, calc(100vh - 250px));
	min-height: 580px;
	gap: 1px;
	background: var(--pix-border-light);
}

.revision-pane {
	display: flex;
	flex-direction: column;
	min-width: 0;
	background: var(--pix-bg-content);
}

.revision-label {
	min-height: 31px;
	padding: 8px 12px;
	background: var(--pix-bg-hover);
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 600;
}

.revision-pane :deep(.artifact-preview) {
	min-height: 0;
	flex: 1;
}

.artifact-missing {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 9px;
	height: 100%;
	min-height: 300px;
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.artifact-missing .mdi {
	color: var(--pix-text-muted);
	font-size: 33px;
}

.artifact-missing strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 17px;
	font-weight: 500;
}

@media (max-width: 700px) {
	.artifact-view {
		padding: 24px 18px 36px;
	}

	.artifact-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.artifact-actions {
		width: 100%;
	}

	.document-toolbar {
		align-items: flex-start;
		flex-direction: column;
		padding: 8px 12px;
	}

	.revision-controls {
		width: 100%;
		margin-left: 0;
	}

	.revision-controls select {
		max-width: none;
		flex: 1;
	}

	.revision-compare {
		grid-template-columns: 1fr;
		height: auto;
		min-height: 0;
	}

	.revision-pane {
		min-height: 380px;
	}
}
</style>
