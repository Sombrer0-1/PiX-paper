<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePaperStore, type PaperView } from "../../stores/paper-store";
import { useRpc } from "../../composables/useRpc";
import { useSessionStore } from "../../stores/session-store";
import PaperNavigation from "./PaperNavigation.vue";
import PaperInspector from "./PaperInspector.vue";
import StageDashboard from "./StageDashboard.vue";
import StageWorkspace from "./StageWorkspace.vue";
import GateReviewWorkspace from "./GateReviewWorkspace.vue";
import ArtifactCatalogView from "./ArtifactCatalogView.vue";
import ManuscriptView from "./ManuscriptView.vue";
import PaperArtifactView from "./PaperArtifactView.vue";
import InboxView from "./InboxView.vue";
import AgentLogDrawer from "./AgentLogDrawer.vue";
import ModelSelector from "../input/ModelSelector.vue";
import PaperRuntimePanel from "./PaperRuntimePanel.vue";
import type { RequestUserInputRequest, RequestUserInputQuestion, RespondGatePayload, StageId } from "../../../shared/types";
import type { DisplayBlock } from "../../../shared/types";

const props = defineProps<{
	pendingUserInput: RequestUserInputRequest | null;
	currentQuestionIndex: number;
	currentAnswer: string;
	currentQuestion: RequestUserInputQuestion | null;
	totalQuestions: number;
	answeredSummary: Array<{ field: string; value: string; checked: boolean; index: number }>;
	paperError: string | null;
	blocks: DisplayBlock[];
}>();

const emit = defineEmits<{
	"update:currentAnswer": [value: string];
	advanceQuestion: [];
	jumpToQuestion: [index: number];
	cancelClarification: [];
	"paper-gate-decide": [payload: RespondGatePayload];
	"dismiss-paper-error": [];
}>();

const router = useRouter();
const route = useRoute();
const rpc = useRpc();
const sessionStore = useSessionStore();
const paperStore = usePaperStore();

const view = computed<PaperView>(() => {
	switch (route.name) {
		case "paper-stage": return "stage";
		case "paper-gate": return "gate";
		case "paper-library": return "library";
		case "paper-figures": return "figures";
		case "paper-results": return "results";
		case "paper-manuscript": return "manuscript";
		case "paper-artifact": return "artifact";
		case "paper-inbox": return "inbox";
		default: return "dashboard";
	}
});

const selectedStage = computed<StageId>(() => {
	const value = route.params.stage;
	if (typeof value === "string" && ["literature", "reproduction", "improvement", "experiment", "writing"].includes(value)) return value as StageId;
	return paperStore.selectedStage ?? paperStore.currentStage ?? "literature";
});

const selectedArtifactId = computed(() => typeof route.params.artifactId === "string" ? route.params.artifactId : paperStore.selectedArtifactId);
const isStreaming = computed(() => rpc.isStreaming.value);
const showModelSelector = ref(false);
const showRuntimePanel = ref(false);
const showMoreMenu = ref(false);
const modelDisplay = computed(() => {
	const model = rpc.sessionState.value?.model;
	return model ? `${model.provider}/${model.id}` : "未选择模型";
});

type MoreAction = "logs" | "runtime" | "settings" | "dashboard" | "inbox";

function openView(next: PaperView): void {
	paperStore.setView(next);
	if (next === "dashboard") void router.push("/workspace/dashboard");
	else void router.push(`/workspace/${next}`);
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

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	paperStore.setView("artifact");
	void router.push(`/workspace/artifact/${artifactId}`);
}

function openInbox(): void {
	paperStore.setView("inbox");
	void router.push("/workspace/inbox");
}

function setLogOpen(open: boolean): void {
	if (open) {
		showModelSelector.value = false;
		showRuntimePanel.value = false;
	}
	showMoreMenu.value = false;
	paperStore.setAgentLogOpen(open);
}

function toggleModelSelector(): void {
	showRuntimePanel.value = false;
	showMoreMenu.value = false;
	setLogOpen(false);
	showModelSelector.value = !showModelSelector.value;
}

function toggleRuntimePanel(): void {
	showModelSelector.value = false;
	showMoreMenu.value = false;
	setLogOpen(false);
	showRuntimePanel.value = !showRuntimePanel.value;
}

function openSettings(): void {
	showModelSelector.value = false;
	showRuntimePanel.value = false;
	showMoreMenu.value = false;
	void router.push("/settings");
}

function toggleMoreMenu(): void {
	showModelSelector.value = false;
	showRuntimePanel.value = false;
	setLogOpen(false);
	showMoreMenu.value = !showMoreMenu.value;
}

function handleMoreAction(action: MoreAction): void {
	showMoreMenu.value = false;
	switch (action) {
		case "logs":
			setLogOpen(true);
			break;
		case "runtime":
			toggleRuntimePanel();
			break;
		case "settings":
			openSettings();
			break;
		case "dashboard":
			openView("dashboard");
			break;
		case "inbox":
			openInbox();
			break;
	}
}

function handleGateDecision(payload: RespondGatePayload): void {
	emit("paper-gate-decide", payload);
}

function handlePaperErrorDismiss(): void {
	emit("dismiss-paper-error");
}

function syncRouteState(): void {
	// `/workspace` is the entry route. Keep the persisted Paper view there so
	// returning to a project can restore the user's last working surface.
	if (route.name !== "workspace") paperStore.setView(view.value);
	const stageParam = route.params.stage;
	if (typeof stageParam === "string" && ["literature", "reproduction", "improvement", "experiment", "writing"].includes(stageParam)) {
		paperStore.selectStage(stageParam as StageId);
	}
	const artifactParam = route.params.artifactId;
	if (typeof artifactParam === "string") paperStore.selectArtifact(artifactParam);
}

watch(() => route.fullPath, syncRouteState, { immediate: true });

// Auto-open the agent log drawer when a clarification arrives so the blocking
// question is never hidden behind a closed drawer (mirrors gate auto-navigate).
watch(() => props.pendingUserInput, (next, prev) => {
	if (next && !prev) setLogOpen(true);
});

onMounted(() => {
	if (route.name === "workspace" && paperStore.activeView !== "dashboard") {
		const persisted = paperStore.activeView;
		if (persisted === "stage" && paperStore.selectedStage) void router.replace(`/workspace/stage/${paperStore.selectedStage}`);
		else if (persisted === "gate" && !paperStore.pendingGate) {
			// No gate is actually pending; avoid landing on an empty gate panel.
			paperStore.setView("dashboard");
			void router.replace("/workspace/dashboard");
		}
		else if (persisted !== "artifact") void router.replace(`/workspace/${persisted}`);
	}
});
</script>

<template>
	<div class="paper-workspace">
		<header class="paper-topbar">
			<div class="topbar-title">
				<span class="topbar-product">PiX-paper</span>
				<span class="topbar-separator">/</span>
				<span class="topbar-context">研究台</span>
				<span v-if="paperStore.currentStage" class="topbar-stage">{{ paperStore.currentStage }}</span>
			</div>
			<div class="topbar-status"><span class="topbar-status-dot" :class="{ live: isStreaming }"></span><span>{{ isStreaming ? 'agent 运行中' : pendingUserInput ? '等待你的回答' : paperStore.pendingGate ? '等待审核' : '研究台已连接' }}</span></div>
			<div class="topbar-actions">
				<div class="topbar-model-control">
					<button
						type="button"
						class="topbar-model"
						:title="`切换模型：${modelDisplay}`"
						:aria-label="`切换模型：${modelDisplay}`"
						:aria-expanded="showModelSelector"
						@click="toggleModelSelector"
					>
						<span class="mdi mdi-cube-outline" aria-hidden="true"></span>
						<span class="topbar-model-label">{{ modelDisplay }}</span>
						<span class="mdi mdi-chevron-down" aria-hidden="true"></span>
					</button>
					<ModelSelector v-if="showModelSelector" placement="topbar" @close="showModelSelector = false" />
				</div>
				<button type="button" class="topbar-action" :class="{ active: paperStore.openInboxCount > 0 }" title="打开待处理事项" aria-label="打开待处理事项" @click="openInbox"><span class="mdi mdi-inbox-outline" aria-hidden="true"></span><span v-if="paperStore.openInboxCount > 0" class="topbar-count">{{ paperStore.openInboxCount }}</span></button>
				<button type="button" class="topbar-action" :class="{ active: paperStore.agentLogOpen }" title="打开 Agent 日志" aria-label="打开 Agent 日志" @click="setLogOpen(!paperStore.agentLogOpen)"><span class="mdi mdi-console-line" aria-hidden="true"></span></button>
				<button type="button" class="topbar-action" :class="{ active: showRuntimePanel }" title="打开运行状态" aria-label="打开运行状态" :aria-expanded="showRuntimePanel" @click="toggleRuntimePanel"><span class="mdi mdi-chart-box-outline" aria-hidden="true"></span></button>
				<button type="button" class="topbar-action" title="打开设置" aria-label="打开设置" @click="openSettings"><span class="mdi mdi-cog-outline" aria-hidden="true"></span></button>
				<button type="button" class="topbar-action" title="回到项目概览" aria-label="回到项目概览" @click="openView('dashboard')"><span class="mdi mdi-home-outline" aria-hidden="true"></span></button>
			</div>
			<div class="topbar-more-control">
				<button
					type="button"
					class="topbar-more-button"
					:class="{ active: showMoreMenu || paperStore.openInboxCount > 0 }"
					title="更多工作区操作"
					aria-label="更多工作区操作"
					:aria-expanded="showMoreMenu"
					@click="toggleMoreMenu"
				>
					<span class="mdi mdi-dots-horizontal" aria-hidden="true"></span>
					<span v-if="paperStore.openInboxCount > 0" class="topbar-count">{{ paperStore.openInboxCount }}</span>
				</button>
				<div v-if="showMoreMenu" class="topbar-more-menu" role="menu">
					<button type="button" role="menuitem" @click="handleMoreAction('logs')">
						<span class="mdi mdi-console-line" aria-hidden="true"></span>
						<span>Agent 日志</span>
					</button>
					<button type="button" role="menuitem" @click="handleMoreAction('runtime')">
						<span class="mdi mdi-chart-box-outline" aria-hidden="true"></span>
						<span>运行状态</span>
					</button>
					<button type="button" role="menuitem" @click="handleMoreAction('settings')">
						<span class="mdi mdi-cog-outline" aria-hidden="true"></span>
						<span>设置</span>
					</button>
					<button type="button" role="menuitem" @click="handleMoreAction('dashboard')">
						<span class="mdi mdi-home-outline" aria-hidden="true"></span>
						<span>项目概览</span>
					</button>
					<div class="topbar-more-divider" role="separator"></div>
					<button type="button" role="menuitem" class="topbar-more-inbox" @click="handleMoreAction('inbox')">
						<span class="mdi mdi-inbox-outline" aria-hidden="true"></span>
						<span>待你处理</span>
						<span v-if="paperStore.openInboxCount > 0" class="menu-count">{{ paperStore.openInboxCount }}</span>
					</button>
				</div>
			</div>
		</header>

		<div class="paper-body">
			<PaperNavigation />
			<main class="paper-main">
				<div v-if="paperError" class="paper-error-banner"><span class="mdi mdi-alert-circle-outline" aria-hidden="true"></span><span>{{ paperError }}</span><button type="button" title="关闭错误提示" aria-label="关闭错误提示" @click="handlePaperErrorDismiss"><span class="mdi mdi-close" aria-hidden="true"></span></button></div>
				<StageDashboard v-if="view === 'dashboard'" @open-stage="openStage" @open-gate="openGate" @open-artifact="openArtifact" @open-inbox="openInbox" @open-agent-log="setLogOpen(true)" />
				<StageWorkspace v-else-if="view === 'stage'" :stage="selectedStage" />
				<GateReviewWorkspace v-else-if="view === 'gate'" @decide="handleGateDecision" @open-artifact="openArtifact" @open-agent-log="setLogOpen(true)" />
				<ArtifactCatalogView v-else-if="view === 'library'" kind="library" />
				<ArtifactCatalogView v-else-if="view === 'figures'" kind="figures" />
				<ArtifactCatalogView v-else-if="view === 'results'" kind="results" />
				<ManuscriptView v-else-if="view === 'manuscript'" />
				<PaperArtifactView v-else-if="view === 'artifact' && selectedArtifactId" />
				<InboxView v-else-if="view === 'inbox'" />
				<StageDashboard v-else @open-stage="openStage" @open-gate="openGate" @open-artifact="openArtifact" @open-inbox="openInbox" @open-agent-log="setLogOpen(true)" />
			</main>
			<PaperInspector :selected-stage="paperStore.selectedStage" @open-inbox="openInbox" @open-agent-log="setLogOpen(true)" />
		</div>

		<PaperRuntimePanel :open="showRuntimePanel" @close="showRuntimePanel = false" />

		<AgentLogDrawer
			:open="paperStore.agentLogOpen"
			:blocks="sessionStore.displayBlocks"
			:pending-user-input="pendingUserInput"
			:current-question-index="currentQuestionIndex"
			:current-answer="currentAnswer"
			:current-question="currentQuestion"
			:total-questions="totalQuestions"
			:answered-summary="answeredSummary"
			@close="setLogOpen(false)"
			@update:current-answer="emit('update:currentAnswer', $event)"
			@advance-question="emit('advanceQuestion')"
			@jump-to-question="emit('jumpToQuestion', $event)"
			@cancel-clarification="emit('cancelClarification')"
		/>
	</div>
</template>

<style scoped>
.paper-workspace {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	position: relative;
	background: var(--pix-bg-app);
	color: var(--pix-text-primary);
}

.paper-topbar {
	position: relative;
	z-index: 10;
	display: flex;
	align-items: center;
	gap: 12px;
	height: 50px;
	min-height: 50px;
	padding: 0 calc(var(--pix-window-controls-width) + var(--pix-space-xs)) 0 18px;
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-bg-topbar);
	-webkit-app-region: no-drag;
	user-select: none;
}

.topbar-title,
.topbar-status,
.topbar-actions,
.topbar-action {
	display: flex;
	align-items: center;
}

.topbar-title {
	gap: 7px;
	min-width: 0;
	flex: 1;
	-webkit-app-region: drag;
}

.topbar-product {
	font-size: 14px;
	font-weight: 650;
}

.topbar-separator {
	color: var(--pix-border);
	font-size: 14px;
}

.topbar-context,
.topbar-stage {
	color: var(--pix-text-secondary);
	font-size: 12px;
}

.topbar-stage {
	padding-left: 9px;
	border-left: 1px solid var(--pix-border);
	color: var(--pix-accent);
	font-size: 11px;
}

.topbar-status {
	justify-content: center;
	gap: 6px;
	min-height: 28px;
	padding: 0 9px;
	border: 1px solid var(--pix-border-light);
	border-radius: 6px;
	background: var(--pix-bg-subtle);
	color: var(--pix-text-secondary);
	font-size: 11px;
	white-space: nowrap;
}

.topbar-status-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--pix-text-muted);
}

.topbar-status-dot.live {
	background: var(--pix-success);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--pix-success) 14%, transparent);
}

.topbar-actions {
	gap: 4px;
	-webkit-app-region: no-drag !important;
	pointer-events: auto;
}

.topbar-actions > .topbar-action {
	display: none;
}

.topbar-model-control {
	position: relative;
	max-width: min(260px, 24vw);
	-webkit-app-region: no-drag !important;
	pointer-events: auto;
}

.topbar-model {
	display: flex;
	align-items: center;
	gap: 5px;
	width: 100%;
	min-width: 0;
	height: 32px;
	padding: 0 9px;
	border: 1px solid var(--pix-border-light);
	border-radius: 7px;
	background: var(--pix-bg-content);
	color: var(--pix-text-primary);
	font-size: 11px;
	text-align: left;
		-webkit-app-region: no-drag !important;
		pointer-events: auto !important;
}

.topbar-model:hover,
.topbar-model[aria-expanded="true"] {
	border-color: var(--pix-accent);
	background: var(--pix-bg-subtle);
	color: var(--pix-text-primary);
}

.topbar-model .mdi:first-child {
	font-size: 15px;
	flex-shrink: 0;
}

.topbar-model .mdi:last-child {
	font-size: 14px;
	flex-shrink: 0;
}

.topbar-model-label {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1;
}

.topbar-action {
	position: relative;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 5px;
	color: var(--pix-text-secondary);
	font-size: 18px;
}

.topbar-action:hover,
.topbar-action.active {
	background: var(--pix-accent-light);
	color: var(--pix-accent-hover);
}

.topbar-count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	position: absolute;
	top: 1px;
	right: 0;
	min-width: 16px;
	height: 16px;
	padding: 0 3px;
	border-radius: 8px;
	background: var(--pix-warning);
	color: var(--pix-text-inverse);
	font-size: 11px;
	font-weight: 700;
}

.topbar-more-control {
	position: relative;
	-webkit-app-region: no-drag !important;
	pointer-events: auto;
}

.topbar-more-button {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border: 1px solid transparent;
	border-radius: 7px;
	color: var(--pix-text-secondary);
	font-size: 18px;
	-webkit-app-region: no-drag !important;
	pointer-events: auto !important;
}

.topbar-more-button:hover,
.topbar-more-button.active,
.topbar-more-button[aria-expanded="true"] {
	border-color: var(--pix-border-light);
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.topbar-more-menu {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	z-index: 30;
	display: flex;
	flex-direction: column;
	width: 196px;
	padding: 5px;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-content);
	box-shadow: var(--pix-shadow-lg);
	-webkit-app-region: no-drag !important;
	pointer-events: auto !important;
}

.topbar-more-menu button {
	display: flex;
	align-items: center;
	gap: 9px;
	width: 100%;
	min-height: 34px;
	padding: 0 9px;
	border-radius: 5px;
	color: var(--pix-text-secondary);
	font-size: 12px;
	text-align: left;
	-webkit-app-region: no-drag !important;
	pointer-events: auto !important;
}

.topbar-more-menu button:hover {
	background: var(--pix-bg-hover);
	color: var(--pix-text-primary);
}

.topbar-more-menu button .mdi {
	width: 17px;
	color: var(--pix-text-muted);
	font-size: 16px;
	text-align: center;
}

.topbar-more-menu button span:nth-child(2) {
	flex: 1;
}

.topbar-more-divider {
	height: 1px;
	margin: 5px 4px;
	background: var(--pix-border-subtle);
}

.menu-count {
	min-width: 18px;
	padding: 1px 5px;
	border-radius: 8px;
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
	font-size: 11px;
	font-weight: 700;
	text-align: center;
}

.paper-body {
	display: flex;
	min-height: 0;
	flex: 1;
	position: relative;
}

.paper-main {
	min-width: 0;
	min-height: 0;
	flex: 1;
	overflow-y: auto;
	background: var(--pix-bg-content);
}

.paper-error-banner {
	display: flex;
	align-items: center;
	gap: 8px;
	position: sticky;
	top: 0;
	z-index: 5;
	min-height: 34px;
	padding: 0 16px;
	border-bottom: 1px solid var(--pix-error-light);
	background: var(--pix-error-bg);
	color: var(--pix-error);
	font-size: 11px;
}

.paper-error-banner span:nth-child(2) {
	min-width: 0;
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.paper-error-banner button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 25px;
	height: 25px;
	color: inherit;
}

@media (max-width: 959px) {
	.paper-body {
		min-width: 0;
	}

	.paper-main {
		width: 100%;
	}

	.topbar-status {
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.topbar-model-control {
		max-width: min(180px, 38vw);
	}
}

@media (max-width: 560px) {
	.paper-topbar {
		gap: 8px;
		padding: 0 calc(var(--pix-window-controls-width) + var(--pix-space-xs)) 0 10px;
	}

	.topbar-context,
	.topbar-stage {
		display: none;
	}

	.topbar-status {
		display: none;
	}

	.topbar-model-control {
		max-width: min(150px, 42vw);
	}

	.topbar-model-label {
		font-size: 11px;
	}
}
</style>
