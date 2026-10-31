import { randomUUID } from "node:crypto";

import { BrowserWindow, ipcMain } from "electron";

import type { McpCommandReply, McpCommandRequest } from "../../types/mcp";

type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const pendingCommands = new Map<string, PendingCommand>();
let rendererQueue: Promise<unknown> = Promise.resolve();

export const setupMcpBridge = () => {
  ipcMain.on("desktop:mcp-reply", (_event, reply: McpCommandReply) => {
    const pending = pendingCommands.get(reply.id);
    if (!pending) {
      return;
    }
    pendingCommands.delete(reply.id);
    clearTimeout(pending.timer);
    if (reply.ok) {
      pending.resolve(reply.result);
    } else {
      pending.reject(new Error(reply.error || "Renderer command failed"));
    }
  });
};

const waitForLoad = async (
  window: BrowserWindow,
  timeoutMs: number,
): Promise<void> => {
  const contents = window.webContents;

  if (!contents.isLoading()) {
    return;
  }

  // settle on close too: a destroyed window never fires did-finish-load
  await new Promise<void>((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      contents.removeListener("did-finish-load", onLoaded);
      window.removeListener("closed", onClosed);
      resolve();
    };

    const onLoaded = () => settle();
    const onClosed = () => settle();

    const timer = setTimeout(settle, timeoutMs);
    contents.once("did-finish-load", onLoaded);
    window.once("closed", onClosed);
  });
};

const invokeRendererOnce = async <T>(
  command: string,
  params: unknown,
  timeoutMs: number,
): Promise<T> => {
  const window = BrowserWindow.getAllWindows()[0];

  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    throw new Error("Excalidraw window is not available");
  }

  const deadline = Date.now() + timeoutMs;

  // commands sent while the renderer reloads would be dropped
  await waitForLoad(window, timeoutMs);

  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    throw new Error("Excalidraw window is not available");
  }

  const remaining = deadline - Date.now();

  if (remaining <= 0) {
    throw new Error(`Renderer command "${command}" timed out`);
  }

  const id = randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Renderer command "${command}" timed out`));
    }, remaining);

    pendingCommands.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });

    const request: McpCommandRequest = { id, command, params };
    window.webContents.send("desktop:mcp-command", request);
  });
};

/** serialized so concurrent MCP calls don't race on the same scene */
export const invokeRenderer = <T>(
  command: string,
  params?: unknown,
  timeoutMs = 20_000,
): Promise<T> => {
  const run = rendererQueue.then(() =>
    invokeRendererOnce<T>(command, params, timeoutMs),
  );
  rendererQueue = run.catch(() => undefined);
  return run;
};
