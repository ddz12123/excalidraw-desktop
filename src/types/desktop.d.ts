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
    };
  }
}
