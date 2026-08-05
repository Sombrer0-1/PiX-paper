<script setup lang="ts">
import { computed, ref } from "vue";
import { usePaperStore } from "../../stores/paper-store";
import { useSessionStore } from "../../stores/session-store";
import { useRpc } from "../../composables/useRpc";
import SessionView from "../session/SessionView.vue";
import ClarificationCard from "../input/ClarificationCard.vue";
import ClarificationChip from "../input/ClarificationChip.vue";
import type { RequestUserInputRequest, RequestUserInputQuestion } from "../../../shared/types";
import type { DisplayBlock } from "../../../shared/types";

const props = defineProps<{
	open: boolean;
	blocks: DisplayBlock[];
	pendingUserInput: RequestUserInputRequest | null;
	currentQuestionIndex: number;
	currentAnswer: string;
	currentQuestion: RequestUserInputQuestion | null;
	totalQuestions: number;
	answeredSummary: Array<{ field: string; value: string; checked: boolean; index: number }>;
}>();

const emit = defineEmits<{
	close: [];
	"update:currentAnswer": [value: string];
	advanceQuestion: [];
	jumpToQuestion: [index: number];
	cancelClarification: [];
}>();

const rpc = useRpc();
const sessionStore = useSessionStore();
const paperStore = usePaperStore();
const isSending = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const draft = computed({
	get: () => paperStore.getComposerDraft(paperStore.selectedStage),
	set: (value: string) => paperStore.setComposerDraft(value, paperStore.selectedStage),
});
const isStreaming = computed(() => rpc.isStreaming.value);
const canSend = computed(() => draft.value.trim().length > 0 && rpc.isConnected.value && !isSending.value && !paperStore.pendingGate && !props.pendingUserInput);
const composerDisabled = computed(() => !rpc.isConnected.value || isSending.value || !!paperStore.pendingGate || !!props.pendingUserInput);
const composerPlaceholder = computed(() => {
	if (paperStore.pendingGate) return "当前阶段等待审核，审核决定会自动推进流程";
	if (props.pendingUserInput) return "先回答 agent 的澄清问题";
	if (isStreaming.value) return "向当前运行中的 agent 发送引导消息...";
	return "补充研究上下文，或告诉 agent 下一步关注什么...";
});

function sendError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function sendMessage(): Promise<void> {
	const message = draft.value.trim();
	if (!message || !canSend.value) return;
	isSending.value = true;
	let optimisticId: string | null = null;
	try {
		optimisticId = sessionStore.appendOptimisticUserMessage(message);
		const type = isStreaming.value ? "steer" : "prompt";
		await rpc.sendCommandAsync({ type, message }).then((result) => {
			if (!result.success) throw new Error(result.error ?? "消息发送失败");
		}).catch((error) => {
			sessionStore.failOptimisticUserMessage(optimisticId, sendError(error));
			if (!draft.value.trim()) draft.value = message;
		});
		draft.value = "";
		if (textareaRef.value) {
			textareaRef.value.value = "";
			textareaRef.value.style.height = "auto";
		}
	} catch (error) {
		sessionStore.failOptimisticUserMessage(optimisticId, sendError(error));
		if (!draft.value.trim()) draft.value = message;
	} finally {
		isSending.value = false;
	}
}

function handleKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		void sendMessage();
	}
}

function resizeTextarea(): void {
	if (!textareaRef.value) return;
	textareaRef.value.style.height = "auto";
	textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 150)}px`;
}

function addAnswer(value: string): void {
	emit("update:currentAnswer", value);
}

function isAgentMessage(block: DisplayBlock): block is Extract<DisplayBlock, { type: "agent-message" }> {
	return block.type === "agent-message";
}
</script>

<template>
	<aside v-if="open" class="agent-log-drawer" aria-label="Agent 日志">
		<header class="drawer-header">
			<div><span class="drawer-kicker"><span class="mdi mdi-console-line" aria-hidden="true"></span> 后台研究记录</span><strong>Agent 日志</strong><span>{{ blocks.filter(isAgentMessage).length }} 个消息块</span></div>
			<button type="button" class="icon-button" title="关闭 Agent 日志" aria-label="关闭 Agent 日志" @click="emit('close')"><span class="mdi mdi-close" aria-hidden="true"></span></button>
		</header>

		<div class="drawer-body">
			<div v-if="pendingUserInput" class="clarification-area">
				<div v-if="answeredSummary.some((item) => item.checked)" class="clarification-chips"><ClarificationChip v-for="item in answeredSummary.filter((item) => item.checked)" :key="item.field" :field="item.field" :value="item.value" @edit="emit('jumpToQuestion', item.index)" /></div>
				<ClarificationCard v-if="currentQuestion" :question="currentQuestion" :question-index="currentQuestionIndex + 1" :total-questions="totalQuestions" :answer="currentAnswer" @update:answer="addAnswer" @next="emit('advanceQuestion')" @cancel="emit('cancelClarification')" />
			</div>
			<div v-if="blocks.length > 0" class="log-scroll"><SessionView :blocks="blocks" /></div>
			<div v-else class="log-empty"><span class="mdi mdi-console-line" aria-hidden="true"></span><strong>还没有过程日志</strong><span>agent 开始运行后，工具调用和消息会出现在这里。</span></div>
		</div>

		<footer class="drawer-composer">
			<div v-if="paperStore.pendingGate" class="composer-blocked"><span class="mdi mdi-lock-outline" aria-hidden="true"></span> Gate 审核期间暂停自由输入</div>
			<textarea ref="textareaRef" v-model="draft" :disabled="composerDisabled" :placeholder="composerPlaceholder" rows="1" @input="resizeTextarea" @keydown="handleKeydown"></textarea>
			<div class="composer-footer"><span class="composer-hint">{{ isStreaming ? '消息会作为引导加入当前运行' : 'Enter 发送 · Shift + Enter 换行' }}</span><button v-if="isStreaming" type="button" class="send-button stop" @click="rpc.abort"><span class="mdi mdi-stop" aria-hidden="true"></span> 停止</button><button v-else type="button" class="send-button" :disabled="!canSend" @click="sendMessage"><span class="mdi mdi-send-outline" aria-hidden="true"></span> 发送</button></div>
		</footer>
	</aside>
</template>

<style scoped>
.agent-log-drawer {
	display: flex;
	flex-direction: column;
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 20;
	width: min(560px, calc(100% - 24px));
	border-left: 1px solid var(--pix-border);
	background: var(--pix-bg-content);
	box-shadow: -16px 0 34px rgba(31, 41, 51, 0.13);
	-webkit-app-region: no-drag;
}

.drawer-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 17px calc(18px + var(--pix-window-controls-width)) 14px 18px;
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-bg-topbar);
	-webkit-app-region: no-drag;
}

.drawer-header > div {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.drawer-kicker {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.drawer-header strong {
	font-family: var(--pix-font-ui);
	font-size: 19px;
	font-weight: 500;
}

.drawer-header > div > span:last-child {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	min-width: 32px;
	flex: 0 0 32px;
	border-radius: 5px;
	color: var(--pix-text-secondary);
	font-size: 17px;
	-webkit-app-region: no-drag;
	pointer-events: auto;
}

.icon-button:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent);
}

.drawer-body {
	min-height: 0;
	flex: 1;
	overflow: hidden;
	background: var(--pix-bg-content);
}

.log-scroll {
	height: 100%;
	overflow-y: auto;
	padding: 18px 18px 26px;
}

.log-scroll :deep(.session-view) {
	max-width: none;
}

.log-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 8px;
	height: 100%;
	min-height: 260px;
	padding: 24px;
	color: var(--pix-text-muted);
	font-size: 12px;
	text-align: center;
}

.log-empty .mdi {
	color: var(--pix-text-muted);
	font-size: 31px;
}

.log-empty strong {
	color: var(--pix-text-secondary);
	font-family: var(--pix-font-ui);
	font-size: 16px;
	font-weight: 500;
}

.clarification-area {
	padding: 16px 18px 0;
}

.clarification-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	margin-bottom: 10px;
}

.drawer-composer {
	padding: 12px 16px 15px;
	border-top: 1px solid var(--pix-border-light);
	background: var(--pix-bg-topbar);
}

.composer-blocked {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 8px;
	color: var(--pix-warning);
	font-size: 11px;
}

.drawer-composer textarea {
	display: block;
	width: 100%;
	min-height: 38px;
	max-height: 150px;
	padding: 9px 10px;
	border: 1px solid var(--pix-border);
	border-radius: 6px;
	background: var(--pix-bg-input);
	color: var(--pix-text-primary);
	font-size: 12px;
	line-height: 1.5;
	resize: none;
}

.drawer-composer textarea:focus {
	outline: none;
	border-color: var(--pix-accent);
	box-shadow: 0 0 0 3px var(--pix-focus-ring);
}

.drawer-composer textarea:disabled {
	background: var(--pix-bg-subtle);
	color: var(--pix-text-muted);
}

.composer-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-top: 8px;
}

.composer-hint {
	color: var(--pix-text-muted);
	font-size: 11px;
}

.send-button {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-height: 28px;
	padding: 0 9px;
	border-radius: 5px;
	background: var(--pix-accent);
	color: var(--pix-text-inverse);
	font-size: 11px;
	font-weight: 600;
}

.send-button:hover:not(:disabled) {
	background: var(--pix-accent-hover);
}

.send-button.stop {
	background: var(--pix-error-bg);
	color: var(--pix-error);
}

.send-button:disabled {
	background: var(--pix-border);
	color: var(--pix-text-inverse);
}

@media (max-width: 680px) {
	.agent-log-drawer {
		width: 100%;
	}
}
</style>
