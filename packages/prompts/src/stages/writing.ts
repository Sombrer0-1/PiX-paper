/**
 * Paper Writing Stage Prompts
 */

import type { PromptTemplate, QualityCheck } from '../types.js';

export const WRITING_SYSTEM_PROMPT = `You are an expert academic paper writer.
Your goal is to write a complete, high-quality research paper based on the conducted research.

Key responsibilities:
1. Create a clear and compelling paper structure
2. Write each section with appropriate academic style
3. Ensure all claims are supported by evidence
4. Properly cite all references
5. Create clear figures and tables

Writing principles:
- Use clear, concise language
- Follow academic writing conventions
- Ensure logical flow between sections
- Support all claims with evidence
- Properly attribute all sources`;

export const WRITING_TASK_PROMPT = `## Task: Write Research Paper

**Research Topic:** {{topic}}

### Research Context
{{research_context}}

### Key Findings
{{key_findings}}

### Instructions

1. **Abstract** (150-250 words)
   - State the problem
   - Describe the approach
   - Highlight key results
   - Summarize contributions

2. **Introduction** (1-2 pages)
   - Motivate the problem
   - Review related work briefly
   - State the research question
   - Outline the approach
   - List contributions

3. **Related Work** (1-2 pages)
   - Organize by themes, not chronologically
   - Compare and contrast approaches
   - Identify gaps that your work addresses

4. **Method** (2-3 pages)
   - Provide overview with figure
   - Describe technical details
   - Explain design choices
   - Discuss complexity

5. **Experiments** (2-3 pages)
   - Describe setup (datasets, metrics, baselines)
   - Present main results with tables
   - Include ablation studies
   - Analyze and discuss results

6. **Conclusion** (0.5-1 page)
   - Summarize contributions
   - Discuss limitations
   - Suggest future work

7. **References**
   - Include all cited works
   - Use consistent format
   - Include DOIs where available`;

export const WRITING_OUTPUT_FORMAT = `## Output Format

### paper.md
\`\`\`markdown
# [Title]

## Abstract
[150-250 word abstract]

## 1. Introduction
[Introduction text with citations [1,2]]

### 1.1 Problem Statement
[Clear problem statement]

### 1.2 Contributions
- Contribution 1
- Contribution 2
- Contribution 3

## 2. Related Work

### 2.1 [Theme 1]
[Discussion of related work]

### 2.2 [Theme 2]
[Discussion of related work]

## 3. Method

### 3.1 Overview
[Method overview with figure reference]

### 3.2 Technical Details
[Detailed technical description]

### 3.3 Implementation
[Implementation details]

## 4. Experiments

### 4.1 Setup
#### Datasets
[Dataset descriptions]

#### Metrics
[Metric definitions]

#### Baselines
[Baseline descriptions]

### 4.2 Main Results
| Method | Metric 1 | Metric 2 | Metric 3 |
|--------|----------|----------|----------|
| ... | ... | ... | ... |

### 4.3 Ablation Study
[Ablation results]

### 4.4 Analysis
[Detailed analysis]

## 5. Conclusion
[Conclusion and future work]

## References
[1] Author et al. (2023). Title. Venue.
[2] Author et al. (2022). Title. Venue.
\`\`\`

### references.json
\`\`\`json
{
  "references": [
    {
      "id": 1,
      "type": "article",
      "title": "Paper Title",
      "authors": ["Author 1", "Author 2"],
      "year": 2023,
      "venue": "Conference/Journal",
      "doi": "10.xxxx/xxxxx",
      "url": "https://..."
    }
  ]
}
\`\`\`

### figures/
\`\`\`
figures/
├── method_overview.png    # Method architecture diagram
├── result_comparison.png  # Comparison chart
└── ablation_study.png     # Ablation results
\`\`\``;

export const WRITING_QUALITY_CHECKS: QualityCheck[] = [
  {
    id: 'sections_complete',
    name: 'Sections Complete',
    description: 'All sections are written',
    prompt: 'Verify that all required sections (Abstract, Introduction, Related Work, Method, Experiments, Conclusion) are complete.',
  },
  {
    id: 'claims_supported',
    name: 'Claims Supported',
    description: 'All claims have citations',
    prompt: 'Verify that every claim or finding is supported by a citation or experimental result.',
  },
  {
    id: 'figures_referenced',
    name: 'Figures Referenced',
    description: 'All figures are referenced in text',
    prompt: 'Verify that all figures are referenced and explained in the text.',
  },
  {
    id: 'references_complete',
    name: 'References Complete',
    description: 'All references are complete',
    prompt: 'Verify that all citations have corresponding reference entries with complete metadata.',
  },
  {
    id: 'logical_flow',
    name: 'Logical Flow',
    description: 'Paper has logical flow',
    prompt: 'Verify that the paper has a logical flow from problem statement to solution to evaluation.',
  },
];

export const WRITING_TEMPLATE: PromptTemplate = {
  system: WRITING_SYSTEM_PROMPT,
  task: WRITING_TASK_PROMPT,
  outputFormat: WRITING_OUTPUT_FORMAT,
  qualityChecks: WRITING_QUALITY_CHECKS.map(c => c.prompt),
};
