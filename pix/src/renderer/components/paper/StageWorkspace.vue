<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import ArtifactRelationsPanel from "./ArtifactRelationsPanel.vue";
import { PAPER_STAGES, artifactName, artifactTypeLabel, elapsedForStage, formatDate, primaryArtifact, stageLabel, statusLabel } from "../../utils/paper";
import type { Artifact, StageId } from "../../../shared/types";

const props = defineProps<{ stage: StageId }>();

const router = useRouter();
const paperStore = usePaperStore();
const selectedArtifactId = ref<string | null>(null);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
	timer = setInterval(() => { now.value = Date.now(); }, 10_000);
});

onUnmounted(() => {
	if (timer) clearInterval(timer);
});

const stage = computed(() => paperStore.stages?.[props.stage] ?? null);
const artifacts = computed(() => paperStore.artifactsOf(props.stage));
const selectedArtifact = computed(() => artifacts.value.find((artifact) => artifact.id === selectedArtifactId.value) ?? primaryArtifact(artifacts.value));
const stageMeta = computed(() => PAPER_STAGES.find((item) => item.id === props.stage));
const activities = computed(() => (paperStore.progress?.activities ?? []).filter((activity) => activity.stage === props.stage).sort((a, b) => b.at - a.at).slice(0, 12));
const currentRevision = computed(() => {
	const id = selectedArtifact.value?.latestRevisionId;
	return id ? paperStore.progress?.artifactRevisions.find((revision) => revision.id === id) : undefined;
});

function chooseArtifact(artifact: Artifact): void {
	selectedArtifactId.value = artifact.id;
	paperStore.selectArtifact(artifact.id);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}

function openArtifactRoute(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function startStage(): void {
	void paperStore.startStage(props.stage);
}

function pauseStage(): void {
	void paperStore.pauseStage(props.stage, "Paused from the research desk");
}

function resumeStage(): void {
	void paperStore.resumeStage(props.stage);
}

function stageActionLabel(): string {
	if (stage.value?.status === "paused") return "恢复阶段";
	if (stage.value?.status === "pending") return "启动阶段";
	return "阶段运行中";
}

function activityLabel(kind: string): string {
	switch (kind) {
		case "started": return "阶段开始";
		case "resumed": return "阶段恢复";
		case "paused": return "阶段暂停";
		case "artifact": return "产物更新";
		case "gate_requested": return "提交审核";
		case "gate_decided": return "审核决策";
		case "error": return "错误";
		default: return "活动";
	}
}
</script>

<template>
	<div class="paper-view stage-view">
		<header class="view-header">
			<div>
				<button type="button" class="back-link" @click="router.push('/workspace/dashboard')">
					<span class="mdi mdi-arrow-left" aria-hidden="true"></span> 项目概览
				</button>
				<div class="eyebrow">研究阶段</div>
				<h1>{{ stageMeta?.label ?? stageLabel(props.stage) }}</h1>
				<p class="view-subtitle">{{ stageMeta?.description }}</p>
			</div>
			<div class="stage-view-actions">
				<button
					v-if="stage?.status === 'running'"
					type="button"
					class="button button-quiet"
					:disabled="paperStore.pendingOperations.pauseStage"
					@click="pauseStage"
				>
					<span class="mdi mdi-pause" aria-hidden="true"></span> 暂停
				</button>
				<button
					v-else-if="stage?.status === 'paused'"
					type="button"
					class="button button-primary"
					:disabled="paperStore.pendingOperations.resumeStage"
					@click="resumeStage"
				>
					<span class="mdi mdi-play" aria-hidden="true"></span> 恢复
				</button>
				<button
					v-else-if="stage?.status === 'pending'"
					type="button"
					class="button button-primary"
					:disabled="paperStore.pendingOperations.startStage"
					@click="startStage"
				>
					<span class="mdi mdi-play" aria-hidden="true"></span> {{ stageActionLabel() }}
				</button>
				<span v-else class="stage-status-badge" :class="stage?.status">{{ statusLabel(stage?.status) }}</span>
			</div>
		</header>

		<div class="stage-summary-strip">
			<div><span>状态</span><strong>{{ statusLabel(stage?.status) }}</strong></div>
			<div><span>耗时</span><strong>{{ elapsedForStage(stage, now) }}</strong></div>
			<div><span>产物</span><strong>{{ artifacts.length }} 项</strong></div>
			<div><span>最近更新</span><strong>{{ formatDate(stage?.lastActivityAt) }}</strong></div>
		</div>

		<div class="stage-content-grid">
			<section class="stage-artifact-section">
				<div class="section-heading">
					<div>
						<h2>阶段产物</h2>
						<p>选择产物后在应用内预览，避免离开研究台。</p>
					</div>
					<span class="artifact-count">{{ artifacts.length }}</span>
				</div>

				<div v-if="artifacts.length > 0" class="artifact-table">
					<button
						v-for="artifact in artifacts"
						:key="artifact.id"
						type="button"
						class="artifact-row"
						:class="{ selected: selectedArtifact?.id === artifact.id }"
						@click="chooseArtifact(artifact)"
					>
						<span class="artifact-type-icon mdi" :class="artifact.type === 'figure' ? 'mdi-chart-box-outline' : artifact.type === 'paper' ? 'mdi-file-document-outline' : 'mdi-file-outline'" aria-hidden="true"></span>
						<span class="artifact-row-copy">
							<strong>{{ artifactName(artifact.path) }}</strong>
							<span>{{ artifactTypeLabel(artifact.type) }} · {{ artifact.role === 'primary' ? '主产物' : '支撑产物' }}</span>
						</span>
						<span class="artifact-row-meta">
							<span>{{ formatDate(artifact.createdAt) }}</span>
							<span class="mdi mdi-open-in-new" title="在独立页面查看" aria-hidden="true" @click.stop="openArtifactRoute(artifact.id)"></span>
						</span>
					</button>
				</div>
				<div v-else class="empty-panel">
					<span class="mdi mdi-file-plus-outline" aria-hidden="true"></span>
					<div><strong>本阶段尚无产物</strong><span>agent 完成工作后会在这里登记主产物和支撑材料。</span></div>
				</div>

				<div class="activity-block">
					<div class="section-heading compact-heading">
						<div><h2>阶段记录</h2><p>仅显示当前阶段的关键状态变化。</p></div>
					</div>
					<div v-if="activities.length > 0" class="timeline">
						<div v-for="activity in activities" :key="activity.id" class="timeline-row">
							<span class="timeline-dot" :class="activity.kind"></span>
							<div><strong>{{ activityLabel(activity.kind) }}</strong><span>{{ activity.message }}</span></div>
							<time>{{ formatDate(activity.at) }}</time>
						</div>
					</div>
					<div v-else class="small-empty">暂无阶段记录</div>
				</div>
			</section>

			<section class="artifact-inspector" aria-label="Artifact preview">
				<div v-if="selectedArtifact" class="inspector-heading">
					<div>
						<span class="eyebrow">当前产物</span>
						<h2>{{ artifactName(selectedArtifact.path) }}</h2>
						<p>{{ artifactTypeLabel(selectedArtifact.type) }} · {{ currentRevision?.revision ? `修订 ${currentRevision.revision}` : '尚未生成修订' }}</p>
					</div>
					<div class="inspector-actions">
						<button type="button" class="icon-button" title="用系统程序打开" aria-label="用系统程序打开" @click="openExternal(selectedArtifact.id)">
							<span class="mdi mdi-open-in-new" aria-hidden="true"></span>
						</button>
					</div>
				</div>
				<div v-if="selectedArtifact" class="preview-frame">
					<ArtifactPreview :artifact-id="selectedArtifact.id" @open-external="openExternal" />
				</div>
				<ArtifactRelationsPanel v-if="selectedArtifact" :artifact="selectedArtifact" :artifacts="paperStore.artifacts" compact @open-artifact="openArtifactRoute" />
				<div v-else class="preview-empty">
					<span class="mdi mdi-eye-off-outline" aria-hidden="true"></span>
					<strong>选择一个产物开始审核</strong>
					<span>阶段产物会在这里以内联方式显示。</span>
				</div>
			</section>
		</div>
	</div>
</template>

<style scoped>
.stage-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.view-header,
.stage-content-grid,
.stage-summary-strip,
.stage-artifact-section {
	max-width: 1180px;
	margin-left: auto;
	margin-right: auto;
}

.view-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 24px;
}

.back-link {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-bottom: 20px;
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
	font-size: 20px;
}

.view-subtitle {
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 15px;
}

.stage-view-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 34px;
	padding: 0 12px;
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

.stage-status-badge {
	padding: 7px 10px;
	border-radius: 5px;
	background: var(--pix-bg-subtle);
	color: var(--pix-text-secondary);
	font-size: 11px;
	font-weight: 600;
}

.stage-status-badge.awaiting_gate {
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
}

.stage-status-badge.passed {
	background: var(--pix-success-bg);
	color: var(--pix-success);
}

.stage-summary-strip {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 1px;
	margin-top: 28px;
	border-top: 1px solid var(--pix-border-light);
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-border-light);
}

.stage-summary-strip > div {
	display: flex;
	flex-direction: column;
	gap: 5px;
	padding: 14px 16px;
	background: var(--pix-bg-content);
}

.stage-summary-strip span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.stage-summary-strip strong {
	font-size: 13px;
	font-weight: 600;
}

.stage-content-grid {
	display: grid;
	grid-template-columns: minmax(0, 0.88fr) minmax(380px, 1.12fr);
	gap: 28px;
	margin-top: 34px;
}

.section-heading {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 14px;
	margin-bottom: 14px;
}

.section-heading p {
	margin-top: 4px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.artifact-count {
	color: var(--pix-success);
	font-size: 12px;
	font-weight: 700;
}

.artifact-table {
	border-top: 1px solid var(--pix-border-light);
}

.artifact-row {
	display: flex;
	align-items: center;
	width: 100%;
	gap: 10px;
	min-height: 60px;
	padding: 8px 0;
	border-bottom: 1px solid var(--pix-border-subtle);
	text-align: left;
}

.artifact-row:hover,
.artifact-row.selected {
	background: var(--pix-bg-hover);
}

.artifact-type-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 6px;
	background: var(--pix-accent-light);
	color: var(--pix-accent);
	font-size: 17px;
	flex-shrink: 0;
}

.artifact-row-copy {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	flex: 1;
}

.artifact-row-copy strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--pix-font-ui);
	font-size: 14px;
	font-weight: 500;
}

.artifact-row-copy span,
.artifact-row-meta {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.artifact-row-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	text-align: right;
	white-space: nowrap;
	flex-shrink: 0;
}

.artifact-row-meta .mdi {
	color: var(--pix-accent);
	font-size: 16px;
}

.empty-panel {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 18px;
	border: 1px dashed var(--pix-border);
	border-radius: 7px;
	color: var(--pix-text-muted);
	font-size: 12px;
}

.empty-panel > div {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.empty-panel strong {
	color: var(--pix-text-secondary);
	font-size: 12px;
}

.activity-block {
	margin-top: 34px;
}

.compact-heading {
	margin-bottom: 10px;
}

.timeline {
	border-top: 1px solid var(--pix-border-subtle);
}

.timeline-row {
	display: grid;
	grid-template-columns: 10px minmax(0, 1fr) auto;
	align-items: center;
	gap: 9px;
	min-height: 48px;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.timeline-row > div {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.timeline-row strong {
	font-size: 11px;
	font-weight: 600;
}

.timeline-row span,
.timeline-row time {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.timeline-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--pix-success);
}

.timeline-dot.gate_requested,
.timeline-dot.gate_decided {
	background: var(--pix-warning);
}

.timeline-dot.error {
	background: var(--pix-error);
}

.small-empty {
	padding: 10px 0;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.artifact-inspector {
	display: flex;
	flex-direction: column;
	min-height: 540px;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-subtle);
	overflow: hidden;
}

.inspector-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	min-height: 76px;
	padding: 15px 17px;
	border-bottom: 1px solid var(--pix-border-light);
}

.inspector-heading h2 {
	margin-top: 5px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 360px;
}

.inspector-heading p {
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

.preview-frame {
	display: flex;
	min-height: 0;
	flex: 1;
}

.preview-frame :deep(.artifact-preview) {
	width: 100%;
	min-height: 0;
	flex: 1;
}

.preview-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 8px;
	min-height: 460px;
	padding: 24px;
	color: var(--pix-text-muted);
	text-align: center;
	font-size: 12px;
}

.preview-empty .mdi {
	font-size: 28px;
	color: var(--pix-text-muted);
}

.preview-empty strong {
	color: var(--pix-text-secondary);
	font-size: 13px;
}

@media (max-width: 1040px) {
	.stage-content-grid {
		grid-template-columns: 1fr;
	}

	.artifact-inspector {
		min-height: 460px;
	}
}

@media (max-width: 680px) {
	.stage-view {
		padding: 24px 18px 36px;
	}

	.view-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.stage-summary-strip {
		grid-template-columns: repeat(2, 1fr);
	}
}
</style>
