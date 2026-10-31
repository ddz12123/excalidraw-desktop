import { ipcMain } from "electron";

import { setupMcpBridge } from "./bridge";
import {
  getMcpStatus,
  startMcpServer,
  stopMcpServer,
  whenMcpSettled,
} from "./server";
import { loadMcpSettings, saveMcpSettings } from "./settings";

import type { McpServerSettings } from "../../types/mcp";

let settings: McpServerSettings | null = null;

export const setupMcp = () => {
  setupMcpBridge();
  settings = loadMcpSettings();

  ipcMain.handle("desktop:mcp-get-settings", async () => {
    await whenMcpSettled();
    return { settings, status: getMcpStatus() };
  });

  ipcMain.handle(
    "desktop:mcp-save-settings",
    async (_event, input: unknown) => {
      const previous = settings;
      settings = saveMcpSettings(input);

      const changed =
        !previous ||
        previous.enabled !== settings.enabled ||
        previous.port !== settings.port ||
        previous.token !== settings.token;

      const status =
        changed || getMcpStatus().error
          ? await startMcpServer(settings)
          : getMcpStatus();

      return { settings, status };
    },
  );

  void startMcpServer(settings).catch((error) => {
    console.error("[mcp] failed to start", error);
  });
};

export const shutdownMcp = () => {
  void stopMcpServer();
};
