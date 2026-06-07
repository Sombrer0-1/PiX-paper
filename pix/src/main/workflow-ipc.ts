/**
 * Workflow IPC Handlers
 *
 * Registers IPC handlers for workflow and research operations.
 */

import { ipcMain } from 'electron';
import type { WorkflowBridge } from './workflow-engine.js';

let handlersRegistered = false;

export function registerWorkflowIpcHandlers(workflowBridge: WorkflowBridge): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  // =========================================================================
  // Workflow Lifecycle
  // =========================================================================

  ipcMain.handle('workflow-start', async (_event, templateId?: string, topic?: string) => {
    try {
      await workflowBridge.startWorkflow(templateId || 'default', topic);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('workflow-stop', async () => {
    try {
      await workflowBridge.stopWorkflow();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('workflow-pause', async () => {
    try {
      await workflowBridge.pauseWorkflow();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('workflow-resume', async () => {
    try {
      await workflowBridge.resumeWorkflow();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Workflow State
  // =========================================================================

  ipcMain.handle('workflow-get-state', () => {
    return workflowBridge.getWorkflowState();
  });

  ipcMain.handle('workflow-get-nodes', () => {
    return workflowBridge.getNodes();
  });

  ipcMain.handle('workflow-get-current-node', () => {
    return workflowBridge.getCurrentNode();
  });

  ipcMain.handle('workflow-get-artifacts', () => {
    return workflowBridge.getArtifacts();
  });

  ipcMain.handle('workflow-get-node-artifacts', (_event, nodeId: string) => {
    return workflowBridge.getNodeArtifacts(nodeId);
  });

  ipcMain.handle('workflow-is-running', () => {
    return workflowBridge.isRunning();
  });

  ipcMain.handle('workflow-get-templates', () => {
    return workflowBridge.getAvailableTemplates();
  });

  // =========================================================================
  // Workflow Actions
  // =========================================================================

  ipcMain.handle('workflow-approve', async (_event, requestId: string, approved: boolean, comments?: string) => {
    try {
      workflowBridge.respondApproval({
        requestId,
        approved,
        comments,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('workflow-backtrack', async (_event, nodeId: string, reason: string) => {
    try {
      await workflowBridge.backtrackToNode(nodeId, reason);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('workflow-register-artifact', async (_event, params: {
    nodeId: string;
    type: string;
    path: string;
    metadata?: Record<string, unknown>;
  }) => {
    try {
      const artifact = await workflowBridge.registerArtifact(params as {
        nodeId: string;
        type: any;
        path: string;
        metadata?: Record<string, unknown>;
      });
      return { success: true, artifact };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('workflow-get-stage-prompt', (_event, nodeId: string) => {
    try {
      return workflowBridge.generateStagePrompt(nodeId);
    } catch (err) {
      return '';
    }
  });
}
