<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePaperStore } from "../../stores/paper-store";
import ArtifactPreview from "./ArtifactPreview.vue";
import { renderMarkdown } from "../../utils/markdown";
import { PAPER_STAGES, artifactName, artifactTypeLabel, formatDate, primaryArtifact, stageLabel } from "../../utils/paper";
import type { GateRequest, StageId } from "../../../shared/types";

const emit = defineEmits<{
	decide: [payload: { decision: "rework" | "continue" | "abort"; reworkTarget?: StageId; reason?: string }];
	openArtifact: [artifactId: string];
	openAgentLog: [];
}>();

const paperStore = usePaperStore();
const mode = ref<"choose" | "rework" | "confirm-abort">("choose");
const reworkTarget = ref<StageId>("literature");
const reason = ref("");
const compareOpen = ref(false);

const gate = computed<GateRequest | null>(() => paperStore.pendingGate);
const reviewArtifact = computed(() => gate.value ? paperStore.artifacts.find((artifact) => artifact.id === (gate.value?.primaryArtifactId ?? "")) ?? primaryArtifact(gate.value.artifacts) : null);
const artifactRevisions = computed(() => reviewArtifact.value ? paperStore.progress?.artifactRevisions.filter((revision) => revision.artifactId === reviewArtifact.value?.id).sort((a, b) => a.revision - b.revision) ?? [] : []);
const latestRevision = computed(() => artifactRevisions.value.at(-1));
const previousRevision = computed(() => artifactRevisions.value.length > 1 ? artifactRevisions.value[artifactRevisions.value.length - 2] : undefined);
const reworkTargets = computed(() => {
	const current = gate.value?.stage;
	if (!current) return PAPER_STAGES;
	const index = PAPER_STAGES.findIndex((stage) => stage.id === current);
	return PAPER_STAGES.slice(0, index + 1);
});
const decisionPending = computed(() => paperStore.pendingOperations.respondGate);

watch(gate, (next) => {
	mode.value = "choose";
	reason.value = "";
	compareOpen.value = false;
	if (next) reworkTarget.value = next.stage;
}, { immediate: true });

function handleExternalLink(event: MouseEvent): void {
	const target = event.target;
	if (!(target instanceof HTMLAnchorElement)) return;
	const href = target.getAttribute("href");
	if (!href || !/^https?:|^mailto:/i.test(href)) return;
	event.preventDefault();
	window.pixApi.openExternal(href);
}

function continueStage(): void {
	emit("decide", { decision: "continue" });
}

function confirmAbort(): void {
	emit("decide", { decision: "abort" });
}

function submitRework(): void {
	emit("decide", {
		decision: "rework",
		reworkTarget: reworkTarget.value,
		reason: reason.value.trim() || undefined,
	});
}

function openArtifact(artifactId: string): void {
	paperStore.selectArtifact(artifactId);
	emit("openArtifact", artifactId);
}

function openExternal(artifactId: string): void {
	void paperStore.openArtifact(artifactId);
}

function statusDetail(ok: boolean): string {
	return ok ? "已检测到" : "未检测到，需人工判断";
}
</script>

<template>
	<div v-if="gate" class="paper-view gate-view">
		<header class="view-header">
			<div>
				<div class="eyebrow review-eyebrow"><span class="mdi mdi-eye-outline" aria-hidden="true"></span> 人工审核</div>
				<h1>{{ stageLabel(gate.stage) }} Gate</h1>
				<p class="view-subtitle">{{ formatDate(gate.requestedAt) }} 提交审核 · 审核决定会驱动下一阶段或返工。</p>
			</div>
			<button type="button" class="button button-quiet" @click="emit('openAgentLog')">
				<span class="mdi mdi-console-line" aria-hidden="true"></span> 查看 Agent 记录
			</button>
		</header>

		<div class="review-layout">
			<section class="review-artifact-column">
				<div class="section-heading">
					<div>
						<h2>主产物</h2>
						<p>直接阅读阶段交付物，相关支撑产物列在下方。</p>
					</div>
					<button v-if="reviewArtifact" type="button" class="text-link" @click="openArtifact(reviewArtifact.id)">独立查看 <span class="mdi mdi-arrow-right" aria-hidden="true"></span></button>
				</div>

				<div v-if="reviewArtifact" class="review-preview-frame">
					<div class="preview-heading">
						<div>
							<strong>{{ artifactName(reviewArtifact.path) }}</strong>
							<span>{{ artifactTypeLabel(reviewArtifact.type) }} · {{ latestRevision?.hash ? `SHA-256 ${latestRevision.hash.slice(0, 12)}...` : '无快照校验' }}</span>
						</div>
						<button type="button" class="icon-button" title="用系统程序打开" aria-label="用系统程序打开" @click="openExternal(reviewArtifact.id)">
							<span class="mdi mdi-open-in-new" aria-hidden="true"></span>
						</button>
					</div>
					<div class="preview-content">
						<div v-if="compareOpen && previousRevision" class="revision-compare">
							<div class="revision-pane">
								<div class="revision-label">修订 {{ previousRevision.revision }} · 旧版本</div>
								<ArtifactPreview :artifact-id="reviewArtifact.id" :revision-id="previousRevision.id" compact @open-external="openExternal" />
							</div>
							<div class="revision-pane">
								<div class="revision-label">修订 {{ latestRevision?.revision ?? '当前' }} · 当前版本</div>
								<ArtifactPreview :artifact-id="reviewArtifact.id" :revision-id="latestRevision?.id" compact @open-external="openExternal" />
							</div>
						</div>
						<ArtifactPreview v-else :artifact-id="reviewArtifact.id" @open-external="openExternal" />
					</div>
					<div v-if="previousRevision" class="revision-toolbar">
						<span class="mdi mdi-source-branch" aria-hidden="true"></span>
						<span>已保存 {{ artifactRevisions.length }} 个不可变修订</span>
						<button type="button" class="text-link" @click="compareOpen = !compareOpen">{{ compareOpen ? '关闭对比' : '对比上一版' }}</button>
					</div>
				</div>
				<div v-else class="empty-panel">
					<span class="mdi mdi-file-alert-outline" aria-hidden="true"></span>
					<div><strong>没有可预览的主产物</strong><span>agent 未声明主产物，仍可根据摘要和检查结果作出决定。</span></div>
				</div>
				<div class="related-artifacts">
					<div class="section-heading compact-heading"><div><h2>相关产物</h2></div></div>
					<div class="related-list">
						<button
							v-for="artifact in gate.artifacts.filter((item) => item.id !== reviewArtifact?.id)"
							:key="artifact.id"
							type="button"
							class="related-item"
							@click="openArtifact(artifact.id)"
						>
							<span class="mdi mdi-file-outline" aria-hidden="true"></span>
							<span><strong>{{ artifactName(artifact.path) }}</strong><small>{{ artifactTypeLabel(artifact.type) }}</small></span>
							<span class="mdi mdi-arrow-right" aria-hidden="true"></span>
						</button>
						<div v-if="gate.artifacts.length <= 1" class="small-empty">本阶段没有额外支撑产物。</div>
					</div>
				</div>
			</section>

			<aside class="review-decision-column">
				<section class="review-panel summary-panel">
					<div class="panel-label">Agent 摘要</div>
					<div class="markdown-body" v-html="renderMarkdown(gate.summary)" @click="handleExternalLink"></div>
				</section>

				<section class="review-panel checks-panel">
					<div class="panel-heading"><div><h2>质量检查</h2><p>Best-effort 提示，不替代人工审核。</p></div><span class="mdi mdi-information-outline" aria-hidden="true"></span></div>
					<div class="check-list">
						<div v-for="(check, index) in gate.checks" :key="`${check.label}-${index}`" class="check-row" :class="{ ok: check.ok, bad: !check.ok }">
							<span class="check-icon mdi" :class="check.ok ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'" aria-hidden="true"></span>
							<div><strong>{{ check.label }}</strong><span>{{ check.detail || statusDetail(check.ok) }}</span></div>
						</div>
						<div v-if="gate.checks.length === 0" class="small-empty">没有自动检查项目。</div>
					</div>
				</section>

				<section class="review-panel decision-panel">
					<div class="panel-label">你的决定</div>
					<div v-if="mode === 'choose'" class="decision-actions">
						<button type="button" class="decision-button continue" :disabled="decisionPending" @click="continueStage"><span class="mdi mdi-arrow-right-circle-outline" aria-hidden="true"></span> 通过并进入下一阶段</button>
						<button type="button" class="decision-button rework" :disabled="decisionPending" @click="mode = 'rework'"><span class="mdi mdi-restore-alert" aria-hidden="true"></span> 要求返工</button>
						<button type="button" class="decision-button abort" :disabled="decisionPending" @click="mode = 'confirm-abort'"><span class="mdi mdi-stop-circle-outline" aria-hidden="true"></span> 终止项目</button>
					</div>
					<div v-else-if="mode === 'confirm-abort'" class="decision-confirm">
						<p>终止会将当前阶段标记为失败，并停止自动推进。已生成的文件会保留。</p>
						<div class="decision-footer"><button type="button" class="button button-quiet" @click="mode = 'choose'">返回</button><button type="button" class="button button-danger" :disabled="decisionPending" @click="confirmAbort">确认终止</button></div>
					</div>
					<div v-else class="rework-form">
						<label><span>返工目标</span><select v-model="reworkTarget"><option v-for="stage in reworkTargets" :key="stage.id" :value="stage.id">{{ stage.label }}</option></select></label>
						<label><span>返工说明</span><textarea v-model="reason" rows="4" placeholder="指出需要重新检查的内容（可选）"></textarea></label>
						<div class="decision-footer"><button type="button" class="button button-quiet" @click="mode = 'choose'">返回</button><button type="button" class="button button-primary" :disabled="decisionPending" @click="submitRework">确认返工</button></div>
					</div>
					<div v-if="decisionPending" class="decision-pending"><span class="spinner"></span> 正在保存审核决定...</div>
				</section>
			</aside>
		</div>
	</div>
	<div v-else class="paper-view gate-empty-view">
		<div class="empty-panel"><span class="mdi mdi-check-decagram-outline" aria-hidden="true"></span><div><strong>当前没有待审核 Gate</strong><span>agent 完成阶段后会在这里提交审核。</span></div></div>
	</div>
</template>

<style scoped>
.gate-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.view-header,
.review-layout {
	max-width: 1220px;
	margin: 0 auto;
}

.view-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 24px;
}

.eyebrow {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	color: var(--pix-warning);
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
	font-size: 19px;
}

.view-subtitle {
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.button,
.text-link {
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

.button-quiet {
	border: 1px solid var(--pix-border);
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
}

.button-quiet:hover {
	background: var(--pix-bg-hover);
}

.button-primary {
	background: var(--pix-accent);
	color: var(--pix-text-inverse);
}

.button-primary:hover {
	background: var(--pix-accent-hover);
}

.button-danger {
	background: var(--pix-error);
	color: var(--pix-text-inverse);
}

.review-layout {
	display: grid;
	grid-template-columns: minmax(0, 1.45fr) minmax(330px, 0.75fr);
	gap: 24px;
	margin-top: 32px;
	align-items: start;
}

.section-heading,
.panel-heading {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 14px;
	margin-bottom: 12px;
}

.section-heading p,
.panel-heading p {
	margin-top: 4px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.text-link {
	padding: 0;
	color: var(--pix-accent);
}

.text-link:hover {
	color: var(--pix-accent-hover);
}

.review-preview-frame {
	display: flex;
	flex-direction: column;
	height: min(720px, calc(100vh - 220px));
	min-height: 520px;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-subtle);
	overflow: hidden;
}

.preview-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 13px 16px;
	border-bottom: 1px solid var(--pix-border-light);
}

.preview-heading > div {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.preview-heading strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--pix-font-ui);
	font-size: 15px;
	font-weight: 500;
}

.preview-heading span {
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
	flex-shrink: 0;
}

.icon-button:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.preview-content {
	display: flex;
	min-height: 0;
	flex: 1;
}

.preview-content > .artifact-preview {
	width: 100%;
	height: 100%;
	min-height: 0;
}

.revision-compare {
	display: grid;
	grid-template-columns: 1fr 1fr;
	height: 100%;
	min-height: 480px;
	gap: 1px;
	background: var(--pix-border-light);
}

.revision-pane {
	display: flex;
	flex-direction: column;
	min-width: 0;
	background: var(--pix-bg-content);
}

.revision-pane :deep(.artifact-preview) {
	min-height: 0;
	height: 100%;
	flex: 1;
}

.revision-label {
	padding: 8px 12px;
	background: var(--pix-bg-hover);
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 600;
}

.revision-toolbar {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 32px;
	padding: 0 12px;
	border-top: 1px solid var(--pix-border-light);
	color: var(--pix-text-muted);
	font-size: 11px;
}

.revision-toolbar .text-link {
	margin-left: auto;
	min-height: 24px;
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

.related-artifacts {
	margin-top: 24px;
}

.compact-heading {
	margin-bottom: 8px;
}

.related-list {
	display: flex;
	flex-direction: column;
	border-top: 1px solid var(--pix-border-subtle);
}

.related-item {
	display: flex;
	align-items: center;
	gap: 9px;
	min-height: 48px;
	padding: 7px 4px;
	border-bottom: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.related-item:hover {
	background: var(--pix-bg-hover);
	color: var(--pix-accent);
}

.related-item > span:nth-child(2) {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	flex: 1;
}

.related-item strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 12px;
	font-weight: 600;
}

.related-item small {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.small-empty {
	padding: 10px 0;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.review-decision-column {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.review-panel {
	padding: 16px;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-content);
}

.summary-panel {
	background: var(--pix-bg-topbar);
}

.panel-label {
	margin-bottom: 11px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.markdown-body {
	color: var(--pix-text-primary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
	line-height: 1.68;
}

.markdown-body :deep(p) {
	margin: 0 0 10px;
}

.markdown-body :deep(p:last-child) {
	margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
	margin: 14px 0 6px;
	font-size: 16px;
	font-weight: 600;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
	padding-left: 20px;
	margin-bottom: 10px;
}

.markdown-body :deep(code) {
	font-family: var(--pix-font-mono);
	font-size: 0.88em;
}

.check-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.check-row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.check-icon {
	margin-top: 1px;
	font-size: 17px;
	flex-shrink: 0;
}

.check-row.ok .check-icon {
	color: var(--pix-success);
}

.check-row.bad .check-icon {
	color: var(--pix-error);
}

.check-row > div {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.check-row strong {
	font-size: 12px;
	font-weight: 600;
}

.check-row span:last-child {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.panel-heading {
	align-items: flex-start;
}

.panel-heading > .mdi {
	color: var(--pix-text-muted);
	font-size: 17px;
}

.decision-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.decision-button {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 38px;
	padding: 0 11px;
	border: 1px solid var(--pix-border-light);
	border-radius: 6px;
	font-size: 12px;
	font-weight: 600;
	text-align: left;
}

.decision-button.continue {
	border-color: var(--pix-success-light);
	background: var(--pix-success-bg);
	color: var(--pix-success);
}

.decision-button.rework {
	background: var(--pix-warning-bg);
	color: var(--pix-warning);
}

.decision-button.abort {
	background: var(--pix-error-bg);
	color: var(--pix-error);
}

.decision-button:hover:not(:disabled) {
	filter: brightness(0.97);
	box-shadow: none;
}

.decision-confirm,
.rework-form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.decision-confirm p {
	color: var(--pix-error);
	font-size: 12px;
	line-height: 1.55;
}

.rework-form label {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: var(--pix-text-secondary);
	font-size: 11px;
	font-weight: 600;
}

.rework-form select,
.rework-form textarea {
	width: 100%;
	padding: 8px 9px;
	border: 1px solid var(--pix-border);
	border-radius: 5px;
	background: var(--pix-bg-content);
	color: var(--pix-text-primary);
	font-family: var(--pix-font-ui);
	font-size: 12px;
}

.rework-form textarea {
	resize: vertical;
	line-height: 1.5;
}

.rework-form select:focus,
.rework-form textarea:focus {
	outline: none;
	border-color: var(--pix-accent);
	box-shadow: 0 0 0 3px var(--pix-focus-ring);
}

.decision-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 2px;
}

.decision-pending {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 12px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

@media (max-width: 1040px) {
	.review-layout {
		grid-template-columns: 1fr;
	}

	.review-decision-column {
		max-width: none;
	}
}

@media (max-width: 700px) {
	.gate-view {
		padding: 24px 18px 36px;
	}

	.view-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.revision-compare {
		grid-template-columns: 1fr;
		height: auto;
	}

	.review-preview-frame {
		height: 620px;
	}

	.revision-pane {
		min-height: 300px;
	}
}
</style>
