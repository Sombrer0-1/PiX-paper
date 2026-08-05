<script setup lang="ts">
/**
 * GateCard - stage gate review card (design §4.2, §6.2).
 *
 * Shown when the agent calls request_stage_review. Displays the agent's stage
 * summary, declared artifacts (clickable to preview/open) and best-effort
 * quality checks (with detail), and offers three decisions:
 * continue / rework (pick target stage + reason) / abort (with confirmation).
 *
 * Visually parallels ClarificationCard but uses the dedicated paper-gate IPC
 * channel (not request_user_input).
 */
import { ref, computed } from "vue";
import type { GateRequest, StageId } from "../../../shared/types";

const props = defineProps<{ gate: GateRequest }>();
const emit = defineEmits<{
  decide: [payload: { decision: "rework" | "continue" | "abort"; reworkTarget?: StageId; reason?: string }];
  "open-artifact": [path: string];
}>();

const STAGE_LABELS: Array<{ id: StageId; label: string }> = [
  { id: "literature", label: "文献调研" },
  { id: "reproduction", label: "代码复现" },
  { id: "improvement", label: "方法改进" },
  { id: "experiment", label: "实验执行" },
  { id: "writing", label: "论文撰写" },
];

const STAGE_ORDER: StageId[] = ["literature", "reproduction", "improvement", "experiment", "writing"];

const mode = ref<"choose" | "rework" | "confirm-abort">("choose");
const reworkTarget = ref<StageId>(props.gate.stage);
const reason = ref("");

const stageLabel = computed(() => STAGE_LABELS.find((s) => s.id === props.gate.stage)?.label ?? props.gate.stage);

// Rework can target the current stage or any earlier one.
const reworkTargets = computed(() => {
  const idx = STAGE_ORDER.indexOf(props.gate.stage);
  return STAGE_LABELS.filter((s) => STAGE_ORDER.indexOf(s.id) <= idx);
});

function nameOf(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function continueStage(): void {
  emit("decide", { decision: "continue" });
}
function requestAbort(): void {
  mode.value = "confirm-abort";
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
</script>

<template>
  <div class="gate-card">
    <div class="gate-header">
      <span class="gate-badge">阶段审核</span>
      <span class="gate-stage">{{ stageLabel }}</span>
    </div>

    <div class="gate-body">
      <p class="gate-summary">{{ gate.summary }}</p>

      <div v-if="gate.checks.length > 0" class="gate-checks">
        <div
          v-for="(c, i) in gate.checks"
          :key="i"
          class="check-row"
          :class="{ ok: c.ok, bad: !c.ok }"
        >
          <span class="check-dot"></span>
          <div class="check-content">
            <span class="check-label">{{ c.label }}</span>
            <span v-if="c.detail" class="check-detail">{{ c.detail }}</span>
          </div>
        </div>
      </div>

      <div v-if="gate.artifacts.length > 0" class="gate-artifacts">
        <span class="artifacts-title">本阶段产物:</span>
        <button
          v-for="a in gate.artifacts"
          :key="a.id"
          type="button"
          class="artifact-chip"
          :title="`打开 ${a.path}`"
          @click="emit('open-artifact', a.path)"
        >
          {{ nameOf(a.path) }}
        </button>
      </div>
    </div>

    <div v-if="mode === 'choose'" class="gate-actions">
      <button class="gate-btn primary" type="button" @click="continueStage">继续下一阶段</button>
      <button class="gate-btn" type="button" @click="mode = 'rework'">返工</button>
      <button class="gate-btn danger" type="button" @click="requestAbort">终止</button>
    </div>

    <div v-else-if="mode === 'confirm-abort'" class="gate-confirm-abort">
      <p class="confirm-text">确定终止本次 paper 工作吗?当前阶段将标记为失败,自动推进停止。项目与已产出文件不会被删除,可重新打开继续。</p>
      <div class="rework-actions">
        <button class="gate-btn" type="button" @click="mode = 'choose'">取消</button>
        <button class="gate-btn danger" type="button" @click="confirmAbort">确认终止</button>
      </div>
    </div>

    <div v-else class="gate-rework">
      <label class="rework-field">
        <span class="rework-label">返工到</span>
        <select v-model="reworkTarget" class="rework-select">
          <option v-for="t in reworkTargets" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </label>
      <textarea v-model="reason" class="rework-reason" placeholder="返工原因(可选)..." rows="2"></textarea>
      <div class="rework-actions">
        <button class="gate-btn" type="button" @click="mode = 'choose'">取消</button>
        <button class="gate-btn primary" type="button" @click="submitRework">确认返工</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate-card {
  background: var(--pix-bg-card);
  border: 1px solid var(--pix-warning-light);
  border-radius: var(--pix-radius-xl);
  padding: var(--pix-space-md);
  box-shadow: var(--pix-shadow-lg);
  animation: gate-enter 220ms ease-out;
}

@keyframes gate-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.gate-header {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  margin-bottom: var(--pix-space-sm);
}

.gate-badge {
  font-size: var(--pix-text-xs);
  font-weight: var(--pix-weight-semibold);
  color: var(--pix-warning);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: var(--pix-radius-xs);
  background: var(--pix-warning-bg);
}

.gate-stage {
  font-size: var(--pix-text-sm);
  font-weight: var(--pix-weight-semibold);
  color: var(--pix-text-primary);
}

.gate-body {
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-sm);
  margin-bottom: var(--pix-space-md);
}

.gate-summary {
  font-size: var(--pix-text-sm);
  color: var(--pix-text-primary);
  line-height: var(--pix-leading-base);
  margin: 0;
  white-space: pre-wrap;
}

.gate-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--pix-text-xs);
}

.check-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.check-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.check-row.ok .check-dot { background: var(--pix-success); }
.check-row.ok .check-label { color: var(--pix-text-secondary); }
.check-row.bad .check-dot { background: var(--pix-error); }
.check-row.bad .check-label { color: var(--pix-error); font-weight: var(--pix-weight-medium); }

.check-detail {
  color: var(--pix-text-muted);
  font-size: 11px;
  line-height: var(--pix-leading-tight);
  word-break: break-word;
}

.gate-artifacts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.artifacts-title {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-muted);
}

.artifact-chip {
  padding: 2px 8px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xs);
  background: var(--pix-bg-code);
  color: var(--pix-text-secondary);
  font-size: var(--pix-text-xs);
  font-family: var(--pix-font-mono);
  cursor: pointer;
  transition: background var(--pix-transition-fast), color var(--pix-transition-fast), border-color var(--pix-transition-fast);
}

.artifact-chip:hover {
  background: var(--pix-accent-light);
  color: var(--pix-accent);
  border-color: var(--pix-accent-soft);
}

.gate-actions,
.rework-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--pix-space-sm);
}

.gate-btn {
  padding: 6px 16px;
  border-radius: var(--pix-radius-md);
  font-family: var(--pix-font-ui);
  font-size: var(--pix-text-sm);
  font-weight: var(--pix-weight-medium);
  cursor: pointer;
  border: 1px solid var(--pix-border-light);
  background: var(--pix-bg-content);
  color: var(--pix-text-secondary);
  transition: background var(--pix-transition-fast), color var(--pix-transition-fast), border-color var(--pix-transition-fast);
}

.gate-btn:hover {
  background: var(--pix-bg-hover);
  color: var(--pix-text-primary);
}

.gate-btn.primary {
  background: var(--pix-accent);
  color: var(--pix-text-inverse);
  border-color: var(--pix-accent);
}

.gate-btn.primary:hover {
  background: var(--pix-accent-hover);
}

.gate-btn.danger {
  color: var(--pix-error);
  border-color: var(--pix-error-light);
}

.gate-btn.danger:hover {
  background: var(--pix-error-bg);
}

.gate-rework,
.gate-confirm-abort {
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-sm);
}

.confirm-text {
  margin: 0;
  font-size: var(--pix-text-sm);
  color: var(--pix-error);
  line-height: var(--pix-leading-base);
}

.rework-field {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
}

.rework-select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-input);
  color: var(--pix-text-primary);
  font-family: var(--pix-font-ui);
  font-size: var(--pix-text-sm);
}

.rework-reason {
  width: 100%;
  resize: vertical;
  min-height: 48px;
  padding: var(--pix-space-sm) var(--pix-space-md);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-input);
  color: var(--pix-text-primary);
  font-family: var(--pix-font-ui);
  font-size: var(--pix-text-sm);
}

.rework-reason:focus {
  outline: none;
  border-color: var(--pix-accent);
  box-shadow: 0 0 0 3px var(--pix-focus-ring);
}
</style>
