
# PiX-paper MVP 开发任务清单

> 每个任务完成后，Agent 必须确认并标记为完成。
> 只有所有任务标记完成后，MVP 开发才算完成。

## 1. 核心目标
- [ ] 打通完整闭环：论文题目 → 文献调研 → 方法设计 → 代码复现 → 实验执行 → 论文撰写
- [ ] 每阶段产出文件固定，可在 UI 中查看
- [ ] MVP 阶段允许线性工作流
- [ ] 所有阶段增加人工确认和重跑机制

## 2. 阶段开发

### 2.1 文献调研
- [ ] 修复搜索工具调用（Semantic Scholar / arXiv）
- [ ] 输出 `literature_pool.json` 和 `survey.md`
- [ ] 增加人工确认：关键词、候选论文、Top-N 精读
- [ ] 确认产物已生成，并在 Artifact 面板显示

### 2.2 方法设计
- [ ] 输出 `method.md` 和 `experiment_config.json`
- [ ] 增加人工确认：研究问题、创新点、实验假设
- [ ] 确认产物已生成，并在 Artifact 面板显示

### 2.3 代码复现
- [ ] 修复 clone、pip 安装、运行 baseline 流程
- [ ] 输出 `repo/` 目录和 `reproduction_log.json`
- [ ] 增加人工确认：baseline 选择、复现结果
- [ ] 使用本地执行环境，不做 Docker
- [ ] 确认产物已生成，并在 Artifact 面板显示

### 2.4 实验执行
- [ ] 输出 `experiment_result.json` 和 `figures/`
- [ ] 人工确认数据集、评估指标、对比方法、显著性判断
- [ ] 修复实验运行和日志记录
- [ ] 确认产物已生成，并在 Artifact 面板显示

### 2.5 论文撰写
- [ ] 输出 `paper.md` 和 `manuscript.json`
- [ ] 每段落关联 `evidenceRefs`
- [ ] 人工确认摘要、贡献表述、实验结论
- [ ] Markdown 导出可选 LaTeX/Word/PDF
- [ ] 确认产物已生成，并在 Artifact 面板显示

## 3. 工作流改动
- [x] 将 DAG 改为线性 Stage 顺序执行
- [x] 每阶段单独启动，提供开始/确认/重跑按钮
- [x] 每阶段结束后检查固定产物文件是否生成
- [x] QualityGate 暂时只检查文件存在

## 4. UI 改动
- [x] 修复或重做 `ResearchProjectPage.vue` 和 `WorkflowProgress.vue`
- [x] 右侧显示 Artifact 列表和当前阶段产物
- [x] 弹出对话框实现人工确认按钮
- [x] HomePage 支持输入题目并创建项目
- [ ] PaperEditor 支持 Markdown 编辑和实时预览

## 5. 底层工具
- [x] 保留 `pi-agent-core`、`pi-ai`、`pi-coding-agent`、`pi-mcp-adapter`
- [x] 保留 `packages/research` 工具库
- [x] 修复 IPC 调用，确保前后端通信稳定

## 6. 开发顺序参考
1. [x] 修复 UI 主链路和阶段启动
2. [ ] 文献调研阶段可完整跑通并生成文件
3. [ ] 方法设计阶段产出文件可生成
4. [ ] 代码复现和实验阶段先用轻量模拟
5. [ ] 论文撰写阶段生成 Markdown 并可预览
6. [ ] 后续再考虑 DAG、复杂质量门禁和完全复现

## 7. 文档更新
- [x] 更新 README.md 和 design.md，标注当前为 MVP 版本
- [x] 删除”已完成””测试通过”等误导信息
- [x] 保留核心数据模型说明（Artifact、Project、WorkflowNode、PaperManuscript）
- [x] 标注每阶段人工确认点和产物文件路径

## 8. 开发注意事项
- [x] 每次修改后确保阶段文件路径与 Artifact 注册表一致
- [x] 不添加未讨论的新功能或复杂机制
- [x] 每次输出代码前说明改动目标和受影响模块
