# PiX-paper

AI 驱动的科研全流程自动化系统。

## 定位

给定一个论文题目，PiX-paper 能够自主完成：

```
论文题目 → 文献调研 → 方法设计 → 代码复现 → 实验执行 → 论文撰写
```

从零到一，端到端完成完整科研工作流。

## 核心能力

- **文献调研**：自动检索、筛选、阅读相关论文，生成文献综述
- **方法设计**：基于文献分析，提出创新技术方案
- **代码复现**：clone baseline 代码，复现论文结果
- **实验执行**：实现新方法，运行对比实验，生成图表
- **论文撰写**：生成完整 LaTeX 论文，包含引用和图表

## 技术栈

- **桌面框架**：Electron
- **前端**：Vue 3 + Vuetify 3 + Pinia
- **构建工具**：Vite + TypeScript
- **Agent 引擎**：pi-agent-core（多轮对话、工具调用、状态管理）
- **LLM 接口**：pi-ai（OpenAI、Anthropic、Google 等多模型）
- **工具协议**：MCP（Model Context Protocol）

## 项目结构

```
PiX-paper/
├── packages/               # 核心包
│   ├── agent/              # agent 引擎
│   ├── ai/                 # LLM 接口
│   ├── coding-agent/       # 代码执行工具
│   ├── mcp-adapter/        # MCP 协议适配
│   ├── workflow/           # 工作流引擎（DAG）
│   ├── research/           # 科研工具（文献搜索、PDF解析等）
│   ├── mcp-tools/          # MCP 工具（search_papers等）
│   └── prompts/            # Prompt 模板
│
├── pix/                    # 桌面应用
│   ├── src/main/           # Electron 主进程
│   │   ├── workflow-engine.ts   # 工作流引擎桥接
│   │   ├── workflow-ipc.ts      # 工作流 IPC 处理
│   │   ├── research-ipc.ts      # 科研工具 IPC 处理
│   │   └── session-bridge.ts    # 会话管理
│   │
│   └── src/renderer/       # Vue 渲染进程
│       ├── components/     # UI 组件
│       │   ├── workflow/   # 工作流组件
│       │   ├── research/   # 文献管理组件
│       │   ├── experiment/ # 实验管理组件
│       │   └── writing/    # 论文写作组件
│       ├── stores/         # 状态管理
│       └── pages/          # 页面
│
├── vuetify_guide/          # Vuetify 组件指南
├── design.md               # 详细设计文档
└── README.md
```

## 快速开始

```bash
# 安装依赖
npm install --ignore-scripts

# 开发模式
npm run dev

# 构建
npm run build

# 运行测试
npm test
```

## 开发进度

### ✅ Phase 1-5: 核心功能（已完成）

1. **基础框架**
   - DAG 工作流引擎
   - Artifact 管理器
   - 工具注册机制

2. **文献工具**
   - Semantic Scholar / arXiv API 集成
   - 论文检索、下载、PDF 解析
   - 去重、排序、引用验证

3. **Harness 核心**
   - 工作流引擎与 Agent 集成
   - 阶段状态管理
   - 人工确认点实现

4. **MCP 工具**
   - search_papers（论文检索）
   - verify_claim_citation（引用验证）
   - generate_chart（图表生成）
   - convert_paper（格式转换）

5. **Prompt 设计**
   - 各阶段 System Prompt
   - 质量检查 Prompt
   - 论文写作 Prompt

### ✅ Phase 6: 集成测试（已完成）

1. **端到端测试**
   - 完整工作流测试（12个测试用例）
   - 阶段特定行为测试
   - 质量门禁测试
   - Artifact 管理测试
   - 审批流程测试
   - 暂停/恢复测试
   - 回溯测试

2. **质量门禁验证**
   - 文献阶段质量检查（11个测试用例）
   - 方法阶段质量检查
   - 实验阶段质量检查
   - 质量门禁事件测试
   - 质量门禁集成测试

3. **测试覆盖**
   - 工作流引擎测试（26个测试用例）
   - Artifact 管理器测试（30个测试用例）
   - Harness 测试（14个测试用例）
   - 类型测试（10个测试用例）
   - 工具注册测试（25个测试用例）

**总计：128个测试用例，全部通过**

## 核心组件

### 工作流引擎（packages/workflow）

DAG 工作流引擎，支持：
- 非线性执行
- 回跳、分支、重试
- 质量门禁
- 人工确认点
- Artifact 追踪

### 科研工具（packages/research）

文献管理工具，支持：
- 多源文献搜索（Semantic Scholar、arXiv）
- PDF 解析和元数据提取
- 引用验证
- 文献库管理

### MCP 工具（packages/mcp-tools）

MCP 协议工具，支持：
- search_papers：论文检索
- verify_claim_citation：引用验证
- generate_chart：图表生成
- convert_paper：格式转换

### Prompt 模板（packages/prompts）

各阶段 Prompt 模板，包括：
- 文献调研阶段
- 方法设计阶段
- 代码复现阶段
- 实验执行阶段
- 论文撰写阶段

## UI 组件

### 工作流组件（workflow/）
- WorkflowProgress：工作流进度可视化
- QualityGatePanel：质量门禁面板
- ApprovalDialog：人工确认对话框
- ArtifactList：Artifact 列表

### 文献管理组件（research/）
- LibraryPanel：文献库管理
- PaperDetail：论文详情
- CitationVerifierPanel：引用验证面板

### 实验管理组件（experiment/）
- ExperimentConfig：实验配置面板
- ExperimentResults：实验结果展示

### 论文写作组件（writing/）
- PaperEditor：论文编辑器
- ReferenceManager：参考文献管理

## 设计文档

详见 [design.md](./design.md)，包含：

- 系统架构设计
- 工作流详细设计
- 工具设计
- 数据模型
- UI 设计
- 开发路线

## 许可证

MIT
