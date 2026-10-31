export interface McpServerSettings {
  enabled: boolean;
  port: number;
  token: string;
}

export interface McpServerStatus {
  running: boolean;
  port: number;
  endpoint: string;
  error: string | null;
}

export interface McpSettingsResponse {
  settings: McpServerSettings;
  status: McpServerStatus;
}

export interface McpCommandRequest {
  id: string;
  command: string;
  params?: unknown;
}

export interface McpCommandReply {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
