<script setup lang="ts">
/**
 * ArtifactList - stage artifact registry (design §6.2).
 *
 * Lists artifacts declared by the agent across stages. Each row opens the
 * artifact with the OS default handler; the folder button reveals it in the
 * file manager (useful for .md/.json that open poorly in the default editor).
 */
import type { Artifact } from "../../../shared/types";

defineProps<{ artifacts: Artifact[] }>();
const emit = defineEmits<{
  open: [path: string];
  "open-in-folder": [path: string];
}>();

const TYPE_LABELS: Record<Artifact["type"], string> = {
  paper: "论文",
  paper_pdf: "导出",
  survey: "综述",
  method: "方法",
  repo: "代码库",
  reproduction_log: "复现日志",
  experiment_config: "实验配置",
  experiment_result: "实验结果",
  figure: "图表",
  literature_pool: "文献池",
};

function nameOf(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
</script>

<template>
  <div class="artifact-list">
    <div v-if="artifacts.length === 0" class="empty">暂无产物</div>
    <div v-for="a in artifacts" :key="a.id" class="artifact-row" :title="a.path">
      <button type="button" class="artifact-main" @click="emit('open', a.path)">
        <span class="artifact-type">{{ TYPE_LABELS[a.type] }}</span>
        <span class="artifact-name">{{ nameOf(a.path) }}</span>
      </button>
      <button
        type="button"
        class="artifact-folder-btn"
        title="在文件夹中打开"
        aria-label="在文件夹中打开"
        @click="emit('open-in-folder', a.path)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.artifact-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-muted);
  padding: var(--pix-space-xs) 0;
}

.artifact-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-content);
  transition: background var(--pix-transition-fast), border-color var(--pix-transition-fast);
}

.artifact-row:hover {
  background: var(--pix-bg-hover);
  border-color: var(--pix-border);
}

.artifact-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.artifact-type {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: var(--pix-radius-xs);
  background: var(--pix-accent-light);
  color: var(--pix-accent);
  font-size: 11px;
  font-weight: var(--pix-weight-semibold);
}

.artifact-name {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-family: var(--pix-font-mono);
}

.artifact-folder-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 2px;
  border-radius: var(--pix-radius-xs);
  color: var(--pix-text-muted);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--pix-transition-fast), background var(--pix-transition-fast);
}

.artifact-folder-btn:hover {
  color: var(--pix-accent);
  background: var(--pix-accent-light);
}
</style>
