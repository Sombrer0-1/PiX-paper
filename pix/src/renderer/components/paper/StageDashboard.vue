<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { usePaperStore } from "../../stores/paper-store";
import { PAPER_STAGES, artifactName, elapsedForStage, formatRelative, primaryArtifact, stageLabel, statusLabel } from "../../utils/paper";
import type { StageId } from "../../../shared/types";

const emit = defineEmits<{
	openStage: [stage: StageId];
	openGate: [];
	openArtifact: [artifactId: string];
	openInbox: [];
	openAgentLog: [];
}>();

const paperStore = usePaperStore();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
	timer = setInterval(() => { now.value = Date.now(); }, 10_000);
});

onUnmounted(() => {
	if (timer) clearInterval(timer);
});

const stageCards = computed(() => PAPER_STAGES.map((stage) => {
	const state = paperStore.stages?.[stage.id] ?? null;
	const artifacts = paperStore.artifactsOf(stage.id);
	return {
		...stage,
		state,
		artifacts,
		primary: primaryArtifact(artifacts),
		status: statusLabel(state?.status),
		elapsed: elapsedForStage(state, now.value),
	};
}));

const recentActivities = computed(() => [...(paperStore.progress?.activities ?? [])].sort((a, b) => b.at - a.at).slice(0, 6));
const completedCount = computed(() => stageCards.value.filter((stage) => stage.state?.status === "passed").length);
const runningStage = computed(() => stageCards.value.find((stage) => stage.state?.status === "running"));
const attentionText = computed(() => {
	if (paperStore.pendingGate) return `${stageLabel(paperStore.pendingGate.stage)}已完成，等待你的审核`;
	if (runningStage.value) return `${runningStage.value.label}正在运行，agent 会在完成后提交审核`;
	if (completedCount.value === PAPER_STAGES.length) return "五个阶段均已通过，论文项目已完成";
	return "项目已准备好，agent 将按阶段推进研究工作";
});

function activityLabel(kind: string): string {
	switch (kind) {
		case "started": return "阶段开始";
		case "resumed": return "阶段恢复";
		case "paused": return "阶段暂停";
		case "artifact": return "产物更新";
		case "gate_requested": return "提交审核";
		case "gate_decided": return "审核决策";
		case "error": return "运行错误";
		default: return "活动";
	}
}

function activityStage(stage: StageId): string {
	return stageLabel(stage);
}

function stageIndex(stage: StageId): number {
	return PAPER_STAGES.findIndex((item) => item.id === stage);
}
</script>

<template>
	<div class="paper-view dashboard-view">
		<header class="view-header dashboard-header">
			<div>
				<div class="eyebrow">研究项目概览</div>
				<h1>{{ paperStore.config?.name || "未命名项目" }}</h1>
				<p class="view-subtitle">{{ paperStore.topic || "暂无研究主题" }}</p>
			</div>
			<div class="header-actions">
				<button v-if="paperStore.pendingGate" type="button" class="button button-primary" @click="emit('openGate')">
					<span class="mdi mdi-clipboard-check-outline" aria-hidden="true"></span>
					审核阶段产物
				</button>
				<button type="button" class="button button-quiet" @click="emit('openAgentLog')">
					<span class="mdi mdi-console-line" aria-hidden="true"></span>
					查看 Agent 日志
				</button>
			</div>
		</header>

		<section class="attention-banner" :class="{ review: !!paperStore.pendingGate }">
			<span class="attention-icon mdi" :class="paperStore.pendingGate ? 'mdi-eye-outline' : 'mdi-progress-clock'" aria-hidden="true"></span>
			<div class="attention-copy">
				<strong>{{ attentionText }}</strong>
				<span v-if="paperStore.pendingGate">审核是 best-effort 检查之外的人工决策，产物内容应以预览为准。</span>
				<span v-else-if="runningStage">已运行 {{ runningStage.elapsed }}，最近状态会持续同步。</span>
			</div>
			<button v-if="paperStore.openInboxCount > 0" type="button" class="banner-link" @click="emit('openInbox')">查看待处理事项 {{ paperStore.openInboxCount }}</button>
		</section>

		<section class="dashboard-section">
			<div class="section-heading">
				<div>
					<h2>阶段管线</h2>
					<p>每个阶段都有独立的产物、运行记录和审核决策。</p>
				</div>
				<div class="progress-count">{{ completedCount }} / {{ PAPER_STAGES.length }} 已通过</div>
			</div>

			<div class="stage-card-grid">
				<article
					v-for="stage in stageCards"
					:key="stage.id"
					class="stage-card"
					:class="[stage.state?.status ?? 'pending', { selected: paperStore.selectedStage === stage.id }]"
				>
					<button type="button" class="stage-card-main" @click="emit('openStage', stage.id)">
						<div class="stage-card-topline">
						<span class="stage-number">{{ stageIndex(stage.id) + 1 }}</span>
							<span class="stage-status">{{ stage.status }}</span>
						</div>
						<h3>{{ stage.label }}</h3>
						<p>{{ stage.description }}</p>
						<div class="stage-card-meta">
							<span><span class="mdi mdi-clock-outline" aria-hidden="true"></span>{{ stage.elapsed }}</span>
							<span><span class="mdi mdi-file-outline" aria-hidden="true"></span>{{ stage.artifacts.length }} 项产物</span>
						</div>
						<div v-if="stage.primary" class="primary-artifact-line">
							<span class="mdi mdi-star-outline" aria-hidden="true"></span>
							<span>{{ artifactName(stage.primary.path) }}</span>
						</div>
						<div v-else class="primary-artifact-line empty-line">
							<span class="mdi mdi-file-hidden-outline" aria-hidden="true"></span>
							<span>尚无主产物</span>
						</div>
					</button>
					<button v-if="stage.primary" type="button" class="stage-preview-button" @click="emit('openArtifact', stage.primary.id)">
						<span class="mdi mdi-eye-outline" aria-hidden="true"></span>
						预览主产物
					</button>
				</article>
			</div>
		</section>

		<section class="dashboard-section activity-section">
			<div class="section-heading">
				<div>
					<h2>最近活动</h2>
					<p>结果优先显示；需要排查过程时再打开 Agent 日志。</p>
				</div>
				<button type="button" class="text-link" @click="emit('openAgentLog')">打开完整日志 <span class="mdi mdi-arrow-right" aria-hidden="true"></span></button>
			</div>
			<div v-if="recentActivities.length > 0" class="activity-list">
				<div v-for="activity in recentActivities" :key="activity.id" class="activity-row">
					<span class="activity-dot" :class="activity.kind"></span>
					<div class="activity-copy">
						<strong>{{ activityLabel(activity.kind) }}</strong>
						<span>{{ activityStage(activity.stage) }} · {{ activity.message }}</span>
					</div>
					<time>{{ formatRelative(activity.at, now) }}</time>
				</div>
			</div>
			<div v-else class="empty-panel">
				<span class="mdi mdi-timeline-outline" aria-hidden="true"></span>
				<span>项目运行后，阶段活动会显示在这里。</span>
			</div>
		</section>
	</div>
</template>

<style scoped>
.paper-view {
	min-height: 100%;
	padding: 34px 42px 48px;
	background: var(--pix-bg-content);
}

.view-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 24px;
	max-width: 1180px;
	margin: 0 auto;
}

.eyebrow {
	margin-bottom: 8px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.09em;
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
	font-size: 36px;
	line-height: 1.15;
}

.view-subtitle {
	max-width: 680px;
	margin-top: 9px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 16px;
	line-height: 1.55;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	padding-top: 14px;
}

.button,
.text-link,
.banner-link {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
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

.attention-banner {
	display: flex;
	align-items: center;
	gap: 13px;
	max-width: 1180px;
	margin: 30px auto 0;
	padding: 14px 16px;
	border: 1px solid var(--pix-success-light);
	border-radius: 8px;
	background: var(--pix-success-bg);
	color: var(--pix-accent);
}

.attention-banner.review {
	border-color: var(--pix-warning-light);
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
}

.attention-icon {
	font-size: 22px;
	flex-shrink: 0;
}

.attention-copy {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	flex: 1;
}

.attention-copy strong {
	font-size: 13px;
	font-weight: 600;
}

.attention-copy span {
	color: var(--pix-text-secondary);
	font-size: 11px;
}

.banner-link {
	min-height: 28px;
	padding: 0 8px;
	color: inherit;
	white-space: nowrap;
}

.dashboard-section {
	max-width: 1180px;
	margin: 38px auto 0;
}

.section-heading {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
	margin-bottom: 16px;
}

h2 {
	font-size: 21px;
	line-height: 1.25;
}

.section-heading p {
	margin-top: 5px;
	color: var(--pix-text-muted);
	font-size: 12px;
}

.progress-count {
	color: var(--pix-text-secondary);
	font-size: 12px;
	font-weight: 600;
}

.stage-card-grid {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 10px;
}

.stage-card {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 220px;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-content);
	transition: border-color var(--pix-transition-fast), background-color var(--pix-transition-fast);
}

.stage-card:hover {
	border-color: var(--pix-accent-soft);
	background: var(--pix-bg-hover);
}

.stage-card.selected {
	border-color: var(--pix-accent);
	box-shadow: inset 3px 0 0 var(--pix-accent);
}

.stage-card.awaiting_gate {
	border-color: var(--pix-warning-light);
	background: var(--pix-warning-bg);
}

.stage-card-main {
	display: flex;
	flex: 1;
	flex-direction: column;
	align-items: stretch;
	min-width: 0;
	padding: 16px;
	text-align: left;
}

.stage-card-topline {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.stage-number {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	background: var(--pix-bg-subtle);
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
}

.stage-card.passed .stage-number {
	background: var(--pix-success-light);
	color: var(--pix-success);
}

.stage-card.running .stage-number {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.stage-card.awaiting_gate .stage-number {
	background: var(--pix-warning-light);
	color: var(--pix-warning);
}

.stage-status {
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 600;
}

.stage-card.running .stage-status {
	color: var(--pix-success);
}

.stage-card.awaiting_gate .stage-status {
	color: var(--pix-warning);
}

.stage-card h3 {
	margin-top: 17px;
	font-size: 18px;
	line-height: 1.2;
}

.stage-card p {
	margin-top: 8px;
	color: var(--pix-text-muted);
	font-size: 11px;
	line-height: 1.5;
}

.stage-card-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 7px;
	margin-top: auto;
	padding-top: 18px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.stage-card-meta span,
.primary-artifact-line {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.primary-artifact-line {
	min-width: 0;
	margin-top: 12px;
	padding-top: 10px;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	font-size: 11px;
}

.primary-artifact-line span:last-child {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.primary-artifact-line.empty-line {
	color: var(--pix-text-muted);
}

.stage-preview-button {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 32px;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-accent);
	font-size: 11px;
	font-weight: 600;
}

.stage-preview-button:hover {
	background: var(--pix-accent-light);
}

.text-link {
	padding: 0;
	color: var(--pix-accent);
}

.text-link:hover {
	color: var(--pix-accent-hover);
}

.activity-section {
	padding-bottom: 12px;
}

.activity-list {
	border-top: 1px solid var(--pix-border-subtle);
}

.activity-row {
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 54px;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.activity-dot {
	width: 8px;
	height: 8px;
	margin-left: 4px;
	border-radius: 50%;
	background: var(--pix-text-muted);
	flex-shrink: 0;
}

.activity-dot.gate_requested,
.activity-dot.gate_decided {
	background: var(--pix-warning);
}

.activity-dot.artifact {
	background: var(--pix-success);
}

.activity-dot.error {
	background: var(--pix-error);
}

.activity-copy {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	flex: 1;
}

.activity-copy strong {
	font-size: 12px;
	font-weight: 600;
}

.activity-copy span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.activity-row time {
	color: var(--pix-text-muted);
	font-size: 11px;
	white-space: nowrap;
}

.empty-panel {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 90px;
	padding: 16px;
	border: 1px dashed var(--pix-border);
	border-radius: 8px;
	color: var(--pix-text-muted);
	font-size: 12px;
}

@media (max-width: 1180px) {
	.paper-view {
		padding-left: 28px;
		padding-right: 28px;
	}

	.stage-card-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

@media (max-width: 720px) {
	.paper-view {
		padding: 24px 18px 36px;
	}

	h1 {
		font-size: 28px;
	}

	.view-header,
	.section-heading {
		align-items: flex-start;
		flex-direction: column;
	}

	.header-actions {
		padding-top: 0;
	}

	.stage-card-grid {
		grid-template-columns: 1fr;
	}

	.attention-banner {
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.banner-link {
		margin-left: 35px;
	}
}
</style>
