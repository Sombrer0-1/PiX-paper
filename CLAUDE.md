# PiX-paper

AI 驱动的科研论文产出系统。用户输入研究主题，系统自动完成文献调研、方法构思、代码复现、实验执行、结果分析和论文撰写。用户在关键节点确认，保证质量与方向。

## 核心概念

- **DAG 工作流**：非线性，支持回跳、分支、重试
- **Artifact**：贯穿全系统的核心抽象，所有阶段输出都登记为 Artifact
- **质量门禁**：每个阶段完成时必须通过质量检查
- **人工确认点**：关键节点强制用户确认

## 项目结构

```
packages/          # 核心包（保留原包名）
  agent/           # pi-agent-core
  ai/              # pi-ai
  coding-agent/    # pi-coding-agent
  mcp-adapter/     # pi-mcp-adapter
  research/        # 新增：科研工具
  workflow/        # 新增：工作流引擎

pix/               # 桌面应用（保留原名）
  src/main/        # Electron 主进程
  src/renderer/    # Vue 渲染进程
  src/shared/      # 共享类型

vuetify_guide/     # Vuetify 组件指南
design.md          # 详细设计文档
```

## 开发命令

```bash
npm install --ignore-scripts   # 安装依赖
npm run dev                    # 开发模式
npm run build                  # 构建
npm run package                # 打包
```

## 开发规范

- Vuetify 组件必须参考 `vuetify_guide/`
- 禁止内联导入，仅使用顶层导入
- 提交时 `git add <具体文件>`，禁用 `git add .`
- 不提交 node_modules、dist、release、*.log
- `npm install --ignore-scripts`，不运行生命周期脚本

## 详细设计

见 [design.md](./design.md)
