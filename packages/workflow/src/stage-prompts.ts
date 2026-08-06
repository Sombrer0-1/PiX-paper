/**
 * Stage prompts for the five paper stages (design §4.3).
 *
 * Each prompt is sent to the agent as a user message when a stage starts.
 * Prompts encode the stage execution steps, the in-stage confirmation points
 * (via request_user_input) and the completion protocol (request_stage_review).
 */

import { STAGE_LABELS } from "./stage-machine.ts";
import type { StageId } from "./types.ts";

export interface StagePromptContext {
	/** Research topic of the paper project. */
	topic: string;
	/** Absolute project directory (agent cwd). */
	projectDir: string;
	/** Extra context from earlier stages (e.g. rework reason, prior results). */
	notes?: string;
}

const MCP = "mcp__papers";

function protocol(ctx: StagePromptContext): string {
	return [
		"",
		"## 工作协议(必读)",
		"",
		`你在一个 PiX paper 项目中工作,研究主题:「${ctx.topic}」。项目目录即当前工作目录。`,
		"项目目录结构(已创建,直接使用):",
		"- literature/library.json(文献元数据)、literature/papers/(PDF)、literature/notes/(阅读笔记)",
		"- code/(baseline 复现代码,每个 baseline 一个独立子目录)、code/our_method/(改进方法代码)",
		"- experiments/configs/、experiments/results/、experiments/figures/",
		"- paper/manuscript.md(论文主存储,Markdown)、paper/references.bib、paper/output/(导出产物)",
		"",
		"你可以使用以下 paper 专属 MCP 工具:",
		`- \`${MCP}__search_papers\` 学术检索(Semantic Scholar)`,
		`- \`${MCP}__fetch_fulltext\` 下载开放获取论文 PDF`,
		`- \`${MCP}__parse_pdf\` 解析 PDF 正文与结构`,
		`- \`${MCP}__extract_figures\` 提取 PDF 中的图表`,
		`- \`${MCP}__generate_bibtex\` 生成 BibTeX 引用条目`,
		`- \`${MCP}__check_citation_support\` 检查引用是否支撑声明(best-effort)`,
		"",
		"其余工作(git clone、环境搭建、运行实验、写文件、出图、pandoc 转换)直接用 bash / read / write / edit 完成,不要等待指令。",
		"",
		"阶段内遇到需要你确认的关键选择(方向、参数、技术栈等)时,调用 `request_user_input` 提问;不要自己硬猜重大决策。",
		"完成本阶段全部工作后,调用 `request_stage_review` 声明完成,并在参数中登记本阶段产物(类型 + 路径)、metadata 和工作摘要。使用 relations.cites / illustrates / derived_from / supports 连接论文、文献、图表和实验结果；localPath、citationKey、caption、config、seed、metric 等信息应写入 metadata。",
		"用户会对阶段进行 gate 审核:可能通过(进入下一阶段)、要求返工(按反馈重做)或终止。不要自行宣布进入下一阶段。",
		ctx.notes ? `\n## 附加上下文\n${ctx.notes}` : "",
		"",
	].join("\n");
}

function literaturePrompt(ctx: StagePromptContext): string {
	return [
		`# 阶段 1/${STAGE_LABELS.literature}:文献调研`,
		"",
		"执行步骤:",
		`1. 解析研究主题「${ctx.topic}」,提取 3-6 个检索关键词。先用 \`request_user_input\` 确认关键词再继续。`,
		`2. 用 \`${MCP}__search_papers\` 检索论文,覆盖关键词的不同组合。`,
		"3. 去重并综合排序(年份 / venue / 引用量 / 与主题的语义相关性)。",
		"4. 形成候选论文池(15-30 篇),用 `request_user_input` 确认论文池(可让用户增删)。",
		`5. 用 \`${MCP}__fetch_fulltext\` 下载开放获取 PDF 到 literature/papers/(付费墙论文只保留 abstract 并在笔记中注明)。`,
		`6. 用 \`${MCP}__parse_pdf\` 精读 top-N(建议 5-10 篇),用 \`request_user_input\` 确认精读列表;每篇在 literature/notes/ 写一篇笔记(问题 / 方法 / 数据 / 结论 / 可复用点 / 代码仓库链接)。`,
		"7. 将全部文献元数据写入 literature/library.json(字段:title/authors/abstract/year/venue/citations/url/doi/localPath/tags/relevanceScore)。",
		"8. 撰写文献综述 literature/survey.md:研究脉络、主要方法分类、关键结果、研究空白(gap)分析。",
		"",
		"完成标准:literature/library.json 与 literature/survey.md 已生成;每篇文献有摘要/年份/来源/URL;去重完成。",
		"完成后调用 `request_stage_review`,登记产物:literature_pool(literature/library.json)、survey(literature/survey.md)。",
	].join("\n");
}

function reproductionPrompt(_ctx: StagePromptContext): string {
	return [
		`# 阶段 2/${STAGE_LABELS.reproduction}:代码复现`,
		"",
		"执行步骤:",
		"1. 阅读 literature/survey.md 和 literature/notes/,从文献中提取代码仓库地址。",
		"2. 选择 1 个(最多 2 个)baseline,用 `request_user_input` 确认 baseline 选择。",
		"3. 用 bash `git clone` 到 code/baseline-<name>/。",
		"4. 搭建环境:每个 baseline 使用独立环境(优先 `python -m venv code/baseline-<name>/.venv`,或 conda / docker);把环境路径、python 版本、安装命令记录到 code/baseline-<name>/ENVIRONMENT.md。",
		"5. 按仓库说明运行 baseline 实验(训练或推理脚本;可用小规模配置先验证跑通)。跑不通时先自行修复(依赖版本、路径、数据下载);无法解决时调用 `request_user_input` 求助。",
		"6. 记录复现日志 code/baseline-<name>/REPRODUCTION.md:环境、命令、配置、运行结果指标、与原论文指标的对比、失败项及说明。",
		"7. 用 `request_user_input` 展示复现结果并询问用户是否接受该 baseline 结果。",
		"",
		"完成标准:有环境记录、运行日志、baseline 指标;失败项有说明。",
		"完成后调用 `request_stage_review`,登记产物:repo(code/baseline-<name>/)、reproduction_log(code/baseline-<name>/REPRODUCTION.md)。",
	].join("\n");
}

function improvementPrompt(_ctx: StagePromptContext): string {
	return [
		`# 阶段 3/${STAGE_LABELS.improvement}:方法改进`,
		"",
		"执行步骤:",
		"1. 基于文献综述的研究空白 + baseline 复现经验,分析可改进点。",
		"2. 提出 1-3 个改进方案 / 创新点,用 `request_user_input` 与用户确认最终方案。",
		"3. 明确实验假设(预期改进在哪个指标上提升多少、为什么),用 `request_user_input` 确认假设。",
		"4. 设计评估指标和实验方案(数据集、对比方法、消融),写入 experiments/configs/experiment_plan.md。",
		"5. 在 code/our_method/ 实现新方法代码(可基于 baseline 代码演进,保持可运行)。",
		"6. 撰写方法描述 code/our_method/METHOD.md:动机、方法细节、与 baseline 的差异、实现要点。",
		"",
		"完成标准:有明确的改进方案、实验假设、baseline、metric;方法代码已放置。",
		"完成后调用 `request_stage_review`,登记产物:method(code/our_method/METHOD.md)、experiment_config(experiments/configs/experiment_plan.md)。",
	].join("\n");
}

function experimentPrompt(_ctx: StagePromptContext): string {
	return [
		`# 阶段 4/${STAGE_LABELS.experiment}:实验执行`,
		"",
		"执行步骤:",
		"1. 确认数据集(名称、来源、划分),用 `request_user_input` 确认。",
		"2. 确认评估指标,用 `request_user_input` 确认。",
		"3. 确认对比方法(baseline + 我们的方法),用 `request_user_input` 确认。",
		"4. 运行对比实验:每组实验记录 config / seed / command / metric,结果写入 experiments/results/(JSON 或 Markdown 表)。",
		"5. 统计显著性:至少 3 个 seed 报告均值±方差;用 `request_user_input` 确认显著性判断。",
		"6. 用 matplotlib 生成图表(主结果对比图、消融图),保存到 experiments/figures/(PNG,300dpi 或矢量 PDF)。",
		"",
		"硬约束:实验或代码没跑通,不能进入论文撰写。跑不通时调用 `request_user_input` 求助,不要编造结果。",
		"完成标准:每个结果有 config/seed/command/metric;图表有来源;结果可复现。",
		"完成后调用 `request_stage_review`,登记产物:experiment_result(experiments/results/ 下各结果文件)、figure(experiments/figures/ 下各图)。",
	].join("\n");
}

function writingPrompt(_ctx: StagePromptContext): string {
	return [
		`# 阶段 5/${STAGE_LABELS.writing}:论文撰写`,
		"",
		"执行步骤:",
		"1. 生成论文大纲(标题、摘要、引言、相关工作、方法、实验、结论),写入 paper/manuscript.md。",
		"2. 逐章撰写:充分利用 literature/survey.md(相关工作)、code/our_method/METHOD.md(方法)、experiments/results/(实验)、experiments/figures/(图表)。",
		`3. 用 \`${MCP}__generate_bibtex\` 为每篇引用文献生成 BibTeX,汇总到 paper/references.bib;正文中用 [@citekey] 形式插入引用;图表用 Markdown 图片语法引用 experiments/figures/ 下的文件并编号。`,
		`4. 对核心声明用 \`${MCP}__check_citation_support\` 做 best-effort 引用核查,把结果以 Markdown 注释或旁注形式呈现给用户(这只是提示,不是硬门禁)。`,
		"5. 用 `request_user_input` 依次确认:摘要、贡献表述、实验结论。",
		"6. 导出:用 bash 调 pandoc(有 LaTeX 环境可接 latexmk)把 manuscript.md + references.bib 导出到 paper/output/(paper.docx / paper.pdf / paper.tex,视本机可用工具而定;缺工具时在摘要中说明)。",
		"",
		"完成标准:manuscript.md 完整(含结论);图表编号有效;引用无缺失;导出产物已生成或说明缺失原因。",
		"完成后调用 `request_stage_review`,登记产物:paper(paper/manuscript.md)、paper_pdf(paper/output/ 下的导出文件)。",
	].join("\n");
}

const STAGE_PROMPT_BUILDERS: Record<StageId, (ctx: StagePromptContext) => string> = {
	literature: literaturePrompt,
	reproduction: reproductionPrompt,
	improvement: improvementPrompt,
	experiment: experimentPrompt,
	writing: writingPrompt,
};

/** Conventional artifact locations per stage, used to frame a rework iteration. */
const STAGE_PRIOR_ARTIFACTS: Record<StageId, string> = {
	literature: "literature/library.json、literature/survey.md、literature/notes/、literature/papers/",
	reproduction: "code/baseline-*/、各 baseline 的 REPRODUCTION.md",
	improvement: "code/our_method/METHOD.md、experiments/configs/experiment_plan.md",
	experiment: "experiments/results/、experiments/figures/",
	writing: "paper/manuscript.md、paper/references.bib、paper/output/",
};

/**
 * Prompt for a rework iteration. Prior artifacts already exist, so lead with the
 * feedback and instruct the agent to work incrementally rather than re-running the
 * whole stage from scratch (mirroring buildResumeNudge). The rework reason is
 * passed by the engine as ctx.notes.
 */
function buildReworkPrompt(stage: StageId, ctx: StagePromptContext): string {
	const reason = ctx.notes?.trim() || "（未提供具体反馈）";
	return [
		`# 返工:${STAGE_LABELS[stage]}`,
		"",
		`这是「${STAGE_LABELS[stage]}」阶段的一次返工。研究主题:「${ctx.topic}」。`,
		`该阶段此前的产物已经存在于项目目录中:${STAGE_PRIOR_ARTIFACTS[stage]}。`,
		"先检查这些已有产物与当前进度,只针对下面的反馈做增量修改;不要重做仍然有效的工作(例如不要重新下载已有的 PDF、不要覆盖仍然正确的产物文件)。",
		"",
		"## 返工反馈",
		reason,
		"",
		"完成必要的修改后,按工作协议调用 `request_stage_review` 重新登记产物(可复用已有产物路径,会作为新增修订)。",
	].join("\n");
}

export function buildStagePrompt(stage: StageId, ctx: StagePromptContext): string {
	// A rework reason is passed as ctx.notes; lead with a rework-aware nudge
	// instead of the fresh-start step list so a literal agent does not redo the
	// whole stage (re-downloading PDFs, overwriting good artifacts).
	if (ctx.notes?.trim()) {
		return `${buildReworkPrompt(stage, ctx)}${protocol({ ...ctx, notes: undefined })}`;
	}
	return `${STAGE_PROMPT_BUILDERS[stage](ctx)}${protocol(ctx)}`;
}

/** Short nudge used to resume an in-progress stage (e.g. after app restart or user clicking 继续). */
export function buildResumeNudge(stage: StageId, ctx: StagePromptContext): string {
	return [
		`继续当前的「${STAGE_LABELS[stage]}」阶段。研究主题:「${ctx.topic}」。`,
		"先检查项目目录中已有的产物和进度,从中断处继续;不要重做已完成的工作。",
		ctx.notes ? `附加上下文:${ctx.notes}` : "",
		"完成后按协议调用 request_stage_review。",
	]
		.filter(Boolean)
		.join("\n");
}
