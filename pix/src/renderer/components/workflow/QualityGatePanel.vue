<script setup lang="ts">
/**
 * QualityGatePanel - Display quality gate status
 *
 * Shows quality checks for the current workflow node.
 */
import type { QualityGate, QualityCheck } from '@/types/workflow';

interface Props {
  gate: QualityGate | null;
  loading?: boolean;
}

defineProps<Props>();

function getCheckIcon(status: string): string {
  switch (status) {
    case 'passed': return 'mdi-check-circle';
    case 'warning': return 'mdi-alert';
    case 'failed': return 'mdi-close-circle';
    default: return 'mdi-circle-outline';
  }
}

function getCheckColor(status: string): string {
  switch (status) {
    case 'passed': return 'success';
    case 'warning': return 'warning';
    case 'failed': return 'error';
    default: return 'grey';
  }
}

function getGateIcon(status: string): string {
  switch (status) {
    case 'passed': return 'mdi-shield-check';
    case 'warning': return 'mdi-shield-alert';
    case 'failed': return 'mdi-shield-off';
    default: return 'mdi-shield-outline';
  }
}

function getGateColor(status: string): string {
  switch (status) {
    case 'passed': return 'success';
    case 'warning': return 'warning';
    case 'failed': return 'error';
    default: return 'grey';
  }
}

function getGateLabel(status: string): string {
  switch (status) {
    case 'passed': return '质量检查通过';
    case 'warning': return '存在警告';
    case 'failed': return '质量检查未通过';
    default: return '未检查';
  }
}
</script>

<template>
  <div class="quality-gate-panel">
    <div class="panel-header">
      <v-icon size="small" class="mr-1">mdi-shield-check</v-icon>
      <span class="text-subtitle-2">质量门禁</span>
    </div>

    <div v-if="loading" class="loading-state">
      <v-progress-circular indeterminate size="24" />
      <span class="text-caption ml-2">检查中...</span>
    </div>

    <div v-else-if="!gate" class="empty-state">
      <v-icon size="32" color="grey">mdi-shield-outline</v-icon>
      <div class="text-caption mt-2">暂无质量检查</div>
    </div>

    <div v-else class="gate-content">
      <!-- Gate status -->
      <div class="gate-status" :class="`gate-${gate.status}`">
        <v-icon :color="getGateColor(gate.status)" size="24">
          {{ getGateIcon(gate.status) }}
        </v-icon>
        <span class="ml-2 font-weight-medium">{{ getGateLabel(gate.status) }}</span>
      </div>

      <!-- Checks list -->
      <div class="checks-list">
        <div v-for="check in gate.checks" :key="check.id" class="check-item">
          <v-icon :color="getCheckColor(check.status)" size="16">
            {{ getCheckIcon(check.status) }}
          </v-icon>
          <div class="check-info">
            <div class="check-name text-caption">{{ check.name }}</div>
            <div v-if="check.details" class="check-details text-caption text-grey">
              {{ check.details }}
            </div>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div class="gate-summary text-caption text-grey">
        {{ gate.checks.filter(c => c.status === 'passed').length }} / {{ gate.checks.length }} 项检查通过
      </div>
    </div>
  </div>
</template>

<style scoped>
.quality-gate-panel {
  padding: 12px;
}

.panel-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.gate-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gate-status {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
}

.gate-status.gate-passed {
  background-color: rgba(var(--v-theme-success), 0.08);
}

.gate-status.gate-warning {
  background-color: rgba(var(--v-theme-warning), 0.08);
}

.gate-status.gate-failed {
  background-color: rgba(var(--v-theme-error), 0.08);
}

.checks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.check-info {
  flex: 1;
  min-width: 0;
}

.check-name {
  font-weight: 500;
}

.check-details {
  font-size: 0.7rem;
  margin-top: 2px;
}

.gate-summary {
  text-align: center;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
</style>
