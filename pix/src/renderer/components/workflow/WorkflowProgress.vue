<script setup lang="ts">
/**
 * WorkflowProgress - DAG workflow visualization
 *
 * Displays workflow nodes as a linear progress bar (v1).
 * Backend supports full DAG, UI simplifies to linear view.
 */
import { computed } from 'vue';
import type { WorkflowNode, NodeStatus } from '@/types/workflow';

interface Props {
  nodes: WorkflowNode[];
  currentNodeId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select-node', nodeId: string): void;
}>();

// Ordered nodes for linear display
const orderedNodes = computed(() => {
  // Sort by dependencies (topological order)
  const sorted: WorkflowNode[] = [];
  const visited = new Set<string>();

  const visit = (node: WorkflowNode) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Visit dependencies first
    for (const depId of node.dependencies) {
      const dep = props.nodes.find(n => n.id === depId);
      if (dep) visit(dep);
    }

    sorted.push(node);
  };

  for (const node of props.nodes) {
    visit(node);
  }

  return sorted;
});

function getStatusIcon(status: NodeStatus): string {
  switch (status) {
    case 'completed': return 'mdi-check-circle';
    case 'running': return 'mdi-loading';
    case 'failed': return 'mdi-alert-circle';
    case 'blocked': return 'mdi-lock';
    case 'paused': return 'mdi-pause-circle';
    default: return 'mdi-circle-outline';
  }
}

function getStatusColor(status: NodeStatus): string {
  switch (status) {
    case 'completed': return 'success';
    case 'running': return 'primary';
    case 'failed': return 'error';
    case 'blocked': return 'warning';
    case 'paused': return 'info';
    default: return 'grey';
  }
}

function isNodeClickable(node: WorkflowNode): boolean {
  return node.status !== 'pending' || node.dependencies.every(depId => {
    const dep = props.nodes.find(n => n.id === depId);
    return dep?.status === 'completed';
  });
}
</script>

<template>
  <div class="workflow-progress">
    <div class="progress-header">
      <v-icon size="small" class="mr-1">mdi-sitemap</v-icon>
      <span class="text-subtitle-2">工作流进度</span>
    </div>

    <div class="progress-nodes">
      <div
        v-for="(node, index) in orderedNodes"
        :key="node.id"
        class="node-item"
        :class="{
          'node-active': node.id === currentNodeId,
          'node-clickable': isNodeClickable(node),
        }"
        @click="isNodeClickable(node) && emit('select-node', node.id)"
      >
        <!-- Connector line -->
        <div v-if="index > 0" class="node-connector" :class="{ 'connector-active': node.status !== 'pending' }" />

        <!-- Node circle -->
        <div class="node-circle">
          <v-icon :color="getStatusColor(node.status)" :size="20">
            {{ getStatusIcon(node.status) }}
          </v-icon>
        </div>

        <!-- Node info -->
        <div class="node-info">
          <div class="node-name">{{ node.name }}</div>
          <div class="node-status text-caption">{{ node.description }}</div>
        </div>

        <!-- Approval badge -->
        <v-chip
          v-if="node.approvalRequired && node.status === 'running'"
          size="x-small"
          color="warning"
          variant="flat"
          class="ml-2"
        >
          需确认
        </v-chip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-progress {
  padding: 12px;
}

.progress-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.progress-nodes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  position: relative;
  transition: background-color 0.2s;
}

.node-item.node-active {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.node-item.node-clickable {
  cursor: pointer;
}

.node-item.node-clickable:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.node-connector {
  position: absolute;
  left: 19px;
  top: -4px;
  width: 2px;
  height: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.12);
}

.node-connector.connector-active {
  background-color: rgb(var(--v-theme-primary));
}

.node-circle {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-info {
  flex: 1;
  min-width: 0;
  margin-left: 8px;
}

.node-name {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-status {
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
