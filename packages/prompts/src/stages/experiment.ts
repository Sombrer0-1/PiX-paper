/**
 * Experiment Execution Stage Prompts
 */

import type { PromptTemplate, QualityCheck } from '../types.js';

export const EXPERIMENT_SYSTEM_PROMPT = `You are an expert research experimenter.
Your goal is to implement the proposed method and run comprehensive experiments.

Key responsibilities:
1. Implement the proposed method
2. Prepare datasets and data loaders
3. Run comparison experiments with baselines
4. Collect and analyze metrics
5. Generate comparison charts and tables

You have access to the following tools:
- bash: Execute shell commands
- read: Read files
- write: Write files
- edit: Edit files
- generate_chart: Generate comparison charts

Always:
- Use consistent random seeds for reproducibility
- Run multiple trials and report mean/std
- Perform statistical significance testing
- Save all intermediate results`;

export const EXPERIMENT_TASK_PROMPT = `## Task: Run Experiments

**Research Topic:** {{topic}}

### Method to Implement
{{method_description}}

### Baseline Results
{{baseline_results}}

### Instructions

1. **Implementation**
   - Implement the proposed method following the design
   - Use the same codebase as baselines for fair comparison
   - Write clean, well-documented code
   - Add unit tests for key components

2. **Main Experiments**
   - Run on all specified datasets
   - Use the same evaluation protocol as baselines
   - Record all metrics
   - Save model checkpoints

3. **Ablation Studies**
   - Test each component contribution
   - Vary key hyperparameters
   - Document the effect of each change

4. **Analysis**
   - Compare with baselines on all metrics
   - Perform statistical significance tests
   - Analyze failure cases
   - Identify strengths and weaknesses

5. **Visualization**
   - Generate comparison charts
   - Create result tables
   - Include error bars where appropriate`;

export const EXPERIMENT_OUTPUT_FORMAT = `## Output Format

### our_code/
\`\`\`
our_code/
├── model.py          # Model implementation
├── train.py          # Training script
├── evaluate.py       # Evaluation script
├── utils.py          # Utility functions
├── configs/          # Configuration files
│   └── default.yaml
└── tests/            # Unit tests
    └── test_model.py
\`\`\`

### experiment_results/
\`\`\`
experiment_results/
├── main/             # Main experiment results
│   ├── dataset1/
│   │   ├── metrics.json
│   │   └── predictions.json
│   └── dataset2/
│       └── ...
└── ablation/         # Ablation study results
    ├── component_a/
    │   └── metrics.json
    └── component_b/
        └── metrics.json
\`\`\`

### figures/
\`\`\`
figures/
├── comparison_bar.png    # Bar chart comparison
├── training_curve.png    # Training curves
└── ablation_table.png    # Ablation results table
\`\`\`

### analysis.md
\`\`\`markdown
# Experiment Analysis

## 1. Main Results

| Method | Dataset 1 | Dataset 2 | Dataset 3 |
|--------|-----------|-----------|-----------|
| Baseline 1 | 0.95 | 0.92 | 0.88 |
| Baseline 2 | 0.96 | 0.93 | 0.89 |
| **Ours** | **0.98** | **0.95** | **0.91** |

## 2. Ablation Study

| Component | Accuracy | Δ |
|-----------|----------|---|
| Full model | 0.98 | - |
| w/o Component A | 0.96 | -0.02 |
| w/o Component B | 0.97 | -0.01 |

## 3. Statistical Significance
- p-value: 0.001 (< 0.05)
- Effect size: 0.3 (medium)

## 4. Analysis
[Detailed analysis of results]

## 5. Failure Cases
[Examples where the method fails]
\`\`\``;

export const EXPERIMENT_QUALITY_CHECKS: QualityCheck[] = [
  {
    id: 'implementation',
    name: 'Implementation',
    description: 'Method successfully implemented',
    prompt: 'Verify that the proposed method is implemented and can run without errors.',
  },
  {
    id: 'experiments_complete',
    name: 'Experiments Complete',
    description: 'All experiments completed',
    prompt: 'Verify that all planned experiments (main + ablation) are completed.',
  },
  {
    id: 'metrics_collected',
    name: 'Metrics Collected',
    description: 'Metrics properly collected',
    prompt: 'Verify that all metrics are properly collected and saved in structured format.',
  },
  {
    id: 'comparison_fair',
    name: 'Fair Comparison',
    description: 'Fair comparison with baselines',
    prompt: 'Verify that the comparison with baselines is fair (same data, same evaluation protocol).',
  },
  {
    id: 'statistical_significance',
    name: 'Statistical Significance',
    description: 'Statistical significance tested',
    prompt: 'Verify that statistical significance testing is performed and reported.',
  },
];

export const EXPERIMENT_TEMPLATE: PromptTemplate = {
  system: EXPERIMENT_SYSTEM_PROMPT,
  task: EXPERIMENT_TASK_PROMPT,
  outputFormat: EXPERIMENT_OUTPUT_FORMAT,
  qualityChecks: EXPERIMENT_QUALITY_CHECKS.map(c => c.prompt),
};
