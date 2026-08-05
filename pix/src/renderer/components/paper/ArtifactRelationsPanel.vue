<script setup lang="ts">
import { computed } from "vue";
import type { Artifact } from "../../../shared/types";
import { artifactName, artifactTypeLabel, relationLabel, resolveArtifactRelations, stageLabel } from "../../utils/paper";

const props = defineProps<{
	artifact: Artifact;
	artifacts: Artifact[];
	compact?: boolean;
}>();

const emit = defineEmits<{
	openArtifact: [artifactId: string];
}>();

const relations = computed(() => resolveArtifactRelations(props.artifact, props.artifacts));
const outgoing = computed(() => relations.value.filter((item) => item.direction === "outgoing"));
const incoming = computed(() => relations.value.filter((item) => item.direction === "incoming"));

function targetName(target: Artifact | null, targetPath?: string): string {
	return target ? artifactName(target.path) : targetPath ? artifactName(targetPath) : "未登记产物";
}

function targetType(target: Artifact | null): string {
	return target ? `${artifactTypeLabel(target.type)} · ${stageLabel(target.stage)}` : "关系目标尚未登记";
}
</script>

<template>
	<section class="relations-panel" :class="{ compact }" aria-labelledby="artifact-relations-title">
		<div class="relations-heading">
			<div>
				<span class="section-label">产物关系</span>
				<h2 id="artifact-relations-title">{{ relations.length }} 条关联</h2>
			</div>
			<span class="mdi mdi-graph-outline" aria-hidden="true"></span>
		</div>
		<div v-if="relations.length > 0" class="relations-groups">
			<div v-if="outgoing.length > 0" class="relation-group">
				<span class="group-label">当前产物指向</span>
				<button v-for="item in outgoing" :key="`out-${item.relation.kind}-${item.relation.targetArtifactId ?? item.relation.targetPath}`" type="button" class="relation-row" :disabled="!item.target" @click="item.target && emit('openArtifact', item.target.id)">
					<span class="relation-kind">{{ item.relation.label || relationLabel(item.relation.kind) }}</span>
					<span class="relation-copy"><strong>{{ targetName(item.target, item.relation.targetPath) }}</strong><small>{{ targetType(item.target) }}</small></span>
					<span class="mdi mdi-arrow-top-right" aria-hidden="true"></span>
				</button>
			</div>
			<div v-if="incoming.length > 0" class="relation-group">
				<span class="group-label">支撑当前产物</span>
				<button v-for="item in incoming" :key="`in-${item.source.id}-${item.relation.kind}`" type="button" class="relation-row" @click="emit('openArtifact', item.source.id)">
					<span class="relation-kind">{{ item.relation.label || relationLabel(item.relation.kind) }}</span>
					<span class="relation-copy"><strong>{{ artifactName(item.source.path) }}</strong><small>{{ artifactTypeLabel(item.source.type) }} · {{ stageLabel(item.source.stage) }}</small></span>
					<span class="mdi mdi-arrow-top-right" aria-hidden="true"></span>
				</button>
			</div>
		</div>
		<div v-else class="relations-empty"><span class="mdi mdi-link-variant-off" aria-hidden="true"></span><span>暂无已登记关系</span></div>
	</section>
</template>

<style scoped>
.relations-panel {
	padding: 16px 0 18px;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.relations-heading,
.relation-row {
	display: flex;
	align-items: center;
}

.relations-heading {
	justify-content: space-between;
	gap: 12px;
}

.relations-heading > .mdi {
	color: var(--pix-text-muted);
	font-size: 18px;
}

.section-label,
.group-label {
	display: block;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

h2 {
	margin-top: 5px;
	font-family: var(--pix-font-ui);
	font-size: 17px;
	font-weight: 500;
}

.relations-groups {
	display: flex;
	flex-direction: column;
	gap: 15px;
	margin-top: 14px;
}

.relation-group {
	display: flex;
	flex-direction: column;
}

.group-label {
	margin-bottom: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.relation-row {
	gap: 8px;
	width: 100%;
	min-width: 0;
	padding: 8px 3px;
	border-top: 1px solid var(--pix-border-subtle);
	color: var(--pix-text-secondary);
	text-align: left;
}

.relation-row:last-child {
	border-bottom: 1px solid var(--pix-border-subtle);
}

.relation-row:hover:not(:disabled) {
	background: var(--pix-bg-hover);
	color: var(--pix-accent);
}

.relation-row:disabled {
	cursor: default;
	opacity: 0.65;
}

.relation-kind {
	min-width: 76px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	text-transform: uppercase;
}

.relation-copy {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	flex: 1;
}

.relation-copy strong,
.relation-copy small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.relation-copy strong {
	font-size: 11px;
	font-weight: 600;
}

.relation-copy small {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.relation-row > .mdi {
	color: var(--pix-text-muted);
	font-size: 14px;
}

.relations-empty {
	display: flex;
	align-items: center;
	gap: 7px;
	margin-top: 13px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.relations-empty .mdi {
	font-size: 16px;
}

.compact {
	padding-top: 10px;
}
</style>
