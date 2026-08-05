# PiX-paper 代码 Review 报告（状态同步）

> 初审范围:full code base,重点为 paper 模式新增代码(`pix/src/main`、`pix/src/renderer`、`packages/workflow`、`packages/paper-mcp`)。
> 初审日期:2026-07-20。
> 本次同步日期:2026-07-21。
> 状态依据:当前源码、配置、依赖树和针对性运行验证。

## 总结

PiX-paper 的核心 MVP 已实现:五阶段状态机、阶段提示词、Artifact 登记、专用 gate IPC、gate 决策回传、自动推进、返工 session clone、Paper 工作台和 6 个 paper MCP 工具均已接入。

原 Review 中列出的 15 个核心问题已修复或收敛为明确的降级行为。当前剩余问题主要是交互增强,不阻塞核心阶段流转:

1. 离开 Workspace 会取消未完成的 `request_user_input`。
2. 产物暂时只能用系统程序打开,没有应用内预览。
3. 长实验没有阶段级暂停/恢复、ETA 和当前活动摘要。
4. Paper 历史 session 没有阶段标签。
5. 创建 Paper 项目还没有可执行的 token 预算字段。

状态含义:

- **已修复**:当前代码已实现原问题的修复目标。
- **部分完成**:核心行为已具备,但原建议还有未实现的增强项。
- **未完成**:当前仍能复现原问题或设计缺口。
- **降级行为**:正常路径已实现,异常路径保留明确 fallback。

---

## 一、核心问题状态

| 编号 | 原问题 | 当前状态 | 当前实现与证据 |
|---|---|---|---|
| 1 | Paper 项目没有默认 `executionMode: unattended` | **已修复** | `ipc-handlers.ts` 在 paper 启动前设置 override; `session-bridge.ts` 通过 `SettingsManager.applyOverrides({ execution: { mode } })` 应用到新 session。 |
| 2 | `request_stage_review` 可审核错误阶段 | **已修复** | `stage-engine.ts` 始终以 `progress.stage.current` 为准;传入合法但不匹配的 stage 会直接报错。 |
| 3 | rework 目标可指向后续阶段 | **已修复** | `packages/workflow/src/stage-machine.ts` 校验阶段顺序;后续阶段目标回落到当前阶段,不会污染状态机。 |
| 4 | `respondGate` 的错误被 `refresh()` 清掉 | **已修复** | `paper-store.ts` 先恢复真实快照,再写入错误,避免 `applySnapshot()` 清空错误。 |
| 5 | `paperStore.error` 不展示 | **已修复** | `WorkspacePage.vue` 将错误传入 `CenterPanel`,显示可关闭的 paper error banner。 |
| 6 | 异步发送失败时用户草稿丢失 | **已修复** | `CenterPanel.vue` 在 `sendCommandAsync` 失败时恢复文本、附件和 textarea 草稿,同时将 optimistic block 标记为失败。 |
| 7 | rework 不 fork session | **已修复（带降级）** | `StageEngine.onAgentEnd()` 在返工前调用 `SessionBridge.clone()` 并记录新的 session file;clone 失败时记录错误并降级在当前 session 继续,这是异常恢复路径。 |
| 8 | `onAgentEnd` Promise 被丢弃 | **已修复** | `ipc-handlers.ts` 为 `onAgentEnd()` 添加 `.catch()`,记录日志并向前端发送 `pi-error`。 |
| 9 | Workspace 重挂载可能重复启动首阶段 | **已修复** | `paper-store.ts` 将 `autoStartDone` 提升到 Pinia store 生命周期,项目切换时重置,并在首阶段启动前设置标志。 |
| 10 | `SessionTreeView.navigateTo` 不刷新会话 | **已修复** | 导航后清空 session store 并重新调用 `getMessages()` 加载分支内容。 |
| 11 | 用户消息使用右对齐聊天气泡 | **已修复** | `MessageBlock.vue` 改为文档流、左对齐、最大内容宽度,不再使用右侧气泡布局。 |
| 12 | 主进程存在内联 `await import('electron')` | **已修复** | Electron API 已改为 `ipc-handlers.ts` 顶层导入。 |
| 13 | `session-bridge.ts` 使用不必要的 `as any` | **已修复** | session tree 转换使用入口对象的类型窄化,当前 paper 相关主进程代码无该断言。 |
| 14 | `startPi` 类型遗漏 `isPaper` | **已修复** | `preload.ts` 的 `PixApi.startPi` 返回类型包含 `isPaper?: boolean`。 |
| 15 | 渲染层不订阅 `paper-gate` | **已修复** | `WorkspacePage.vue` 订阅 `onPaperGate`;状态快照仍通过 `onPaperStateChanged` 同步,两条通道职责明确。 |

### 核心状态机的剩余风险

返工的正常路径会创建 session clone,原 session 保留。若当前 session 尚未持久化或 clone 失败,`StageEngine` 会记录错误并继续当前 session;这保证流程尽量不中断,但不能在该异常路径保证分支隔离。后续可将 clone 失败改为阻止返工并要求用户重试。

质量检查当前是 `StageEngine.runQualityChecks()` 的 best-effort 检查,依据 Artifact 类型和摘要生成提示,不是硬 gate。`verification_gate` 仍是 pi 原生事件,不应在文档或 UI 中描述成 paper 阶段的自动 pass/fail 判定。

---

## 二、交互建议状态

### A. 不合理交互

| 编号 | 建议 | 当前状态 | 说明 |
|---|---|---|---|
| A1 | Gate「终止」增加二次确认 | **已完成** | `GateCard.vue` 增加确认状态,明确阶段失败、自动推进停止且项目文件不会删除。 |
| A2 | Gate 产物 chip 支持打开 | **已完成** | 产物 chip 已改为按钮,通过 `open-artifact` 事件复用打开逻辑。 |
| A3 | Clarification「跳过」不要误导 | **部分完成** | 文案已改为“取消全部”,准确表达当前行为;仍未实现单题跳过或取消确认。 |
| A4 | 离开 Workspace 不要静默取消澄清 | **未完成** | `WorkspacePage.onUnmounted` 仍会对未答请求发送 `cancelled: true`;需要 store 化请求或离开确认。 |
| A5 | 长任务结束后通知用户 gate | **已完成** | 主进程在 gate 时发送系统通知,窗口最小化时调用 `flashFrame(true)`。 |
| A6 | Paper 模式隐藏 coding onboarding | **已完成** | `CenterPanel.vue` 对 paper/coding 空状态分别渲染;paper 模式显示阶段引导。 |

### B. 可改进交互

| 编号 | 建议 | 当前状态 | 说明 |
|---|---|---|---|
| B1 | 创建 Paper 项目增加范围和成本引导 | **部分完成** | 已有五阶段折叠说明、耗时提示、成本提示和过短主题警告;尚未接入 token 预算字段。 |
| B2 | 产物增加应用内预览 | **部分完成** | 已支持系统默认程序打开和在文件夹中定位;Markdown/PDF/JSON 内置预览未实现。 |
| B3 | 阶段进度显示耗时和返工目标 | **已完成** | `StageProgress.vue` 显示运行耗时、返工目标和 started/finished 时间 tooltip。 |
| B4 | Gate 质量检查显示 detail | **已完成** | `GateCard.vue` 显示 `QualityCheckItem.detail`,失败项使用错误色突出。 |
| B5 | 长任务增加活动摘要、ETA 和安全暂停 | **未完成** | 当前只有 Agent turn 的停止按钮;没有阶段暂停/恢复、ETA 或高层活动摘要。 |
| B6 | Paper 标识和 session 阶段信息 | **部分完成** | 左栏已有 Paper badge,在 paper 模式新建普通 session 前有确认;历史 session 尚无阶段标签。 |

### C. 已保留的合理设计

| 编号 | 设计 | 当前状态 |
|---|---|---|
| C1 | 工具执行按批次折叠为运行状态 | **已保留** |

`SessionView` 的 work-status 块继续默认折叠工具调用,用户需要时再展开原始细节。阶段分隔线和 gate 记录仍可作为后续增强。

---

## 三、papers MCP 连接故障

### 根因

旧项目的 `.pi/mcp.json` 使用:

```json
{
  "command": "pi-paper-mcp",
  "args": [],
  "transport": "stdio"
}
```

`pi-paper-mcp` 不是桌面应用稳定可用的 PATH 命令。子进程启动失败后,MCP SDK 只向上层报告通用的 `MCP error -32000: Connection closed`。

### 修复

1. `pix/package.json` 将 `pi-paper-mcp` 声明为生产依赖,由 electron-builder 收集 server 及其运行时依赖。
2. `paper-project.ts` 正常通过 Node module resolution 获取绝对 `dist/index.js` 入口;模块解析失败时保留 `pi-paper-mcp` PATH fallback 以支持未链接依赖的开发环境。
3. Electron 启动 MCP 子进程时使用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`,避免把 Electron 当 GUI 进程启动。
4. paper 项目执行 `start-pi` 前自动刷新 `.pi/mcp.json`,旧项目无需手动迁移配置。

### 验证

- 直接 stdio MCP 握手成功,`listTools()` 返回 6 个工具。
- `pix/tsconfig.main.json` 类型检查通过。
- electron-builder `node-dep-tree` 包含 `pi-paper-mcp`、MCP SDK、`pdfjs-dist`、`pngjs`、`zod` 及其依赖。
- 当前未运行完整 `npm run build` 或安装包启动验证;需要重新打包并重新打开 paper 项目后验证实际安装包。

---

## 四、当前结论与后续优先级

当前不应再将原 Review 的 15 项核心问题标记为未修复。PiX-paper 已进入联调/验收阶段,优先级如下:

1. 保留未答的 `request_user_input`,避免路由切换丢失上下文。
2. 增加 Markdown/PDF/JSON 产物预览。
3. 为长实验增加阶段暂停/恢复和当前活动摘要。
4. 为历史 session 建立阶段关联标签。
5. 将 Paper 项目 token 预算接入 `ThreadGoal` 或明确的项目级预算模型。
6. 将 clone 失败从降级继续改为可重试的显式错误流程。
