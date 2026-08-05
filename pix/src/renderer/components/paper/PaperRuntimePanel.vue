<script setup lang="ts">
import { useRouter } from "vue-router";
import RightPanel from "../layout/RightPanel.vue";

defineProps<{
	open: boolean;
}>();

const emit = defineEmits<{
	close: [];
}>();

const router = useRouter();

function close(): void {
	emit("close");
}

function openSettings(section: "model" | "auth" | "mcp"): void {
	close();
	void router.push({ path: "/settings", query: { section } });
}
</script>

<template>
	<div v-if="open" class="runtime-drawer-layer">
		<button
			type="button"
			class="runtime-drawer-backdrop"
			title="关闭运行状态"
			aria-label="关闭运行状态"
			@click="close"
		></button>
		<aside class="runtime-drawer" aria-label="运行状态面板">
			<header class="runtime-drawer-header">
				<div class="runtime-drawer-heading">
					<span class="mdi mdi-chart-box-outline" aria-hidden="true"></span>
					<div>
						<h2>运行状态</h2>
						<p>会话、上下文与 MCP</p>
					</div>
				</div>
				<button
					type="button"
					class="runtime-drawer-close"
					title="关闭运行状态"
					aria-label="关闭运行状态"
					@click="close"
				>
					<span class="mdi mdi-close" aria-hidden="true"></span>
				</button>
			</header>

			<nav class="runtime-settings-links" aria-label="运行配置入口">
				<button type="button" @click="openSettings('model')">
					<span class="mdi mdi-cube-outline" aria-hidden="true"></span>
					<span>模型设置</span>
				</button>
				<button type="button" @click="openSettings('auth')">
					<span class="mdi mdi-key-outline" aria-hidden="true"></span>
					<span>API 密钥</span>
				</button>
				<button type="button" @click="openSettings('mcp')">
					<span class="mdi mdi-puzzle-outline" aria-hidden="true"></span>
					<span>MCP 设置</span>
				</button>
			</nav>

			<div class="runtime-drawer-body">
				<RightPanel :paper-mode="false" :paper-artifacts="[]" />
			</div>
		</aside>
	</div>
</template>

<style scoped>
.runtime-drawer-layer {
	position: absolute;
	inset: 0;
	z-index: 20;
	pointer-events: none;
}

.runtime-drawer-backdrop {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	border: 0;
	background: rgba(31, 41, 51, 0.16);
	cursor: default;
	pointer-events: auto;
}

.runtime-drawer {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 1;
	display: flex;
	flex-direction: column;
	width: min(380px, calc(100% - 24px));
	border-left: 1px solid var(--pix-border-light);
	background: var(--pix-bg-subtle);
	box-shadow: -12px 0 32px rgba(31, 41, 51, 0.12);
	pointer-events: auto;
	-webkit-app-region: no-drag;
}

.runtime-drawer-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-height: 66px;
	padding: 14px calc(16px + var(--pix-window-controls-width)) 14px 16px;
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-bg-topbar);
	-webkit-app-region: no-drag;
}

.runtime-drawer-heading {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	color: var(--pix-accent);
}

.runtime-drawer-heading > span {
	font-size: 22px;
}

.runtime-drawer-heading h2 {
	margin: 0;
	color: var(--pix-text-primary);
	font-size: 15px;
	font-weight: 700;
}

.runtime-drawer-heading p {
	margin: 3px 0 0;
	color: var(--pix-text-muted);
	font-size: 11px;
}

.runtime-drawer-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	min-width: 30px;
	flex: 0 0 30px;
	border-radius: 5px;
	color: var(--pix-text-secondary);
	font-size: 18px;
	-webkit-app-region: no-drag;
	pointer-events: auto;
}

.runtime-drawer-close:hover {
	background: var(--pix-accent-light);
	color: var(--pix-accent-hover);
}

.runtime-settings-links {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 6px;
	padding: 12px;
	border-bottom: 1px solid var(--pix-border-light);
	background: var(--pix-bg-left);
}

.runtime-settings-links button {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	min-width: 0;
	min-height: 32px;
	padding: 5px 4px;
	border: 1px solid var(--pix-border-light);
	border-radius: 5px;
	background: var(--pix-bg-content);
	color: var(--pix-text-secondary);
	font-size: 11px;
	white-space: nowrap;
}

.runtime-settings-links button:hover {
	border-color: var(--pix-accent-soft);
	background: var(--pix-accent-light);
	color: var(--pix-accent-hover);
}

.runtime-settings-links .mdi {
	font-size: 15px;
}

.runtime-drawer-body {
	min-height: 0;
	flex: 1;
	overflow-y: auto;
}

.runtime-drawer-body :deep(.right-panel) {
	height: auto;
	min-height: 100%;
	padding: 14px 12px 20px;
	background: transparent;
}

.runtime-drawer-body :deep(.info-card) {
	padding: 14px;
}

@media (max-width: 560px) {
	.runtime-drawer {
		width: min(380px, calc(100% - 10px));
	}

	.runtime-settings-links button {
		font-size: 11px;
	}
}
</style>
