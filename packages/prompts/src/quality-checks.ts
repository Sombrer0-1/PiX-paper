/**
 * Quality Check Prompts
 *
 * Prompts for validating research quality at each stage.
 */

import type { StageType, QualityCheckPrompt, QualityCheck } from './types.js';
import { LITERATURE_QUALITY_CHECKS } from './stages/literature.js';
import { METHOD_QUALITY_CHECKS } from './stages/method.js';
import { REPRODUCTION_QUALITY_CHECKS } from './stages/reproduction.js';
import { EXPERIMENT_QUALITY_CHECKS } from './stages/experiment.js';
import { WRITING_QUALITY_CHECKS } from './stages/writing.js';

// ============================================================================
// Quality Check Registry
// ============================================================================

export const QUALITY_CHECKS: Record<StageType, QualityCheck[]> = {
  literature: LITERATURE_QUALITY_CHECKS,
  method: METHOD_QUALITY_CHECKS,
  reproduction: REPRODUCTION_QUALITY_CHECKS,
  experiment: EXPERIMENT_QUALITY_CHECKS,
  writing: WRITING_QUALITY_CHECKS,
  review: [],
};

// ============================================================================
// Quality Gate Prompt Generator
// ============================================================================

export function generateQualityGatePrompt(stage: StageType, artifacts: string[]): string {
  const checks = QUALITY_CHECKS[stage];
  if (!checks || checks.length === 0) {
    return 'No quality checks defined for this stage.';
  }

  const lines: string[] = [
    `## Quality Gate: ${stage.charAt(0).toUpperCase() + stage.slice(1)} Stage`,
    '',
    'Please verify the following quality requirements:',
    '',
  ];

  for (const check of checks) {
    lines.push(`### ${check.name}`);
    lines.push(`**Description:** ${check.description}`);
    lines.push(`**Check:** ${check.prompt}`);
    lines.push('');
  }

  if (artifacts.length > 0) {
    lines.push('### Artifacts to Verify');
    for (const artifact of artifacts) {
      lines.push(`- ${artifact}`);
    }
    lines.push('');
  }

  lines.push('### Output Format');
  lines.push('For each check, respond with:');
  lines.push('```json');
  lines.push('{');
  lines.push('  "check_id": "check_name",');
  lines.push('  "status": "passed|warning|failed",');
  lines.push('  "details": "Explanation of the result"');
  lines.push('}');
  lines.push('```');

  return lines.join('\n');
}

// ============================================================================
// Review Prompt
// ============================================================================

export const REVIEW_SYSTEM_PROMPT = `You are an expert research reviewer.
Your goal is to provide a comprehensive review of the research work.

Key responsibilities:
1. Evaluate the overall quality of the research
2. Check consistency across all stages
3. Identify potential issues or weaknesses
4. Provide constructive feedback
5. Make a recommendation (accept/revise/reject)

Review criteria:
- Novelty and significance of contributions
- Technical soundness
- Experimental validation
- Quality of writing
- Reproducibility`;

export const REVIEW_TASK_PROMPT = `## Task: Review Research Work

**Research Topic:** {{topic}}

### Materials to Review
{{materials}}

### Instructions

1. **Literature Survey Review**
   - Is the survey comprehensive?
   - Are research gaps clearly identified?
   - Is the related work well-organized?

2. **Method Review**
   - Is the research question clear?
   - Is the method novel?
   - Is the approach well-justified?

3. **Experiments Review**
   - Is the experimental setup appropriate?
   - Are baselines fair?
   - Are results properly analyzed?

4. **Paper Review**
   - Is the paper well-written?
   - Are claims supported by evidence?
   - Are figures and tables clear?

5. **Overall Assessment**
   - What are the main strengths?
   - What are the main weaknesses?
   - What improvements are needed?
   - Accept/Revise/Reject recommendation`;

export const REVIEW_OUTPUT_FORMAT = `## Output Format

### review.md
\`\`\`markdown
# Research Review

## Summary
[Brief summary of the research]

## Strengths
1. [Strength 1]
2. [Strength 2]

## Weaknesses
1. [Weakness 1]
2. [Weakness 2]

## Detailed Review

### Literature Survey
[Review of literature survey]

### Method
[Review of proposed method]

### Experiments
[Review of experiments]

### Paper Quality
[Review of writing quality]

## Recommendations
1. [Recommendation 1]
2. [Recommendation 2]

## Overall Score
- Novelty: X/5
- Significance: X/5
- Technical Soundness: X/5
- Experiments: X/5
- Writing: X/5
- **Overall: X/5**

## Decision
[Accept / Minor Revision / Major Revision / Reject]
\`\`\``;

export const REVIEW_TEMPLATE = {
  system: REVIEW_SYSTEM_PROMPT,
  task: REVIEW_TASK_PROMPT,
  outputFormat: REVIEW_OUTPUT_FORMAT,
  qualityChecks: [],
};
