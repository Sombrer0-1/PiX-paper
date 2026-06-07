/**
 * Research Agent Runner
 *
 * Implements the AgentRunner interface using pi-coding-agent's AgentSession.
 * Injects research tools and manages the agent lifecycle for research workflows.
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import {
  createAgentSession,
  type AgentSession,
  SessionManager,
  AuthStorage,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';
import {
  createResearchTools,
  type AgentRunner,
  type AgentResult,
  type AgentRunOptions,
} from 'pp-workflow';

export interface ResearchAgentRunnerOptions {
  /** Project working directory */
  projectDir: string;
  /** Agent config directory. Default: ~/.pp/agent */
  agentDir?: string;
}

/**
 * Research Agent Runner
 *
 * Wraps pi-coding-agent's AgentSession to execute research tasks.
 * Each stage call creates a fresh session with research tools injected.
 */
export class ResearchAgentRunner implements AgentRunner {
  private options: ResearchAgentRunnerOptions;
  private currentSession: AgentSession | null = null;
  private aborted = false;

  constructor(options: ResearchAgentRunnerOptions) {
    this.options = options;
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    console.log(`[ResearchAgentRunner.run] Starting, projectDir=${this.options.projectDir}, time=${new Date().toISOString()}`);
    this.aborted = false;

    const filesWritten: Array<{ path: string; summary: string }> = [];
    const toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }> = [];
    let outputText = '';

    try {
      // Create research tools for this project
      const { tools: researchTools } = createResearchTools(this.options.projectDir);
      console.log(`[ResearchAgentRunner.run] Created ${researchTools.length} research tools`);

      // Create a new agent session with research tools
      const agentDir = this.options.agentDir || getAgentDir();
      const authStorage = AuthStorage.create(join(agentDir, 'auth.json'));

      const { session } = await createAgentSession({
        cwd: this.options.projectDir,
        agentDir,
        authStorage,
        sessionManager: SessionManager.inMemory(),
        customTools: researchTools.map(tool => ({
          name: tool.name,
          label: tool.name,
          description: tool.description,
          parameters: tool.parameters as any,
          execute: async (
            _toolCallId: string,
            params: any,
            _signal: AbortSignal | undefined,
            _onUpdate: any,
            _ctx: any,
          ) => {
            try {
              const result = await tool.execute(params);
              const text = result.content?.map((c: any) => c.text).join('\n') || '';
              toolCalls.push({ name: tool.name, args: params, result: text });
              options.onToolCall?.(tool.name, params);
              return {
                content: result.content || [{ type: 'text' as const, text }],
                details: null,
              };
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              return {
                content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
                details: null,
              };
            }
          },
        })),
      });

      this.currentSession = session;
      console.log(`[ResearchAgentRunner.run] Agent session created`);

      // Build the full prompt
      const fullPrompt = `${options.systemPrompt}

---

${options.userPrompt}`;
      console.log(`[ResearchAgentRunner.run] Sending prompt (${fullPrompt.length} chars)`);

      // Listen for agent events to capture output
      const unsubscribe = session.subscribe((event: any) => {
        if (this.aborted) return;

        if (event.type === 'message_update' || event.type === 'message_end') {
          const msg = event.message;
          if (msg?.role === 'assistant') {
            const content = msg.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  outputText += block.text;
                  options.onOutput?.(block.text);
                }
              }
            }
          }
        }
      });

      try {
        // Send the prompt and wait for completion
        await session.prompt(fullPrompt, {
          expandPromptTemplates: false,
        });
      } finally {
        unsubscribe();
      }

      // Scan for files written by the agent in the project directory
      const writtenFiles = this.scanForWrittenFiles(this.options.projectDir);
      filesWritten.push(...writtenFiles);
      console.log(`[ResearchAgentRunner.run] Completed. outputText=${outputText.length} chars, filesWritten=${writtenFiles.length}`);

      return {
        success: !this.aborted,
        output: outputText,
        filesWritten,
        toolCalls,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ResearchAgentRunner.run] LLM Error, falling back to dev mock:`, errorMsg);

      // Dev fallback: generate mock files if LLM is not available
      const mockResult = this.generateDevFallback(options);
      return mockResult;
    } finally {
      this.currentSession = null;
    }
  }

  /**
   * Dev fallback: generate mock files when LLM is not available.
   * This is for development/testing only — not real research output.
   */
  private generateDevFallback(options: AgentRunOptions): AgentResult {
    console.log(`[ResearchAgentRunner] Using dev fallback mode`);
    const { writeFileSync, existsSync, mkdirSync } = require('fs');
    const filesWritten: Array<{ path: string; summary: string }> = [];

    // Determine which stage we're running — prefer nodeId from harness
    const prompt = options.userPrompt || '';
    let stageType = options.nodeId || 'unknown';

    if (stageType === 'unknown') {
      // Fallback: detect from prompt content
      if (prompt.includes('literature') || prompt.includes('Literature') || prompt.includes('survey')) {
        stageType = 'literature';
      } else if (prompt.includes('method') || prompt.includes('Method') || prompt.includes('design')) {
        stageType = 'method';
      } else if (prompt.includes('paper') || prompt.includes('Paper') || prompt.includes('writing')) {
        stageType = 'writing';
      }
    }

    console.log(`[ResearchAgentRunner] Detected stage type: ${stageType}`);

    const projectDir = this.options.projectDir;

    try {
      switch (stageType) {
        case 'literature': {
          // Create literature directory
          const litDir = join(projectDir, 'literature');
          if (!existsSync(litDir)) mkdirSync(litDir, { recursive: true });

          // Generate mock literature_pool.json
          const poolPath = join(litDir, 'literature_pool.json');
          const poolData = {
            _dev_mock: true,
            topic: 'Research Topic',
            papers: [
              {
                id: 'paper-1',
                title: 'Sample Paper 1: A Survey of Methods',
                authors: ['Author A', 'Author B'],
                year: 2024,
                abstract: 'This paper surveys existing methods in the field.',
                source: 'arxiv',
                url: 'https://arxiv.org/abs/2024.00001',
                relevance: 0.95,
              },
              {
                id: 'paper-2',
                title: 'Sample Paper 2: Novel Approach',
                authors: ['Author C'],
                year: 2023,
                abstract: 'We propose a novel approach to the problem.',
                source: 'arxiv',
                url: 'https://arxiv.org/abs/2023.00002',
                relevance: 0.88,
              },
            ],
            totalFound: 2,
            searchDate: new Date().toISOString(),
          };
          writeFileSync(poolPath, JSON.stringify(poolData, null, 2));
          filesWritten.push({ path: poolPath, summary: 'Mock literature pool' });

          // Generate mock survey.md
          const surveyPath = join(litDir, 'survey.md');
          const surveyContent = `# Literature Survey

> **DEV MOCK** — This is a placeholder generated for development testing.

## Overview

This literature survey covers recent advances in the research topic.

## Key Papers

### 1. Sample Paper 1: A Survey of Methods (2024)
- **Authors**: Author A, Author B
- **Key Finding**: Comprehensive survey of existing methods
- **Relevance**: High

### 2. Sample Paper 2: Novel Approach (2023)
- **Authors**: Author C
- **Key Finding**: Proposed a novel approach
- **Relevance**: Medium-High

## Research Gaps

1. Gap 1: Lack of comprehensive evaluation
2. Gap 2: Limited real-world applications
3. Gap 3: Need for better metrics

## Summary

The literature review identified several key papers and research gaps that inform our proposed method.
`;
          writeFileSync(surveyPath, surveyContent);
          filesWritten.push({ path: surveyPath, summary: 'Mock literature survey' });

          return {
            success: true,
            output: '[DEV MOCK] Generated literature survey with 2 sample papers.',
            filesWritten,
            toolCalls: [],
          };
        }

        case 'method': {
          // Create method directory
          const methodDir = join(projectDir, 'method');
          if (!existsSync(methodDir)) mkdirSync(methodDir, { recursive: true });

          // Generate mock method.md
          const methodPath = join(methodDir, 'method.md');
          const methodContent = `# Research Method

> **DEV MOCK** — This is a placeholder generated for development testing.

## Research Question

How can we improve the existing approach to achieve better performance?

## Proposed Method

### Overview
We propose a novel approach that combines existing techniques with new innovations.

### Key Components
1. **Component A**: Enhanced feature extraction
2. **Component B**: Improved training strategy
3. **Component C**: Better evaluation metrics

### Algorithm
\`\`\`
Input: dataset D
Output: trained model M

1. Preprocess D
2. Extract features using Component A
3. Train model using Component B
4. Evaluate using Component C
5. Return M
\`\`\`

## Expected Contributions
1. Novel combination of existing techniques
2. Improved performance metrics
3. Better understanding of the problem

## Baselines
- Baseline 1: Standard approach (Expected: 85% accuracy)
- Baseline 2: Recent SOTA (Expected: 90% accuracy)
- Our method (Expected: 93% accuracy)
`;
          writeFileSync(methodPath, methodContent);
          filesWritten.push({ path: methodPath, summary: 'Mock method description' });

          // Generate mock experiment_config.json
          const configPath = join(methodDir, 'experiment_config.json');
          const configData = {
            _dev_mock: true,
            experiments: [
              {
                name: 'Main Comparison',
                description: 'Compare our method against baselines',
                datasets: ['dataset-1', 'dataset-2'],
                metrics: ['accuracy', 'f1', 'precision', 'recall'],
                baselines: ['baseline-1', 'baseline-2'],
                runs: 5,
              },
            ],
            hardware: {
              gpu: 'NVIDIA A100',
              cpu: 'Intel Xeon',
              ram: '64GB',
            },
          };
          writeFileSync(configPath, JSON.stringify(configData, null, 2));
          filesWritten.push({ path: configPath, summary: 'Mock experiment config' });

          return {
            success: true,
            output: '[DEV MOCK] Generated method description and experiment config.',
            filesWritten,
            toolCalls: [],
          };
        }

        case 'writing': {
          // Create paper directory
          const paperDir = join(projectDir, 'paper');
          if (!existsSync(paperDir)) mkdirSync(paperDir, { recursive: true });

          // Generate mock paper.md
          const paperPath = join(paperDir, 'paper.md');
          const paperContent = `# Research Paper

> **DEV MOCK** — This is a placeholder generated for development testing.

## Abstract

This paper presents a novel approach to the research problem. Our method achieves state-of-the-art performance on standard benchmarks.

## 1. Introduction

The research problem is important because... [DEV MOCK: placeholder content]

## 2. Related Work

Previous work in this area includes... [DEV MOCK: placeholder content]

## 3. Method

Our proposed method consists of... [DEV MOCK: placeholder content]

### 3.1 Overview

The key idea is... [DEV MOCK: placeholder content]

### 3.2 Technical Details

The technical implementation involves... [DEV MOCK: placeholder content]

## 4. Experiments

### 4.1 Setup

We evaluated our method on... [DEV MOCK: placeholder content]

### 4.2 Results

| Method | Accuracy | F1 | Precision | Recall |
|--------|----------|-----|-----------|--------|
| Baseline 1 | 85.0% | 84.5% | 86.0% | 83.0% |
| Baseline 2 | 90.0% | 89.5% | 91.0% | 88.0% |
| **Our Method** | **93.0%** | **92.5%** | **94.0%** | **91.0%** |

### 4.3 Analysis

Our method outperforms all baselines... [DEV MOCK: placeholder content]

## 5. Conclusion

We presented a novel approach that... [DEV MOCK: placeholder content]

## References

1. Author A, Author B. "Sample Paper 1." 2024.
2. Author C. "Sample Paper 2." 2023.
`;
          writeFileSync(paperPath, paperContent);
          filesWritten.push({ path: paperPath, summary: 'Mock research paper' });

          // Generate mock manuscript.json
          const manuscriptPath = join(paperDir, 'manuscript.json');
          const manuscriptData = {
            _dev_mock: true,
            title: 'Research Paper',
            abstract: 'This paper presents a novel approach...',
            sections: ['Introduction', 'Related Work', 'Method', 'Experiments', 'Conclusion'],
            wordCount: 1500,
            figureCount: 0,
            tableCount: 1,
            referenceCount: 2,
          };
          writeFileSync(manuscriptPath, JSON.stringify(manuscriptData, null, 2));
          filesWritten.push({ path: manuscriptPath, summary: 'Mock manuscript metadata' });

          return {
            success: true,
            output: '[DEV MOCK] Generated research paper and manuscript metadata.',
            filesWritten,
            toolCalls: [],
          };
        }

        default:
          return {
            success: false,
            output: '',
            filesWritten: [],
            toolCalls: [],
            error: `Unknown stage type for dev fallback: ${stageType}`,
          };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ResearchAgentRunner] Dev fallback error:`, errorMsg);
      return {
        success: false,
        output: '',
        filesWritten,
        toolCalls: [],
        error: `Dev fallback failed: ${errorMsg}`,
      };
    }
  }

  abort(): void {
    this.aborted = true;
  }

  isRunning(): boolean {
    return this.currentSession !== null;
  }

  setProjectDir(dir: string): void {
    this.options.projectDir = dir;
  }

  /**
   * Scan project directory for recently written files.
   * This is a heuristic — we check for files modified in the last few seconds.
   */
  private scanForWrittenFiles(projectDir: string): Array<{ path: string; summary: string }> {
    const results: Array<{ path: string; summary: string }> = [];
    const cutoff = Date.now() - 30000; // 30 seconds ago

    const scan = (dir: string, depth: number = 0) => {
      if (depth > 3) return;
      if (!existsSync(dir)) return;

      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath, depth + 1);
          } else if (entry.isFile()) {
            try {
              const stat = statSync(fullPath);
              if (stat.mtimeMs > cutoff) {
                results.push({
                  path: fullPath,
                  summary: `Modified at ${new Date(stat.mtimeMs).toISOString()}`,
                });
              }
            } catch {
              // Skip files we can't stat
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    scan(projectDir);
    return results;
  }
}
