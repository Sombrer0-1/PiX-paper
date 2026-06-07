/**
 * Preload Script
 *
 * Exposes a typed API to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AgentSessionEvent,
  GuiSettings,
  McpConfigInfo,
  McpResourceContent,
  McpResourceInfo,
  McpServerInfo,
  RequestUserInputRequest,
  RpcCommand,
  SessionInfo,
} from "../shared/types.js";

export interface PixApi {
  // File dialogs
  selectProject: () => Promise<string | null>;
  selectPiPath: () => Promise<string | null>;
  selectSessionFile: () => Promise<string | null>;
  selectChatFiles: () => Promise<string[]>;
  getPathForFile: (file: File) => string;

  // Pi lifecycle
  startPi: (projectDir: string) => Promise<{ success: boolean; error?: string }>;
  stopPi: () => Promise<{ success: boolean }>;

  // RPC commands
  sendCommand: <T = unknown>(command: RpcCommand) => Promise<{ success: boolean; data?: T; error?: string }>;
  sendCommandAsync: (command: RpcCommand) => Promise<{ success: boolean; error?: string }>;

  // Settings
  getSettings: () => Promise<GuiSettings>;
  setSettings: (settings: Partial<GuiSettings>) => Promise<{ success: boolean }>;

  // Pi detection
  detectPi: () => Promise<{ found: boolean; path: string; note?: string }>;
  getPiStderr: () => Promise<string>;
  isPiRunning: () => Promise<boolean>;

  // Event subscriptions
  onPiEvent: (callback: (event: AgentSessionEvent) => void) => () => void;
  onPiResponse: (callback: (response: unknown) => void) => () => void;
  onPiExit: (callback: (data: { code: number | null; signal: string | null; stderr: string }) => void) => () => void;
  onPiError: (callback: (err: { message: string }) => void) => () => void;
  onPiReady: (callback: () => void) => () => void;
  onUserInputRequest: (callback: (request: RequestUserInputRequest) => void) => () => void;

  // Session management
  listSessions: (projectDir: string) => Promise<SessionInfo[]>;

  // Window controls (frameless window)
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => () => void;

  // Session management
  deleteSession: (sessionPath: string) => Promise<{ success: boolean; error?: string }>;

  // MCP queries
  mcpGetServers: () => Promise<McpServerInfo[]>;
  mcpGetConfig: () => Promise<McpConfigInfo>;
  mcpListResources: (serverName?: string) => Promise<McpResourceInfo[]>;
  mcpReadResource: (serverName: string | undefined, uri: string) => Promise<McpResourceContent>;

  // Project config (.pp)
  getProjectConfig: (projectDir: string) => Promise<{ success: boolean; config?: unknown; error?: string }>;
  updateProjectConfig: (projectDir: string, updates: Record<string, unknown>) => Promise<{ success: boolean; config?: unknown; error?: string }>;

  // Workflow
  workflowStart: (templateId?: string, topic?: string) => Promise<{ success: boolean; error?: string }>;
  workflowStop: () => Promise<{ success: boolean; error?: string }>;
  workflowPause: () => Promise<{ success: boolean; error?: string }>;
  workflowResume: () => Promise<{ success: boolean; error?: string }>;
  workflowGetState: () => Promise<unknown>;
  workflowGetNodes: () => Promise<unknown[]>;
  workflowGetCurrentNode: () => Promise<unknown>;
  workflowGetArtifacts: () => Promise<unknown[]>;
  workflowGetNodeArtifacts: (nodeId: string) => Promise<unknown[]>;
  workflowIsRunning: () => Promise<boolean>;
  workflowGetTemplates: () => Promise<Array<{ id: string; name: string; description: string }>>;
  workflowApprove: (requestId: string, approved: boolean, comments?: string) => Promise<{ success: boolean; error?: string }>;
  workflowBacktrack: (nodeId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  workflowRegisterArtifact: (params: { nodeId: string; type: string; path: string; metadata?: Record<string, unknown> }) => Promise<{ success: boolean; artifact?: unknown; error?: string }>;
  workflowGetStagePrompt: (nodeId: string) => Promise<string>;
  onWorkflowEvent: (callback: (event: unknown) => void) => () => void;
  onWorkflowApprovalRequest: (callback: (request: unknown) => void) => () => void;
  onWorkflowStagePrompt: (callback: (data: unknown) => void) => () => void;
  onWorkflowComplete: (callback: () => void) => () => void;
  onWorkflowAgentOutput: (callback: (data: unknown) => void) => () => void;
  onWorkflowAgentToolCall: (callback: (data: unknown) => void) => () => void;

  // Research
  researchSearch: (query: { keywords: string[]; limit?: number; yearFrom?: number; yearTo?: number; minCitations?: number }) => Promise<{ success: boolean; papers?: unknown[]; total?: number; error?: string }>;
  researchGetPaper: (paperId: string, source: string) => Promise<{ success: boolean; paper?: unknown; error?: string }>;
  researchParsePdf: (filePath: string) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  researchVerifyCitation: (claim: string, citations: string[]) => Promise<{ success: boolean; result?: unknown; error?: string }>;
  researchGetLibraries: () => Promise<{ success: boolean; libraries?: unknown[]; error?: string }>;
  researchCreateLibrary: (name: string) => Promise<{ success: boolean; library?: unknown; error?: string }>;
  researchGetLibrary: (libraryId: string) => Promise<{ success: boolean; library?: unknown; error?: string }>;
  researchDeleteLibrary: (libraryId: string) => Promise<{ success: boolean; error?: string }>;
  researchAddPaper: (libraryId: string, paper: unknown) => Promise<{ success: boolean; error?: string }>;
  researchRemovePaper: (libraryId: string, paperId: string) => Promise<{ success: boolean; error?: string }>;
  researchAddNote: (libraryId: string, paperId: string, note: string) => Promise<{ success: boolean; error?: string }>;
  researchAddTag: (libraryId: string, paperId: string, tag: string) => Promise<{ success: boolean; error?: string }>;
  researchRemoveTag: (libraryId: string, paperId: string, tag: string) => Promise<{ success: boolean; error?: string }>;
  researchGetTags: (libraryId: string) => Promise<{ success: boolean; tags?: unknown[]; error?: string }>;
  researchCreateTag: (libraryId: string, name: string, color?: string) => Promise<{ success: boolean; tag?: unknown; error?: string }>;
  researchFilterPapers: (libraryId: string, filters: { query?: string; tags?: string[]; yearFrom?: number; yearTo?: number; minCitations?: number }) => Promise<{ success: boolean; papers?: unknown[]; error?: string }>;
}

const api: PixApi = {
  selectProject: () => {
    console.log("[preload] selectProject() called, invoking IPC select-project");
    return ipcRenderer.invoke("select-project");
  },
  selectPiPath: () => ipcRenderer.invoke("select-pi-path"),
  selectSessionFile: () => ipcRenderer.invoke("select-session-file"),
  selectChatFiles: () => ipcRenderer.invoke("select-chat-files"),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  startPi: (projectDir: string) => ipcRenderer.invoke("start-pi", projectDir),
  stopPi: () => ipcRenderer.invoke("stop-pi"),

  sendCommand: <T = unknown>(command: RpcCommand) =>
    ipcRenderer.invoke("rpc-command", command) as Promise<{ success: boolean; data?: T; error?: string }>,
  sendCommandAsync: (command: RpcCommand) =>
    ipcRenderer.invoke("rpc-command-async", command) as Promise<{ success: boolean; error?: string }>,

  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (settings: Partial<GuiSettings>) => ipcRenderer.invoke("set-settings", settings),

  detectPi: () => ipcRenderer.invoke("detect-pi"),
  getPiStderr: () => ipcRenderer.invoke("get-pi-stderr"),
  isPiRunning: () => ipcRenderer.invoke("is-pi-running"),

  onPiEvent: (callback: (event: AgentSessionEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentSessionEvent) => callback(data);
    ipcRenderer.on("pi-event", handler);
    return () => ipcRenderer.removeListener("pi-event", handler);
  },
  onPiResponse: (callback: (response: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("pi-response", handler);
    return () => ipcRenderer.removeListener("pi-response", handler);
  },
  onPiExit: (callback: (data: { code: number | null; signal: string | null; stderr: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { code: number | null; signal: string | null; stderr: string }) => callback(data);
    ipcRenderer.on("pi-exit", handler);
    return () => ipcRenderer.removeListener("pi-exit", handler);
  },
  onPiError: (callback: (err: { message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
    ipcRenderer.on("pi-error", handler);
    return () => ipcRenderer.removeListener("pi-error", handler);
  },
  onPiReady: (callback: () => void) => {
    ipcRenderer.on("pi-ready", callback);
    return () => ipcRenderer.removeListener("pi-ready", callback);
  },
  onUserInputRequest: (callback: (request: RequestUserInputRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RequestUserInputRequest) => callback(data);
    ipcRenderer.on("user-input-request", handler);
    return () => ipcRenderer.removeListener("user-input-request", handler);
  },

  listSessions: (projectDir: string) => ipcRenderer.invoke("list-sessions", projectDir),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window-maximize-change", handler);
    return () => ipcRenderer.removeListener("window-maximize-change", handler);
  },

  deleteSession: (sessionPath: string) =>
    ipcRenderer.invoke("delete-session", sessionPath) as Promise<{ success: boolean; error?: string }>,

  // MCP queries
  mcpGetServers: () => ipcRenderer.invoke("mcp-get-servers"),
  mcpGetConfig: () => ipcRenderer.invoke("mcp-get-config"),
  mcpListResources: (serverName?: string) => ipcRenderer.invoke("mcp-list-resources", serverName),
  mcpReadResource: (serverName: string | undefined, uri: string) =>
    ipcRenderer.invoke("mcp-read-resource", serverName, uri),

  // Project config (.pp)
  getProjectConfig: (projectDir: string) =>
    ipcRenderer.invoke("get-project-config", projectDir),
  updateProjectConfig: (projectDir: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke("update-project-config", projectDir, updates),

  // Workflow
  workflowStart: (templateId?: string, topic?: string) => ipcRenderer.invoke("workflow-start", templateId, topic),
  workflowStop: () => ipcRenderer.invoke("workflow-stop"),
  workflowPause: () => ipcRenderer.invoke("workflow-pause"),
  workflowResume: () => ipcRenderer.invoke("workflow-resume"),
  workflowGetState: () => ipcRenderer.invoke("workflow-get-state"),
  workflowGetNodes: () => ipcRenderer.invoke("workflow-get-nodes"),
  workflowGetCurrentNode: () => ipcRenderer.invoke("workflow-get-current-node"),
  workflowGetArtifacts: () => ipcRenderer.invoke("workflow-get-artifacts"),
  workflowGetNodeArtifacts: (nodeId: string) => ipcRenderer.invoke("workflow-get-node-artifacts", nodeId),
  workflowIsRunning: () => ipcRenderer.invoke("workflow-is-running"),
  workflowGetTemplates: () => ipcRenderer.invoke("workflow-get-templates"),
  workflowApprove: (requestId: string, approved: boolean, comments?: string) => ipcRenderer.invoke("workflow-approve", requestId, approved, comments),
  workflowBacktrack: (nodeId: string, reason: string) => ipcRenderer.invoke("workflow-backtrack", nodeId, reason),
  workflowRegisterArtifact: (params: { nodeId: string; type: string; path: string; metadata?: Record<string, unknown> }) => ipcRenderer.invoke("workflow-register-artifact", params),
  workflowGetStagePrompt: (nodeId: string) => ipcRenderer.invoke("workflow-get-stage-prompt", nodeId),
  onWorkflowEvent: (callback: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("workflow-event", handler);
    return () => ipcRenderer.removeListener("workflow-event", handler);
  },
  onWorkflowApprovalRequest: (callback: (request: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("workflow-approval-request", handler);
    return () => ipcRenderer.removeListener("workflow-approval-request", handler);
  },
  onWorkflowStagePrompt: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("workflow-stage-prompt", handler);
    return () => ipcRenderer.removeListener("workflow-stage-prompt", handler);
  },
  onWorkflowComplete: (callback: () => void) => {
    ipcRenderer.on("workflow-complete", callback);
    return () => ipcRenderer.removeListener("workflow-complete", callback);
  },
  onWorkflowAgentOutput: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("workflow-agent-output", handler);
    return () => ipcRenderer.removeListener("workflow-agent-output", handler);
  },
  onWorkflowAgentToolCall: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("workflow-agent-tool-call", handler);
    return () => ipcRenderer.removeListener("workflow-agent-tool-call", handler);
  },

  // Research
  researchSearch: (query) => ipcRenderer.invoke("research-search", query),
  researchGetPaper: (paperId, source) => ipcRenderer.invoke("research-get-paper", paperId, source),
  researchParsePdf: (filePath) => ipcRenderer.invoke("research-parse-pdf", filePath),
  researchVerifyCitation: (claim, citations) => ipcRenderer.invoke("research-verify-citation", claim, citations),
  researchGetLibraries: () => ipcRenderer.invoke("research-get-libraries"),
  researchCreateLibrary: (name) => ipcRenderer.invoke("research-create-library", name),
  researchGetLibrary: (libraryId) => ipcRenderer.invoke("research-get-library", libraryId),
  researchDeleteLibrary: (libraryId) => ipcRenderer.invoke("research-delete-library", libraryId),
  researchAddPaper: (libraryId, paper) => ipcRenderer.invoke("research-add-paper", libraryId, paper),
  researchRemovePaper: (libraryId, paperId) => ipcRenderer.invoke("research-remove-paper", libraryId, paperId),
  researchAddNote: (libraryId, paperId, note) => ipcRenderer.invoke("research-add-note", libraryId, paperId, note),
  researchAddTag: (libraryId, paperId, tag) => ipcRenderer.invoke("research-add-tag", libraryId, paperId, tag),
  researchRemoveTag: (libraryId, paperId, tag) => ipcRenderer.invoke("research-remove-tag", libraryId, paperId, tag),
  researchGetTags: (libraryId) => ipcRenderer.invoke("research-get-tags", libraryId),
  researchCreateTag: (libraryId, name, color) => ipcRenderer.invoke("research-create-tag", libraryId, name, color),
  researchFilterPapers: (libraryId, filters) => ipcRenderer.invoke("research-filter-papers", libraryId, filters),
};

contextBridge.exposeInMainWorld("pixApi", api);
