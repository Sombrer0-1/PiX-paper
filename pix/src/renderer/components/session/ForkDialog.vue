<script setup lang="ts">
/**
 * ForkDialog - Choose a user message to fork from.
 */
import { ref, onMounted } from "vue";
import { useRpc } from "../../composables/useRpc";
import type { UserMessageForForking } from "@/types/rpc";

const emit = defineEmits<{
  close: [];
  fork: [entryId: string, label?: string];
}>();

const rpc = useRpc();
const messages = ref<UserMessageForForking[]>([]);
const loading = ref(true);
const forkLabel = ref("");

onMounted(async () => {
  try {
    const result = await rpc.getUserMessagesForForking();
    if (result) {
      messages.value = result;
    }
  } catch (err) {
    console.error("[ForkDialog] Failed to load messages:", err);
  } finally {
    loading.value = false;
  }
});

function selectMessage(entryId: string): void {
  emit("fork", entryId, forkLabel.value || undefined);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function handleDialogModel(value: boolean): void {
  if (!value) emit("close");
}
</script>

<template>
  <v-dialog :model-value="true" max-width="520" scrollable @update:model-value="handleDialogModel">
    <v-card class="fork-dialog">
      <v-card-title class="dialog-header">
        <span class="dialog-title">创建分支会话</span>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          title="关闭弹窗"
          aria-label="关闭弹窗"
          @click="emit('close')"
        />
      </v-card-title>

      <v-card-text class="dialog-content">
        <p class="dialog-desc">
          选择一条用户消息作为分支点。新会话将保留该消息及之前的历史记录。
        </p>

        <v-form class="dialog-form" @submit.prevent>
          <v-text-field
            v-model="forkLabel"
            label="分支标签（可选）"
            placeholder="例如：尝试另一种实现"
            variant="outlined"
            density="compact"
            hide-details
            spellcheck="false"
          />
        </v-form>

        <div class="dialog-list">
          <div v-if="loading" class="loading-state">
            <v-progress-circular indeterminate size="20" width="2" />
            <span>正在加载消息...</span>
          </div>
          <div v-else-if="messages.length === 0" class="empty-state">当前会话中没有可用的用户消息。</div>
          <button
            v-for="msg in messages"
            :key="msg.entryId"
            type="button"
            class="fork-item"
            @click="selectMessage(msg.entryId)"
          >
            <span class="fork-text">{{ truncate(msg.text, 120) }}</span>
            <span class="mdi mdi-source-branch fork-action" aria-hidden="true"></span>
          </button>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fork-dialog {
  background: var(--pix-bg-content);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-lg) !important;
  box-shadow: var(--pix-shadow-xl) !important;
  width: min(520px, calc(100vw - 32px));
  max-height: 560px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 52px;
  padding: var(--pix-space-md) var(--pix-space-md) var(--pix-space-md) var(--pix-space-xl) !important;
  border-bottom: 1px solid var(--pix-border-light);
}

.dialog-title {
  font-size: var(--pix-text-md);
  font-weight: 600;
}

.dialog-content {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 0 !important;
}

.dialog-desc {
  padding: var(--pix-space-lg) var(--pix-space-xl) var(--pix-space-md);
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
  margin: 0;
  line-height: var(--pix-leading-normal);
}

.dialog-form {
  padding: 0 var(--pix-space-xl) var(--pix-space-md);
}

.dialog-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--pix-space-xl) var(--pix-space-xl);
}

.loading-state,
.empty-state {
  padding: var(--pix-space-xl);
  text-align: center;
  color: var(--pix-text-muted);
  font-size: var(--pix-text-sm);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--pix-space-sm);
}

.fork-item {
  display: flex;
  align-items: center;
  gap: var(--pix-space-md);
  width: 100%;
  padding: var(--pix-space-md);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  text-align: left;
  margin-bottom: var(--pix-space-sm);
  font-size: var(--pix-text-sm);
  color: var(--pix-text-primary);
  transition: background var(--pix-transition-fast), border-color var(--pix-transition-fast);
}

.fork-item:hover {
  background: var(--pix-bg-hover);
  border-color: var(--pix-accent-light-hover);
}

.fork-text {
  min-width: 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fork-action {
  flex-shrink: 0;
  color: var(--pix-text-muted);
  font-size: 16px;
}
</style>
