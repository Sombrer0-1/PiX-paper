# PiX-paper 设计文档

## 1. 定位

PiX-paper 是一个 AI 驱动的科研论文产出系统。用户输入研究主题后，系统自动完成文献调研、方法构思、代码复现、实验尝试、结果分析和论文撰写；用户主要在关键节点进行确认、选择和修正，以保证科研质量与方向正确。

### 核心原则

- **人机协作**：AI 执行，人类决策
- **质量优先**：每个阶段有质量门禁
- **可追溯**：所有输出登记为 Artifact，支持溯源
- **非线性**：DAG 工作流，支持回跳、分支、重试

### 人工确认点

| 阶段 | 必须人工确认的节点 |
|------|-------------------|
| 文献调研 | 关键词、候选论文池、top-N 精读列表 |
| 方法设计 | 研究问题、创新点、实验假设 |
| 代码复现 | baseline 选择、复现结果是否接受 |
| 实验执行 | 数据集、指标、对比方法、显著性判断 |
| 论文撰写 | 摘要、贡献表述、实验结论 |

### 与 PiX 的关系

| 组件 | 复用方式 |
|------|----------|
| Electron + Vue 框架 | 完全复用，调整 UI 布局 |
| pi-agent-core | 完全复用，agent 核心引擎 |
| pi-ai | 完全复用，多模型 LLM 接口 |
| pi-mcp-adapter | 完全复用，扩展外部工具 |
| pi-coding-agent | 部分复用，保留代码执行能力 |

---

## 2. 系统架构

### 2.1 核心理念

**LLM Agent 是主体**，它有能力自主完成大部分工作：
- 通过 `bash` 执行命令（git clone, python, pip install, ...）
- 通过 `read/write/edit` 操作文件
- 通过 LLM 自身进行推理、分析、写作

**系统提供 Harness（工作流引擎）** 来编排 LLM 的执行流程，确保质量。

**只提供 LLM 自己做不了的工具**（如调用外部 API）。

### 2.2 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Harness（工作流引擎）                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  DAG 工作流 → 阶段编排 → 质量门禁 → 人工确认 → Artifact   │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ 驱动
┌────────────────────────────┴────────────────────────────────────┐
│                         LLM Agent                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  pi-agent-core + pi-ai (多模型支持)                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  内置工具（复用 PiX）：                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   bash   │ │   read   │ │   edit   │ │   write  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  LLM 可以自主完成：                                              │
│  • git clone 代码仓库                                           │
│  • python train.py 运行实验                                     │
│  • pip install 安装依赖                                         │
│  • 读写文件、分析代码                                            │
│  • 撰写论文内容                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用
┌────────────────────────────┴────────────────────────────────────┐
│                    MCP 工具（LLM 做不了的）                       │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │ search_papers  │ │verify_citation │ │generate_chart  │      │
│  │ 调用学术API    │ │ 引用验证        │ │ 图表生成       │      │
│  └────────────────┘ └────────────────┘ └────────────────┘      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    UI（给用户看的）                               │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │ WorkflowProgress│ │ LibraryPanel  │ │QualityGatePanel│      │
│  │ 工作流进度      │ │ 文献库浏览     │ │ 质量门禁       │      │
│  └────────────────┘ └────────────────┘ └────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块划分

#### 核心包（packages/）

保留 PiX 原包名，新增两个包：

| 包名 | 职责 | 状态 |
|------|------|------|
| `packages/agent` | pi-agent-core，agent 引擎 | 复用 |
| `packages/ai` | pi-ai，LLM 接口 | 复用 |
| `packages/coding-agent` | pi-coding-agent，代码执行 | 复用 |
| `packages/mcp-adapter` | pi-mcp-adapter，MCP 协议 | 复用 |
| `packages/research` | 科研工具包 | 新增 |
| `packages/workflow` | 工作流引擎 | 新增 |

#### 桌面应用（pix/）

```
pix/src/
├── main/
│   ├── index.ts             # 应用入口
│   ├── session-bridge.ts    # 会话管理桥接
│   ├── workflow-engine.ts   # DAG 工作流引擎（新增）
│   ├── artifact-manager.ts  # Artifact 管理器（新增）
│   ├── tool-registry.ts     # 工具注册中心（新增）
│   ├── settings-store.ts    # 设置持久化
│   └── ipc-handlers.ts      # IPC 通信处理
│
├── renderer/
│   ├── components/
│   │   ├── workflow/        # 工作流组件（新增）
│   │   ├── literature/      # 文献管理组件（新增）
│   │   ├── experiment/      # 实验管理组件（新增）
│   │   ├── writing/         # 论文写作组件（新增）
│   │   ├── layout/          # 布局组件（复用）
│   │   └── common/          # 通用组件（复用）
│   │
│   ├── stores/
│   │   ├── workflow-store.ts
│   │   ├── artifact-store.ts
│   │   ├── literature-store.ts
│   │   └── ...
│   │
│   └── pages/
│       ├── HomePage.vue
│       ├── ProjectPage.vue
│       └── SettingsPage.vue
│
└── shared/
    └── types.ts
```

---

## 3. 核心数据模型

### 3.1 Artifact（核心抽象）

所有阶段输出都登记为 Artifact，支持溯源、恢复、审计。

```typescript
interface Artifact {
  id: string;
  projectId: string;
  type: ArtifactType;
  path: string;                    // 文件路径
  createdBy: 'user' | 'agent' | 'tool';
  sourceNodeId: string;            // 产出该 Artifact 的工作流节点
  hash: string;                    // 内容哈希
  metadata: Record<string, unknown>;
  provenance: Provenance[];        // 来源追溯链
  createdAt: number;
}

type ArtifactType =
  | 'paper'
  | 'paper_pdf'
  | 'paper_note'
  | 'survey'
  | 'method'
  | 'repo'
  | 'experiment_config'
  | 'experiment_result'
  | 'figure'
  | 'draft_section'
  | 'literature_pool'
  | 'reproduction_log';

interface Provenance {
  sourceId: string;      // 来源 Artifact ID
  relation: 'derived_from' | 'cites' | 'supports' | 'contradicts';
  description: string;
}
```

### 3.2 Project

```typescript
interface Project {
  id: string;
  name: string;
  topic: string;                   // 研究主题
  createdAt: number;
  workflow: WorkflowState;
  artifacts: Artifact[];           // 项目所有 Artifact
}
```

### 3.3 文献

```typescript
interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  venue: string;
  citations: number;
  url: string;
  doi?: string;
  localPath?: string;
  notes?: string;
  tags: string[];
  relevanceScore?: number;         // 与研究主题的相关性分数
}

interface DraftParagraph {
  id: string;
  content: string;
  citations: string[];             // 引用 ID
  evidenceRefs: ArtifactRef[];     // 支撑证据的 Artifact
  claimType: 'background' | 'method' | 'result' | 'limitation' | 'speculation';
}
```

### 3.4 论文结构化存储

论文主存储使用结构化 JSON，Markdown/LaTeX/Word 都是导出产物。

```typescript
interface PaperManuscript {
  title: string;
  abstract: Section;
  introduction: Section;
  relatedWork: Section;
  method: Section;
  experiments: Section;
  conclusion: Section;
  references: Reference[];
  figures: Figure[];
  tables: Table[];
}

interface Section {
  id: string;
  title: string;
  paragraphs: DraftParagraph[];
  status: 'draft' | 'review' | 'final';
}
```

---

## 4. 工作流设计（DAG）

### 4.1 DAG 架构

工作流是有向图（DAG），不是线性流程。支持回跳、分支、重试。

```
                    ┌─────────────┐
                    │   题目输入   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
               ┌───→│  文献调研    │←─────────────────┐
               │    └──────┬──────┘                   │
               │           │                          │
               │           ▼                          │
               │    ┌─────────────┐                   │
               │    │  方法设计    │←────────────────┐ │
               │    └──────┬──────┘                 │ │
               │           │                        │ │
               │           ▼                        │ │
               │    ┌─────────────┐                 │ │
               │    │  代码复现    │──── 失败 ────────┘ │
               │    └──────┬──────┘                   │
               │           │                          │
               │           ▼                          │
               │    ┌─────────────┐                   │
               │    │  实验执行    │──── 结果不好 ──────┘
               │    └──────┬──────┘
               │           │
               │           ▼
               │    ┌─────────────┐
               │    │  论文撰写    │──── 缺少消融实验 ──┘
               │    └──────┬──────┘
               │           │
               │           ▼
               │    ┌─────────────┐
               └────│  质量审查    │
                    └─────────────┘
```

### 4.2 工作流节点

```typescript
interface WorkflowNode {
  id: string;
  type: NodeType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'paused';
  dependencies: string[];          // 依赖的节点 ID
  artifacts: ArtifactRef[];        // 产出的 Artifact
  retryPolicy?: RetryPolicy;
  approvalRequired?: boolean;      // 是否需要人工确认
  qualityGate?: QualityGate;       // 质量门禁
  tasks: Task[];
}

type NodeType =
  | 'literature'
  | 'method'
  | 'reproduction'
  | 'experiment'
  | 'writing'
  | 'review';

interface WorkflowState {
  nodes: Record<string, WorkflowNode>;
  currentNodeId: string;
  history: WorkflowTransition[];   // 执行历史，支持回溯
}

interface WorkflowTransition {
  from: string;
  to: string;
  reason: string;                  // 跳转原因
  timestamp: number;
}
```

### 4.3 阶段详细设计

#### Stage 1: 文献调研

**执行步骤**：
1. 解析研究主题，提取关键词（需确认）
2. 多源检索论文（Semantic Scholar / arXiv / Crossref / OpenAlex）
3. 去重（deduplicate_papers）
4. 综合排序（rank_papers）：年份、venue、引用量、语义相关性
5. 候选论文池（需确认）
6. 精读 top-N（需确认）
7. 生成文献综述

**人工确认点**：关键词、候选论文池、top-N 精读列表

**输出 Artifact**：
- `literature_pool`：结构化文献库
- `survey`：文献综述

#### Stage 2: 方法设计

**执行步骤**：
1. 分析研究空白
2. 提出研究问题（需确认）
3. 设计技术方案和创新点（需确认）
4. 确定实验假设（需确认）
5. 设计评估指标和实验方案

**人工确认点**：研究问题、创新点、实验假设

**输出 Artifact**：
- `method`：方法描述
- `experiment_config`：实验配置

#### Stage 3: 代码复现

**执行步骤**：
1. 从论文提取代码仓库地址
2. 选择 baseline（需确认）
3. clone 代码库
4. 搭建环境
5. 运行 baseline 实验
6. 验证复现结果（需确认）

**人工确认点**：baseline 选择、复现结果是否接受

**输出 Artifact**：
- `repo`：baseline 代码库
- `reproduction_log`：复现日志和结果

#### Stage 4: 实验执行

**执行步骤**：
1. 确认数据集（需确认）
2. 确认评估指标（需确认）
3. 确认对比方法（需确认）
4. 实现新方法
5. 运行对比实验
6. 统计显著性判断（需确认）
7. 生成图表

**人工确认点**：数据集、指标、对比方法、显著性判断

**输出 Artifact**：
- `experiment_result`：实验结果
- `figure`：对比图表

#### Stage 5: 论文撰写

**执行步骤**：
1. 生成论文大纲
2. 结构化撰写各章节
3. 每个段落附带 evidenceRefs
4. 插入引用和图表
5. 摘要确认（需确认）
6. 贡献表述确认（需确认）
7. 实验结论确认（需确认）
8. 导出 Markdown → LaTeX/Word/PDF

**人工确认点**：摘要、贡献表述、实验结论

**输出 Artifact**：
- `paper`：结构化论文 JSON
- `paper_pdf`：导出的 PDF

### 4.4 质量门禁

每个阶段完成时必须通过质量检查：

```typescript
interface QualityGate {
  id: string;
  stageId: string;
  checks: QualityCheck[];
  status: 'passed' | 'warning' | 'failed';
}

interface QualityCheck {
  id: string;
  name: string;
  description: string;
  status: 'passed' | 'warning' | 'failed';
  details?: string;
}
```

| 阶段 | 质量门禁 |
|------|----------|
| 文献调研 | 至少 N 篇高相关论文；每篇有摘要、年份、来源、URL；去重完成 |
| 方法设计 | 明确 research question、hypothesis、baseline、metric |
| 代码复现 | 有环境记录、运行日志、baseline 指标、失败说明 |
| 实验执行 | 每个结果有 config、seed、command、metric、图表来源 |
| 论文写作 | 每个核心 claim 有引用或实验依据；图表编号有效；引用无缺失 |

---

## 5. 工具设计

### 5.1 设计原则

**LLM 能自己做的事，不封装工具。**

| LLM 内置能力 | 通过 bash/read/write 实现 |
|-------------|------------------------|
| Git 操作 | `git clone`, `git checkout`, ... |
| Python 执行 | `python train.py`, `pip install` |
| 环境管理 | `conda create`, `python -m venv` |
| 文件操作 | read/write/edit 工具 |
| 论文撰写 | LLM 直接生成 Markdown |

**只封装 LLM 做不了的事：**

| 需要 MCP 工具 | 原因 |
|--------------|------|
| `search_papers` | 调用 Semantic Scholar / arXiv API |
| `verify_claim_citation` | 结构化引用验证 |
| `generate_chart` | 生成图表数据（Chart.js 格式） |
| `convert_paper` | Markdown → LaTeX/Word/PDF 转换 |

### 5.2 MCP 工具清单

#### 文献工具

| 工具 | 功能 | 备注 |
|------|------|------|
| `search_papers` | 多源检索（Semantic Scholar / arXiv） | 内置去重和排序 |
| `verify_claim_citation` | 验证引用是否支持声明 | |

#### 输出工具

| 工具 | 功能 |
|------|------|
| `generate_chart` | 生成图表数据 |
| `convert_paper` | Markdown → LaTeX/Word/PDF |

### 5.3 LLM 自主操作

LLM 通过内置工具（bash/read/write）自主完成：

```
文献调研阶段：
  LLM → search_papers (MCP) 获取论文列表
  LLM → bash: wget 下载 PDF
  LLM → read: 阅读论文内容
  LLM → write: 生成文献综述

代码复现阶段：
  LLM → bash: git clone 仓库
  LLM → bash: pip install -r requirements.txt
  LLM → bash: python train.py
  LLM → read: 分析结果

实验执行阶段：
  LLM → write: 编写实验代码
  LLM → bash: python experiment.py
  LLM → read: 读取结果
  LLM → generate_chart (MCP): 生成图表

论文撰写阶段：
  LLM → write: 直接撰写 Markdown
  LLM → convert_paper (MCP): 导出 PDF
```

---

## 6. UI 设计

### 6.1 布局

```
┌─────────────────────────────────────────────────────────────────┐
│  PiX-paper                              [设置] [最小化] [关闭]   │
├──────────┬──────────────────────────────────────┬───────────────┤
│          │                                      │               │
│  项目列表 │  工作流进度 + 对话                    │  Artifacts     │
│          │                                      │               │
│  ───────  │  ┌────────────────────────────────┐  │  ┌─────────┐  │
│          │  │  [文献] → [方法] → [复现] → ...  │  │  │ 当前阶段 │  │
│  项目1    │  └────────────────────────────────┘  │  │ 产出物   │  │
│  项目2    │                                      │  └─────────┘  │
│  项目3    │  ┌────────────────────────────────┐  │               │
│          │  │                                  │  │  ┌─────────┐  │
│          │  │  对话内容 / 阶段详情              │  │  │ 质量门禁 │  │
│          │  │                                  │  │  │ ✓ / ✗   │  │
│          │  └────────────────────────────────┘  │  └─────────┘  │
│          │                                      │               │
│          │  ┌────────────────────────────────┐  │  ┌─────────┐  │
│          │  │  输入框 + 确认按钮              │  │  │ 人工确认 │  │
│          │  └────────────────────────────────┘  │  │ 待处理   │  │
│          │                                      │  └─────────┘  │
└──────────┴──────────────────────────────────────┴───────────────┘
```

### 6.2 核心交互

- **工作流启动**：用户输入研究主题，点击"开始研究"
- **人工确认**：关键节点弹出确认对话框
- **质量门禁**：右侧面板显示当前阶段质量状态
- **Artifact 浏览**：右侧面板展示当前阶段产出物
- **论文预览**：Markdown 实时预览，一键转换

---

## 7. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Electron | PiX 已有，跨平台 |
| 前端框架 | Vue 3 + Vuetify 3 | PiX 已有，组件丰富 |
| 状态管理 | Pinia | Vue 3 官方推荐 |
| 构建工具 | Vite | 快速，PiX 已有 |
| Agent 引擎 | pi-agent-core | 成熟，支持工具调用 |
| LLM 接口 | pi-ai | 多模型支持 |
| MCP 协议 | pi-mcp-adapter | 标准化工具集成 |
| 文献 API | Semantic Scholar + arXiv + Crossref + OpenAlex | 多源，去重 |
| 格式转换 | pandoc | Markdown → LaTeX/Word/PDF |
| 图表生成 | matplotlib + Chart.js | Python + 前端 |

---

## 8. 项目目录结构

```
projects/
└── my-research/
    ├── .pp/                          # 项目配置
    │   ├── config.json
    │   ├── workflow.json             # DAG 工作流状态
    │   └── artifacts.json            # Artifact 注册表
    │
    ├── literature/
    │   ├── library.json              # 文献元数据
    │   ├── papers/                   # PDF 文件
    │   └── notes/                    # 阅读笔记
    │
    ├── code/
    │   ├── baseline/                 # baseline 代码
    │   └── our_method/               # 新方法代码
    │
    ├── experiments/
    │   ├── configs/                  # 实验配置
    │   ├── results/                  # 实验结果
    │   └── figures/                  # 图表
    │
    └── paper/
        ├── manuscript.json           # 结构化论文（主存储）
        ├── paper.md                  # 导出：Markdown
        ├── output/
        │   ├── paper.tex             # 导出：LaTeX
        │   ├── paper.docx            # 导出：Word
        │   └── paper.pdf             # 导出：PDF
        └── references.json           # 参考文献
```

---

## 9. 开发路线

### Phase 1: 基础框架（2 周）

- [x] 新增 `packages/workflow` 和 `packages/research`
- [x] DAG 工作流引擎基础实现
- [x] Artifact 管理器
- [x] 工具注册机制
- [x] 基础 UI 框架

### Phase 2: 文献工具（2 周）

- [x] Semantic Scholar / arXiv API 集成
- [x] 论文检索、下载、PDF 解析
- [x] 去重、排序、引用验证
- [x] 文献库管理 UI

### Phase 3: Harness 核心（2 周）

- [x] 工作流引擎与 Agent 集成
- [x] 阶段状态管理
- [x] 人工确认点实现
- [x] Artifact 追踪

### Phase 4: MCP 工具（1 周）

- [x] search_papers MCP Server
- [x] verify_claim_citation MCP Server
- [x] generate_chart MCP Server
- [x] convert_paper MCP Server

### Phase 5: Prompt 设计（2 周）

- [x] 各阶段 System Prompt
- [x] 质量检查 Prompt
- [x] 论文写作 Prompt
- [x] 输出格式规范

### Phase 6: 集成测试（1 周）

- [ ] 端到端测试
- [ ] 质量门禁验证
- [ ] 文档完善

---

## 10. 风险和挑战

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 上下文长度限制 | 无法处理长论文 | 分章节处理，摘要压缩 |
| 文献 API 限制 | 检索不全 | 多源检索，缓存结果 |
| 代码复现困难 | 环境不一致 | Docker 容器化，环境快照 |
| 实验耗时长 | 用户体验差 | 异步执行，进度通知 |
| 论文质量 | 不符合学术规范 | 质量门禁 + 人工确认 |
| 工作流回跳 | 状态混乱 | DAG 设计，Artifact 溯源 |
