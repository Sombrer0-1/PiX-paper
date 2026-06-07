<script setup lang="ts">
/**
 * CitationVerifierPanel - Verify claims are supported by citations
 *
 * Display verification results for paper claims.
 */
import { computed } from 'vue';

interface Claim {
  id: string;
  text: string;
  type: 'background' | 'method' | 'result' | 'limitation' | 'speculation';
  citations: string[];
  verified: boolean;
  verificationDetails?: string;
}

interface VerificationResult {
  claimId: string;
  supported: boolean;
  confidence: number;
  evidence: string[];
  issues: string[];
}

interface Props {
  claims: Claim[];
  results: Map<string, VerificationResult> | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'verify', claimId: string): void;
  (e: 'verify-all'): void;
}>();

// Summary statistics
const summary = computed(() => {
  if (!props.results) return null;

  let supported = 0;
  let unsupported = 0;
  let totalConfidence = 0;

  for (const result of props.results.values()) {
    if (result.supported) {
      supported++;
    } else {
      unsupported++;
    }
    totalConfidence += result.confidence;
  }

  return {
    total: props.results.size,
    supported,
    unsupported,
    avgConfidence: props.results.size > 0 ? totalConfidence / props.results.size : 0,
  };
});

// Claims with results
const claimsWithResults = computed(() => {
  return props.claims.map(claim => ({
    ...claim,
    result: props.results?.get(claim.id) || null,
  }));
});

function getClaimTypeLabel(type: string): string {
  switch (type) {
    case 'background': return '背景';
    case 'method': return '方法';
    case 'result': return '结果';
    case 'limitation': return '局限';
    case 'speculation': return '推测';
    default: return type;
  }
}

function getClaimTypeColor(type: string): string {
  switch (type) {
    case 'background': return 'info';
    case 'method': return 'primary';
    case 'result': return 'success';
    case 'limitation': return 'warning';
    case 'speculation': return 'grey';
    default: return 'grey';
  }
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'warning';
  return 'error';
}

function getConfidenceLabel(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}
</script>

<template>
  <div class="citation-verifier">
    <!-- Header -->
    <div class="panel-header">
      <v-icon size="small" class="mr-1">mdi-check-decagram</v-icon>
      <span class="text-subtitle-2">引用验证</span>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        @click="emit('verify-all')"
      >
        验证全部
      </v-btn>
    </div>

    <!-- Summary -->
    <div v-if="summary" class="summary-card">
      <div class="summary-stats">
        <div class="stat">
          <div class="stat-value">{{ summary.total }}</div>
          <div class="stat-label">总声明</div>
        </div>
        <div class="stat">
          <div class="stat-value text-success">{{ summary.supported }}</div>
          <div class="stat-label">已验证</div>
        </div>
        <div class="stat">
          <div class="stat-value text-error">{{ summary.unsupported }}</div>
          <div class="stat-label">未验证</div>
        </div>
        <div class="stat">
          <v-progress-circular
            :model-value="summary.avgConfidence * 100"
            :color="getConfidenceColor(summary.avgConfidence)"
            size="36"
            width="3"
          >
            <span class="text-caption">{{ getConfidenceLabel(summary.avgConfidence) }}</span>
          </v-progress-circular>
          <div class="stat-label mt-1">置信度</div>
        </div>
      </div>
    </div>

    <!-- Claims list -->
    <div class="claims-list">
      <div v-if="claims.length === 0" class="empty-state">
        <v-icon size="32" color="grey">mdi-text-box-outline</v-icon>
        <div class="text-caption mt-2">暂无声明</div>
      </div>

      <div
        v-for="claim in claimsWithResults"
        :key="claim.id"
        class="claim-item"
      >
        <div class="claim-header">
          <v-chip
            size="x-small"
            :color="getClaimTypeColor(claim.type)"
            variant="flat"
          >
            {{ getClaimTypeLabel(claim.type) }}
          </v-chip>
          <v-chip
            v-if="claim.citations.length > 0"
            size="x-small"
            variant="outlined"
            class="ml-2"
          >
            {{ claim.citations.length }} 引用
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="!claim.result"
            size="x-small"
            variant="text"
            @click="emit('verify', claim.id)"
          >
            验证
          </v-btn>
          <v-icon
            v-else-if="claim.result.supported"
            color="success"
            size="small"
          >
            mdi-check-circle
          </v-icon>
          <v-icon
            v-else
            color="error"
            size="small"
          >
            mdi-alert-circle
          </v-icon>
        </div>

        <div class="claim-text">{{ claim.text }}</div>

        <!-- Verification details -->
        <div v-if="claim.result" class="claim-verification">
          <div v-if="claim.result.issues.length > 0" class="issues">
            <div v-for="(issue, index) in claim.result.issues" :key="index" class="issue">
              <v-icon size="x-small" color="error" class="mr-1">mdi-alert</v-icon>
              <span class="text-caption">{{ issue }}</span>
            </div>
          </div>
          <div v-if="claim.result.evidence.length > 0" class="evidence">
            <div v-for="(ev, index) in claim.result.evidence" :key="index" class="ev">
              <v-icon size="x-small" color="success" class="mr-1">mdi-check</v-icon>
              <span class="text-caption">{{ ev }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.citation-verifier {
  padding: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.summary-card {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.summary-stats {
  display: flex;
  justify-content: space-around;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
}

.stat-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.claims-list {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.claim-item {
  padding: 10px;
  border-radius: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}

.claim-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.claim-text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.claim-verification {
  margin-top: 8px;
  padding: 8px;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 4px;
}

.issues,
.evidence {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.issue,
.ev {
  display: flex;
  align-items: flex-start;
}
</style>
