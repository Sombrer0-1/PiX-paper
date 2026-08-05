<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import { artifactName, artifactTypeLabel, elapsedForStage, formatDate, formatRelative, primaryArtifact, stageLabel, statusLabel } from "../../utils/paper";
import type { StageId } from "../../../shared/types";

const props = defineProps<{ selectedStage: StageId | null }>();
const emit = defineEmits<{ openInbox: []; openAgentLog: [] }>();

const router = useRouter();
const paperStore = usePaperStore();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
	timer = setInterval(() => { now.value = Date.now(); }, 10_000);
});

onUnmounted(() => {
	if (timer) clearInterval(timer);
});

const focusStage = computed<StageId | null>(() => props.selectedStage ?? paperStore.currentStage);
const focusState = computed(() => focusStage.value ? paperStore.stages?.[focusStage.value] ?? null : null);
const focusArtifacts = computed(() => focusStage.value ? paperStore.artifactsOf(focusStage.value) : []);
const focusRun = computed(() => {
	const id = focusState.value?.runId;
	return id ? paperStore.progress?.stageRuns.find((run) => run.id === id) : undefined;
});
const openInboxItems = computed(() => paperStore.inbox.items.filter((item) => item.status !== "resolved").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4));
const recentActivities = computed(() => [...(paperStore.progress?.activities ?? [])].sort((a, b) => b.at - a.at).slice(0, 4));

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openGate(): void {
	if (!paperStore.pendingGate) return;
	void router.push("/workspace/gate");
}

function pauseStage(): void {
	if (!focusStage.value) return;
	void paperStore.pauseStage(focusStage.value, "Paused from the inspector");
}

function resumeStage(): void {
	if (!focusStage.value) return;
	void paperStore.resumeStage(focusStage.value);
}

function startStage(): void {
	if (!focusStage.value) return;
	void paperStore.startStage(focusStage.value);
}

function activityLabel(kind: string): string {
	switch (kind) {
		case "artifact": return "产物更新";
		case "gate_requested": return "提交审核";
		case "gate_decided": return "审核决策";
		case "error": return "错误";
		default: return "阶段活动";
	}
}
</script>

<template>
	<aside class="paper-inspector">
		<div class="inspector-scroll">
			<section v-if="paperStore.pendingGate" class="inspector-alert">
				<div class="alert-title"><span class="mdi mdi-eye-outline" aria-hidden="true"></span><strong>等待你的审核</strong></div>
				<p>{{ stageLabel(paperStore.pendingGate.stage) }}的产物已经准备好。</p>
				<button type="button" class="alert-button" @click="openGate">打开审核工作区 <span class="mdi mdi-arrow-right" aria-hidden="true"></span></button>
			</section>

			<section class="inspector-section project-section">
				<div class="section-label">项目状态</div>
				<div class="project-status-row"><span class="status-dot" :class="paperStore.currentStageState?.status"></span><strong>{{ paperStore.currentStage ? stageLabel(paperStore.currentStage) : '未开始' }}</strong><span>{{ statusLabel(paperStore.currentStageState?.status) }}</span></div>
				<div class="project-stat-grid"><div><span>已通过</span><strong>{{ Object.values(paperStore.stages ?? {}).filter((stage) => stage.status === 'passed').length }} / 5</strong></div><div><span>待处理</span><strong>{{ paperStore.openInboxCount }}</strong></div></div>
			</section>

			<section v-if="focusStage" class="inspector-section">
				<div class="section-heading"><div><div class="section-label">当前阶段</div><h2>{{ stageLabel(focusStage) }}</h2></div><button type="button" class="icon-button" title="打开阶段工作区" aria-label="打开阶段工作区" @click="router.push(`/workspace/stage/${focusStage}`)"><span class="mdi mdi-open-in-new" aria-hidden="true"></span></button></div>
				<div class="focus-status"><span class="status-pill" :class="focusState?.status">{{ statusLabel(focusState?.status) }}</span><span>{{ elapsedForStage(focusState, now) }}</span></div>
				<div v-if="focusState?.status === 'running'" class="focus-control"><button type="button" class="control-button" :disabled="paperStore.pendingOperations.pauseStage" @click="pauseStage"><span class="mdi mdi-pause" aria-hidden="true"></span>暂停 agent</button></div>
				<div v-else-if="focusState?.status === 'paused'" class="focus-control"><button type="button" class="control-button primary" :disabled="paperStore.pendingOperations.resumeStage" @click="resumeStage"><span class="mdi mdi-play" aria-hidden="true"></span>恢复 agent</button></div>
				<div v-else-if="focusState?.status === 'pending'" class="focus-control"><button type="button" class="control-button primary" :disabled="paperStore.pendingOperations.startStage" @click="startStage"><span class="mdi mdi-play" aria-hidden="true"></span>启动阶段</button></div>
				<div class="focus-stats"><div><span>主产物</span><strong>{{ primaryArtifact(focusArtifacts) ? artifactName(primaryArtifact(focusArtifacts)!.path) : '暂无' }}</strong></div><div><span>运行成本</span><strong>{{ focusRun?.usage?.cost ? `$${focusRun.usage.cost.toFixed(3)}` : '暂无' }}</strong></div></div>
			</section>

			<details v-if="focusArtifacts.length > 0" class="inspector-details">
				<summary class="inspector-summary">
					<div class="section-heading"><div><div class="section-label">阶段产物</div><h2>{{ focusArtifacts.length }} 项</h2></div><span class="mdi mdi-chevron-down details-chevron" aria-hidden="true"></span></div>
				</summary>
				<div class="inspector-details-body">
					<button type="button" class="text-button details-action" @click.stop="router.push(`/workspace/stage/${focusStage}`)">查看全部</button>
					<div class="inspector-artifact-list">
						<button v-for="artifact in focusArtifacts.slice(0, 5)" :key="artifact.id" type="button" class="inspector-artifact" @click="openArtifact(artifact.id)"><span class="mdi mdi-file-outline" aria-hidden="true"></span><span><strong>{{ artifactName(artifact.path) }}</strong><small>{{ artifactTypeLabel(artifact.type) }}</small></span><span class="mdi mdi-chevron-right" aria-hidden="true"></span></button>
					</div>
				</div>
			</details>

			<details class="inspector-details" :open="paperStore.openInboxCount > 0">
				<summary class="inspector-summary">
					<div class="section-heading"><div><div class="section-label">待你处理</div><h2>{{ paperStore.openInboxCount }} 项</h2></div><span class="mdi mdi-chevron-down details-chevron" aria-hidden="true"></span></div>
				</summary>
				<div class="inspector-details-body">
					<button type="button" class="text-button details-action" @click.stop="emit('openInbox')">查看收件箱</button>
					<div v-if="openInboxItems.length > 0" class="inbox-mini-list">
						<button v-for="item in openInboxItems" :key="item.id" type="button" class="inbox-mini-item" @click="item.kind === 'gate' ? openGate() : emit('openInbox')"><span class="inbox-mini-dot" :class="item.severity"></span><span><strong>{{ item.title }}</strong><small>{{ formatRelative(item.updatedAt, now) }}</small></span></button>
					</div>
					<div v-else class="small-empty">当前没有需要处理的事项。</div>
				</div>
			</details>

			<details class="inspector-details recent-section">
				<summary class="inspector-summary">
					<div class="section-heading"><div><div class="section-label">最近活动</div></div><span class="mdi mdi-chevron-down details-chevron" aria-hidden="true"></span></div>
				</summary>
				<div class="inspector-details-body">
					<button type="button" class="icon-button details-log-button" title="打开 Agent 日志" aria-label="打开 Agent 日志" @click.stop="emit('openAgentLog')"><span class="mdi mdi-console-line" aria-hidden="true"></span></button>
					<div class="recent-list"><div v-for="activity in recentActivities" :key="activity.id" class="recent-row"><span class="recent-dot" :class="activity.kind"></span><span><strong>{{ activityLabel(activity.kind) }}</strong><small>{{ activity.message }}</small></span></div><div v-if="recentActivities.length === 0" class="small-empty">暂无活动</div></div>
				</div>
			</details>
		</div>
	</aside>
</template>

<style scoped>
.paper-inspector {
	width: 300px;
	min-width: 300px;
	height: 100%;
	border-left: 1px solid var(--pix-border-light);
	background: var(--pix-bg-right);
}

.inspector-scroll {
	height: 100%;
	overflow-y: auto;
	padding: 24px 17px 30px;
}

.inspector-alert {
	padding: 13px;
	border: 1px solid var(--pix-warning-light);
	border-radius: 7px;
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
}

.alert-title,
.project-status-row,
.focus-status,
.focus-control,
.section-heading {
	display: flex;
	align-items: center;
}

.alert-title {
	gap: 7px;
	font-size: 12px;
}

.alert-title .mdi {
	font-size: 17px;
}

.inspector-alert p {
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-size: 11px;
	line-height: 1.45;
}

.alert-button {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	margin-top: 10px;
	padding: 7px 8px;
	border-radius: 5px;
	background: var(--pix-warning-light);
	color: var(--pix-warning);
	font-size: 11px;
	font-weight: 600;
}

.alert-button:hover {
	background: var(--pix-warning-light);
}

.inspector-section,
.inspector-details {
	padding: 20px 0;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.inspector-section:first-of-type {
	padding-top: 18px;
}

.section-label {
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.project-status-row {
	gap: 7px;
	margin-top: 9px;
	font-size: 12px;
}

.project-status-row > span:last-child {
	margin-left: auto;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.status-dot,
.recent-dot,
.inbox-mini-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--pix-text-muted);
	flex-shrink: 0;
}

.status-dot.running,
.status-dot.paused {
	background: var(--pix-success);
}

.status-dot.awaiting_gate {
	background: var(--pix-warning);
}

.status-dot.passed {
	background: var(--pix-success);
}

.project-stat-grid,
.focus-stats {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	margin-top: 15px;
}

.project-stat-grid > div,
.focus-stats > div {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	padding: 9px;
	border-radius: 5px;
	background: var(--pix-bg-subtle);
}

.project-stat-grid span,
.focus-stats span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.project-stat-grid strong,
.focus-stats strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 12px;
	font-weight: 600;
}

.section-heading {
	justify-content: space-between;
	gap: 8px;
	align-items: flex-start;
}

h2 {
	margin-top: 5px;
	font-family: var(--pix-font-ui);
	font-size: 17px;
	font-weight: 500;
	letter-spacing: 0;
}

.icon-button,
.text-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 26px;
	padding: 0 5px;
	border-radius: 4px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.icon-button {
	width: 26px;
	padding: 0;
	font-size: 16px;
}

.icon-button:hover,
.text-button:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent-hover);
}

.focus-status {
	gap: 8px;
	margin-top: 10px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.status-pill {
	padding: 3px 6px;
	border-radius: 4px;
	background: var(--pix-bg-subtle);
	color: var(--pix-text-secondary);
	font-size: 11px;
	font-weight: 600;
}

.status-pill.running,
.status-pill.paused,
.status-pill.passed {
	background: var(--pix-success-bg);
	color: var(--pix-success);
}

.status-pill.awaiting_gate {
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
}

.focus-control {
	margin-top: 10px;
}

.control-button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 29px;
	padding: 0 8px;
	border: 1px solid var(--pix-border);
	border-radius: 5px;
	color: var(--pix-text-secondary);
	font-size: 11px;
	font-weight: 600;
}

.control-button.primary {
	border-color: var(--pix-accent-soft);
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.control-button:hover:not(:disabled) {
	background: var(--pix-bg-hover);
}

.inspector-details {
	display: block;
}

.inspector-details summary {
	list-style: none;
	cursor: pointer;
}

.inspector-details summary::-webkit-details-marker {
	display: none;
}

.inspector-details[open] .details-chevron {
	transform: rotate(180deg);
}

.details-chevron {
	margin-top: 3px;
	color: var(--pix-text-muted);
	transition: transform var(--pix-transition-fast);
}

.inspector-details-body {
	position: relative;
	padding-top: 10px;
}

.details-action {
	position: absolute;
	top: 4px;
	right: 0;
}

.details-log-button {
	position: absolute;
	top: 0;
	right: 0;
}

.inspector-artifact-list,
.inbox-mini-list,
.recent-list {
	display: flex;
	flex-direction: column;
	margin-top: 10px;
}

.inspector-artifact,
.inbox-mini-item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	min-height: 39px;
	padding: 5px 3px;
	border-bottom: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.inspector-artifact:hover,
.inbox-mini-item:hover {
	background: var(--pix-bg-hover);
	color: var(--pix-accent-hover);
}

.inspector-artifact > span:nth-child(2),
.inbox-mini-item > span:nth-child(2),
.recent-row > span:last-child {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	flex: 1;
}

.inspector-artifact strong,
.inbox-mini-item strong,
.recent-row strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 11px;
	font-weight: 600;
}

.inspector-artifact small,
.inbox-mini-item small,
.recent-row small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.inbox-mini-dot.warning {
	background: var(--pix-warning);
}

.inbox-mini-dot.error {
	background: var(--pix-error);
}

.inbox-mini-dot.info {
	background: var(--pix-info);
}

.recent-section {
	border-bottom: 0;
}

.recent-row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 6px 0;
}

.recent-dot.artifact {
	background: var(--pix-success);
}

.recent-dot.gate_requested,
.recent-dot.gate_decided {
	background: var(--pix-warning);
}

.recent-dot.error {
	background: var(--pix-error);
}

.small-empty {
	padding: 8px 0;
	color: var(--pix-text-muted);
	font-size: 11px;
}

@media (max-width: 1180px) {
	.paper-inspector {
		width: 270px;
		min-width: 270px;
	}
}

@media (max-width: 959px) {
	.paper-inspector {
		display: none;
	}
}
</style>
