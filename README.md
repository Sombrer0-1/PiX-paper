# PiX-paper

> **开发状态：MVP 开发中。** 当前目标是跑通三阶段最小闭环（文献调研 → 方法设计 → 论文撰写），尚未完成。

AI 驱动的科研论文产出系统。用户输入研究主题，系统自动完成文献调研、方法构思、代码复现、实验执行、结果分析和论文撰写。用户在关键节点确认，保证质量与方向。

## 核心概念

- **分阶段执行**：MVP 采用线性 Stage 顺序执行，每阶段可独立启动
- **Artifact**：贯穿全系统的核心抽象，所有阶段输出都登记为 Artifact
- **人工确认点**：关键节点强制用户确认
- **质量门禁**：MVP 阶段仅检查文件是否存在

## 项目结构

```
packages/          # 核心包
  agent/           # pi-agent-core — agent 引擎
  ai/              # pi-ai — 多模型 LLM 接口
  coding-agent/    # pi-coding-agent — 代码执行
  mcp-adapter/     # pi-mcp-adapter — MCP 协议
  research/        # pp-research — 科研工具
  workflow/        # pp-workflow — 工作流引擎

pix/               # 桌面应用（Electron + Vue）
  src/main/        # Electron 主进程
  src/renderer/    # Vue 渲染进程
  src/shared/      # 共享类型
```

## 开发命令

```bash
npm install --ignore-scripts   # 安装依赖
npm run dev                    # 开发模式
npm run build                  # 构建
npm run package                # 打包
```

## MVP 目标

跑通三阶段闭环，生成以下文件：

| 阶段 | 产物文件 |
|------|---------|
| 文献调研 | `literature/survey.md`, `literature/gaps.md` |
| 方法设计 | `method/method.md`, `method/experiment_plan.md` |
| 论文撰写 | `paper/paper.md` |

## 详细设计

见 [design.md](./design.md)
