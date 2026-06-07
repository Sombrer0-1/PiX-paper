/**
 * Method Design Stage Prompts
 */

import type { PromptTemplate, QualityCheck } from '../types.js';

export const METHOD_SYSTEM_PROMPT = `You are an expert research method designer.
Your goal is to design a novel research method based on the literature survey findings.

Key responsibilities:
1. Analyze research gaps from the literature survey
2. Formulate a clear research question
3. Propose a novel method or approach
4. Define evaluation metrics and experimental setup
5. Justify the novelty and potential impact

Always:
- Ground your design in the identified research gaps
- Consider practical feasibility
- Define clear evaluation criteria
- Anticipate potential challenges`;

export const METHOD_TASK_PROMPT = `## Task: Design Research Method

**Research Topic:** {{topic}}

### Context from Literature Survey
{{literature_summary}}

### Identified Research Gaps
{{research_gaps}}

### Instructions

1. **Research Question Formulation**
   - Define a clear, specific research question
   - Ensure it addresses an identified research gap
   - Make it measurable and testable

2. **Method Design**
   - Propose a novel approach to address the research question
   - Describe the technical approach in detail
   - Explain why this approach is novel compared to existing work
   - Consider computational complexity and feasibility

3. **Baseline Selection**
   - Identify 2-3 baseline methods for comparison
   - Justify why these are appropriate baselines
   - Note expected advantages of your method

4. **Evaluation Plan**
   - Define evaluation metrics (e.g., accuracy, F1, BLEU, etc.)
   - Specify datasets to be used
   - Plan ablation studies to validate design choices
   - Define statistical significance testing approach

5. **Expected Contributions**
   - List the main contributions of this work
   - Explain the significance of each contribution`;

export const METHOD_OUTPUT_FORMAT = `## Output Format

### method.md
\`\`\`markdown
# Research Method: [Title]

## 1. Research Question
[Clear statement of the research question]

## 2. Proposed Method

### 2.1 Overview
[High-level description of the approach]

### 2.2 Technical Details
[Detailed technical description]

### 2.3 Novelty
[What makes this approach novel]

## 3. Baselines
[Description of baseline methods]

## 4. Evaluation Plan

### 4.1 Metrics
[Evaluation metrics to be used]

### 4.2 Datasets
[Datasets for experiments]

### 4.3 Ablation Studies
[Planned ablation experiments]

## 5. Expected Contributions
[Main contributions of this work]
\`\`\`

### experiment_plan.md
\`\`\`markdown
# Experiment Plan

## Datasets
| Dataset | Size | Task | Source |
|---------|------|------|--------|
| ... | ... | ... | ... |

## Baselines
| Method | Description | Reference |
|--------|-------------|-----------|
| ... | ... | ... |

## Metrics
- Metric 1: Description
- Metric 2: Description

## Experiment Settings
- Hardware: [GPU/CPU specs]
- Hyperparameters: [Key hyperparameters]
- Training: [Training details]

## Ablation Studies
1. [Ablation 1]: [What to test]
2. [Ablation 2]: [What to test]
\`\`\``;

export const METHOD_QUALITY_CHECKS: QualityCheck[] = [
  {
    id: 'research_question',
    name: 'Research Question',
    description: 'Clear research question defined',
    prompt: 'Verify that a clear, specific, and testable research question is defined.',
  },
  {
    id: 'novelty',
    name: 'Novelty',
    description: 'Novel contribution identified',
    prompt: 'Verify that the proposed method has clear novelty compared to existing work.',
  },
  {
    id: 'metrics',
    name: 'Evaluation Metrics',
    description: 'Evaluation metrics defined',
    prompt: 'Verify that appropriate evaluation metrics are defined with clear justification.',
  },
  {
    id: 'baselines',
    name: 'Baseline Methods',
    description: 'Baseline methods identified',
    prompt: 'Verify that 2-3 appropriate baseline methods are identified for comparison.',
  },
  {
    id: 'feasibility',
    name: 'Feasibility',
    description: 'Method is practically feasible',
    prompt: 'Verify that the proposed method is practically feasible to implement and evaluate.',
  },
];

export const METHOD_TEMPLATE: PromptTemplate = {
  system: METHOD_SYSTEM_PROMPT,
  task: METHOD_TASK_PROMPT,
  outputFormat: METHOD_OUTPUT_FORMAT,
  qualityChecks: METHOD_QUALITY_CHECKS.map(c => c.prompt),
};
