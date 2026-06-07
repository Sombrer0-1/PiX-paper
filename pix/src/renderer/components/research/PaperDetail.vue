<script setup lang="ts">
/**
 * PaperDetail - Paper detail view
 *
 * Display paper details with abstract, references, and notes.
 */
import { ref, computed } from 'vue';
import type { Paper } from '@/types/research';

interface Props {
  paper: Paper | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'add-tag', paperId: string, tag: string): void;
  (e: 'remove-tag', paperId: string, tag: string): void;
  (e: 'add-note', paperId: string, note: string): void;
  (e: 'download', paperId: string): void;
  (e: 'open-url', url: string): void;
}>();

const newTag = ref('');
const noteText = ref('');
const showFullAbstract = ref(false);

const displayAbstract = computed(() => {
  if (!props.paper?.abstract) return 'No abstract available';
  if (showFullAbstract.value || props.paper.abstract.length <= 300) {
    return props.paper.abstract;
  }
  return props.paper.abstract.substring(0, 300) + '...';
});

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown';
  return authors.join(', ');
}

function getCitationLabel(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function addTag() {
  if (!props.paper || !newTag.value.trim()) return;
  emit('add-tag', props.paper.id, newTag.value.trim());
  newTag.value = '';
}

function saveNote() {
  if (!props.paper) return;
  emit('add-note', props.paper.id, noteText.value);
}

// Initialize note text when paper changes
import { watch } from 'vue';
watch(() => props.paper, (newPaper) => {
  noteText.value = newPaper?.notes || '';
}, { immediate: true });
</script>

<template>
  <div class="paper-detail">
    <div v-if="!paper" class="empty-state">
      <v-icon size="48" color="grey">mdi-file-document-outline</v-icon>
      <div class="text-body-2 mt-2">选择论文查看详情</div>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="detail-header">
        <div class="paper-title">{{ paper.title }}</div>
        <div class="paper-actions">
          <v-btn
            v-if="paper.url"
            icon
            size="small"
            variant="text"
            @click="emit('open-url', paper.url)"
          >
            <v-icon>mdi-open-in-new</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            @click="emit('download', paper.id)"
          >
            <v-icon>mdi-download</v-icon>
          </v-btn>
        </div>
      </div>

      <!-- Meta -->
      <div class="paper-meta">
        <div class="meta-item">
          <v-icon size="small" class="mr-1">mdi-account</v-icon>
          <span>{{ formatAuthors(paper.authors) }}</span>
        </div>
        <div class="meta-item">
          <v-icon size="small" class="mr-1">mdi-calendar</v-icon>
          <span>{{ paper.year || 'N/A' }}</span>
        </div>
        <div class="meta-item">
          <v-icon size="small" class="mr-1">mdi-school</v-icon>
          <span>{{ paper.venue || 'N/A' }}</span>
        </div>
        <div class="meta-item">
          <v-icon size="small" class="mr-1">mdi-quote</v-icon>
          <span>{{ getCitationLabel(paper.citations) }} citations</span>
        </div>
      </div>

      <!-- DOI / URL -->
      <div v-if="paper.doi || paper.url" class="paper-links">
        <v-chip
          v-if="paper.doi"
          size="small"
          variant="outlined"
          @click="emit('open-url', `https://doi.org/${paper.doi}`)"
        >
          DOI: {{ paper.doi }}
        </v-chip>
      </div>

      <!-- Abstract -->
      <div class="section">
        <div class="section-header">
          <span class="text-subtitle-2">摘要</span>
          <v-btn
            v-if="paper.abstract && paper.abstract.length > 300"
            size="x-small"
            variant="text"
            @click="showFullAbstract = !showFullAbstract"
          >
            {{ showFullAbstract ? '收起' : '展开' }}
          </v-btn>
        </div>
        <div class="abstract-text">{{ displayAbstract }}</div>
      </div>

      <!-- Tags -->
      <div class="section">
        <div class="section-header">
          <span class="text-subtitle-2">标签</span>
        </div>
        <div class="tags-container">
          <v-chip
            v-for="tag in paper.tags"
            :key="tag"
            size="small"
            closable
            @click:close="emit('remove-tag', paper.id, tag)"
          >
            {{ tag }}
          </v-chip>
          <div class="add-tag">
            <v-text-field
              v-model="newTag"
              density="compact"
              variant="outlined"
              placeholder="添加标签"
              hide-details
              @keyup.enter="addTag"
            >
              <template #append>
                <v-btn icon size="x-small" @click="addTag">
                  <v-icon size="small">mdi-plus</v-icon>
                </v-btn>
              </template>
            </v-text-field>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="section">
        <div class="section-header">
          <span class="text-subtitle-2">笔记</span>
        </div>
        <v-textarea
          v-model="noteText"
          variant="outlined"
          rows="3"
          placeholder="添加笔记..."
          @blur="saveNote"
        />
      </div>

      <!-- Source -->
      <div class="paper-source text-caption text-grey">
        来源: {{ paper.source }} · ID: {{ paper.sourceId }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.paper-detail {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.paper-title {
  font-size: 1.1rem;
  font-weight: 600;
  flex: 1;
  margin-right: 8px;
}

.paper-actions {
  display: flex;
  gap: 4px;
}

.paper-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.paper-links {
  margin-bottom: 12px;
}

.section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.abstract-text {
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.add-tag {
  width: 150px;
}

.paper-source {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
</style>
