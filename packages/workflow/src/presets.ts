/**
 * Default Workflow Presets
 *
 * Pre-configured workflow templates for common research patterns.
 */

import type { WorkflowConfig, WorkflowNodeConfig, QualityCheckConfig } from './types.js';

// ============================================================================
// Quality Check Presets
// ============================================================================

const literatureQualityChecks: QualityCheckConfig[] = [
  {
    id: 'min_papers',
    name: 'Minimum Papers',
    description: 'At least 10 highly relevant papers found',
    checkFn: 'checkMinPapers',
  },
  {
    id: 'paper_metadata',
    name: 'Paper Metadata',
    description: 'Each paper has abstract, year, source, URL',
    checkFn: 'checkPaperMetadata',
  },
  {
    id: 'deduplication',
    name: 'Deduplication',
    description: 'No duplicate papers in the pool',
    checkFn: 'checkDeduplication',
  },
];

const methodQualityChecks: QualityCheckConfig[] = [
  {
    id: 'research_question',
    name: 'Research Question',
    description: 'Clear research question defined',
    checkFn: 'checkResearchQuestion',
  },
  {
    id: 'hypothesis',
    name: 'Hypothesis',
    description: 'Testable hypothesis stated',
    checkFn: 'checkHypothesis',
  },
  {
    id: 'baseline',
    name: 'Baseline',
    description: 'Baseline method selected',
    checkFn: 'checkBaseline',
  },
  {
    id: 'metrics',
    name: 'Metrics',
    description: 'Evaluation metrics defined',
    checkFn: 'checkMetrics',
  },
];

const reproductionQualityChecks: QualityCheckConfig[] = [
  {
    id: 'env_record',
    name: 'Environment Record',
    description: 'Environment setup documented',
    checkFn: 'checkEnvRecord',
  },
  {
    id: 'run_logs',
    name: 'Run Logs',
    description: 'Execution logs captured',
    checkFn: 'checkRunLogs',
  },
  {
    id: 'baseline_metrics',
    name: 'Baseline Metrics',
    description: 'Baseline metrics recorded',
    checkFn: 'checkBaselineMetrics',
  },
];

const experimentQualityChecks: QualityCheckConfig[] = [
  {
    id: 'config_record',
    name: 'Config Record',
    description: 'Experiment config saved',
    checkFn: 'checkConfigRecord',
  },
  {
    id: 'seed_record',
    name: 'Seed Record',
    description: 'Random seeds recorded',
    checkFn: 'checkSeedRecord',
  },
  {
    id: 'metrics_record',
    name: 'Metrics Record',
    description: 'All metrics recorded',
    checkFn: 'checkMetricsRecord',
  },
  {
    id: 'figure_sources',
    name: 'Figure Sources',
    description: 'Figures traceable to data',
    checkFn: 'checkFigureSources',
  },
];

const writingQualityChecks: QualityCheckConfig[] = [
  {
    id: 'claim_citations',
    name: 'Claim Citations',
    description: 'Every core claim has citation or evidence',
    checkFn: 'checkClaimCitations',
  },
  {
    id: 'figure_numbers',
    name: 'Figure Numbers',
    description: 'All figure references valid',
    checkFn: 'checkFigureNumbers',
  },
  {
    id: 'reference_integrity',
    name: 'Reference Integrity',
    description: 'No missing references',
    checkFn: 'checkReferenceIntegrity',
  },
];

// ============================================================================
// Default Research Workflow
// ============================================================================

export function createDefaultResearchWorkflow(): WorkflowConfig {
  const nodes: WorkflowNodeConfig[] = [
    {
      id: 'literature',
      type: 'literature',
      name: 'Literature Survey',
      description: 'Search, filter, and analyze related papers',
      dependencies: [],
      approvalRequired: true,
      qualityGateChecks: literatureQualityChecks,
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 5000,
        retryOnFailure: true,
      },
    },
    {
      id: 'method',
      type: 'method',
      name: 'Method Design',
      description: 'Design novel method based on literature analysis',
      dependencies: ['literature'],
      approvalRequired: true,
      qualityGateChecks: methodQualityChecks,
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 5000,
        retryOnFailure: true,
      },
    },
    {
      id: 'reproduction',
      type: 'reproduction',
      name: 'Code Reproduction',
      description: 'Reproduce baseline results',
      dependencies: ['method'],
      approvalRequired: true,
      qualityGateChecks: reproductionQualityChecks,
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 10000,
        retryOnFailure: true,
      },
    },
    {
      id: 'experiment',
      type: 'experiment',
      name: 'Experiment Execution',
      description: 'Run comparison experiments',
      dependencies: ['reproduction'],
      approvalRequired: true,
      qualityGateChecks: experimentQualityChecks,
      retryPolicy: {
        maxRetries: 1,
        backoffMs: 15000,
        retryOnFailure: true,
      },
    },
    {
      id: 'writing',
      type: 'writing',
      name: 'Paper Writing',
      description: 'Write the research paper',
      dependencies: ['experiment'],
      approvalRequired: true,
      qualityGateChecks: writingQualityChecks,
    },
    {
      id: 'review',
      type: 'review',
      name: 'Quality Review',
      description: 'Final quality review and export',
      dependencies: ['writing'],
      approvalRequired: true,
    },
  ];

  return {
    id: 'default-research',
    name: 'Default Research Workflow',
    description: 'Standard research workflow: literature → method → reproduction → experiment → writing',
    nodes,
  };
}

// ============================================================================
// Quick Survey Workflow
// ============================================================================

export function createQuickSurveyWorkflow(): WorkflowConfig {
  const nodes: WorkflowNodeConfig[] = [
    {
      id: 'literature',
      type: 'literature',
      name: 'Literature Survey',
      description: 'Quick survey of related papers',
      dependencies: [],
      approvalRequired: true,
      qualityGateChecks: literatureQualityChecks.slice(0, 2),
    },
    {
      id: 'writing',
      type: 'writing',
      name: 'Survey Paper',
      description: 'Write survey paper',
      dependencies: ['literature'],
      approvalRequired: true,
      qualityGateChecks: writingQualityChecks,
    },
  ];

  return {
    id: 'quick-survey',
    name: 'Quick Survey Workflow',
    description: 'Quick literature survey and survey paper writing',
    nodes,
  };
}

// ============================================================================
// Experiment Only Workflow
// ============================================================================

export function createExperimentOnlyWorkflow(): WorkflowConfig {
  const nodes: WorkflowNodeConfig[] = [
    {
      id: 'reproduction',
      type: 'reproduction',
      name: 'Code Setup',
      description: 'Setup baseline code and environment',
      dependencies: [],
      approvalRequired: true,
      qualityGateChecks: reproductionQualityChecks,
    },
    {
      id: 'experiment',
      type: 'experiment',
      name: 'Experiment Execution',
      description: 'Run experiments',
      dependencies: ['reproduction'],
      approvalRequired: true,
      qualityGateChecks: experimentQualityChecks,
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 10000,
        retryOnFailure: true,
      },
    },
  ];

  return {
    id: 'experiment-only',
    name: 'Experiment Only Workflow',
    description: 'Setup code and run experiments only',
    nodes,
  };
}

// ============================================================================
// MVP Workflow (literature → method → writing)
// ============================================================================

export function createMvpResearchWorkflow(): WorkflowConfig {
  const nodes: WorkflowNodeConfig[] = [
    {
      id: 'literature',
      type: 'literature',
      name: 'Literature Survey',
      description: 'Search, filter, and analyze related papers',
      dependencies: [],
      approvalRequired: false,
      qualityGateChecks: [],
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 5000,
        retryOnFailure: true,
      },
    },
    {
      id: 'method',
      type: 'method',
      name: 'Method Design',
      description: 'Design novel method based on literature analysis',
      dependencies: ['literature'],
      approvalRequired: false,
      qualityGateChecks: [],
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 5000,
        retryOnFailure: true,
      },
    },
    {
      id: 'writing',
      type: 'writing',
      name: 'Paper Writing',
      description: 'Write the research paper',
      dependencies: ['method'],
      approvalRequired: false,
      qualityGateChecks: [],
    },
  ];

  return {
    id: 'mvp-research',
    name: 'MVP Research Workflow',
    description: 'Minimal workflow: literature → method → writing',
    nodes,
  };
}
