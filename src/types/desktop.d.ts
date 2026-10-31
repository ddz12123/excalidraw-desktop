import type {
  McpCommandRequest,
  McpServerSettings,
  McpSettingsResponse,
} from "./mcp";

export {};

declare global {
  interface Window {
    desktop?: {
      platform: NodeJS.Platform;
      checkForUpdates?: () => Promise<{
        supported: boolean;
        checking?: boolean;
      }>;
      windowControls?: {
        minimize: () => void;
        toggleMaximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (
          callback: (maximized: boolean) => void,
        ) => () => void;
      };
      mcp?: {
        getSettings: () => Promise<McpSettingsResponse>;
        saveSettings: (
          settings: McpServerSettings,
        ) => Promise<McpSettingsResponse>;
        onCommand: (
          handler: (request: McpCommandRequest) => Promise<unknown>,
        ) => () => void;
      };
    };
  }
}
