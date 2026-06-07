<script setup lang="ts">
/**
 * ReferenceManager - Reference management
 *
 * Manage references and citations for the paper.
 */
import { ref, computed } from 'vue';

interface Props {
  nodeId: string;
  references?: Reference[];
  citations?: Citation[];
}

interface Reference {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  doi?: string;
  url?: string;
  bibtex?: string;
}

interface Citation {
  id: string;
  paperId: string;
  text: string;
  location: {
    section: string;
    paragraph: number;
    sentence: number;
  };
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'add', reference: Reference): void;
  (e: 'update', id: string, reference: Reference): void;
  (e: 'delete', id: string): void;
  (e: 'import', references: Reference[]): void;
}>();

// Local state
const searchQuery = ref('');
const showAddDialog = ref(false);
const showImportDialog = ref(false);
const editMode = ref(false);
const editingReference = ref<Reference | null>(null);

// New reference form
const newReference = ref<Reference>({
  id: '',
  title: '',
  authors: [],
  year: new Date().getFullYear(),
  venue: '',
  doi: '',
  url: '',
  bibtex: '',
});

// Import
const importText = ref('');
const importFormat = ref<'bibtex' | 'ris' | 'json'>('bibtex');

// Computed
const filteredReferences = computed(() => {
  if (!props.references) return [];
  if (!searchQuery.value) return props.references;

  const query = searchQuery.value.toLowerCase();
  return props.references.filter(ref =>
    ref.title.toLowerCase().includes(query) ||
    ref.authors.some(a => a.toLowerCase().includes(query)) ||
    ref.venue.toLowerCase().includes(query) ||
    String(ref.year).includes(query)
  );
});

const referencesByYear = computed(() => {
  if (!props.references) return new Map<number, Reference[]>();

  const groups = new Map<number, Reference[]>();
  for (const ref of props.references) {
    const group = groups.get(ref.year) || [];
    group.push(ref);
    groups.set(ref.year, group);
  }

  // Sort years descending
  return new Map([...groups.entries()].sort((a, b) => b[0] - a[0]));
});

const citationCount = computed(() => {
  if (!props.citations) return 0;
  return props.citations.length;
});

const uniqueAuthors = computed(() => {
  if (!props.references) return [];
  const authors = new Set<string>();
  for (const ref of props.references) {
    for (const author of ref.authors) {
      authors.add(author);
    }
  }
  return [...authors].sort();
});

// Methods
function addReference() {
  if (!newReference.value.title) return;

  const reference: Reference = {
    ...newReference.value,
    id: `ref-${Date.now()}`,
  };

  emit('add', reference);
  resetForm();
  showAddDialog.value = false;
}

function updateReference() {
  if (!editingReference.value) return;
  emit('update', editingReference.value.id, editingReference.value);
  editingReference.value = null;
  editMode.value = false;
}

function deleteReference(id: string) {
  emit('delete', id);
}

function startEdit(reference: Reference) {
  editingReference.value = { ...reference };
  editMode.value = true;
}

function cancelEdit() {
  editingReference.value = null;
  editMode.value = false;
}

function resetForm() {
  newReference.value = {
    id: '',
    title: '',
    authors: [],
    year: new Date().getFullYear(),
    venue: '',
    doi: '',
    url: '',
    bibtex: '',
  };
}

function addAuthor(author: string) {
  if (author && !newReference.value.authors.includes(author)) {
    newReference.value.authors.push(author);
  }
}

function removeAuthor(index: number) {
  newReference.value.authors.splice(index, 1);
}

function importReferences() {
  if (!importText.value) return;

  let references: Reference[] = [];

  if (importFormat.value === 'bibtex') {
    references = parseBibtex(importText.value);
  } else if (importFormat.value === 'ris') {
    references = parseRis(importText.value);
  } else if (importFormat.value === 'json') {
    try {
      references = JSON.parse(importText.value);
    } catch (err) {
      console.error('Failed to parse JSON:', err);
    }
  }

  if (references.length > 0) {
    emit('import', references);
    importText.value = '';
    showImportDialog.value = false;
  }
}

function parseBibtex(text: string): Reference[] {
  const references: Reference[] = [];
  const entries = text.split('@').filter(entry => entry.trim());

  for (const entry of entries) {
    const typeMatch = entry.match(/^(\w+)\{(\w+),/);
    if (!typeMatch) continue;

    const id = typeMatch[2];
    const fields: Record<string, string> = {};

    const fieldRegex = /(\w+)\s*=\s*\{([^}]+)\}/g;
    let match;
    while ((match = fieldRegex.exec(entry)) !== null) {
      fields[match[1].toLowerCase()] = match[2];
    }

    references.push({
      id,
      title: fields.title || '',
      authors: fields.author ? fields.author.split(' and ') : [],
      year: parseInt(fields.year) || new Date().getFullYear(),
      venue: fields.journal || fields.booktitle || '',
      doi: fields.doi,
      url: fields.url,
      bibtex: `@${entry}`,
    });
  }

  return references;
}

function parseRis(text: string): Reference[] {
  const references: Reference[] = [];
  const entries = text.split(/\n\s*\n/).filter(entry => entry.trim());

  for (const entry of entries) {
    const lines = entry.split('\n');
    const fields: Record<string, string[]> = {};

    for (const line of lines) {
      const match = line.match(/^(\w+)\s*-\s*(.+)/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!fields[key]) fields[key] = [];
        fields[key].push(value);
      }
    }

    if (fields.TI || fields.T1) {
      references.push({
        id: `ris-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: (fields.TI || fields.T1 || [''])[0],
        authors: fields.AU || [],
        year: parseInt((fields.PY || fields.Y1 || [''])[0]) || new Date().getFullYear(),
        venue: (fields.JO || fields.JF || fields.T2 || [''])[0],
        doi: (fields.DO || [''])[0],
        url: (fields.UR || [''])[0],
      });
    }
  }

  return references;
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown';
  if (authors.length <= 2) return authors.join(', ');
  return `${authors[0]} et al.`;
}

function getCitationForReference(refId: string): Citation | undefined {
  return props.citations?.find(c => c.paperId === refId);
}
</script>

<template>
  <div class="reference-manager">
    <div class="manager-header">
      <v-icon size="small" class="mr-1">mdi-bookshelf</v-icon>
      <span class="text-subtitle-2">参考文献</span>
      <v-chip size="x-small" class="ml-2">{{ references?.length || 0 }}</v-chip>
      <v-chip size="x-small" class="ml-1" color="primary">{{ citationCount }} 引用</v-chip>

      <v-spacer />

      <v-btn size="small" variant="outlined" @click="showImportDialog = true">
        <v-icon size="small" class="mr-1">mdi-import</v-icon>
        导入
      </v-btn>
      <v-btn size="small" variant="outlined" @click="showAddDialog = true">
        <v-icon size="small" class="mr-1">mdi-plus</v-icon>
        添加
      </v-btn>
    </div>

    <!-- Search -->
    <v-text-field
      v-model="searchQuery"
      density="compact"
      variant="outlined"
      placeholder="搜索参考文献..."
      prepend-inner-icon="mdi-magnify"
      hide-details
      class="mb-4"
    />

    <!-- References list -->
    <div class="references-list">
      <div v-if="filteredReferences.length === 0" class="empty-state">
        <v-icon size="32" color="grey">mdi-book-outline</v-icon>
        <div class="text-caption mt-2">暂无参考文献</div>
      </div>

      <div
        v-for="reference in filteredReferences"
        :key="reference.id"
        class="reference-item"
      >
        <div class="reference-header">
          <div class="reference-title">{{ reference.title }}</div>
          <div class="reference-actions">
            <v-btn icon size="x-small" variant="text" @click="startEdit(reference)">
              <v-icon size="small">mdi-pencil</v-icon>
            </v-btn>
            <v-btn icon size="x-small" variant="text" @click="deleteReference(reference.id)">
              <v-icon size="small">mdi-delete</v-icon>
            </v-btn>
          </div>
        </div>

        <div class="reference-meta">
          {{ formatAuthors(reference.authors) }} · {{ reference.year }} · {{ reference.venue }}
        </div>

        <div class="reference-links">
          <v-chip v-if="reference.doi" size="x-small" variant="outlined">
            DOI: {{ reference.doi }}
          </v-chip>
          <v-chip v-if="reference.url" size="x-small" variant="outlined" @click="window.open(reference.url)">
            URL
          </v-chip>
          <v-chip
            v-if="getCitationForReference(reference.id)"
            size="x-small"
            color="primary"
            variant="tonal"
          >
            已引用
          </v-chip>
        </div>
      </div>
    </div>

    <!-- Add Dialog -->
    <v-dialog v-model="showAddDialog" max-width="600">
      <v-card>
        <v-card-title>添加参考文献</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newReference.title"
            label="标题"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="newReference.authors"
            label="作者（用逗号分隔）"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <div class="d-flex gap-2 mb-2">
            <v-text-field
              v-model.number="newReference.year"
              label="年份"
              type="number"
              variant="outlined"
              density="compact"
            />
            <v-text-field
              v-model="newReference.venue"
              label="期刊/会议"
              variant="outlined"
              density="compact"
            />
          </div>
          <v-text-field
            v-model="newReference.doi"
            label="DOI"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="newReference.url"
            label="URL"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-textarea
            v-model="newReference.bibtex"
            label="BibTeX"
            variant="outlined"
            density="compact"
            rows="3"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAddDialog = false">取消</v-btn>
          <v-btn variant="flat" color="primary" @click="addReference">添加</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Dialog -->
    <v-dialog v-model="showImportDialog" max-width="600">
      <v-card>
        <v-card-title>导入参考文献</v-card-title>
        <v-card-text>
          <v-select
            v-model="importFormat"
            :items="[
              { title: 'BibTeX', value: 'bibtex' },
              { title: 'RIS', value: 'ris' },
              { title: 'JSON', value: 'json' },
            ]"
            item-title="title"
            item-value="value"
            label="格式"
            variant="outlined"
            density="compact"
            class="mb-4"
          />
          <v-textarea
            v-model="importText"
            :placeholder="importFormat === 'bibtex' ? '@article{key, ...}' : '粘贴文献数据...'"
            variant="outlined"
            rows="10"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showImportDialog = false">取消</v-btn>
          <v-btn variant="flat" color="primary" @click="importReferences">导入</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Edit Dialog -->
    <v-dialog v-model="editMode" max-width="600">
      <v-card v-if="editingReference">
        <v-card-title>编辑参考文献</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="editingReference.title"
            label="标题"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="editingReference.authors"
            label="作者（用逗号分隔）"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <div class="d-flex gap-2 mb-2">
            <v-text-field
              v-model.number="editingReference.year"
              label="年份"
              type="number"
              variant="outlined"
              density="compact"
            />
            <v-text-field
              v-model="editingReference.venue"
              label="期刊/会议"
              variant="outlined"
              density="compact"
            />
          </div>
          <v-text-field
            v-model="editingReference.doi"
            label="DOI"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="editingReference.url"
            label="URL"
            variant="outlined"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelEdit">取消</v-btn>
          <v-btn variant="flat" color="primary" @click="updateReference">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.reference-manager {
  padding: 12px;
}

.manager-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.references-list {
  max-height: 400px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.reference-item {
  padding: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  margin-bottom: 8px;
}

.reference-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.reference-title {
  font-size: 0.875rem;
  font-weight: 500;
  flex: 1;
  margin-right: 8px;
}

.reference-actions {
  display: flex;
  gap: 4px;
}

.reference-meta {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-top: 4px;
}

.reference-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
</style>
