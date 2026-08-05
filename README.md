# PiX-paper

PiX-paper 是基于 PiX 的**独立产品**,专精科研论文写作。输入研究主题后,系统按五阶段自动推进(文献调研 → 代码复现 → 方法改进 → 实验执行 → 论文撰写),用户在大阶段节点审核方向,在 agent 拿不准的小问题上按需给建议。

> 写代码用 PiX,写论文用 PiX-paper。PiX-paper 严格 paper-only:非 paper 目录无法启动会话。

## 技术栈

- **前端**: Vue 3 + Vuetify 3 + Pinia + Vue Router
- **桌面框架**: Electron
- **构建工具**: Vite + TypeScript
- **Agent 后端**: 复用 pi-agent-core / pi-coding-agent / pi-ai(多模型 LLM)
- **paper 专属**: 轻量 stage 编排器(`packages/workflow`)+ paper MCP server(`packages/paper-mcp`)

## 功能特性

- 主页两个入口:**创建 Paper 项目**(主)与**打开 Paper 项目**(校验 `.pp/`,非 paper 目录拒绝)
- 五阶段自动推进,阶段内 agent 自主执行(`executionMode: unattended`)
- 阶段完成 gate(继续 / 返工至任意前序阶段 / 终止),专用 `paper-gate` IPC
- 阶段内小问题询问复用 pi 的 `request_user_input` + ClarificationCard
- paper MCP 工具:学术检索、PDF 下载/解析、图表提取、BibTeX 生成、引用支持检查
- 阶段产物登记与浏览(系统默认程序打开 / 在文件夹中定位)
- 最近项目列表自动过滤掉非 paper 目录
- 复用 PiX 三栏工作台、SessionView、SessionTreeView、RightPanel

## 项目结构

```
pix/
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── index.ts         # 应用入口
│   │   ├── session-bridge.ts# AgentSession 桥接
│   │   ├── ipc-handlers.ts  # IPC 处理(start-pi 拒绝非 paper 项目)
│   │   ├── paper-project.ts # .pp/ manifest + papers MCP 配置
│   │   ├── stage-engine.ts  # stage 编排器
│   │   └── paper-rpc.ts     # paper 专属 RPC + paper-check-project
│   ├── renderer/            # Vue 渲染进程
│   │   ├── components/paper/# 阶段进度、gate 卡、产物列表
│   │   ├── pages/           # HomePage(创建/打开 Paper)、WorkspacePage
│   │   ├── stores/          # 含 paper-store
│   │   └── composables/
│   └── shared/              # 共享类型
├── package.json             # name: pix-paper, build: electron-builder 配置
└── tsconfig.json
packages/
├── workflow/                # 阶段状态机 + gate + 五阶段提示词
├── paper-mcp/               # paper MCP server(检索/PDF 解析等)
├── agent/ ai/ coding-agent/ mcp-adapter/  # 复用的 pi 基础设施
```

## 开发

```bash
# 安装依赖(在仓库根目录,工作区包含 packages/*)
npm install --ignore-scripts

# 在 pix/ 下开发
cd pix
npm run dev          # Vite + Electron
npm run dev:renderer # 仅渲染进程
npm run build        # 构建 main + renderer
npm run package      # 构建并打包为安装程序
```

## 构建打包

```bash
cd pix
npm run package
```

产物位于 `pix/release/`:
- Windows: `PiX-paper-Setup-x.x.x.exe`(NSIS 安装程序)
- macOS: `PiX-paper-x.x.x.dmg`
- Linux: `PiX-paper-x.x.x.AppImage`

`package.json` 的 `build` 字段是 electron-builder 的唯一配置源(`appId: com.pixpaper.app`,`productName: PiX-paper`,GitHub 发布通道 `Sombrer0-1/PiX-paper`)。

## 依赖包

| 包名 | 说明 |
|------|------|
| `@earendil-works/pi-coding-agent` | 复用:AgentSession / 工具 / session / settings |
| `@earendil-works/pi-agent-core` | 复用:agent 运行时 |
| `@earendil-works/pi-ai` | 复用:多模型 LLM API |
| `pi-mcp-adapter` | 复用:MCP 协议适配器 |
| `pi-paper-workflow` | paper 专属:阶段状态机 + gate + 提示词 |
| `pi-paper-mcp` | paper 专属:MCP server(检索/PDF 解析等) |

## 许可证

MIT
