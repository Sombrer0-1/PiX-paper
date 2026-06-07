# pp-workflow

DAG workflow engine for PiX-paper research automation.

## Features

- DAG-based workflow execution
- Non-linear execution with backtracking and retry
- Quality gates for each stage
- Human approval points
- Artifact tracking

## Usage

```typescript
import { WorkflowEngine, createDefaultResearchWorkflow } from 'pp-workflow';

// Create workflow from preset
const config = createDefaultResearchWorkflow();

// Initialize engine
const engine = new WorkflowEngine(state);

// Start a node
await engine.startNode('literature');

// Complete a node
await engine.completeNode('literature', result);

// Request approval
const response = await engine.requestApproval(request);
```

## Types

See `src/types.ts` for full type definitions.
