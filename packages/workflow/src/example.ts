/**
 * Artifact Manager Usage Example
 *
 * Demonstrates how to use ArtifactManager for research artifact tracking.
 */

import { ArtifactManager } from './artifact-manager.js';
import type { Artifact, Provenance } from './types.js';

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  // Initialize artifact manager
  const manager = new ArtifactManager({
    storagePath: './data/artifacts.json',
    autoSave: true,
  });

  console.log('=== Artifact Manager Example ===\n');

  // 1. Create artifacts for a research project
  console.log('1. Creating artifacts...');

  const survey = manager.create({
    projectId: 'research-001',
    type: 'survey',
    path: './projects/research-001/literature/survey.md',
    createdBy: 'agent',
    sourceNodeId: 'literature',
    metadata: {
      title: 'Literature Survey on Transformer Attention',
      paperCount: 25,
    },
  });

  const method = manager.create({
    projectId: 'research-001',
    type: 'method',
    path: './projects/research-001/method/method.md',
    createdBy: 'agent',
    sourceNodeId: 'method',
    metadata: {
      title: 'Novel Attention Mechanism',
      innovation: 'Sparse attention with linear complexity',
    },
    provenance: [
      {
        sourceId: survey.id,
        relation: 'derived_from',
        description: 'Method designed based on literature survey findings',
      },
    ],
  });

  const experimentResult = manager.create({
    projectId: 'research-001',
    type: 'experiment_result',
    path: './projects/research-001/experiments/results.json',
    createdBy: 'tool',
    sourceNodeId: 'experiment',
    metadata: {
      accuracy: 0.95,
      f1Score: 0.93,
      runtime: '2.3s',
    },
    provenance: [
      {
        sourceId: method.id,
        relation: 'supports',
        description: 'Experiment results support the proposed method',
      },
    ],
  });

  const paper = manager.create({
    projectId: 'research-001',
    type: 'paper',
    path: './projects/research-001/paper/paper.md',
    createdBy: 'agent',
    sourceNodeId: 'writing',
    metadata: {
      title: 'Sparse Transformer: Efficient Attention with Linear Complexity',
      sections: ['abstract', 'introduction', 'method', 'experiments', 'conclusion'],
    },
    provenance: [
      {
        sourceId: survey.id,
        relation: 'cites',
        description: 'Paper cites literature survey',
      },
      {
        sourceId: method.id,
        relation: 'supports',
        description: 'Paper describes the proposed method',
      },
      {
        sourceId: experimentResult.id,
        relation: 'supports',
        description: 'Paper presents experiment results',
      },
    ],
  });

  console.log(`Created ${4} artifacts\n`);

  // 2. Query artifacts
  console.log('2. Querying artifacts...');

  const allArtifacts = manager.getAll();
  console.log(`Total artifacts: ${allArtifacts.length}`);

  const surveyArtifacts = manager.getByType('survey');
  console.log(`Survey artifacts: ${surveyArtifacts.length}`);

  const literatureNodeArtifacts = manager.getByNode('literature');
  console.log(`Literature node artifacts: ${literatureNodeArtifacts.length}`);

  const projectArtifacts = manager.getByProject('research-001');
  console.log(`Project artifacts: ${projectArtifacts.length}\n`);

  // 3. Provenance tracking
  console.log('3. Provenance tracking...');

  const paperChain = manager.getProvenanceChain(paper.id);
  console.log(`Paper provenance chain: ${paperChain.length} artifacts`);
  for (const artifact of paperChain) {
    console.log(`  - ${artifact.type}: ${artifact.path}`);
  }

  const derivedFromSurvey = manager.getDerivedArtifacts(survey.id);
  console.log(`\nDerived from survey: ${derivedFromSurvey.length} artifacts`);
  for (const artifact of derivedFromSurvey) {
    console.log(`  - ${artifact.type}: ${artifact.path}`);
  }

  // 4. Statistics
  console.log('\n4. Statistics...');

  const stats = manager.getStats('research-001');
  console.log(`Total: ${stats.total}`);
  console.log('By type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('By node:');
  for (const [node, count] of Object.entries(stats.byNode)) {
    console.log(`  ${node}: ${count}`);
  }

  // 5. Integrity check
  console.log('\n5. Integrity check...');

  const integrity = manager.verifyIntegrity(paper.id);
  console.log(`Paper integrity: ${integrity.valid ? 'Valid' : 'Invalid'}`);
  if (integrity.issues.length > 0) {
    console.log('Issues:');
    for (const issue of integrity.issues) {
      console.log(`  - ${issue}`);
    }
  }

  // 6. Update artifact
  console.log('\n6. Updating artifact...');

  manager.update(paper.id, {
    metadata: {
      ...paper.metadata,
      version: 2,
      lastEdited: new Date().toISOString(),
    },
  });

  const updatedPaper = manager.get(paper.id);
  console.log(`Paper version: ${updatedPaper?.metadata.version}`);

  // 7. Export
  console.log('\n7. Exporting...');

  const exported = manager.exportToJson('research-001');
  console.log(`Exported ${exported.length} characters`);

  console.log('\n=== Example Complete ===');
}

// Run example
main().catch(console.error);
