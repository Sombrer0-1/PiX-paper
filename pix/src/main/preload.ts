/**
 * Preload Script
 *
 * Exposes a typed API to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AgentSessionEvent,
  Artifact,
  CreatePaperProjectPayload,
  GateRequest,
  GuiSettings,
  ListArtifactsPayload,
  MarkPaperInboxItemPayload,
  McpConfigInfo,
  McpResourceContent,
  McpResourceInfo,
  McpServerInfo,
  OpenArtifactPayload,
  PausePaperStagePayload,
  PaperArtifactContent,
  PaperStateChangedEvent,
  PaperStateSnapshot,
  ReadArtifactPayload,
  RequestUserInputRequest,
  RespondGatePayload,
  RpcCommand,
  SessionInfo,
  StartPaperStagePayload,
  ValidatePaperProjectDirPayload,
} from "../shared/types.js";

export interface PixApi {
  // File dialogs
  selectProject: () => Promise<string | null>;
  selectPiPath: () => Promise<string | null>;
  selectSessionFile: () => Promise<string | null>;
  selectChatFiles: () => Promise<string[]>;
  getPathForFile: (file: File) => string;

  // External links
  openExternal: (url: string) => void;

  // Pi lifecycle
  startPi: (projectDir: string) => Promise<{ success: boolean; error?: string; isPaper?: boolean }>;
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

  // Background tasks
  getBackgroundTasks: () => Promise<Array<{ taskId: string; command: string; pid?: number; startedAt: number; status: string }>>;
  stopBackgroundTask: (taskId: string) => Promise<{ found: boolean }>;

  // Session management
  deleteSession: (sessionPath: string) => Promise<{ success: boolean; error?: string }>;

  // MCP queries
  mcpGetServers: () => Promise<McpServerInfo[]>;
  mcpGetConfig: () => Promise<McpConfigInfo>;
  mcpListResources: (serverName?: string) => Promise<McpResourceInfo[]>;
  mcpReadResource: (serverName: string | undefined, uri: string) => Promise<McpResourceContent>;

  // Auto update
  checkForUpdates: () => Promise<{
    success: boolean;
    hasUpdate?: boolean;
    currentVersion?: string;
    latestVersion?: string;
    releaseNotes?: string;
    releaseDate?: string;
    error?: string;
  }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;

  // Paper (PiX-paper)
  paperCreateProject: (payload: CreatePaperProjectPayload) => Promise<{ success: boolean; error?: string }>;
  paperValidateProjectDir: (payload: ValidatePaperProjectDirPayload) => Promise<{ success: boolean; error?: string; exists?: boolean; writable?: boolean; hasPaperProject?: boolean }>;
  paperCheckProject: (projectDir: string) => Promise<boolean>;
  paperGetState: () => Promise<{ success: boolean; data?: PaperStateSnapshot; error?: string }>;
  paperStartStage: (payload: StartPaperStagePayload) => Promise<{ success: boolean; error?: string }>;
  paperPauseStage: (payload: PausePaperStagePayload) => Promise<{ success: boolean; error?: string }>;
  paperResumeStage: (payload: StartPaperStagePayload) => Promise<{ success: boolean; error?: string }>;
  paperRespondGate: (payload: RespondGatePayload) => Promise<{ success: boolean; error?: string }>;
  paperListArtifacts: (payload: ListArtifactsPayload) => Promise<{ success: boolean; data?: Artifact[]; error?: string }>;
  paperReadArtifact: (payload: ReadArtifactPayload) => Promise<{ success: boolean; data?: PaperArtifactContent; error?: string }>;
  paperMarkInboxItem: (payload: MarkPaperInboxItemPayload) => Promise<{ success: boolean; error?: string }>;
  paperOpenArtifact: (payload: OpenArtifactPayload) => Promise<{ success: boolean; error?: string }>;
  paperOpenInFolder: (payload: OpenArtifactPayload) => Promise<{ success: boolean; error?: string }>;
  onPaperGate: (callback: (gate: GateRequest) => void) => () => void;
  onPaperStateChanged: (callback: (event: PaperStateChangedEvent) => void) => () => void;
  onPaperInboxChanged: (callback: (event: PaperStateChangedEvent) => void) => () => void;
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
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),

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

  getBackgroundTasks: () =>
    ipcRenderer.invoke("get-background-tasks") as Promise<Array<{ taskId: string; command: string; pid?: number; startedAt: number; status: string }>>,

  stopBackgroundTask: (taskId: string) =>
    ipcRenderer.invoke("stop-background-task", taskId) as Promise<{ found: boolean }>,

  // MCP queries
  mcpGetServers: () => ipcRenderer.invoke("mcp-get-servers"),
  mcpGetConfig: () => ipcRenderer.invoke("mcp-get-config"),
  mcpListResources: (serverName?: string) => ipcRenderer.invoke("mcp-list-resources", serverName),
  mcpReadResource: (serverName: string | undefined, uri: string) =>
    ipcRenderer.invoke("mcp-read-resource", serverName, uri),

  // Auto update
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // Paper (PiX-paper)
  paperCreateProject: (payload: CreatePaperProjectPayload) =>
    ipcRenderer.invoke("paper-create-project", payload) as Promise<{ success: boolean; error?: string }>,
  paperValidateProjectDir: (payload: ValidatePaperProjectDirPayload) =>
    ipcRenderer.invoke("paper-validate-project-dir", payload) as Promise<{ success: boolean; error?: string; exists?: boolean; writable?: boolean; hasPaperProject?: boolean }>,
  paperCheckProject: (projectDir: string) =>
    ipcRenderer.invoke("paper-check-project", projectDir) as Promise<boolean>,
  paperGetState: () =>
    ipcRenderer.invoke("paper-get-state") as Promise<{ success: boolean; data?: PaperStateSnapshot; error?: string }>,
  paperStartStage: (payload: StartPaperStagePayload) =>
    ipcRenderer.invoke("paper-start-stage", payload) as Promise<{ success: boolean; error?: string }>,
  paperPauseStage: (payload: PausePaperStagePayload) =>
    ipcRenderer.invoke("paper-pause-stage", payload) as Promise<{ success: boolean; error?: string }>,
  paperResumeStage: (payload: StartPaperStagePayload) =>
    ipcRenderer.invoke("paper-resume-stage", payload) as Promise<{ success: boolean; error?: string }>,
  paperRespondGate: (payload: RespondGatePayload) =>
    ipcRenderer.invoke("paper-respond-gate", payload) as Promise<{ success: boolean; error?: string }>,
  paperListArtifacts: (payload: ListArtifactsPayload) =>
    ipcRenderer.invoke("paper-list-artifacts", payload) as Promise<{ success: boolean; data?: Artifact[]; error?: string }>,
  paperReadArtifact: (payload: ReadArtifactPayload) =>
    ipcRenderer.invoke("paper-read-artifact", payload) as Promise<{ success: boolean; data?: PaperArtifactContent; error?: string }>,
  paperMarkInboxItem: (payload: MarkPaperInboxItemPayload) =>
    ipcRenderer.invoke("paper-mark-inbox-item", payload) as Promise<{ success: boolean; error?: string }>,
  paperOpenArtifact: (payload: OpenArtifactPayload) =>
    ipcRenderer.invoke("paper-open-artifact", payload) as Promise<{ success: boolean; error?: string }>,
  paperOpenInFolder: (payload: OpenArtifactPayload) =>
    ipcRenderer.invoke("paper-open-in-folder", payload) as Promise<{ success: boolean; error?: string }>,
  onPaperGate: (callback: (gate: GateRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: GateRequest) => callback(data);
    ipcRenderer.on("paper-gate", handler);
    return () => ipcRenderer.removeListener("paper-gate", handler);
  },
  onPaperStateChanged: (callback: (event: PaperStateChangedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PaperStateChangedEvent) => callback(data);
    ipcRenderer.on("paper-state-changed", handler);
    return () => ipcRenderer.removeListener("paper-state-changed", handler);
  },
  onPaperInboxChanged: (callback: (event: PaperStateChangedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PaperStateChangedEvent) => callback(data);
    ipcRenderer.on("paper-inbox-changed", handler);
    return () => ipcRenderer.removeListener("paper-inbox-changed", handler);
  },
};

contextBridge.exposeInMainWorld("pixApi", api);
