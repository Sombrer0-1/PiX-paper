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
    this.aborted = false;

    const filesWritten: Array<{ path: string; summary: string }> = [];
    const toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }> = [];
    let outputText = '';

    try {
      // Create research tools for this project
      const { tools: researchTools } = createResearchTools(this.options.projectDir);

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

      // Build the full prompt
      const fullPrompt = `${options.systemPrompt}

---

${options.userPrompt}`;

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

      return {
        success: !this.aborted,
        output: outputText,
        filesWritten,
        toolCalls,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: outputText,
        filesWritten,
        toolCalls,
        error: errorMsg,
      };
    } finally {
      this.currentSession = null;
    }
  }

  abort(): void {
    this.aborted = true;
  }

  isRunning(): boolean {
    return this.currentSession !== null;
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
