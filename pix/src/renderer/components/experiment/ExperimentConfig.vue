<script setup lang="ts">
/**
 * ExperimentConfig - Experiment configuration panel
 *
 * Configure experiment parameters, datasets, and metrics.
 */
import { ref, computed } from 'vue';

interface Props {
  nodeId: string;
  config?: ExperimentConfig;
}

interface ExperimentConfig {
  datasets: string[];
  metrics: string[];
  baselines: string[];
  parameters: Record<string, unknown>;
  seeds: number[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update', config: ExperimentConfig): void;
  (e: 'run'): void;
}>();

// Local state
const datasets = ref<string[]>(props.config?.datasets || []);
const metrics = ref<string[]>(props.config?.metrics || []);
const baselines = ref<string[]>(props.config?.baselines || []);
const parameters = ref<Record<string, unknown>>(props.config?.parameters || {});
const seeds = ref<number[]>(props.config?.seeds || [42, 123, 456]);

// New item inputs
const newDataset = ref('');
const newMetric = ref('');
const newBaseline = ref('');
const newSeed = ref<number | null>(null);

// Parameter editing
const paramName = ref('');
const paramValue = ref('');

// Computed
const isValid = computed(() => {
  return datasets.value.length > 0 &&
         metrics.value.length > 0 &&
         baselines.value.length > 0 &&
         seeds.value.length > 0;
});

// Methods
function addDataset() {
  if (newDataset.value && !datasets.value.includes(newDataset.value)) {
    datasets.value.push(newDataset.value);
    newDataset.value = '';
    emitConfig();
  }
}

function removeDataset(index: number) {
  datasets.value.splice(index, 1);
  emitConfig();
}

function addMetric() {
  if (newMetric.value && !metrics.value.includes(newMetric.value)) {
    metrics.value.push(newMetric.value);
    newMetric.value = '';
    emitConfig();
  }
}

function removeMetric(index: number) {
  metrics.value.splice(index, 1);
  emitConfig();
}

function addBaseline() {
  if (newBaseline.value && !baselines.value.includes(newBaseline.value)) {
    baselines.value.push(newBaseline.value);
    newBaseline.value = '';
    emitConfig();
  }
}

function removeBaseline(index: number) {
  baselines.value.splice(index, 1);
  emitConfig();
}

function addSeed() {
  if (newSeed.value && !seeds.value.includes(newSeed.value)) {
    seeds.value.push(newSeed.value);
    newSeed.value = null;
    emitConfig();
  }
}

function removeSeed(index: number) {
  seeds.value.splice(index, 1);
  emitConfig();
}

function addParameter() {
  if (paramName.value) {
    parameters.value[paramName.value] = paramValue.value;
    paramName.value = '';
    paramValue.value = '';
    emitConfig();
  }
}

function removeParameter(name: string) {
  delete parameters.value[name];
  emitConfig();
}

function emitConfig() {
  emit('update', {
    datasets: datasets.value,
    metrics: metrics.value,
    baselines: baselines.value,
    parameters: parameters.value,
    seeds: seeds.value,
  });
}

function runExperiment() {
  if (isValid.value) {
    emit('run');
  }
}
</script>

<template>
  <div class="experiment-config">
    <div class="config-header">
      <v-icon size="small" class="mr-1">mdi-flask</v-icon>
      <span class="text-subtitle-2">实验配置</span>
    </div>

    <!-- Datasets -->
    <div class="config-section">
      <div class="section-title">数据集</div>
      <div class="items-list">
        <v-chip
          v-for="(dataset, index) in datasets"
          :key="index"
          closable
          @click:close="removeDataset(index)"
        >
          {{ dataset }}
        </v-chip>
      </div>
      <div class="add-item">
        <v-text-field
          v-model="newDataset"
          density="compact"
          variant="outlined"
          placeholder="添加数据集..."
          hide-details
          @keyup.enter="addDataset"
        />
        <v-btn size="small" @click="addDataset">添加</v-btn>
      </div>
    </div>

    <!-- Metrics -->
    <div class="config-section">
      <div class="section-title">评估指标</div>
      <div class="items-list">
        <v-chip
          v-for="(metric, index) in metrics"
          :key="index"
          closable
          @click:close="removeMetric(index)"
        >
          {{ metric }}
        </v-chip>
      </div>
      <div class="add-item">
        <v-text-field
          v-model="newMetric"
          density="compact"
          variant="outlined"
          placeholder="添加指标..."
          hide-details
          @keyup.enter="addMetric"
        />
        <v-btn size="small" @click="addMetric">添加</v-btn>
      </div>
    </div>

    <!-- Baselines -->
    <div class="config-section">
      <div class="section-title">对比方法</div>
      <div class="items-list">
        <v-chip
          v-for="(baseline, index) in baselines"
          :key="index"
          closable
          @click:close="removeBaseline(index)"
        >
          {{ baseline }}
        </v-chip>
      </div>
      <div class="add-item">
        <v-text-field
          v-model="newBaseline"
          density="compact"
          variant="outlined"
          placeholder="添加对比方法..."
          hide-details
          @keyup.enter="addBaseline"
        />
        <v-btn size="small" @click="addBaseline">添加</v-btn>
      </div>
    </div>

    <!-- Seeds -->
    <div class="config-section">
      <div class="section-title">随机种子</div>
      <div class="items-list">
        <v-chip
          v-for="(seed, index) in seeds"
          :key="index"
          closable
          @click:close="removeSeed(index)"
        >
          {{ seed }}
        </v-chip>
      </div>
      <div class="add-item">
        <v-text-field
          v-model.number="newSeed"
          density="compact"
          variant="outlined"
          placeholder="添加种子..."
          type="number"
          hide-details
          @keyup.enter="addSeed"
        />
        <v-btn size="small" @click="addSeed">添加</v-btn>
      </div>
    </div>

    <!-- Parameters -->
    <div class="config-section">
      <div class="section-title">实验参数</div>
      <div class="parameters-list">
        <div v-for="(value, name) in parameters" :key="name" class="parameter-item">
          <span class="param-name">{{ name }}:</span>
          <span class="param-value">{{ value }}</span>
          <v-btn icon size="x-small" variant="text" @click="removeParameter(name)">
            <v-icon size="small">mdi-close</v-icon>
          </v-btn>
        </div>
      </div>
      <div class="add-parameter">
        <v-text-field
          v-model="paramName"
          density="compact"
          variant="outlined"
          placeholder="参数名"
          hide-details
        />
        <v-text-field
          v-model="paramValue"
          density="compact"
          variant="outlined"
          placeholder="参数值"
          hide-details
        />
        <v-btn size="small" @click="addParameter">添加</v-btn>
      </div>
    </div>

    <!-- Run Button -->
    <div class="config-actions">
      <v-btn
        color="primary"
        :disabled="!isValid"
        @click="runExperiment"
      >
        <v-icon class="mr-1">mdi-play</v-icon>
        运行实验
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.experiment-config {
  padding: 12px;
}

.config-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.config-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 8px;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.items-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.add-item {
  display: flex;
  gap: 8px;
}

.add-item .v-text-field {
  flex: 1;
}

.parameters-list {
  margin-bottom: 8px;
}

.parameter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.875rem;
}

.param-name {
  font-weight: 500;
  min-width: 100px;
}

.param-value {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.add-parameter {
  display: flex;
  gap: 8px;
}

.add-parameter .v-text-field {
  flex: 1;
}

.config-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
