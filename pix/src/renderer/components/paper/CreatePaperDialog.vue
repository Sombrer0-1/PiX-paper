<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const emit = defineEmits<{
	close: [];
	created: [payload: { projectDir: string; name: string; topic: string }];
}>();

const name = ref("");
const topic = ref("");
const projectDir = ref("");
const error = ref<string | null>(null);
const formValid = ref<boolean | null>(null);
const isValidating = ref(false);
const directoryStatus = ref<{ exists: boolean; writable: boolean; hasPaperProject: boolean } | null>(null);
const previousActiveElement = ref<HTMLElement | null>(null);
let validationTimer: ReturnType<typeof setTimeout> | undefined;

const requiredRule = (value: string): true | string => value?.trim() ? true : "此项不能为空";

const topicExamples = [
	"视觉语言模型的少样本泛化",
	"可解释的时间序列预测",
	"低资源医学图像分割",
];

const canCreate = computed(() => Boolean(
	name.value.trim() &&
	topic.value.trim() &&
	projectDir.value.trim() &&
	directoryStatus.value?.exists &&
	directoryStatus.value.writable &&
	!directoryStatus.value.hasPaperProject &&
	!isValidating.value,
));

const topicWarning = computed(() => {
	const value = topic.value.trim();
	return value && value.length < 8 ? "主题较短，建议补充具体方法、数据集或应用场景。" : "";
});

const directoryStatusText = computed(() => {
	if (isValidating.value) return "正在检查目录...";
	if (!projectDir.value.trim()) return "请选择一个已有且可写的目录";
	if (!directoryStatus.value) return "等待检查目录";
	if (!directoryStatus.value.exists) return "目录不存在或不是文件夹";
	if (!directoryStatus.value.writable) return "目录不可写";
	if (directoryStatus.value.hasPaperProject) return "这里已经是 Paper 项目";
	return "目录可用，将在其中创建 .pp/ 和研究目录";
});

const directoryStatusClass = computed(() => {
	if (isValidating.value || !directoryStatus.value) return "pending";
	if (!directoryStatus.value.exists || !directoryStatus.value.writable || directoryStatus.value.hasPaperProject) return "invalid";
	return "valid";
});

async function pickDir(): Promise<void> {
	if (!window.pixApi) return;
	const directory = await window.pixApi.selectProject();
	if (!directory) return;
	projectDir.value = directory;
	if (!name.value.trim()) name.value = directory.split(/[/\\]/).pop() || directory;
	await validateProjectDir();
}

async function validateProjectDir(): Promise<void> {
	const value = projectDir.value.trim();
	directoryStatus.value = null;
	if (!value || !window.pixApi) return;
	isValidating.value = true;
	error.value = null;
	try {
		const result = await window.pixApi.paperValidateProjectDir({ projectDir: value });
		if (!result.success) {
			error.value = result.error || "无法检查项目目录";
			return;
		}
		directoryStatus.value = {
			exists: result.exists === true,
			writable: result.writable === true,
			hasPaperProject: result.hasPaperProject === true,
		};
	} catch (err) {
		error.value = err instanceof Error ? err.message : String(err);
	} finally {
		isValidating.value = false;
	}
}

function scheduleDirectoryValidation(): void {
	if (validationTimer) clearTimeout(validationTimer);
	validationTimer = setTimeout(() => { void validateProjectDir(); }, 350);
}

function selectTopic(example: string): void {
	topic.value = example;
}

function handleDialogModel(value: boolean): void {
	if (!value) emit("close");
}

async function submit(): Promise<void> {
	if (!canCreate.value) {
		if (!directoryStatus.value || directoryStatus.value.hasPaperProject || !directoryStatus.value.writable) await validateProjectDir();
		if (!canCreate.value) {
			error.value = "请填写有效的可写目录、项目名称和研究主题";
			return;
		}
	}
	emit("created", {
		projectDir: projectDir.value.trim(),
		name: name.value.trim(),
		topic: topic.value.trim(),
	});
}

watch(projectDir, () => {
	directoryStatus.value = null;
	scheduleDirectoryValidation();
});

onMounted(() => {
	previousActiveElement.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
});

onBeforeUnmount(() => {
	if (validationTimer) clearTimeout(validationTimer);
	previousActiveElement.value?.focus();
});
</script>

<template>
	<v-dialog :model-value="true" max-width="560" scrollable @update:model-value="handleDialogModel">
		<v-card class="dialog-card" variant="outlined" aria-labelledby="create-paper-title">
			<v-form v-model="formValid" class="dialog-form" validate-on="blur invalid-input" @submit.prevent="submit">
				<div class="dialog-header">
					<div><span class="dialog-kicker">研究台项目</span><h2 id="create-paper-title" class="dialog-title">创建 Paper 项目</h2></div>
					<v-btn icon="mdi-close" variant="text" size="small" title="关闭" aria-label="关闭创建项目对话框" @click="emit('close')" />
				</div>

				<div class="dialog-body">
					<div class="field">
						<div class="dir-row">
							<v-text-field
								v-model="projectDir"
								class="field-control"
								label="项目目录"
								placeholder="选择或输入已有项目目录..."
								:rules="[requiredRule]"
								hide-details="auto"
								autofocus
								@blur="validateProjectDir"
							/>
							<v-btn class="dir-btn" variant="outlined" prepend-icon="mdi-folder-open-outline" @click="pickDir">选择</v-btn>
						</div>
						<span id="directory-status" class="directory-status" :class="directoryStatusClass"><span v-if="isValidating" class="spinner"></span><span v-else class="mdi" :class="directoryStatusClass === 'valid' ? 'mdi-check-circle-outline' : directoryStatusClass === 'invalid' ? 'mdi-alert-circle-outline' : 'mdi-help-circle-outline'" aria-hidden="true"></span>{{ directoryStatusText }}</span>
					</div>

					<v-text-field v-model="name" label="项目名称" placeholder="例如：my-research" :rules="[requiredRule]" hide-details="auto" />

					<div class="field">
						<v-textarea
							v-model="topic"
							label="研究主题"
							placeholder="描述你要研究或撰写的主题，例如：基于对比学习的少样本图像分类方法改进"
							:rules="[requiredRule]"
							:messages="topicWarning ? [topicWarning] : []"
							rows="3"
							no-resize
							hide-details="auto"
						/>
						<div class="topic-examples"><span>主题示例</span><v-chip v-for="example in topicExamples" :key="example" size="small" variant="outlined" @click="selectTopic(example)">{{ example }}</v-chip></div>
					</div>

				<section class="create-info" aria-labelledby="create-info-title">
					<h3 id="create-info-title">接下来会发生什么</h3>
					<ol class="stage-list">
						<li><strong>文献调研</strong>：收集论文、整理文献池并形成综述。</li>
						<li><strong>代码复现</strong>：验证 baseline、环境和原始结果。</li>
						<li><strong>方法改进</strong>：提出方案、实现代码并准备实验。</li>
						<li><strong>实验执行</strong>：运行对比实验并整理图表和指标。</li>
						<li><strong>论文撰写</strong>：完成 manuscript 并导出 PDF。</li>
					</ol>
					<p class="cost-hint">全程自动推进，每个阶段完成后会请求你审核。Token 消耗取决于主题和本地计算量，建议先确认模型预算。</p>
				</section>

				<v-alert v-if="error" type="error" variant="tonal" density="compact" closable @click:close="error = null">{{ error }}</v-alert>
				<p class="dialog-hint">将在该目录下创建 .pp/ 配置、阶段目录结构，并注册 paper MCP 工具。</p>
				</div>

				<div class="dialog-footer">
					<v-btn variant="text" @click="emit('close')">取消</v-btn>
					<v-btn type="submit" color="primary" variant="flat" :loading="isValidating" :disabled="!canCreate">创建</v-btn>
				</div>
			</v-form>
		</v-card>
	</v-dialog>
</template>

<style scoped>
.dialog-card {
	display: flex;
	flex-direction: column;
	width: 100%;
	max-width: 560px;
	max-height: 90vh;
	border: 1px solid var(--pix-border-light);
	border-radius: 8px;
	background: var(--pix-bg-content);
	box-shadow: var(--pix-shadow-xl);
	overflow: hidden;
}

.dialog-form {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
}

.dialog-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 14px;
	padding: 22px 24px 16px;
	border-bottom: 1px solid var(--pix-border-subtle);
}

.dialog-kicker {
	color: var(--pix-text-muted);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.dialog-title {
	margin-top: 6px;
	font-family: var(--pix-font-ui);
	font-size: 22px;
	font-weight: 500;
	letter-spacing: 0;
}

.dialog-body {
	display: flex;
	flex-direction: column;
	gap: 17px;
	padding: 20px 24px 17px;
	overflow-y: auto;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.dir-row {
	display: flex;
	align-items: flex-start;
	gap: 7px;
}

.dir-row .field-control {
	min-width: 0;
	flex: 1;
}

.dir-btn {
	min-height: var(--pix-control-height);
	margin-top: 0;
}

.directory-status {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-height: 16px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.directory-status.valid {
	color: var(--pix-success);
}

.directory-status.invalid {
	color: var(--pix-error);
}

.directory-status .mdi {
	font-size: 15px;
}

.topic-examples {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 5px;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.create-info {
	padding: 13px 14px;
	border: 1px solid var(--pix-border-light);
	border-radius: 6px;
	background: var(--pix-bg-subtle);
	color: var(--pix-text-secondary);
}

.create-info h3 {
	font-family: var(--pix-font-ui);
	font-size: 12px;
	font-weight: 700;
}

.stage-list {
	display: flex;
	flex-direction: column;
	gap: 5px;
	margin: 10px 0 0;
	padding-left: 19px;
	font-size: 11px;
	line-height: 1.45;
}

.stage-list strong {
	color: var(--pix-accent-hover);
	font-weight: 600;
}

.cost-hint,
.dialog-hint {
	color: var(--pix-text-muted);
	font-size: 11px;
	line-height: 1.55;
}

.cost-hint {
	margin-top: 10px;
}

.dialog-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 13px 24px 21px;
	border-top: 1px solid var(--pix-border-subtle);
}

@media (max-width: 600px) {
	.dialog-card {
		max-height: 94vh;
		border-radius: 8px 8px 0 0;
	}

	.dialog-header,
	.dialog-body,
	.dialog-footer {
		padding-left: 18px;
		padding-right: 18px;
	}
}
</style>
