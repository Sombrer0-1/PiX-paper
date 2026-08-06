# PiX-paper 设计文档

> **开发状态:PiX-paper MVP 核心主流程已实现,当前处于联调与验收阶段。** 本文档基于 PiX 现有代码(已完整集成 pi-coding-agent via `createAgentSession`)演进而非另起炉灶。实现状态以 `pix/src` 与 `packages/` 当前代码为准。
>
> **同步日期:2026-08-06。** 阶段状态机、五阶段提示词、paper MCP、项目骨架、gate 控制流和 paper 工作台已落地;PiX-paper 已确定为基于 PiX 的独立产品并切换为严格 paper-only(移除通用 coding 入口,非 paper 目录拒绝启动)。paper 工作台已从早期的"三栏 + GateCard"演化为多视图研究台(PaperWorkspace),产物支持应用内预览与修订快照,阶段支持暂停/恢复,并新增收件箱(.pp/inbox.json)集中沉淀 gate/澄清/错误/验证等待事项。剩余项主要是历史 session 阶段标签、可执行 token 预算字段和 ETA/活动摘要等体验增强。

## 1. 定位

PiX-paper 是基于 PiX 的独立产品,专精科研论文写作(PiX 仍是 coding 产品,二者分离)。用户输入研究主题后,系统自动完成文献调研、代码复现、方法改进、实验和论文撰写;用户在大阶段节点审核方向,在 agent 拿不准的小问题上按需给建议。

### 1.1 全自动低监督的定义

- **全自动**:阶段内 agent 自主执行,过程不用用户操心。agent 跑不通时主动向用户求助(复用 pi 的 `request_user_input`)。
- **低监督**:大阶段完成时人工 gate(返工 / 继续下一阶段);阶段内小问题(技术栈偏好、参数选择、命名等)按需询问。
- **硬约束**:实验或代码没跑通,不能进入论文撰写阶段。

### 1.2 与 PiX 的关系

PiX-paper 是基于 PiX 的独立产品,与 PiX(coding)分离。一个 paper 就是一个项目目录(含 `.pp/` 标记)。打开 paper 项目即进入 paper 工作模式;非 paper 目录在 `start-pi` 层面被拒绝(PiX-paper 严格 paper-only,写代码请用 PiX)。

| 组件 | 复用方式 |
|------|----------|
| Electron + Vue + Vuetify 框架 | 完全复用 |
| SessionBridge + IPC 层 + preload | 完全复用,扩展新 RPC 命令 |
| pi-agent-core(Agent / AgentHarness) | 完全复用 |
| pi-ai(多模型 LLM) | 完全复用 |
| pi-coding-agent(AgentSession / 工具 / session / settings) | 完全复用 |
| pi-mcp-adapter | 完全复用,注册 paper MCP server |
| 渲染层(SessionView、ClarificationCard、SessionTreeView、RightPanel) | 复用;paper 模式套独立 `PaperWorkspace` 外壳,上述组件在 drawer/抽屉中复用 |
| **stage 编排器 + 阶段提示词** | **paper 专属,已实现** |
| **paper MCP 工具**(检索/PDF 解析等) | **paper 专属,已实现** |

### 1.3 复用边界

| 复用 PiX/pi 现有能力 | paper 专属单独做 |
|---|---|
| agent 框架(tools、call-loop) | stage 编排器(阶段状态机 + gate) |
| pi 内置工具(read/write/edit/bash/grep) | 五阶段提示词 |
| mcp 适配器(工具注册机制) | paper MCP server 实现 |
| `request_user_input` 提问机制 | 阶段内小问题询问 |
| `verification_gate` / `executionMode` | 阶段产物登记 |
| session fork / navigateTree(版本分支、返工) | |
| `ThreadGoal`(目标 + token/time 预算) | |
| `takeHerEyes`(视觉模型,图表分析) | |

### 1.4 五阶段

```
文献调研 ──gate──▶ 代码复现 ──gate──▶ 方法改进 ──gate──▶ 实验执行 ──gate──▶ 论文撰写
  ▲──────────────────  返工(可回退到任意前序阶段)──────────────────────┘
```

复现在改进前(先复现 baseline,再在其基础上改进)。结论并入论文撰写阶段。每阶段完成需人工 gate。

---

## 2. 系统架构

### 2.1 核心理念

**LLM Agent 是主体**,通过 bash / read / write / edit 自主完成大部分工作(git clone、pip install、python train、写 Markdown、pandoc 转换、matplotlib 出图)。

**系统提供两层 paper 专属能力**:
- **stage 编排器**(轻量):驱动阶段流转、发起 gate 询问、登记产物。不是 DAG 引擎。
- **paper MCP 工具**:封装 LLM 做不了的事(调用学术 API、解析 PDF)。

### 2.2 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                  stage 编排器(paper 专属,轻量)                  │
│   阶段状态机 -> request_stage_review -> 专用 paper-gate -> Artifact │
│   复用: executionMode / session fork / goal;质量检查为 best-effort   │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用 SessionBridge.prompt / subscribe
┌────────────────────────────┴────────────────────────────────────┐
│                         LLM Agent(完全复用)                     │
│   pi-agent-core + pi-ai + pi-coding-agent                       │
│                                                                  │
│   内置工具:  bash   read   edit   write   grep   find   ls      │
│                                                                  │
│   LLM 自主完成:                                                  │
│   • git clone / pip install / conda create                       │
│   • python train.py / experiment.py                              │
│   • matplotlib 出图(bash)                                       │
│   • pandoc 转 PDF/LaTeX(bash)                                   │
│   • write 撰写 Markdown 论文                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用
┌────────────────────────────┴────────────────────────────────────┐
│              paper MCP server(LLM 做不了的,新建)                │
│   search_papers  fetch_fulltext  parse_pdf                       │
│   extract_figures  generate_bibtex  check_citation_support       │
│   通过 pi-mcp-adapter 自动注册为 mcp__papers__xxx                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              UI(PaperWorkspace 多视图研究台)                     │
│  顶栏:阶段/状态/模型选择/收件箱/Agent 日志/运行状态/设置          │
│  左栏(PaperNavigation):概览/五阶段/审核/产物分组/收件箱          │
│  中栏(路由视图):dashboard/stage/gate/library/figures/results/     │
│                  manuscript/artifact/inbox                       │
│  右栏(PaperInspector):项目状态/当前阶段/运行成本/产物/活动       │
│  抽屉:AgentLogDrawer(对话+澄清+composer)/PaperRuntimePanel      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 模块划分

#### 核心包(packages/)

保留 PiX 原包,新增 workflow 包和 paper MCP server:

| 包/服务 | 职责 | 状态 |
|---|---|---|
| `packages/agent` | pi-agent-core,agent 引擎 | 复用 |
| `packages/ai` | pi-ai,LLM 接口 | 复用 |
| `packages/coding-agent` | pi-coding-agent,代码执行 + AgentSession | 复用 |
| `packages/mcp-adapter` | pi-mcp-adapter,MCP 协议 | 复用 |
| `packages/workflow` | **轻量 stage 编排器**(阶段状态机 + gate + 产物登记),非 DAG 引擎 | 已实现 |
| `packages/paper-mcp` | paper 专属 MCP server(检索/PDF 解析等) | 已实现 |

> `packages/workflow` 只做 paper 阶段编排,不重造 pi 已有的 session/fork/compaction/steering 能力(那些直接用 `AgentSession`)。`pix/package.json` 将 `pi-paper-mcp` 声明为生产依赖,打包时携带 server 及其运行时依赖。

#### 桌面应用(pix/)

```
pix/src/
├── main/
│   ├── index.ts                # 应用入口(复用)
│   ├── session-bridge.ts       # AgentSession 桥接(复用,仅加 addExtraExtensionFactories 注入口)
│   ├── settings-store.ts       # 设置持久化(复用)
│   ├── ipc-handlers.ts         # IPC 通信(复用,扩展 paper 命令)
│   ├── paper-project.ts        # 新增:paper project manifest 读写(.pp/progress.json)
│   ├── stage-engine.ts         # 新增:stage 编排器(驱动阶段、发 gate、登记产物)
│   └── paper-rpc.ts            # 新增:paper 专属 RPC(paper 状态/产物/gate 决策)
│
├── renderer/
│   ├── components/
│   │   ├── paper/              # 新增:PaperWorkspace 多视图研究台
│   │   │                       # StageDashboard/StageWorkspace/GateReviewWorkspace
│   │   │                       # ArtifactCatalogView/ManuscriptView/PaperArtifactView/ArtifactPreview
│   │   │                       # InboxView/PaperNavigation/PaperInspector/PaperRuntimePanel/AgentLogDrawer
│   │   ├── layout/             # 复用(AppLayout 三栏,非 paper 兜底)
│   │   ├── session/            # 复用
│   │   ├── input/              # 复用(ClarificationCard/Chip、ModelSelector 等)
│   │   └── ...
│   ├── stores/
│   │   ├── paper-store.ts      # 新增:paper 状态(阶段/产物/gate/inbox/UI 视图/草稿)
│   │   ├── session-store.ts    # 复用
│   │   └── ...
│   └── pages/
│       ├── HomePage.vue        # 复用,加"创建 Paper 项目" + "打开 Paper 项目"(校验 .pp/)
│       ├── WorkspacePage.vue   # 复用,paper 模式渲染 PaperWorkspace,否则 AppLayout
│       └── SettingsPage.vue    # 复用
│
└── shared/
    └── types.ts                # 扩展 paper 类型
```

---

## 3. 核心数据模型

### 3.1 Artifact + ArtifactRevision

所有阶段输出登记为 Artifact。每次声明产物时追加一条不可变 ArtifactRevision,记录路径、sha256、字节大小、mime 类型,并在 `.pp/snapshots/<artifactId>/r<revision><ext>` 保存一份不可变快照,用于 gate 审核时的版本对比。

```typescript
interface Artifact {
  id: string;
  projectId: string;
  type: ArtifactType;
  path: string;                 // 项目相对路径
  stage: StageId;               // 产出阶段
  createdBy: 'user' | 'agent' | 'tool';
  createdAt: number;
  role?: 'primary' | 'supporting';
  latestRevisionId?: string;    // 指向最新修订
  relations?: ArtifactRelation[];
  metadata?: Record<string, unknown>;  // citationKey/caption/config/seed/metric 等
}

interface ArtifactRevision {
  id: string;
  artifactId: string;
  revision: number;
  path: string;
  createdAt: number;
  hash?: string;                // sha256
  byteSize?: number;
  mimeType?: string;
  snapshotPath?: string;        // .pp/snapshots/<artifactId>/r<revision><ext>
  available: boolean;
  error?: string;
}

interface ArtifactRelation {
  kind: 'cites' | 'illustrates' | 'derived_from' | 'supports';
  targetArtifactId?: string;
  targetPath?: string;
  label?: string;
}

type ArtifactType =
  | 'paper'           // manuscript.md
  | 'paper_pdf'       // 导出 PDF
  | 'survey'          // 文献综述
  | 'method'          // 方法描述
  | 'repo'            // baseline 代码库
  | 'reproduction_log'
  | 'experiment_config'
  | 'experiment_result'
  | 'figure'
  | 'literature_pool';
```

> `provenance`(跨产物溯源链)仍后置 v2;当前用 `relations` 表达产物间引用关系(cites/illustrates/derived_from/supports)。

### 3.2 PaperProjectConfig + PaperProgress

项目元数据与进度分文件存放:`.pp/config.json` 存 `PaperProjectConfig`,`.pp/progress.json` 存 `PaperProgress`。

```typescript
interface PaperProjectConfig {
  id: string;
  name: string;
  topic: string;                 // 研究主题
  createdAt: number;
}

interface PaperProgress {
  version: 2;
  stage: StageProgress;          // 阶段状态机
  artifacts: Artifact[];         // 全局产物注册表
  artifactRevisions: ArtifactRevision[];  // 修订快照
  stageRuns: StageRun[];         // 每次阶段运行的记录(含 token/成本)
  activities: StageActivity[];   // 阶段活动流水(最近 200 条)
  pendingGate?: GateRequest;     // 持久化的在途 gate,重启后恢复
  updatedAt: number;
}

interface StageProgress {
  current: StageId;
  stages: Record<StageId, StageState>;
}

interface StageState {
  status: StageStatus;
  artifacts: string[];           // 产出 artifact id 列表
  sessionFile?: string;          // 该阶段对应的 pi session 文件(支持 fork 分支)
  gateDecision?: 'rework' | 'continue' | 'abort';
  reworkTarget?: StageId;        // 返工目标阶段
  runId?: string;                // 当前 StageRun id
  startedAt?: number;
  finishedAt?: number;
  pausedAt?: number;
  lastActivityAt?: number;
}

type StageStatus =
  | 'pending' | 'running' | 'paused' | 'awaiting_gate'
  | 'passed' | 'failed' | 'rework';

type StageId = 'literature' | 'reproduction' | 'improvement' | 'experiment' | 'writing';
```

`StageRun` 记录单次阶段运行的起止、状态、产出、gate 和用量;`StageUsage` 含 input/output/cache token 与成本,在右栏 Inspector 和运行状态面板中展示:

```typescript
interface StageRun {
  id: string;
  stage: StageId;
  sessionFile?: string;
  startedAt: number;
  finishedAt?: number;
  status: Exclude<StageStatus, 'pending'>;
  lastActivityAt: number;
  artifactIds: string[];
  gateId?: string;
  summary?: string;
  usage?: StageUsage;
}

interface StageUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

type StageActivityKind =
  | 'started' | 'resumed' | 'paused' | 'artifact'
  | 'gate_requested' | 'gate_decided' | 'error';

interface StageActivity {
  id: string;
  stage: StageId;
  kind: StageActivityKind;
  at: number;
  message: string;
  artifactIds?: string[];
  gateId?: string;
}
```

### 3.3 PaperInbox(收件箱)

收件箱集中沉淀用户离开期间发生的高信号事项,存储在 `.pp/inbox.json`。主进程在 gate 请求、`request_user_input`、`verification_gate`、`auto_retry` 失败和生命周期错误时写入 inbox 项;前端在顶栏、左侧导航和 Inspector 显示未处理计数,并提供独立收件箱视图。

```typescript
interface PaperInbox {
  version: 1;
  items: InboxItem[];
  updatedAt: number;
}

interface InboxItem {
  id: string;
  projectId: string;
  kind: 'gate' | 'clarification' | 'error' | 'attention';
  status: 'open' | 'read' | 'resolved';
  severity: 'info' | 'warning' | 'error';
  title: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  stage?: StageId;
  gateId?: string;
  requestId?: string;           // 关联 request_user_input,用于去重
  errorCode?: string;
}
```

> 低信号工具失败(标题以"工具执行失败:"开头)在加载时被过滤,不进入收件箱。inbox 写入经 Promise 链串行化,避免并发冲突;`requestId` 去重防止渲染进程重连后重复转发。

### 3.4 文献

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
  localPath?: string;            // 本地 PDF 路径
  notes?: string;
  tags: string[];
  relevanceScore?: number;
}
```

### 3.5 论文存储(Markdown 主存储)

**主存储**:`paper/manuscript.md`,agent 用 `write` 工具直接撰写与修改。

**导出产物**:pandoc / latexmk 转换得到 LaTeX / Word / PDF。

段落级 `evidenceRefs`(每个 claim 标注支撑证据)后置 v2,届时可用 Markdown 注释或旁置 JSON 实现,不改变 Markdown 主存储地位。

---

## 4. 工作流设计

### 4.1 stage 编排器(轻量,非 DAG)

> MVP 采用线性 stage + gate。返工支持回退到当前或任意前序阶段;gate 决策后在 agent turn 结束时通过 `SessionBridge.clone()` 创建 session 分支。完整 DAG 回跳 / 并行分支后置 v2。

编排器位于主进程 `stage-engine.ts`,在 SessionBridge 之上调用 `prompt` / 订阅事件 / 发起 `request_user_input`,本身不重造 agent loop。

```
                    ┌─────────────┐
                    │  主题输入    │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
               ┌───▶│  文献调研    │◀─────────────────┐
               │    └──────┬──────┘                  │
               │           ▼ gate                    │
               │    ┌─────────────┐                  │
               │    │  代码复现    │◀───────────────┐ │
               │    └──────┬──────┘                │ │
               │           ▼ gate                  │ │
               │    ┌─────────────┐                │ │
               │    │  方法改进    │◀─────────────┐ │ │
               │    └──────┬──────┘              │ │ │
               │           ▼ gate                │ │ │
               │    ┌─────────────┐              │ │ │
               │    │  实验执行    │──── 跑不通 ──┘ │ │
               │    └──────┬──────┘                │ │
               │           ▼ gate(未通过不进撰写) │ │
               │    ┌─────────────┐                │ │
               │    │  论文撰写    │──── 缺实验 ────┘ │
               │    └──────┬──────┘                  │
               │           ▼ gate                    │
               └──── 返工  │  完成                   │
                          ▼
                       产出 PDF
```

### 4.2 gate 机制(专用 IPC,与 request_user_input 分离)

**阶段完成 gate**:agent 调用 `request_stage_review` 工具(见 §5.3)声明阶段完成。该工具的 execute 触发 stage-engine 通过专用 IPC(`paper-gate` 通道)向前端发起 gate:

- 展示该阶段产物摘要 + StageEngine 的轻量质量检查结果
- 选项:**继续下一阶段** / **返工**(指定回退阶段 + 原因)/ **终止**
- gate 决策作为工具结果回传给 agent,agent 据此继续 / 返工 / 停止

**阶段内小问题询问**:agent 自主调用 `request_user_input`(如"这块代码用 PyTorch 还是 JAX?"),走 `user-input-request` IPC,前端复用 ClarificationCard / ClarificationChip 多步问答状态机展示。

> gate(编排器大决策,专用 IPC + GateReviewWorkspace)与 agent 小问题询问(`request_user_input` + ClarificationCard)职责分离,原因见 §5.3。

**自主执行模式**:paper 项目默认 `executionMode: unattended`,agent 阶段内自主跑,只在 gate 和拿不准的小问题上打断用户。

**阶段暂停/恢复**:运行中的阶段可暂停(`paper-pause-stage` IPC,先 `abort()` 当前 turn 再置 `paused`)和恢复(`paper-resume-stage`,发送 `buildResumeNudge` 让 agent 从中断处继续,而非重发完整阶段提示词)。暂停/恢复在 StageWorkspace 和右栏 Inspector 都有入口,状态写入 `StageState.pausedAt` 与活动流水。

**自动推进与重启恢复**:gate 决策后编排器把下一阶段(`advance`)或返工目标(`rework`,带 `fork:true`)暂存到 `_pendingStart`,在 `agent_end` 事件触发 `onAgentEnd` 时才发送;rework 会先 `SessionBridge.clone()` 分叉 session 保留原始分支。在途 gate 持久化到 `.pp/progress.json` 的 `pendingGate`,应用重启后 `StageEngine.load()` 恢复,`respondGate` 检测到 `restoredGate` 且 session 空闲时直接推进,无需等待新的 `agent_end`。

阶段 gate 不复用 `request_user_input`:StageEngine 通过 `paper-gate` IPC 发送 GateRequest,WorkspacePage 同时接收专用 gate 事件和状态快照。阶段内的小问题仍由 agent 调用 `request_user_input` 并显示 ClarificationCard。

### 4.3 各 stage 详细设计

#### Stage 1: 文献调研

**执行步骤**:
1. 解析研究主题,提取关键词(gate 确认)
2. 检索论文(`search_papers`,MVP 单源 Semantic Scholar)
3. 去重、综合排序(年份 / venue / 引用量 / 语义相关性)
4. 候选论文池(gate 确认)
5. 下载 PDF(`fetch_fulltext`,arXiv 等开放源)
6. 精读 top-N(`parse_pdf` 解析,gate 确认精读列表)
7. 生成文献综述(`write`)

**gate 确认点**:关键词、候选论文池、top-N 精读列表

**输出 Artifact**:`literature_pool`、`survey`

#### Stage 2: 代码复现

**执行步骤**:
1. 从文献提取代码仓库地址
2. 选择 baseline(gate 确认)
3. `git clone` 仓库
4. 搭建环境(bash:`conda create` / `python -m venv` / `docker run`,**每 baseline 独立环境**,路径登记 manifest)
5. 运行 baseline 实验(`python train.py` 等)
6. 验证复现结果(gate 确认是否接受)

**环境隔离**:每个 baseline 一个独立 venv / conda env / docker container,由 agent 通过 bash 创建,环境路径与命令登记到 `reproduction_log`。避免多个 baseline 依赖冲突。

**gate 确认点**:baseline 选择、复现结果是否接受

**输出 Artifact**:`repo`、`reproduction_log`

#### Stage 3: 方法改进

**执行步骤**:
1. 分析研究空白(基于文献综述 + 复现经验)
2. 提出改进方案 / 创新点(gate 确认)
3. 确定实验假设(gate 确认)
4. 设计评估指标和实验方案
5. 实现新方法代码(`write` + `edit`)

**gate 确认点**:改进方案、实验假设

**输出 Artifact**:`method`、`experiment_config`

#### Stage 4: 实验执行

**执行步骤**:
1. 确认数据集(gate 确认)
2. 确认评估指标(gate 确认)
3. 确认对比方法(gate 确认)
4. 运行对比实验(`bash`)
5. 统计显著性判断(多 seed,gate 确认)
6. 生成图表(matplotlib + bash)

**硬约束**:实验跑不通或代码没跑通,agent 通过 `request_user_input` 求助;未通过 gate 不能进入撰写阶段。

**gate 确认点**:数据集、指标、对比方法、显著性判断

**输出 Artifact**:`experiment_result`、`figure`

#### Stage 5: 论文撰写

**执行步骤**:
1. 生成论文大纲
2. 撰写各章节(`write` manuscript.md,含结论)
3. 插入引用和图表
4. 引用验证(`check_citation_support`,best-effort 提示,非硬门禁)
5. 摘要确认(gate 确认)
6. 贡献表述确认(gate 确认)
7. 实验结论确认(gate 确认)
8. 导出(`bash`:pandoc / latexmk -> LaTeX / Word / PDF)

**gate 确认点**:摘要、贡献表述、实验结论

**输出 Artifact**:`paper`(manuscript.md)、`paper_pdf`

### 4.4 质量门禁(best-effort)

> MVP 质量检查聚焦"关键产物是否存在、阶段是否真的完成"。当前由 `StageEngine.runQualityChecks()` 根据 agent 声明的 Artifact 类型和摘要生成提示,不阻止用户做 gate 决策。`verification_gate` 仍是 pi 的原生事件,不是 paper gate 的 pass/fail 判定。详细审计后置 v2。

| 阶段 | 质量检查 |
|------|----------|
| 文献调研 | `literature_pool` 与 `survey` 已生成;每篇有摘要/年份/来源/URL;去重完成 |
| 代码复现 | 有环境记录、运行日志、baseline 指标;失败有说明 |
| 方法改进 | 明确改进方案、实验假设、baseline、metric |
| 实验执行 | 每个结果有 config/seed/command/metric;图表有来源 |
| 论文撰写 | 核心 claim 有引用或实验依据(best-effort);图表编号有效;引用无缺失 |

**引用验证诚实性**:`check_citation_support` 基于 LLM 判断"引用是否支持声明"会幻觉,只能作为 best-effort 提示展示给用户,不能作为 pass/fail 硬门禁。

---

## 5. 工具设计

### 5.1 设计原则

**LLM 能自己做的事,不封装工具。**

| LLM 内置能力 | 通过 bash / 内置工具实现 |
|---|---|
| Git 操作 | `git clone` / `git checkout`(bash) |
| Python 执行 | `python train.py`(bash) |
| 环境管理 | `conda create` / `python -m venv` / `docker run`(bash) |
| 文件操作 | read / write / edit 工具 |
| 出图 | matplotlib 代码 + bash |
| 格式转换 | pandoc / latexmk(bash) |
| 论文撰写 | `write` 直接生成 Markdown |

**只封装 LLM 做不了的事**(调用外部 API、解析二进制 PDF),作为 MCP server。

### 5.2 paper MCP 工具(通过 pi-mcp-adapter 注册)

`packages/paper-mcp` 提供独立 MCP server。创建或打开 paper 项目时,`paper-project.ts` 自动写入项目 `.pi/mcp.json`,由 pi-mcp-adapter 注册为 `mcp__papers__xxx`。

server 正常启动路径由主进程解析为 `pi-paper-mcp` 的绝对入口,使用 Electron binary + `ELECTRON_RUN_AS_NODE=1` 运行;模块解析失败时保留 `pi-paper-mcp` PATH fallback 以支持未链接依赖的开发环境。`pix/package.json` 将其声明为生产依赖,因此正常打包路径不依赖用户机器的 PATH;旧项目在 `start-pi` 时会刷新过期的裸命令配置。

| 工具 | 功能 | 备注 |
|---|---|---|
| `search_papers` | 学术检索(Semantic Scholar) | 入参 query/limit/yearFrom/yearTo/minCitations;返回 title/authors/abstract/year/venue/citations/DOI/arXivId/openAccessPdfUrl/relevance |
| `fetch_fulltext` | 下载论文 PDF(arXiv 等开放源) | 入参 url/doi/arxivId/s2PaperId/outDir/filename;付费墙论文返回 abstract 并注明无开放 PDF |
| `parse_pdf` | PDF -> 文本 + 结构 | 入参 path/maxPages/saveTextTo;正文存为同名 .txt,返回页数、元数据、章节大纲与预览 |
| `extract_figures` | 提取 PDF 中的图表 | 入参 path/outDir/pages/maxFigures;提取内嵌光栅图为 PNG,矢量图无法提取并在 notes 注明 |
| `generate_bibtex` | 生成 BibTeX 引用条目 | 有 DOI 时经 doi.org content negotiation 取出版商级条目,否则从 Semantic Scholar 元数据组装 |
| `check_citation_support` | 引用是否支持声明(best-effort) | 入参 claim/pdfPath/doi/title/maxSnippets;基于关键词重叠召回证据片段,返回 verdictHint,非硬门禁 |

> 多源检索(Crossref / OpenAlex)、引用网络分析后置 v2。

### 5.3 编排器控制流工具

`request_stage_review`:agent 调用此工具声明当前阶段完成,触发编排器发起 gate。这是控制流工具(agent 不能自己决定阶段流转,需用户 gate),由 stage 编排器实现。

**注入机制(复用 ExtensionFactory,与 McpAdapter 同机制)**:

1. `stage-engine.ts` 导出一个 `ExtensionFactory`,内部 `pi.registerTool(requestStageReviewTool)`。工具的 `execute` 闭包捕获 stage-engine 实例,调用 `await stageEngine.requestReview(stageId, summary)`,把 gate 决策作为工具结果返回给 agent。
2. `SessionBridge` **仅新增一个方法** `addExtraExtensionFactories(factories: ExtensionFactory[])`,存到实例字段。`_createSession` 把 `this._extraFactories` 合并进 `DefaultResourceLoader` 的 `extensionFactories` 数组(与 McpAdapter 的 factory 并列)。
3. 主进程装配顺序:先 `new StageEngine(...)`,再 `sessionBridge.addExtraExtensionFactories([stageEngine.extensionFactory])`,最后 `sessionBridge.start(projectDir, guiSettings)`。

当前实现还包含三项状态保护:工具只允许审核当前阶段;非法返工目标会回落到当前阶段;gate 决策在 `agent_end` 后才推进下一阶段,并为返工创建 session clone。自动推进失败会记录日志并通过 `pi-error` 通知前端。

> `SessionBridge._createSession` 在 `newSession` / `switchSession` / `fork` 时都会重走,`_extraFactories` 存在实例上,每次都合并,保证切换会话后 stage-engine 工具仍在。

**gate 通道(不复用 request_user_input)**:`ExtensionAPI` 无主动发起 user input 的方法(`sendMessage`/`sendUserMessage`/`appendEntry` 只能加消息触发 turn,不能发询问),且 `request_user_input` 通道仅在 agent 内部调用该工具时触发,外部无法主动发起。因此 gate 走 stage-engine 专用 IPC(`paper-rpc.ts` 的 `paper-gate` 通道),前端用 GateCard 组件展示(视觉可参考 ClarificationCard);agent 小问题询问仍走 `request_user_input` + ClarificationCard。这样 SessionBridge 严格只加一个方法,且两类询问职责分离。

参考:`McpAdapter` 已通过同样机制注入(`session-bridge.ts:1230` 的 `extensionFactories: [(pi) => { mcpAdapter.register(pi); }]`)。

### 5.4 LLM 自主操作示例

```
文献调研阶段:
  LLM -> search_papers(MCP) 获取论文列表
  LLM -> fetch_fulltext(MCP) 下载 PDF
  LLM -> parse_pdf(MCP) 解析正文
  LLM -> write 生成文献综述

代码复现阶段:
  LLM -> bash: git clone 仓库
  LLM -> bash: conda create / pip install
  LLM -> bash: python train.py
  LLM -> read 分析结果

实验执行阶段:
  LLM -> write/edit 编写实验代码
  LLM -> bash: python experiment.py
  LLM -> bash: matplotlib 出图
  LLM -> request_stage_review 触发 gate

论文撰写阶段:
  LLM -> write 撰写 manuscript.md
  LLM -> check_citation_support(MCP) 检查引用(best-effort)
  LLM -> bash: pandoc 转 PDF
```

---

## 6. UI 设计

### 6.1 设计约束

前端样式(卡片视觉、配色、间距、图标、尺寸、动画)不做高保真/低保真规定,给开发发挥空间,遵循 PiX 现有视觉风格(干净、克制、低饱和,见 gui.md §12)。本节只划定**必备元素**和**大致摆放**,不约束具体实现。

### 6.2 paper 工作台布局(PaperWorkspace)

paper 模式不复用 PiX 三栏 `AppLayout`,而由 `PaperWorkspace` 独立组织:顶栏 + 左侧 `PaperNavigation` + 中部视图切换区 + 右侧 `PaperInspector`,叠加 `AgentLogDrawer` 与 `PaperRuntimePanel` 两个抽屉。`WorkspacePage` 在 `isPaperMode` 为真时渲染 `PaperWorkspace`,否则回退到 `AppLayout`(三栏)作为非 paper 场景的兜底。

```
┌──────────────────────────────────────────────────────────────────────┐
│ 顶栏:PiX-paper / 研究台 / 当前阶段 · 运行状态 · 模型选择 · 收件箱 · Agent 日志 · 运行状态 · 设置 · 概览  │
├───────────────┬────────────────────────────────────────┬─────────────┤
│ PaperNavigation│         中部视图(路由切换)              │ PaperInspector│
│  项目名/主题    │  dashboard / stage / gate / library /   │  gate 提醒   │
│  项目概览       │  figures / results / manuscript /       │  项目状态    │
│  五阶段(状态/  │  artifact / inbox                       │  当前阶段    │
│   产物数/审核)  │                                          │  (暂停/恢复) │
│  审核工作区     │                                          │  运行成本    │
│  产物(文献/图/  │                                          │  产物列表    │
│   结果/论文)    │                                          │  最近活动    │
│  待你处理       │                                          │              │
│  运行状态/切换   │                                          │              │
└───────────────┴────────────────────────────────────────┴─────────────┘
        AgentLogDrawer(对话流 + ClarificationCard + composer)
        PaperRuntimePanel(运行状态:模型/token/MCP,复用 RightPanel)
```

中部视图由 Vue Router 驱动(`/workspace/<view>`),9 个视图:

| 视图 | 组件 | 职责 |
|---|---|---|
| dashboard | StageDashboard | 项目概览:注意力横幅、五阶段管线卡片(状态/耗时/产物/主产物预览)、最近活动 |
| stage | StageWorkspace | 单阶段工作台:暂停/恢复/启动、产物表、阶段活动时间线、内联产物预览 |
| gate | GateReviewWorkspace | 阶段审核:主产物预览 + 修订版本对比、相关产物、Agent 摘要、质量检查、决策(继续/返工/终止) |
| library | ArtifactCatalogView | 文献池:`literature_pool` 产物,搜索/排序 + LiteraturePoolView |
| figures | ArtifactCatalogView | 图表画廊:`figure` 产物 + FigureGalleryView |
| results | ArtifactCatalogView | 实验结果:`experiment_result`/`experiment_config` + ExperimentResultsView |
| manuscript | ManuscriptView | 论文中心:渲染 manuscript.md,内联图表图片、解析引用 key |
| artifact | PaperArtifactView | 单产物详情:ArtifactPreview + ArtifactRelationsPanel |
| inbox | InboxView | 收件箱:gate/澄清/错误/验证等待事项,筛选未解决/全部,标记已解决 |

### 6.3 核心交互(行为约束)

- **阶段进度**:左侧导航与 dashboard 卡片均展示五阶段状态(pending/running/paused/awaiting_gate/passed/failed/rework)、产物数与审核提醒;点击进入对应 StageWorkspace
- **阶段暂停/恢复**:StageWorkspace 顶栏与右栏 Inspector 在 running 时提供暂停、paused 时提供恢复、pending 时提供启动;暂停先 abort 当前 turn
- **阶段 gate**:收到 `paper-gate` 事件自动导航到 gate 视图;GateReviewWorkspace 展示主产物应用内预览(可对比上一修订版本,显示 SHA-256 前缀)、Agent 摘要(markdown 渲染)、best-effort 质量检查;决策为通过进下一阶段 / 返工(选目标阶段 + 原因)/ 终止(二次确认)
- **小问题询问**:agent 调用 `request_user_input` 触发 `AgentLogDrawer` 内的 ClarificationCard/ClarificationChip 多步问答;drawer 在 paper 视图间切换时保持,不取消请求
- **产物预览**:`ArtifactPreview` 在应用内渲染 Markdown(渲染)/文本/JSON(`<pre>`,长文本折叠展开)/图片(`<img>`)/PDF(`<iframe>`),不支持类型回退到系统默认程序;同时保留"在文件夹中定位"
- **论文预览**:`ManuscriptView` 渲染 manuscript.md,从 `literature_pool` 解析引用 key、从 `figure` 产物内联图表图片;导出仍由 agent 通过 bash pandoc 完成
- **收件箱**:顶栏与导航显示未处理计数;InboxView 按 open/all 筛选,处理项跳转到对应 gate/澄清/阶段
- **运行状态**:`PaperRuntimePanel` 抽屉复用 RightPanel 展示模型/token/MCP,并提供模型/API 密钥/MCP 设置入口
- **创建 paper 项目**:HomePage 入口,CreatePaperDialog 收集目录(实时校验可写/是否已为 paper 项目)、项目名、研究主题,初始化五阶段
- **打开 paper 项目**:HomePage 入口,选择已有 paper 项目目录(校验 `.pp/`,非 paper 拒绝);最近项目列表自动过滤非 paper 目录

### 6.4 当前已知交互缺口

以下项目不影响核心阶段流转,暂列为后续体验工作:

1. 完全离开工作台(如进入设置页)后,未答完的 `request_user_input` 活动状态不保留;paper 视图间切换已通过 drawer 保留,收件箱也会留下记录。
2. 长实验有暂停/恢复与运行耗时,但尚无完整 ETA 和"当前活动摘要"。
3. 历史会话列表已有 Paper 模式标识,但尚未为每个历史 session 显示所属阶段标签。
4. 创建对话框已有阶段说明、主题宽泛提醒和成本提示,尚未接入可执行的 token 预算字段(右栏 Inspector 已展示每阶段实际成本)。

---

## 7. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Electron | PiX 已有 |
| 前端框架 | Vue 3 + Vuetify 3 | PiX 已有 |
| 状态管理 | Pinia | PiX 已有 |
| 构建工具 | Vite | PiX 已有 |
| Agent 引擎 | pi-agent-core / pi-coding-agent | 完全复用,AgentSession 提供完整能力 |
| LLM 接口 | pi-ai | 多模型支持 |
| MCP 协议 | pi-mcp-adapter | 接入 paper MCP server |
| 论文主存储 | Markdown | agent 直接 write,贴合能力 |
| 格式转换 | pandoc + latexmk | bash 调用 |
| 图表生成 | matplotlib | bash 调用 |
| 文献 API | Semantic Scholar(MVP)+ arXiv | 单源起步,后置多源 |
| PDF 解析 | paper MCP server 内部实现 | LLM 做不了 |
| 环境隔离 | conda / venv / docker | 每 baseline 独立环境 |

---

## 8. 项目目录结构

```
projects/
└── my-research/
    ├── .pp/                          # paper 项目配置
    │   ├── config.json               # PaperProjectConfig(主题、创建时间等)
    │   ├── progress.json             # PaperProgress:阶段状态机 + artifact/revision/stageRun/activity 注册表 + pendingGate
    │   ├── inbox.json                # PaperInbox:gate/澄清/错误/验证等待事项
    │   └── snapshots/<artifactId>/   # 产物修订不可变快照(r<revision><ext>)
    ├── .pi/
    │   └── mcp.json                  # papers MCP server(由 PiX 自动维护)
    │
    ├── literature/
    │   ├── library.json              # 文献元数据
    │   ├── papers/                   # PDF 文件
    │   └── notes/                    # 阅读笔记
    │
    ├── code/
    │   ├── baseline-xxx/             # 每个 baseline 独立目录 + 独立环境
    │   └── our_method/               # 改进方法代码
    │
    ├── experiments/
    │   ├── configs/                  # 实验配置
    │   ├── results/                  # 实验结果
    │   └── figures/                  # 图表
    │
    └── paper/
        ├── manuscript.md             # 主存储(Markdown)
        ├── references.bib            # 参考文献
        └── output/                   # 导出产物
            ├── paper.tex
            ├── paper.docx
            └── paper.pdf
```

> pi 自身的 session 文件存在 `~/.pi/agent/sessions/`(由 SessionManager 管理),不在项目目录内。`.pp/progress.json` 的 `sessionFile` 字段记录每阶段对应的 session 文件路径。

---

## 9. 与 PiX / pi 现有能力的映射

> 本节明确 paper 每个需求复用哪个现成能力,避免重造轮子。

| paper 需求 | 复用的 PiX / pi 能力 | 证据来源 |
|---|---|---|
| 阶段 gate 询问(返工/继续/终止) | stage-engine 专用 IPC(`paper-gate`)+ GateReviewWorkspace 组件 | `stage-engine.ts` requestReview、`paper-rpc.ts` |
| 阶段内小问题询问 | `request_user_input`(agent 主动调用)+ ClarificationCard | `session-bridge.ts` _requestUserInput、`WorkspacePage.vue` pendingUserInput |
| stage-engine 工具注入 | `ExtensionFactory` + `DefaultResourceLoader.extensionFactories` | `session-bridge.ts:194` addExtraExtensionFactories、`session-bridge.ts:1230` extensionFactories 合并 |
| 阶段内自主执行 | `executionMode: unattended` | `RpcSessionState.executionMode`、CenterPanel 执行模式选择器 |
| 质量门禁 | StageEngine best-effort Artifact/摘要检查;不作硬门禁 | `stage-engine.ts` `runQualityChecks` |
| 返工 / 版本分支 | gate 后 `SessionBridge.clone()` 创建分支,普通树操作仍支持 fork/navigateTree | `SessionBridge.clone`、`StageEngine.onAgentEnd` |
| 成本 / 预算控制 | `ThreadGoal`(tokenBudget / timeUsedMs)+ 每阶段 `StageRun.usage` 实际成本 | `ThreadGoal` 类型、RightPanel 目标卡、PaperInspector 运行成本 |
| 工具注册 | pi-mcp-adapter(extension factory 注入 DefaultResourceLoader) | `session-bridge.ts:1231` mcpAdapter.register |
| 图表 / PDF 视觉分析 | `takeHerEyes`(视觉模型,主模型不支持 image 时自动调用) | `SessionBridge._tryTakeHerEyes` |
| 会话历史回看 | `SessionManager.list` / `open` | `list-sessions` handler |
| 设置持久化 | pix-settings + `SettingsManager.applyOverrides` | `settings-store.ts`、`_createSettingsManager` |

---

## 10. 风险和挑战

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 上下文长度限制 | 无法处理长论文 / 大量文献 | pi 自动 compaction;分章节撰写;摘要压缩 |
| 文献 API 限制 | 检索不全 / 限流 | MVP 单源 + 缓存;多源后置 |
| 代码复现困难 | 环境不一致、repo 跑不起来 | 每 baseline 独立环境(conda/venv/docker);环境与命令登记 manifest;跑不通 agent 主动求助 |
| 算力不足 | 实验跑不动 | 依赖本地 GPU(大部分用途够用);agent 检测到算力不足主动求助;云 GPU 后置 |
| 实验耗时 | 用户体验差 | 异步执行 + 后台任务面板(复用 RightPanel)+ 进度通知 |
| 论文质量 | 不符合学术规范 | 阶段 gate + StageEngine best-effort 检查 + 人工确认 |
| 引用验证不可靠 | 幻觉引用支持 | `check_citation_support` 仅作 best-effort 提示,不作硬门禁 |
| 成本失控 | 单 paper token 消耗高($50+) | 按阶段设 `ThreadGoal` tokenBudget;RightPanel 预算卡监控 |
| 检索时效 | 漏掉新论文 | 缓存 + 增量更新(后置) |
| 阶段状态与 session 状态不一致 | 返工后状态混乱 | stage 进度单一来源(`.pp/progress.json`);gate 后 clone 建分支;clone 失败时记录错误并降级继续当前 session |
| papers MCP 进程无法启动 | stdio MCP 显示 Connection closed | `pi-paper-mcp` 作为 pix 生产依赖打包;正常配置使用绝对入口 + `ELECTRON_RUN_AS_NODE=1`,解析失败时保留 PATH fallback;打开 paper 项目时刷新旧配置 |

---

## 11. 当前实现同步

以下内容与当前代码保持一致:

1. paper 项目通过 `.pp/` 目录识别;创建时生成阶段目录骨架、`.pp/config.json`、`.pp/progress.json`、`.pp/inbox.json`、`literature/library.json`、`paper/manuscript.md`、`paper/references.bib`,并写入 `.pi/mcp.json` 注册 papers server。
2. paper 项目启动前由 `ipc-handlers.ts` 的 `start-pi` 校验 `.pp/`,创建 StageEngine,经 `addExtraExtensionFactories` 注入 `request_stage_review` 工具,设置内存级 `execution.mode=unattended`,刷新 `.pi/mcp.json`,再创建 AgentSession,最后 `stageEngine.load()` 恢复 config/progress/inbox。
3. `request_stage_review` 只允许审核当前阶段(否则抛错);gate 使用 `paper-gate` 专用 IPC,agent 小问题仍使用 `request_user_input`(经 `user-input-request` 通道 + ClarificationCard)。
4. gate 决策持久化到 `.pp/progress.json`(含 `pendingGate`);通过后由 `agent_end` 触发 `onAgentEnd` 自动发送下一阶段提示词,返工在 agent 空闲后 `clone()` session 再启动目标阶段;重启后恢复的在途 gate 在 session 空闲时直接推进。
5. 阶段支持暂停/恢复(`paper-pause-stage` / `paper-resume-stage`),暂停先 abort 当前 turn,恢复发送 `buildResumeNudge`。
6. paper 工作台为 `PaperWorkspace` 多视图研究台:顶栏 + `PaperNavigation` + 路由视图(dashboard/stage/gate/library/figures/results/manuscript/artifact/inbox)+ `PaperInspector` + `AgentLogDrawer`(对话流 + 澄清 + composer)+ `PaperRuntimePanel`(运行状态抽屉)。`paper-gate` 事件自动导航到 gate 视图。
7. 产物支持应用内预览:`ArtifactPreview` 渲染 Markdown/文本/JSON/图片/PDF;`ManuscriptView` 渲染手稿并内联图表与引用;`GateReviewWorkspace` 支持修订版本对比(显示 SHA-256 前缀)。Inspector 展示每阶段实际 token/成本(`StageRun.usage`)。
8. 收件箱(`.pp/inbox.json`)集中沉淀 gate/澄清/错误/验证等待事项,顶栏与导航显示未处理计数,未聚焦窗口时桌面通知。
9. paper MCP 已实现 6 个工具;打包依赖树包含 server、MCP SDK、PDF.js、PNG.js、Zod 及其运行时依赖,正常打包路径不依赖用户 PATH。
10. 当前已知体验缺口:完全离开工作台后澄清活动状态不保留、完整 ETA/活动摘要、历史 session 阶段标签、可执行 token 预算字段。
11. PiX-paper 严格 paper-only:`start-pi` 拒绝非 paper 项目;主页"打开 Paper 项目"入口通过 `paper-check-project` IPC 预校验 `.pp/`;最近项目列表在 `loadSettings` 时过滤掉非 paper 目录。`package.json` 已更名为 `pix-paper`,`appId` 改为 `com.pixpaper.app`,发布通道指向 `Sombrer0-1/PiX-paper`。
