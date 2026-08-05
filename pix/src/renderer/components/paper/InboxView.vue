<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { usePaperStore } from "../../stores/paper-store";
import { formatDate, stageLabel } from "../../utils/paper";
import type { InboxItem } from "../../../shared/types";

const router = useRouter();
const paperStore = usePaperStore();
const filter = ref<"open" | "all">("open");

const items = computed(() => [...paperStore.inbox.items]
	.filter((item) => filter.value === "all" || item.status !== "resolved")
	.sort((a, b) => b.updatedAt - a.updatedAt));

function openItem(item: InboxItem): void {
	if (item.status === "open") void paperStore.markInboxItem(item.id, "read");
	if (item.kind === "gate" && paperStore.pendingGate) {
		void router.push("/workspace/gate");
		return;
	}
	if (item.kind === "clarification") {
		paperStore.setAgentLogOpen(true);
	}
	if (item.kind === "error" || item.kind === "attention") {
		paperStore.setAgentLogOpen(true);
	}
	if (item.stage) {
		paperStore.selectStage(item.stage);
		void router.push(`/workspace/stage/${item.stage}`);
	}
}

function resolveItem(item: InboxItem): void {
	void paperStore.markInboxItem(item.id, "resolved");
}

function severityLabel(severity: InboxItem["severity"]): string {
	if (severity === "error") return "错误";
	if (severity === "warning") return "需要注意";
	return "信息";
}
</script>

<template>
	<div class="paper-view inbox-view">
		<header class="view-header">
			<div>
				<div class="eyebrow">项目收件箱</div>
				<h1>待你处理</h1>
				<p class="view-subtitle">离开期间发生的审核、澄清、验证等待和重要故障会集中在这里，回到项目时从高信号事项开始。</p>
			</div>
			<div class="inbox-count"><strong>{{ paperStore.openInboxCount }}</strong><span>未解决</span></div>
		</header>

		<div class="inbox-toolbar"><div class="filter-tabs"><button type="button" :class="{ active: filter === 'open' }" @click="filter = 'open'">未解决</button><button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button></div><span>状态会在 Gate 决策、澄清回答或手动处理后更新。</span></div>

		<section v-if="items.length > 0" class="inbox-list">
			<article v-for="item in items" :key="item.id" class="inbox-item" :class="[item.severity, { unread: item.status === 'open' }]">
				<div class="item-severity"><span class="severity-dot"></span><span>{{ severityLabel(item.severity) }}</span></div>
				<div class="item-main"><div class="item-title-row"><h2>{{ item.title }}</h2><span v-if="item.stage" class="stage-tag">{{ stageLabel(item.stage) }}</span></div><p>{{ item.summary }}</p><div class="item-meta"><time>{{ formatDate(item.updatedAt) }}</time><span>{{ item.status === 'resolved' ? '已解决' : item.status === 'read' ? '已读' : '未读' }}</span></div></div>
				<div class="item-actions"><button type="button" class="item-open" @click="openItem(item)"><span class="mdi mdi-arrow-right" aria-hidden="true"></span>处理</button><button v-if="item.status !== 'resolved'" type="button" class="item-resolve" :disabled="paperStore.pendingOperations.markInboxItem" title="标记为已解决" aria-label="标记为已解决" @click="resolveItem(item)"><span class="mdi mdi-check" aria-hidden="true"></span></button></div>
			</article>
		</section>
		<div v-else class="empty-inbox"><span class="mdi mdi-inbox-check-outline" aria-hidden="true"></span><strong>{{ filter === 'open' ? '当前没有待处理事项' : '收件箱还是空的' }}</strong><span>Gate 请求、澄清、验证等待或重要故障会在这里留下可定位的记录。</span></div>
	</div>
</template>

<style scoped>
.inbox-view {
	min-height: 100%;
	padding: 30px 38px 46px;
	background: var(--pix-bg-content);
}

.view-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 20px;
	max-width: 980px;
	margin: 0 auto;
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
}

h2 {
	font-size: 18px;
}

.view-subtitle {
	max-width: 690px;
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 14px;
}

.inbox-count {
	display: flex;
	align-items: baseline;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.inbox-count strong {
	color: var(--pix-warning);
	font-family: var(--pix-font-ui);
	font-size: 28px;
	font-weight: 500;
}

.inbox-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	max-width: 980px;
	margin: 28px auto 0;
	padding: 10px 0;
	border-top: 1px solid var(--pix-border-light);
	border-bottom: 1px solid var(--pix-border-light);
	color: var(--pix-text-muted);
	font-size: 11px;
}

.filter-tabs {
	display: inline-flex;
	gap: 3px;
}

.filter-tabs button {
	min-height: 28px;
	padding: 0 9px;
	border-radius: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 600;
}

.filter-tabs button:hover,
.filter-tabs button.active {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.inbox-list {
	display: flex;
	flex-direction: column;
	max-width: 980px;
	margin: 24px auto 0;
}

.inbox-item {
	display: grid;
	grid-template-columns: 82px minmax(0, 1fr) auto;
	gap: 18px;
	padding: 18px 6px;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.inbox-item.unread {
	background: var(--pix-warning-bg);
}

.item-severity {
	display: flex;
	align-items: flex-start;
	gap: 6px;
	padding-top: 4px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.severity-dot {
	width: 7px;
	height: 7px;
	margin-top: 2px;
	border-radius: 50%;
	background: var(--pix-info);
}

.inbox-item.warning .severity-dot {
	background: var(--pix-warning);
}

.inbox-item.error .severity-dot {
	background: var(--pix-error);
}

.item-main {
	min-width: 0;
}

.item-title-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.item-title-row h2 {
	font-size: 17px;
}

.stage-tag {
	padding: 2px 6px;
	border-radius: 4px;
	background: var(--pix-bg-subtle);
	color: var(--pix-text-secondary);
	font-size: 11px;
}

.item-main > p {
	margin-top: 7px;
	color: var(--pix-text-secondary);
	font-size: 12px;
	line-height: 1.55;
}

.item-meta {
	display: flex;
	gap: 12px;
	margin-top: 9px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.item-actions {
	display: flex;
	align-items: center;
	gap: 5px;
	padding-top: 2px;
}

.item-open {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-height: 29px;
	padding: 0 8px;
	border-radius: 5px;
	color: var(--pix-accent);
	font-size: 11px;
	font-weight: 600;
}

.item-open:hover {
	background: var(--pix-accent-light);
}

.item-resolve {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 27px;
	height: 27px;
	border-radius: 5px;
	color: var(--pix-text-muted);
	font-size: 16px;
}

.item-resolve:hover {
	background: var(--pix-success-light);
	color: var(--pix-success);
}

.empty-inbox {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 9px;
	max-width: 980px;
	min-height: 260px;
	margin: 24px auto 0;
	border: 1px dashed var(--pix-border);
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.empty-inbox .mdi {
	color: var(--pix-text-muted);
	font-size: 32px;
}

.empty-inbox strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 17px;
	font-weight: 500;
}

@media (max-width: 700px) {
	.inbox-view {
		padding: 24px 18px 36px;
	}

	.view-header,
	.inbox-toolbar {
		align-items: flex-start;
		flex-direction: column;
	}

	.inbox-item {
		grid-template-columns: 1fr auto;
		gap: 8px;
	}

	.item-severity {
		grid-column: 1 / -1;
	}
}
</style>
