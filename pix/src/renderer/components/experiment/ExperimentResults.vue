<script setup lang="ts">
/**
 * ExperimentResults - Experiment results display
 *
 * Display experiment results with charts and statistics.
 */
import { ref, computed, onMounted } from 'vue';

interface Props {
  nodeId: string;
  results?: ExperimentResult[];
}

interface ExperimentResult {
  id: string;
  method: string;
  dataset: string;
  metrics: Record<string, number>;
  config: Record<string, unknown>;
  timestamp: number;
}

interface MetricComparison {
  metric: string;
  values: { method: string; value: number; isBest: boolean }[];
  bestMethod: string;
  bestValue: number;
}

const props = defineProps<Props>();

// Local state
const selectedMetric = ref<string | null>(null);
const selectedDataset = ref<string | null>(null);
const viewMode = ref<'table' | 'chart'>('table');

// Computed
const uniqueDatasets = computed(() => {
  if (!props.results) return [];
  return [...new Set(props.results.map(r => r.dataset))];
});

const uniqueMethods = computed(() => {
  if (!props.results) return [];
  return [...new Set(props.results.map(r => r.method))];
});

const uniqueMetrics = computed(() => {
  if (!props.results || props.results.length === 0) return [];
  return Object.keys(props.results[0].metrics);
});

const filteredResults = computed(() => {
  if (!props.results) return [];

  let results = props.results;

  if (selectedDataset.value) {
    results = results.filter(r => r.dataset === selectedDataset.value);
  }

  return results;
});

const metricComparisons = computed((): MetricComparison[] => {
  if (!filteredResults.value.length) return [];

  return uniqueMetrics.value.map(metric => {
    const values = filteredResults.value
      .filter(r => r.metrics[metric] !== undefined)
      .map(r => ({
        method: r.method,
        value: r.metrics[metric],
        isBest: false,
      }));

    // Find best value (assuming higher is better for most metrics)
    const bestValue = Math.max(...values.map(v => v.value));
    const bestMethod = values.find(v => v.value === bestValue)?.method || '';

    // Mark best values
    values.forEach(v => {
      v.isBest = v.value === bestValue;
    });

    return {
      metric,
      values,
      bestMethod,
      bestValue,
    };
  });
});

const resultsByDataset = computed(() => {
  if (!filteredResults.value.length) return new Map<string, ExperimentResult[]>();

  const groups = new Map<string, ExperimentResult[]>();
  for (const result of filteredResults.value) {
    const group = groups.get(result.dataset) || [];
    group.push(result);
    groups.set(result.dataset, group);
  }
  return groups;
});

// Methods
function formatMetricValue(value: number): string {
  if (value >= 1000) {
    return value.toFixed(0);
  } else if (value >= 1) {
    return value.toFixed(2);
  } else {
    return value.toFixed(4);
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getMetricColor(value: number, bestValue: number): string {
  const ratio = value / bestValue;
  if (ratio >= 0.95) return 'success';
  if (ratio >= 0.9) return 'warning';
  return 'error';
}

function selectMetric(metric: string) {
  selectedMetric.value = selectedMetric.value === metric ? null : metric;
}

function selectDataset(dataset: string) {
  selectedDataset.value = selectedDataset.value === dataset ? null : dataset;
}
</script>

<template>
  <div class="experiment-results">
    <div class="results-header">
      <v-icon size="small" class="mr-1">mdi-chart-bar</v-icon>
      <span class="text-subtitle-2">实验结果</span>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="filter-group">
        <div class="filter-label">数据集:</div>
        <div class="filter-chips">
          <v-chip
            v-for="dataset in uniqueDatasets"
            :key="dataset"
            size="small"
            :color="selectedDataset === dataset ? 'primary' : undefined"
            :variant="selectedDataset === dataset ? 'flat' : 'outlined'"
            @click="selectDataset(dataset)"
          >
            {{ dataset }}
          </v-chip>
        </div>
      </div>

      <div class="filter-group">
        <div class="filter-label">指标:</div>
        <div class="filter-chips">
          <v-chip
            v-for="metric in uniqueMetrics"
            :key="metric"
            size="small"
            :color="selectedMetric === metric ? 'primary' : undefined"
            :variant="selectedMetric === metric ? 'flat' : 'outlined'"
            @click="selectMetric(metric)"
          >
            {{ metric }}
          </v-chip>
        </div>
      </div>
    </div>

    <!-- View Mode Toggle -->
    <div class="view-toggle">
      <v-btn-toggle v-model="viewMode" density="compact" variant="outlined">
        <v-btn value="table" size="small">
          <v-icon size="small">mdi-table</v-icon>
        </v-btn>
        <v-btn value="chart" size="small">
          <v-icon size="small">mdi-chart-bar</v-icon>
        </v-btn>
      </v-btn-toggle>
    </div>

    <!-- Table View -->
    <div v-if="viewMode === 'table'" class="results-table">
      <v-table density="compact">
        <thead>
          <tr>
            <th>方法</th>
            <th v-for="metric in uniqueMetrics" :key="metric">
              {{ metric }}
            </th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="result in filteredResults" :key="result.id">
            <td>{{ result.method }}</td>
            <td
              v-for="metric in uniqueMetrics"
              :key="metric"
              :class="{ 'best-value': result.metrics[metric] === metricComparisons.find(m => m.metric === metric)?.bestValue }"
            >
              {{ formatMetricValue(result.metrics[metric]) }}
            </td>
            <td>{{ formatTimestamp(result.timestamp) }}</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <!-- Chart View -->
    <div v-else class="results-chart">
      <div
        v-for="comparison in metricComparisons"
        :key="comparison.metric"
        class="metric-chart"
        :class="{ 'selected': selectedMetric === comparison.metric }"
        @click="selectMetric(comparison.metric)"
      >
        <div class="chart-title">{{ comparison.metric }}</div>
        <div class="chart-bars">
          <div
            v-for="item in comparison.values"
            :key="item.method"
            class="chart-bar"
          >
            <div class="bar-label">{{ item.method }}</div>
            <div class="bar-container">
              <div
                class="bar-fill"
                :style="{ width: `${(item.value / comparison.bestValue) * 100}%` }"
                :class="getMetricColor(item.value, comparison.bestValue)"
              />
            </div>
            <div class="bar-value" :class="{ 'best': item.isBest }">
              {{ formatMetricValue(item.value) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <div v-if="filteredResults.length > 0" class="results-summary">
      <div class="summary-item">
        <span class="summary-label">总实验数:</span>
        <span class="summary-value">{{ filteredResults.length }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">方法数:</span>
        <span class="summary-value">{{ uniqueMethods.length }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">数据集数:</span>
        <span class="summary-value">{{ uniqueDatasets.length }}</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <v-icon size="48" color="grey">mdi-chart-bar</v-icon>
      <div class="text-body-2 mt-2">暂无实验结果</div>
    </div>
  </div>
</template>

<style scoped>
.experiment-results {
  padding: 12px;
}

.results-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.filters {
  margin-bottom: 16px;
}

.filter-group {
  margin-bottom: 8px;
}

.filter-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 4px;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.view-toggle {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.results-table {
  margin-bottom: 16px;
}

.best-value {
  font-weight: 600;
  color: rgb(var(--v-theme-success));
}

.results-chart {
  margin-bottom: 16px;
}

.metric-chart {
  padding: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.metric-chart:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
}

.metric-chart.selected {
  border-color: rgb(var(--v-theme-primary));
}

.chart-title {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 8px;
}

.chart-bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chart-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-label {
  min-width: 80px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.bar-container {
  flex: 1;
  height: 16px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.bar-fill.success {
  background: rgb(var(--v-theme-success));
}

.bar-fill.warning {
  background: rgb(var(--v-theme-warning));
}

.bar-fill.error {
  background: rgb(var(--v-theme-error));
}

.bar-value {
  min-width: 60px;
  text-align: right;
  font-size: 0.75rem;
  font-weight: 500;
}

.bar-value.best {
  color: rgb(var(--v-theme-success));
  font-weight: 600;
}

.results-summary {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.summary-label {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.summary-value {
  font-size: 1.25rem;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
