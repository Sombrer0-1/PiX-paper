<script setup lang="ts">
/**
 * LibraryPanel - Literature library management
 *
 * Display and manage paper collections with tags and notes.
 */
import { ref, computed } from 'vue';
import type { Paper, Tag } from '@/types/research';

interface Props {
  papers: Paper[];
  tags: Tag[];
  selectedPaperId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select', paperId: string): void;
  (e: 'add-tag', paperId: string, tag: string): void;
  (e: 'remove-tag', paperId: string, tag: string): void;
  (e: 'add-note', paperId: string, note: string): void;
  (e: 'delete', paperId: string): void;
}>();

const searchQuery = ref('');
const selectedTag = ref<string | null>(null);
const showNoteDialog = ref(false);
const notePaperId = ref<string>('');
const noteText = ref('');

// Filtered papers
const filteredPapers = computed(() => {
  let papers = props.papers;

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    papers = papers.filter(p =>
      p.title.toLowerCase().includes(query) ||
      p.abstract.toLowerCase().includes(query) ||
      p.authors.some(a => a.toLowerCase().includes(query))
    );
  }

  // Filter by tag
  if (selectedTag.value) {
    papers = papers.filter(p => p.tags.includes(selectedTag.value!));
  }

  return papers;
});

// Tag counts
const tagCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const paper of props.papers) {
    for (const tag of paper.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
});

function formatYear(year: number): string {
  return year > 0 ? String(year) : 'N/A';
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown';
  if (authors.length <= 2) return authors.join(', ');
  return `${authors[0]} et al.`;
}

function getCitationLabel(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function openNoteDialog(paperId: string, currentNote?: string) {
  notePaperId.value = paperId;
  noteText.value = currentNote || '';
  showNoteDialog.value = true;
}

function saveNote() {
  emit('add-note', notePaperId.value, noteText.value);
  showNoteDialog.value = false;
}

function getPaperById(id: string): Paper | undefined {
  return props.papers.find(p => p.id === id);
}
</script>

<template>
  <div class="library-panel">
    <!-- Header -->
    <div class="panel-header">
      <v-icon size="small" class="mr-1">mdi-library</v-icon>
      <span class="text-subtitle-2">文献库</span>
      <v-chip size="x-small" class="ml-2">{{ papers.length }}</v-chip>
    </div>

    <!-- Search -->
    <v-text-field
      v-model="searchQuery"
      density="compact"
      variant="outlined"
      placeholder="搜索论文..."
      prepend-inner-icon="mdi-magnify"
      hide-details
      class="mb-3"
    />

    <!-- Tags -->
    <div v-if="tags.length > 0" class="tags-section mb-3">
      <div class="text-caption text-grey mb-1">标签</div>
      <div class="tags-list">
        <v-chip
          v-for="tag in tags"
          :key="tag.id"
          size="small"
          :color="selectedTag === tag.name ? 'primary' : undefined"
          :variant="selectedTag === tag.name ? 'flat' : 'outlined'"
          @click="selectedTag = selectedTag === tag.name ? null : tag.name"
        >
          {{ tag.name }}
          <v-badge
            :content="tagCounts.get(tag.name) || 0"
            inline
            color="grey"
            class="ml-1"
          />
        </v-chip>
      </div>
    </div>

    <!-- Papers list -->
    <div class="papers-list">
      <div v-if="filteredPapers.length === 0" class="empty-state">
        <v-icon size="32" color="grey">mdi-file-document-outline</v-icon>
        <div class="text-caption mt-2">暂无论文</div>
      </div>

      <div
        v-for="paper in filteredPapers"
        :key="paper.id"
        class="paper-item"
        :class="{ 'paper-selected': paper.id === selectedPaperId }"
        @click="emit('select', paper.id)"
      >
        <div class="paper-header">
          <div class="paper-title">{{ paper.title }}</div>
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                icon
                size="x-small"
                variant="text"
                v-bind="menuProps"
                @click.stop
              >
                <v-icon size="small">mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="openNoteDialog(paper.id, paper.notes)">
                <v-list-item-title>添加笔记</v-list-item-title>
              </v-list-item>
              <v-list-item @click="emit('delete', paper.id)" color="error">
                <v-list-item-title>删除</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>

        <div class="paper-meta text-caption text-grey">
          {{ formatAuthors(paper.authors) }} · {{ formatYear(paper.year) }} · {{ paper.venue || 'N/A' }}
        </div>

        <div class="paper-stats">
          <v-chip size="x-small" variant="text">
            <v-icon size="x-small" class="mr-1">mdi-quote</v-icon>
            {{ getCitationLabel(paper.citations) }}
          </v-chip>

          <div v-if="paper.tags.length > 0" class="paper-tags">
            <v-chip
              v-for="tag in paper.tags.slice(0, 3)"
              :key="tag"
              size="x-small"
              color="primary"
              variant="tonal"
            >
              {{ tag }}
            </v-chip>
          </div>
        </div>

        <div v-if="paper.notes" class="paper-note text-caption">
          <v-icon size="x-small" class="mr-1">mdi-note-text</v-icon>
          {{ paper.notes.substring(0, 100) }}{{ paper.notes.length > 100 ? '...' : '' }}
        </div>
      </div>
    </div>

    <!-- Note dialog -->
    <v-dialog v-model="showNoteDialog" max-width="500">
      <v-card>
        <v-card-title>论文笔记</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="noteText"
            variant="outlined"
            rows="4"
            placeholder="添加笔记..."
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showNoteDialog = false">取消</v-btn>
          <v-btn variant="flat" color="primary" @click="saveNote">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.library-panel {
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

.tags-section {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-bottom: 8px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.papers-list {
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

.paper-item {
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}

.paper-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.paper-item.paper-selected {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.paper-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.paper-title {
  font-size: 0.875rem;
  font-weight: 500;
  flex: 1;
  margin-right: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.paper-meta {
  margin-top: 4px;
}

.paper-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.paper-tags {
  display: flex;
  gap: 4px;
}

.paper-note {
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(var(--v-theme-surface-variant), 0.5);
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
}
</style>
