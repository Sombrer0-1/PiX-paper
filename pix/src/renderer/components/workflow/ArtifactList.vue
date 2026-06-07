<script setup lang="ts">
/**
 * ArtifactList - Display project artifacts
 *
 * Shows artifacts grouped by type with provenance indicators.
 */
import { computed } from 'vue';
import type { Artifact, ArtifactType } from '@/types/workflow';

interface Props {
  artifacts: Artifact[];
  selectedId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select', artifactId: string): void;
}>();

// Group artifacts by type
const groupedArtifacts = computed(() => {
  const groups = new Map<ArtifactType, Artifact[]>();

  for (const artifact of props.artifacts) {
    const group = groups.get(artifact.type) || [];
    group.push(artifact);
    groups.set(artifact.type, group);
  }

  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
});

function getTypeIcon(type: ArtifactType): string {
  switch (type) {
    case 'paper': return 'mdi-file-document';
    case 'paper_pdf': return 'mdi-file-pdf-box';
    case 'paper_note': return 'mdi-note-text';
    case 'survey': return 'mdi-bookshelf';
    case 'method': return 'mdi-cog';
    case 'repo': return 'mdi-git';
    case 'experiment_config': return 'mdi-flask';
    case 'experiment_result': return 'mdi-chart-bar';
    case 'figure': return 'mdi-image';
    case 'draft_section': return 'mdi-file-edit';
    case 'literature_pool': return 'mdi-library';
    case 'reproduction_log': return 'mdi-console';
    default: return 'mdi-file';
  }
}

function getTypeLabel(type: ArtifactType): string {
  switch (type) {
    case 'paper': return '论文';
    case 'paper_pdf': return '论文 PDF';
    case 'paper_note': return '笔记';
    case 'survey': return '文献综述';
    case 'method': return '方法';
    case 'repo': return '代码库';
    case 'experiment_config': return '实验配置';
    case 'experiment_result': return '实验结果';
    case 'figure': return '图表';
    case 'draft_section': return '章节草稿';
    case 'literature_pool': return '文献库';
    case 'reproduction_log': return '复现日志';
    default: return type;
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCreatorLabel(creator: string): string {
  switch (creator) {
    case 'user': return '用户';
    case 'agent': return 'AI';
    case 'tool': return '工具';
    default: return creator;
  }
}
</script>

<template>
  <div class="artifact-list">
    <div class="list-header">
      <v-icon size="small" class="mr-1">mdi-folder-open</v-icon>
      <span class="text-subtitle-2">项目产出物</span>
      <v-chip size="x-small" class="ml-2">{{ artifacts.length }}</v-chip>
    </div>

    <div v-if="artifacts.length === 0" class="empty-state">
      <v-icon size="32" color="grey">mdi-folder-open-outline</v-icon>
      <div class="text-caption mt-2">暂无产出物</div>
    </div>

    <div v-else class="groups">
      <div v-for="[type, items] in groupedArtifacts" :key="type" class="artifact-group">
        <div class="group-header">
          <v-icon size="small" class="mr-1">{{ getTypeIcon(type) }}</v-icon>
          <span class="text-caption font-weight-medium">{{ getTypeLabel(type) }}</span>
          <v-chip size="x-small" variant="text">{{ items.length }}</v-chip>
        </div>

        <div class="group-items">
          <div
            v-for="artifact in items"
            :key="artifact.id"
            class="artifact-item"
            :class="{ 'artifact-selected': artifact.id === selectedId }"
            @click="emit('select', artifact.id)"
          >
            <div class="artifact-info">
              <div class="artifact-path text-caption">
                {{ artifact.path.split('/').pop() }}
              </div>
              <div class="artifact-meta text-caption text-grey">
                {{ getCreatorLabel(artifact.createdBy) }} · {{ formatTime(artifact.createdAt) }}
              </div>
            </div>

            <div v-if="artifact.provenance.length > 0" class="artifact-provenance">
              <v-icon size="x-small" color="grey">mdi-source-branch</v-icon>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.artifact-list {
  padding: 12px;
}

.list-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.artifact-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.artifact-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.artifact-item.artifact-selected {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.artifact-info {
  flex: 1;
  min-width: 0;
}

.artifact-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artifact-meta {
  font-size: 0.7rem;
}

.artifact-provenance {
  flex-shrink: 0;
  margin-left: 8px;
}
</style>
