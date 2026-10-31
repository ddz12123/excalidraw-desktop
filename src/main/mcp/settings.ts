import { randomBytes } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app } from "electron";

import type { McpServerSettings } from "../../types/mcp";

export const DEFAULT_MCP_PORT = 8765;

const MIN_PORT = 1024;
const MAX_PORT = 65535;
const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 128;

const settingsPath = () => join(app.getPath("userData"), "mcp-server.json");

export const generateMcpToken = () => randomBytes(24).toString("hex");

const createDefaultSettings = (): McpServerSettings => ({
  enabled: false,
  port: DEFAULT_MCP_PORT,
  token: generateMcpToken(),
});

export const sanitizeMcpSettings = (input: unknown): McpServerSettings => {
  const source = (input ?? {}) as Partial<McpServerSettings>;
  const port = Number(source.port);

  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Port must be an integer between ${MIN_PORT} and ${MAX_PORT}`,
    );
  }

  const token = typeof source.token === "string" ? source.token.trim() : "";

  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    throw new Error(
      `Access token must be ${MIN_TOKEN_LENGTH}-${MAX_TOKEN_LENGTH} characters`,
    );
  }

  return {
    enabled: source.enabled === true,
    port,
    token,
  };
};

const writeSettings = (settings: McpServerSettings) => {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
};

export const loadMcpSettings = (): McpServerSettings => {
  try {
    return sanitizeMcpSettings(
      JSON.parse(readFileSync(settingsPath(), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // keep the unreadable/corrupt file around so the user's port and token
      // are recoverable instead of silently lost
      try {
        copyFileSync(settingsPath(), `${settingsPath()}.bak`);
      } catch (backupError) {
        console.warn("[mcp] failed to back up settings", backupError);
      }
      console.warn(
        "[mcp] invalid settings, regenerating (previous file kept as mcp-server.json.bak)",
        error,
      );
    }
    const settings = createDefaultSettings();
    try {
      writeSettings(settings);
    } catch (writeError) {
      console.warn("[mcp] failed to persist default settings", writeError);
    }
    return settings;
  }
};

export const saveMcpSettings = (input: unknown): McpServerSettings => {
  const settings = sanitizeMcpSettings(input);
  writeSettings(settings);
  return settings;
};
