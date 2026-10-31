import { contextBridge, ipcRenderer } from "electron";

import type {
  McpCommandReply,
  McpCommandRequest,
  McpServerSettings,
  McpSettingsResponse,
} from "../types/mcp";

const windowControls = {
  minimize: () => ipcRenderer.send("desktop:window-minimize"),
  toggleMaximize: () => ipcRenderer.send("desktop:window-toggle-maximize"),
  close: () => ipcRenderer.send("desktop:window-close"),
  isMaximized: () => ipcRenderer.invoke("desktop:window-is-maximized"),
  onMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) =>
      callback(maximized);
    ipcRenderer.on("desktop:window-maximized-changed", listener);
    return () =>
      ipcRenderer.removeListener("desktop:window-maximized-changed", listener);
  },
};

let mcpHandler: ((request: McpCommandRequest) => Promise<unknown>) | null =
  null;
const queuedMcpRequests: McpCommandRequest[] = [];

const runMcpCommand = async (request: McpCommandRequest) => {
  try {
    if (!mcpHandler) {
      throw new Error("MCP bridge is not ready");
    }
    const result = await mcpHandler(request);
    const reply: McpCommandReply = { id: request.id, ok: true, result };
    ipcRenderer.send("desktop:mcp-reply", reply);
  } catch (error) {
    const reply: McpCommandReply = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    ipcRenderer.send("desktop:mcp-reply", reply);
  }
};

ipcRenderer.on(
  "desktop:mcp-command",
  (_event: Electron.IpcRendererEvent, request: McpCommandRequest) => {
    if (!mcpHandler) {
      queuedMcpRequests.push(request);
      return;
    }
    void runMcpCommand(request);
  },
);

const mcp = {
  getSettings: () =>
    ipcRenderer.invoke(
      "desktop:mcp-get-settings",
    ) as Promise<McpSettingsResponse>,
  saveSettings: (settings: McpServerSettings) =>
    ipcRenderer.invoke(
      "desktop:mcp-save-settings",
      settings,
    ) as Promise<McpSettingsResponse>,
  onCommand: (handler: (request: McpCommandRequest) => Promise<unknown>) => {
    mcpHandler = handler;
    while (queuedMcpRequests.length) {
      void runMcpCommand(queuedMcpRequests.shift()!);
    }
    return () => {
      if (mcpHandler === handler) {
        mcpHandler = null;
      }
    };
  },
};

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  windowControls,
  mcp,
});
