<script setup lang="ts">
/**
 * PaperEditor - Paper writing editor
 *
 * Markdown editor with citation support and preview.
 */
import { ref, computed, watch, onMounted } from 'vue';

interface Props {
  nodeId: string;
  content?: string;
  citations?: Citation[];
  sections?: PaperSection[];
}

interface Citation {
  id: string;
  text: string;
  paperId: string;
  paperTitle: string;
}

interface PaperSection {
  id: string;
  title: string;
  content: string;
  level: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update', content: string): void;
  (e: 'save'): void;
  (e: 'export', format: string): void;
  (e: 'insert-citation', citation: Citation): void;
}>();

// Local state
const editorContent = ref(props.content || '');
const activeSection = ref<string | null>(null);
const showPreview = ref(false);
const showCitationDialog = ref(false);
const citationSearch = ref('');
const selectedCitation = ref<Citation | null>(null);

// Computed
const wordCount = computed(() => {
  if (!editorContent.value) return 0;
  return editorContent.value.split(/\s+/).filter(word => word.length > 0).length;
});

const charCount = computed(() => {
  return editorContent.value.length;
});

const lineCount = computed(() => {
  if (!editorContent.value) return 0;
  return editorContent.value.split('\n').length;
});

const sections = computed(() => {
  if (!editorContent.value) return [];

  const lines = editorContent.value.split('\n');
  const sections: { id: string; title: string; level: number; start: number; end: number }[] = [];
  let currentSection: typeof sections[0] | null = null;

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      if (currentSection) {
        currentSection.end = index - 1;
      }
      currentSection = {
        id: `section-${index}`,
        title: match[2],
        level: match[1].length,
        start: index,
        end: lines.length - 1,
      };
      sections.push(currentSection);
    }
  });

  return sections;
});

const filteredCitations = computed(() => {
  if (!props.citations) return [];
  if (!citationSearch.value) return props.citations;

  const query = citationSearch.value.toLowerCase();
  return props.citations.filter(c =>
    c.text.toLowerCase().includes(query) ||
    c.paperTitle.toLowerCase().includes(query)
  );
});

// Methods
function handleInput() {
  emit('update', editorContent.value);
}

function handleSave() {
  emit('save');
}

function insertCitation(citation: Citation) {
  const cursorPos = getCursorPosition();
  const before = editorContent.value.substring(0, cursorPos);
  const after = editorContent.value.substring(cursorPos);
  const citationText = `[@${citation.id}]`;

  editorContent.value = before + citationText + after;
  emit('insert-citation', citation);
  showCitationDialog.value = false;

  // Set cursor position after citation
  setTimeout(() => {
    setCursorPosition(cursorPos + citationText.length);
  }, 0);
}

function insertSection(title: string, level: number) {
  const prefix = '#'.repeat(level);
  const sectionText = `\n${prefix} ${title}\n\n`;

  const cursorPos = getCursorPosition();
  const before = editorContent.value.substring(0, cursorPos);
  const after = editorContent.value.substring(cursorPos);

  editorContent.value = before + sectionText + after;
  handleInput();
}

function getCursorPosition(): number {
  const textarea = document.querySelector('.editor-textarea') as HTMLTextAreaElement;
  return textarea?.selectionStart || editorContent.value.length;
}

function setCursorPosition(pos: number) {
  const textarea = document.querySelector('.editor-textarea') as HTMLTextAreaElement;
  if (textarea) {
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }
}

function scrollToSection(sectionId: string) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

function exportPaper(format: string) {
  emit('export', format);
}

function togglePreview() {
  showPreview.value = !showPreview.value;
}

// Watch for external content changes
watch(() => props.content, (newContent) => {
  if (newContent !== editorContent.value) {
    editorContent.value = newContent || '';
  }
});
</script>

<template>
  <div class="paper-editor">
    <div class="editor-header">
      <v-icon size="small" class="mr-1">mdi-file-document-edit</v-icon>
      <span class="text-subtitle-2">论文编辑</span>

      <v-spacer />

      <div class="editor-actions">
        <v-btn size="small" variant="outlined" @click="togglePreview">
          <v-icon size="small" class="mr-1">
            {{ showPreview ? 'mdi-pencil' : 'mdi-eye' }}
          </v-icon>
          {{ showPreview ? '编辑' : '预览' }}
        </v-btn>

        <v-btn size="small" variant="outlined" @click="showCitationDialog = true">
          <v-icon size="small" class="mr-1">mdi-format-quote-close</v-icon>
          引用
        </v-btn>

        <v-btn size="small" variant="outlined" @click="handleSave">
          <v-icon size="small" class="mr-1">mdi-content-save</v-icon>
          保存
        </v-btn>

        <v-menu>
          <template #activator="{ props: menuProps }">
            <v-btn size="small" variant="outlined" v-bind="menuProps">
              <v-icon size="small" class="mr-1">mdi-export</v-icon>
              导出
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item @click="exportPaper('markdown')">
              <v-list-item-title>Markdown</v-list-item-title>
            </v-list-item>
            <v-list-item @click="exportPaper('latex')">
              <v-list-item-title>LaTeX</v-list-item-title>
            </v-list-item>
            <v-list-item @click="exportPaper('word')">
              <v-list-item-title>Word</v-list-item-title>
            </v-list-item>
            <v-list-item @click="exportPaper('pdf')">
              <v-list-item-title>PDF</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>

    <div class="editor-content">
      <!-- Sidebar with sections -->
      <div class="editor-sidebar">
        <div class="sidebar-title">章节</div>
        <div class="sections-list">
          <div
            v-for="section in sections"
            :key="section.id"
            class="section-item"
            :class="{ 'active': activeSection === section.id }"
            :style="{ paddingLeft: `${(section.level - 1) * 12}px` }"
            @click="scrollToSection(section.id)"
          >
            <v-icon size="x-small" class="mr-1">mdi-pound</v-icon>
            {{ section.title }}
          </div>
        </div>

        <div class="sidebar-actions">
          <v-btn size="small" variant="text" @click="insertSection('新章节', 2)">
            <v-icon size="small" class="mr-1">mdi-plus</v-icon>
            添加章节
          </v-btn>
        </div>
      </div>

      <!-- Editor area -->
      <div class="editor-main">
        <!-- Edit mode -->
        <div v-if="!showPreview" class="editor-edit">
          <textarea
            v-model="editorContent"
            class="editor-textarea"
            placeholder="开始撰写论文..."
            @input="handleInput"
          />
        </div>

        <!-- Preview mode -->
        <div v-else class="editor-preview">
          <div class="preview-content" v-html="editorContent" />
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="editor-status">
      <div class="status-item">
        <span class="status-label">字数:</span>
        <span class="status-value">{{ wordCount }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">字符:</span>
        <span class="status-value">{{ charCount }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">行数:</span>
        <span class="status-value">{{ lineCount }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">章节:</span>
        <span class="status-value">{{ sections.length }}</span>
      </div>
    </div>

    <!-- Citation Dialog -->
    <v-dialog v-model="showCitationDialog" max-width="600">
      <v-card>
        <v-card-title>插入引用</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="citationSearch"
            density="compact"
            variant="outlined"
            placeholder="搜索引用..."
            prepend-inner-icon="mdi-magnify"
            hide-details
            class="mb-4"
          />

          <div class="citations-list">
            <div
              v-for="citation in filteredCitations"
              :key="citation.id"
              class="citation-item"
              :class="{ 'selected': selectedCitation?.id === citation.id }"
              @click="selectedCitation = citation"
            >
              <div class="citation-text">{{ citation.text }}</div>
              <div class="citation-paper">{{ citation.paperTitle }}</div>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCitationDialog = false">取消</v-btn>
          <v-btn
            variant="flat"
            color="primary"
            :disabled="!selectedCitation"
            @click="insertCitation(selectedCitation!)"
          >
            插入
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.paper-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.editor-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-sidebar {
  width: 200px;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  display: flex;
  flex-direction: column;
}

.sidebar-title {
  padding: 8px 12px;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.sections-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.section-item {
  padding: 6px 12px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.section-item:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}

.section-item.active {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.sidebar-actions {
  padding: 8px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.editor-main {
  flex: 1;
  overflow: hidden;
}

.editor-edit {
  height: 100%;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  padding: 16px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
}

.editor-preview {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.preview-content {
  font-family: 'Times New Roman', serif;
  font-size: 16px;
  line-height: 1.8;
}

.editor-status {
  display: flex;
  gap: 16px;
  padding: 6px 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.status-item {
  display: flex;
  gap: 4px;
  font-size: 0.75rem;
}

.status-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.status-value {
  font-weight: 500;
}

.citations-list {
  max-height: 400px;
  overflow-y: auto;
}

.citation-item {
  padding: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.citation-item:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
}

.citation-item.selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.04);
}

.citation-text {
  font-size: 0.875rem;
  margin-bottom: 4px;
}

.citation-paper {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
