<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePaperStore, type PaperView } from "../../stores/paper-store";
import { PAPER_STAGES, stageLabel, statusLabel } from "../../utils/paper";
import type { StageId } from "../../../shared/types";

const router = useRouter();
const route = useRoute();
const paperStore = usePaperStore();

const libraryItems: Array<{ view: PaperView; label: string; icon: string }> = [
	{ view: "library", label: "文献池", icon: "mdi-bookshelf" },
	{ view: "figures", label: "图表", icon: "mdi-chart-line" },
	{ view: "results", label: "实验结果", icon: "mdi-table-large" },
	{ view: "manuscript", label: "论文中心", icon: "mdi-file-document-edit-outline" },
];

const routeView = computed<PaperView>(() => {
	if (route.name === "paper-stage") return "stage";
	if (route.name === "paper-gate") return "gate";
	if (route.name === "paper-library") return "library";
	if (route.name === "paper-figures") return "figures";
	if (route.name === "paper-results") return "results";
	if (route.name === "paper-manuscript") return "manuscript";
	if (route.name === "paper-artifact") return "artifact";
	if (route.name === "paper-inbox") return "inbox";
	return "dashboard";
});

const selectedStage = computed<StageId | null>(() => {
	const value = route.params.stage;
	return typeof value === "string" && PAPER_STAGES.some((stage) => stage.id === value)
		? value as StageId
		: paperStore.selectedStage;
});

function isViewActive(view: PaperView): boolean {
	return routeView.value === view;
}

function go(view: PaperView): void {
	paperStore.setView(view);
	if (view === "dashboard") void router.push("/workspace/dashboard");
	else void router.push(`/workspace/${view}`);
}

function openStage(stage: StageId): void {
	paperStore.selectStage(stage);
	paperStore.setView("stage");
	void router.push(`/workspace/stage/${stage}`);
}

function openGate(): void {
	if (!paperStore.pendingGate) return;
	paperStore.setView("gate");
	void router.push("/workspace/gate");
}

function goHome(): void {
	void router.push("/");
}

function goSettings(): void {
	void router.push("/settings");
}

function stageStatus(stage: StageId): string {
	return statusLabel(paperStore.stages?.[stage]?.status);
}
</script>

<template>
	<aside class="paper-navigation" aria-label="Paper project navigation">
		<div class="paper-nav-header">
			<button type="button" class="paper-brand" title="返回项目首页" @click="goHome">
				<span class="brand-mark mdi mdi-flask-outline" aria-hidden="true"></span>
				<span class="brand-copy">
					<strong>{{ paperStore.config?.name || "PiX-paper" }}</strong>
					<span>研究台</span>
				</span>
			</button>
			<p class="paper-topic" :title="paperStore.topic">{{ paperStore.topic || "未命名研究主题" }}</p>
		</div>

		<nav class="paper-nav-body">
			<button
				type="button"
				class="nav-item nav-home"
				:class="{ active: isViewActive('dashboard') }"
				:aria-current="isViewActive('dashboard') ? 'page' : undefined"
				@click="go('dashboard')"
			>
				<span class="mdi mdi-view-dashboard-outline nav-icon" aria-hidden="true"></span>
				<span>项目概览</span>
			</button>

			<div class="nav-section-label">研究阶段</div>
			<div class="stage-nav-list">
				<button
					v-for="stage in PAPER_STAGES"
					:key="stage.id"
					type="button"
					class="stage-nav-item"
					:class="{ active: routeView === 'stage' && selectedStage === stage.id, attention: paperStore.pendingGate?.stage === stage.id }"
					:aria-current="routeView === 'stage' && selectedStage === stage.id ? 'page' : undefined"
					@click="openStage(stage.id)"
				>
					<span class="stage-nav-index" :class="paperStore.stages?.[stage.id]?.status ?? 'pending'">
						<span v-if="paperStore.stages?.[stage.id]?.status === 'passed'" class="mdi mdi-check" aria-hidden="true"></span>
						<span v-else>{{ PAPER_STAGES.indexOf(stage) + 1 }}</span>
					</span>
					<span class="stage-nav-copy">
						<span class="stage-nav-name">{{ stage.label }}</span>
						<span class="stage-nav-meta">{{ stageStatus(stage.id) }} · {{ paperStore.artifactsOf(stage.id).length }} 项产物</span>
					</span>
					<span v-if="paperStore.pendingGate?.stage === stage.id" class="stage-nav-alert" title="等待审核">!</span>
				</button>
			</div>

			<button
				type="button"
				class="nav-item gate-nav-item"
				:class="{ active: isViewActive('gate'), attention: !!paperStore.pendingGate }"
				:aria-current="isViewActive('gate') ? 'page' : undefined"
				@click="openGate"
			>
				<span class="mdi mdi-clipboard-check-outline nav-icon" aria-hidden="true"></span>
				<span class="nav-item-copy">
					<span>审核工作区</span>
					<span v-if="paperStore.pendingGate" class="nav-badge">待处理</span>
				</span>
			</button>

			<div class="nav-section-label">产物</div>
			<button
				v-for="item in libraryItems"
				:key="item.view"
				type="button"
				class="nav-item"
				:class="{ active: isViewActive(item.view) }"
				:aria-current="isViewActive(item.view) ? 'page' : undefined"
				@click="go(item.view)"
			>
				<span class="mdi nav-icon" :class="item.icon" aria-hidden="true"></span>
				<span>{{ item.label }}</span>
			</button>

			<button
				type="button"
				class="nav-item inbox-nav-item"
				:class="{ active: isViewActive('inbox'), attention: paperStore.openInboxCount > 0 }"
				:aria-current="isViewActive('inbox') ? 'page' : undefined"
				@click="go('inbox')"
			>
				<span class="mdi mdi-inbox-outline nav-icon" aria-hidden="true"></span>
				<span class="nav-item-copy">
					<span>待你处理</span>
					<span v-if="paperStore.openInboxCount > 0" class="nav-count">{{ paperStore.openInboxCount }}</span>
				</span>
			</button>
		</nav>

		<div class="paper-nav-footer">
			<div class="runtime-line">
				<span class="runtime-dot" :class="{ live: paperStore.currentStageState?.status === 'running' }"></span>
				<span>{{ paperStore.currentStageState ? `${stageLabel(paperStore.currentStage ?? 'literature')} ${statusLabel(paperStore.currentStageState.status)}` : "等待连接" }}</span>
			</div>
			<button type="button" class="footer-link" @click="goHome">
				<span class="mdi mdi-arrow-left footer-icon" aria-hidden="true"></span>
				<span>切换项目</span>
			</button>
			<button type="button" class="footer-link" title="打开设置" aria-label="打开设置" @click="goSettings">
				<span class="mdi mdi-cog-outline footer-icon" aria-hidden="true"></span>
				<span>设置</span>
			</button>
		</div>
	</aside>
</template>

<style scoped>
.paper-navigation {
	display: flex;
	flex-direction: column;
	min-width: 250px;
	width: 250px;
	height: 100%;
	background: var(--pix-bg-left);
	border-right: 1px solid var(--pix-border-light);
	color: var(--pix-text-primary);
}

.paper-nav-header {
	padding: 18px 16px 16px;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.paper-brand {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	text-align: left;
}

.brand-mark {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 6px;
	background: transparent;
	color: var(--pix-accent);
	font-family: var(--pix-font-ui);
	font-size: 22px;
}

.brand-copy {
	display: flex;
	flex-direction: column;
	min-width: 0;
	line-height: 1.25;
}

.brand-copy strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 13px;
}

.brand-copy span {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.paper-topic {
	margin: 16px 0 0;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 15px;
	line-height: 1.45;
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.paper-nav-body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 14px 10px;
}

.nav-section-label {
	padding: 14px 10px 7px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.nav-item,
.stage-nav-item {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: 34px;
	border-radius: 7px;
	color: var(--pix-text-secondary);
	text-align: left;
	transition: background var(--pix-transition-fast), color var(--pix-transition-fast);
}

.nav-item {
	gap: 10px;
	padding: 8px 10px;
	font-size: 13px;
}

.nav-item:hover,
.stage-nav-item:hover {
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.nav-item.active,
.stage-nav-item.active {
	background: var(--pix-bg-active);
	color: var(--pix-text-primary);
}

.nav-item.attention,
.stage-nav-item.attention {
	color: var(--pix-warning);
}

.nav-icon {
	width: 18px;
	font-size: 18px;
	text-align: center;
	flex-shrink: 0;
}

.nav-item-copy {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-width: 0;
	width: 100%;
}

.nav-badge,
.nav-count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 20px;
	height: 18px;
	padding: 0 6px;
	border-radius: 9px;
	background: var(--pix-warning-light);
	color: var(--pix-warning);
	font-size: 11px;
	font-weight: 700;
}

.stage-nav-list {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.stage-nav-item {
	gap: 9px;
	padding: 7px 8px;
}

.stage-nav-index {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border: 1px solid var(--pix-border);
	border-radius: 6px;
	background: var(--pix-bg-content);
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	flex-shrink: 0;
}

.stage-nav-index.running {
	border-color: var(--pix-success);
	background: var(--pix-success-bg);
	color: var(--pix-success);
}

.stage-nav-index.awaiting_gate {
	border-color: var(--pix-warning);
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
}

.stage-nav-index.passed {
	border-color: var(--pix-success);
	background: var(--pix-success-light);
	color: var(--pix-success);
}

.stage-nav-index.failed,
.stage-nav-index.rework {
	border-color: var(--pix-error-light);
	background: var(--pix-error-bg);
	color: var(--pix-error);
}

.stage-nav-copy {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.stage-nav-name {
	font-size: 12px;
	font-weight: 600;
}

.stage-nav-meta {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.stage-nav-alert {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: var(--pix-warning);
	color: var(--pix-text-inverse);
	font-size: 11px;
	font-weight: 700;
	margin-left: auto;
}

.gate-nav-item {
	margin-top: 10px;
}

.paper-nav-footer {
	display: flex;
	flex-direction: column;
	gap: 9px;
	padding: 14px 16px 16px;
	border-top: 1px solid var(--pix-border-subtle);
}

.runtime-line,
.footer-link {
	display: flex;
	align-items: center;
	gap: 7px;
	color: var(--pix-text-muted);
	font-size: 11px;
	text-align: left;
}

.runtime-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--pix-text-muted);
}

.runtime-dot.live {
	background: var(--pix-success);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--pix-success) 14%, transparent);
}

.footer-link:hover {
	color: var(--pix-text-primary);
}

.footer-icon {
	font-size: 15px;
}

@media (max-width: 900px) {
	.paper-navigation {
		width: 210px;
		min-width: 210px;
	}

	.paper-nav-header {
		padding-left: 14px;
		padding-right: 14px;
	}
}

@media (max-width: 560px) {
	.paper-navigation {
		width: 188px;
		min-width: 188px;
	}

	.paper-nav-header {
		padding-top: 18px;
		padding-bottom: 14px;
	}

	.paper-topic {
		font-size: 13px;
	}

	.nav-item {
		font-size: 12px;
	}
}
</style>
