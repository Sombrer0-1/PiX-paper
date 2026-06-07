<script setup lang="ts">
/**
 * ApprovalDialog - Human approval dialog
 *
 * Displays approval requests with options for confirmation, selection, or input.
 */
import { ref, computed } from 'vue';
import type { ApprovalRequest, ApprovalResponse } from '@/types/workflow';

interface Props {
  request: ApprovalRequest | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'respond', response: ApprovalResponse): void;
}>();

const selectedOptionId = ref<string>('');
const inputValue = ref<string>('');
const comments = ref<string>('');

// Reset state when request changes
const resetState = () => {
  if (props.request?.options?.length) {
    selectedOptionId.value = props.request.options[0].id;
  } else {
    selectedOptionId.value = '';
  }
  inputValue.value = '';
  comments.value = '';
};

// Watch for request changes
import { watch } from 'vue';
watch(() => props.request, resetState, { immediate: true });

const isValid = computed(() => {
  if (!props.request) return false;

  switch (props.request.type) {
    case 'confirm':
      return true;
    case 'select':
      return !!selectedOptionId.value;
    case 'input':
      return !!inputValue.value.trim();
    default:
      return false;
  }
});

function handleApprove() {
  if (!props.request || !isValid.value) return;

  emit('respond', {
    requestId: props.request.id,
    approved: true,
    selectedOptionId: selectedOptionId.value || undefined,
    value: inputValue.value || undefined,
    comments: comments.value || undefined,
  });
}

function handleReject() {
  if (!props.request) return;

  emit('respond', {
    requestId: props.request.id,
    approved: false,
    comments: comments.value || undefined,
  });
}
</script>

<template>
  <v-dialog :model-value="!!request" max-width="500" persistent>
    <v-card v-if="request">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="warning">mdi-account-question</v-icon>
        需要确认
      </v-card-title>

      <v-card-text>
        <div class="text-subtitle-1 mb-2">{{ request.title }}</div>
        <div class="text-body-2 mb-4">{{ request.description }}</div>

        <!-- Confirm type -->
        <div v-if="request.type === 'confirm'" class="confirm-section">
          <v-alert type="info" variant="tonal" density="compact">
            请确认是否继续执行此操作
          </v-alert>
        </div>

        <!-- Select type -->
        <div v-if="request.type === 'select' && request.options" class="select-section">
          <v-radio-group v-model="selectedOptionId" hide-details>
            <v-radio
              v-for="option in request.options"
              :key="option.id"
              :value="option.id"
              color="primary"
            >
              <template #label>
                <div>
                  <div class="font-weight-medium">{{ option.label }}</div>
                  <div v-if="option.description" class="text-caption text-grey">
                    {{ option.description }}
                  </div>
                </div>
              </template>
            </v-radio>
          </v-radio-group>
        </div>

        <!-- Input type -->
        <div v-if="request.type === 'input'" class="input-section">
          <v-text-field
            v-model="inputValue"
            label="请输入"
            variant="outlined"
            density="compact"
            hide-details
          />
        </div>

        <!-- Comments -->
        <v-textarea
          v-model="comments"
          label="备注（可选）"
          variant="outlined"
          density="compact"
          rows="2"
          class="mt-4"
          hide-details
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          color="error"
          @click="handleReject"
        >
          拒绝
        </v-btn>
        <v-btn
          variant="flat"
          color="primary"
          :disabled="!isValid"
          @click="handleApprove"
        >
          确认
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirm-section,
.select-section,
.input-section {
  margin-bottom: 8px;
}
</style>
