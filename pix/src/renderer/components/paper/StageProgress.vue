<script setup lang="ts">
/**
 * StageProgress - five-stage progress indicator (design §6.2).
 *
 * Shows the five paper stages with their current status; the current stage is
 * highlighted. Clicking a stage emits `select` (e.g. to inspect its artifacts).
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { StageId, StageState } from "../../../shared/types";

const props = defineProps<{
  current: StageId | null;
  stages: Record<StageId, StageState> | null;
  selected?: StageId | null;
}>();

const emit = defineEmits<{ select: [stage: StageId] }>();

const STAGES: Array<{ id: StageId; label: string }> = [
  { id: "literature", label: "文献调研" },
  { id: "reproduction", label: "代码复现" },
  { id: "improvement", label: "方法改进" },
  { id: "experiment", label: "实验执行" },
  { id: "writing", label: "论文撰写" },
];

const items = computed(() =>
  STAGES.map((s) => ({
    ...s,
    state: props.stages?.[s.id] ?? null,
    isCurrent: props.current === s.id,
    isSelected: (props.selected ?? props.current) === s.id,
    isReworkTarget: Object.values(props.stages ?? {}).some((state) => state.reworkTarget === s.id),
  })),
);

// Tick `now` so running-stage elapsed times stay fresh (B3).
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 10_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function labelOf(stage: StageId): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return "<1min";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${rest}min` : `${hours}h`;
}

function statusText(state: StageState | null): string {
  switch (state?.status) {
    case "running": {
      const elapsed = state.startedAt ? formatDuration(now.value - state.startedAt) : "";
      return elapsed ? `进行中 · ${elapsed}` : "进行中";
    }
    case "awaiting_gate": return "待审核";
    case "passed": return "已通过";
    case "failed": return "失败";
    case "rework": return state.reworkTarget ? `返工至${labelOf(state.reworkTarget)}` : "返工";
    default: return "未开始";
  }
}

function tooltip(state: StageState | null, label: string): string {
  const parts = [label, statusText(state)];
  if (state?.startedAt) parts.push(`开始 ${new Date(state.startedAt).toLocaleString()}`);
  if (state?.finishedAt) parts.push(`完成 ${new Date(state.finishedAt).toLocaleString()}`);
  return parts.join(" · ");
}
</script>

<template>
  <div class="stage-progress">
    <template v-for="(item, index) in items" :key="item.id">
      <button
        type="button"
        class="stage-step"
        :class="[item.state?.status ?? 'pending', { current: item.isCurrent, selected: item.isSelected, 'rework-target': item.isReworkTarget }]"
        :aria-current="item.isCurrent ? 'step' : undefined"
        :aria-pressed="item.isSelected"
        :title="tooltip(item.state, item.label)"
        @click="emit('select', item.id)"
      >
        <span class="step-index">{{ index + 1 }}</span>
        <span class="step-label">{{ item.label }}</span>
        <span class="step-status">{{ statusText(item.state) }}</span>
        <span v-if="item.isReworkTarget" class="rework-target-label">← 返工目标</span>
      </button>
      <span v-if="index < items.length - 1" class="step-connector" aria-hidden="true"></span>
    </template>
  </div>
</template>

<style scoped>
.stage-progress {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px var(--pix-space-lg);
  background: var(--pix-bg-topbar);
  border-bottom: 1px solid var(--pix-border-light);
  flex-shrink: 0;
  overflow-x: auto;
}

.stage-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-content);
  color: var(--pix-text-secondary);
  font-size: var(--pix-text-xs);
  font-family: var(--pix-font-ui);
  cursor: pointer;
  transition: background var(--pix-transition-fast), border-color var(--pix-transition-fast), color var(--pix-transition-fast);
  white-space: nowrap;
}

.stage-step:hover {
  background: var(--pix-bg-hover);
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--pix-bg-hover);
  color: var(--pix-text-muted);
  font-size: 11px;
  font-weight: var(--pix-weight-semibold);
}

.step-label {
  font-weight: var(--pix-weight-medium);
}

.step-status {
  color: var(--pix-text-muted);
}

.stage-step.current {
  border-color: var(--pix-accent);
  background: var(--pix-accent-light);
  color: var(--pix-accent);
}
.stage-step.current .step-index {
  background: var(--pix-accent);
  color: var(--pix-text-inverse);
}
.stage-step.current .step-status {
  color: var(--pix-accent);
}

.stage-step.selected {
  box-shadow: inset 0 -2px 0 var(--pix-accent);
}

.stage-step.rework-target {
  border-color: var(--pix-error-light);
}

.rework-target-label {
  color: var(--pix-error);
  font-size: 11px;
  font-weight: var(--pix-weight-semibold);
}

.stage-step.passed {
  border-color: var(--pix-success-light);
}
.stage-step.passed .step-index {
  background: var(--pix-success);
  color: var(--pix-text-inverse);
}
.stage-step.passed .step-status {
  color: var(--pix-success);
}

.stage-step.awaiting_gate {
  border-color: var(--pix-warning-light);
  background: var(--pix-warning-bg);
}
.stage-step.awaiting_gate .step-status {
  color: var(--pix-warning);
}

.stage-step.failed,
.stage-step.rework {
  border-color: var(--pix-error-light);
}
.stage-step.failed .step-status,
.stage-step.rework .step-status {
  color: var(--pix-error);
}

.step-connector {
  width: 12px;
  height: 1px;
  background: var(--pix-border);
  flex-shrink: 0;
}
</style>
