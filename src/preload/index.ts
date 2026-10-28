import { contextBridge, ipcRenderer } from "electron";

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

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  windowControls,
});
