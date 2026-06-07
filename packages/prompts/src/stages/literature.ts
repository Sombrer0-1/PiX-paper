/**
 * Literature Survey Stage Prompts
 */

import type { PromptTemplate, QualityCheck } from '../types.js';

export const LITERATURE_SYSTEM_PROMPT = `You are an expert research assistant specializing in literature surveys.
Your goal is to conduct a comprehensive literature survey on a given research topic.

Key responsibilities:
1. Search for relevant academic papers using multiple sources
2. Analyze and synthesize findings from the literature
3. Identify research gaps and opportunities
4. Produce a well-structured literature review

You have access to the following tools:
- search_papers: Search for academic papers (Semantic Scholar, arXiv)
- verify_claim_citation: Verify that claims are supported by citations

Always:
- Use multiple search queries to ensure comprehensive coverage
- Evaluate paper quality based on venue, citations, and recency
- Take notes on key findings and methodologies
- Identify connections between papers`;

export const LITERATURE_TASK_PROMPT = `## Task: Conduct Literature Survey

**Research Topic:** {{topic}}

### Instructions

1. **Search Phase**
   - Generate 3-5 different search queries related to the topic
   - Use search_papers tool with each query
   - Collect at least 15-20 relevant papers

2. **Filtering Phase**
   - Remove duplicates
   - Prioritize papers by:
     - Citation count (higher is better)
     - Recency (newer is better)
     - Venue quality (top conferences/journals)
   - Select top 10-15 papers for detailed analysis

3. **Analysis Phase**
   - Read abstracts and conclusions of selected papers
   - For each paper, note:
     - Research question/problem addressed
     - Methodology used
     - Key findings
     - Limitations

4. **Synthesis Phase**
   - Group papers by subtopic or methodology
   - Identify common themes and trends
   - Note contradictions or debates in the field

5. **Gap Analysis**
   - Identify what questions remain unanswered
   - Note limitations of existing approaches
   - Suggest potential research directions`;

export const LITERATURE_OUTPUT_FORMAT = `## Output Format

### literature_pool.json
\`\`\`json
{
  "papers": [
    {
      "id": "paper_1",
      "title": "Paper Title",
      "authors": ["Author 1", "Author 2"],
      "year": 2023,
      "venue": "Conference/Journal",
      "citations": 100,
      "url": "https://...",
      "abstract": "Brief abstract...",
      "relevance": 0.95,
      "key_findings": ["Finding 1", "Finding 2"],
      "methodology": "Brief description",
      "limitations": ["Limitation 1"]
    }
  ],
  "total_searched": 50,
  "total_selected": 15
}
\`\`\`

### survey.md
\`\`\`markdown
# Literature Survey: [Topic]

## 1. Introduction
[Brief overview of the research area]

## 2. Background
[Key concepts and definitions]

## 3. Related Work
### 3.1 [Subtopic 1]
[Review of papers in this area]

### 3.2 [Subtopic 2]
[Review of papers in this area]

## 4. Research Gaps
[Identified gaps and opportunities]

## 5. Summary
[Key takeaways]
\`\`\`

### gaps.md
\`\`\`markdown
# Research Gaps

## Gap 1: [Description]
- Evidence: [Why this is a gap]
- Opportunity: [Potential research direction]

## Gap 2: [Description]
...
\`\`\``;

export const LITERATURE_QUALITY_CHECKS: QualityCheck[] = [
  {
    id: 'min_papers',
    name: 'Minimum Papers',
    description: 'At least 10 relevant papers found',
    prompt: 'Verify that the literature pool contains at least 10 papers with relevance score > 0.5.',
  },
  {
    id: 'paper_metadata',
    name: 'Paper Metadata',
    description: 'Each paper has complete metadata',
    prompt: 'Verify that each paper has: title, authors, year, venue, citations, url, abstract.',
  },
  {
    id: 'deduplication',
    name: 'Deduplication',
    description: 'No duplicate papers in the pool',
    prompt: 'Verify that there are no duplicate papers (same title or very similar titles).',
  },
  {
    id: 'coverage',
    name: 'Topic Coverage',
    description: 'Papers cover different aspects of the topic',
    prompt: 'Verify that the papers cover multiple subtopics or methodologies related to the research area.',
  },
  {
    id: 'gap_identification',
    name: 'Gap Identification',
    description: 'Research gaps are clearly identified',
    prompt: 'Verify that at least 2-3 research gaps are identified with supporting evidence.',
  },
];

export const LITERATURE_TEMPLATE: PromptTemplate = {
  system: LITERATURE_SYSTEM_PROMPT,
  task: LITERATURE_TASK_PROMPT,
  outputFormat: LITERATURE_OUTPUT_FORMAT,
  qualityChecks: LITERATURE_QUALITY_CHECKS.map(c => c.prompt),
};
