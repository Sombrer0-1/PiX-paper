/**
 * Code Reproduction Stage Prompts
 */

import type { PromptTemplate, QualityCheck } from '../types.js';

export const REPRODUCTION_SYSTEM_PROMPT = `You are an expert research engineer specializing in code reproduction.
Your goal is to reproduce baseline methods to establish comparison benchmarks.

Key responsibilities:
1. Find and clone the baseline code repository
2. Set up the required environment
3. Run baseline experiments
4. Verify results match the paper
5. Document the reproduction process

You have access to the following tools:
- bash: Execute shell commands (git clone, pip install, python, etc.)
- read: Read files
- write: Write files
- edit: Edit files

Always:
- Document every step carefully
- Record exact commands and configurations
- Note any deviations from the original paper
- Save all logs and results`;

export const REPRODUCTION_TASK_PROMPT = `## Task: Reproduce Baseline Methods

**Research Topic:** {{topic}}

### Baseline Methods to Reproduce
{{baselines}}

### Instructions

1. **Repository Setup**
   - Find the official repository for each baseline
   - Clone the repository
   - Check out the correct version/branch
   - Read the README and documentation

2. **Environment Setup**
   - Create a new virtual environment
   - Install dependencies from requirements.txt
   - Note any version conflicts or issues
   - Document the exact environment (Python version, package versions)

3. **Data Preparation**
   - Download required datasets
   - Preprocess data if needed
   - Verify data integrity

4. **Baseline Execution**
   - Run the baseline code with default settings
   - Record all outputs and metrics
   - Compare with reported results in the paper
   - Note any discrepancies

5. **Documentation**
   - Create a detailed reproduction log
   - Include all commands run
   - Record any issues encountered and solutions
   - Save environment configuration`;

export const REPRODUCTION_OUTPUT_FORMAT = `## Output Format

### reproduction_log.md
\`\`\`markdown
# Reproduction Log

## Baseline: [Method Name]

### Repository
- URL: [GitHub URL]
- Commit: [Hash]
- Branch: [Branch name]

### Environment
- Python: [Version]
- CUDA: [Version]
- Key packages: [List with versions]

### Setup Steps
\`\`\`bash
# Step 1: Clone repository
git clone [url]
cd [repo]
git checkout [commit]

# Step 2: Create environment
conda create -n [env] python=[version]
conda activate [env]
pip install -r requirements.txt

# Step 3: Download data
[commands]
\`\`\`

### Results
| Metric | Reported | Reproduced | Difference |
|--------|----------|------------|------------|
| ... | ... | ... | ... |

### Issues Encountered
1. [Issue]: [Solution]
2. [Issue]: [Solution]
\`\`\`

### baseline_results.json
\`\`\`json
{
  "baselines": [
    {
      "name": "Method Name",
      "repository": "https://...",
      "commit": "abc123",
      "metrics": {
        "accuracy": 0.95,
        "f1": 0.93
      },
      "reported_metrics": {
        "accuracy": 0.96,
        "f1": 0.94
      },
      "environment": {
        "python": "3.10",
        "torch": "2.0.0"
      }
    }
  ]
}
\`\`\`

### environment.yml
\`\`\`yaml
name: research
channels:
  - defaults
  - pytorch
dependencies:
  - python=3.10
  - pytorch=2.0.0
  - pip:
    - package1==1.0.0
    - package2==2.0.0
\`\`\``;

export const REPRODUCTION_QUALITY_CHECKS: QualityCheck[] = [
  {
    id: 'repo_cloned',
    name: 'Repository Cloned',
    description: 'Repository successfully cloned',
    prompt: 'Verify that the baseline repository is successfully cloned with correct commit hash.',
  },
  {
    id: 'env_setup',
    name: 'Environment Setup',
    description: 'Environment properly configured',
    prompt: 'Verify that the environment is properly set up with all dependencies installed.',
  },
  {
    id: 'results_reproduced',
    name: 'Results Reproduced',
    description: 'Baseline results reproduced',
    prompt: 'Verify that baseline experiments run successfully and produce results.',
  },
  {
    id: 'results_match',
    name: 'Results Match Paper',
    description: 'Results match paper claims',
    prompt: 'Verify that reproduced results are within 5% of reported results in the paper.',
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'Reproduction process documented',
    prompt: 'Verify that the reproduction process is thoroughly documented with all commands and configurations.',
  },
];

export const REPRODUCTION_TEMPLATE: PromptTemplate = {
  system: REPRODUCTION_SYSTEM_PROMPT,
  task: REPRODUCTION_TASK_PROMPT,
  outputFormat: REPRODUCTION_OUTPUT_FORMAT,
  qualityChecks: REPRODUCTION_QUALITY_CHECKS.map(c => c.prompt),
};
