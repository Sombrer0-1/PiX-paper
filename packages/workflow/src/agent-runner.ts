/**
 * Agent Runner
 *
 * Abstraction for executing LLM agent tasks within workflow stages.
 * Decouples the harness from specific agent implementations.
 */

/**
 * Result from an agent execution.
 */
export interface AgentResult {
  /** Whether the agent completed successfully */
  success: boolean;
  /** Text output from the agent */
  output: string;
  /** Files written by the agent (path → content summary) */
  filesWritten: Array<{ path: string; summary: string }>;
  /** Tool calls made by the agent */
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>;
  /** Error message if failed */
  error?: string;
  /** Token usage */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Options for an agent run.
 */
export interface AgentRunOptions {
  /** System prompt for this stage */
  systemPrompt: string;
  /** User/task prompt */
  userPrompt: string;
  /** Working directory */
  cwd: string;
  /** Node/stage ID (e.g., 'literature', 'method', 'writing') */
  nodeId?: string;
  /** Abort signal */
  signal?: AbortSignal;
  /** Callback for streaming output */
  onOutput?: (text: string) => void;
  /** Callback for tool call events */
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  /** Callback for tool result events */
  onToolResult?: (name: string, result: string) => void;
}

/**
 * AgentRunner interface.
 *
 * Implementations wrap an LLM agent (e.g., pi-coding-agent's AgentSession)
 * and execute a single stage prompt, returning the result.
 */
export interface AgentRunner {
  /**
   * Execute an agent task.
   */
  run(options: AgentRunOptions): Promise<AgentResult>;

  /**
   * Abort the current execution.
   */
  abort(): void;

  /**
   * Check if the agent is currently running.
   */
  isRunning(): boolean;

  /**
   * Update the working directory for subsequent runs.
   * Optional — not all implementations need this.
   */
  setProjectDir?(dir: string): void;
}
