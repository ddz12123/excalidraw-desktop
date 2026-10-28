import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  shell,
} from "electron";
import { autoUpdater } from "electron-updater";

import type { MenuItemConstructorOptions } from "electron";

const GITHUB_URL = "https://github.com/ddz12123/excalidraw-desktop";
const APP_URL = "app://excalidraw/index.html";
const UPDATE_CHECK_CHANNEL = "desktop:check-for-updates";
const isDev = !!process.env.ELECTRON_RENDERER_URL;
// set by the electron-builder portable launcher
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const rendererDir = join(__dirname, "../renderer");
const preloadPath = join(__dirname, "../preload/index.js");

let allowQuit = false;
let isConfirmingQuit = false;
let interactiveUpdateCheck = false;

const confirmQuit = () => {
  if (allowQuit || isConfirmingQuit) {
    return;
  }

  const parent =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

  isConfirmingQuit = true;
  void dialog
    .showMessageBox(parent, {
      type: "question",
      title: "确认退出",
      message: "确定要退出 Excalidraw 吗？",
      detail: "当前画布会自动保存到本地，下次启动后可以继续编辑。",
      buttons: ["取消", "退出"],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 1) {
        allowQuit = true;
        app.quit();
      }
    })
    .finally(() => {
      isConfirmingQuit = false;
    });
};

const getParentWindow = () =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

const setWindowTitle = (title: string) => {
  const window = getParentWindow();
  if (window) {
    window.setTitle(title);
  }
};

const setupAutoUpdater = () => {
  ipcMain.handle(UPDATE_CHECK_CHANNEL, async () => {
    if (!app.isPackaged || isPortable) {
      return { supported: false };
    }

    if (interactiveUpdateCheck) {
      return { supported: true, checking: true };
    }

    interactiveUpdateCheck = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("检查更新失败", message);
      interactiveUpdateCheck = false;
    }

    return { supported: true };
  });

  if (isPortable) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (interactiveUpdateCheck) {
      dialog.showErrorBox("检查更新失败", message);
    } else {
      console.error("[updater]", message);
    }
    interactiveUpdateCheck = false;
    setWindowTitle("Excalidraw");
  });

  autoUpdater.on("update-available", (info) => {
    setWindowTitle(`Excalidraw - 正在下载更新 v${info.version}`);
    void dialog.showMessageBox(getParentWindow(), {
      type: "info",
      title: "发现新版本",
      message: `发现新版本 v${info.version}`,
      detail: "正在后台下载更新，下载完成后会提示重启安装。",
      buttons: ["知道了"],
      noLink: true,
    });
  });

  autoUpdater.on("update-not-available", () => {
    if (interactiveUpdateCheck) {
      void dialog.showMessageBox(getParentWindow(), {
        type: "info",
        title: "检查更新",
        message: "当前已是最新版本。",
        buttons: ["知道了"],
        noLink: true,
      });
    }
    interactiveUpdateCheck = false;
  });

  autoUpdater.on("download-progress", (progress) => {
    setWindowTitle(
      `Excalidraw - 正在下载更新 ${Math.round(progress.percent)}%`,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    interactiveUpdateCheck = false;
    setWindowTitle("Excalidraw");
    void dialog
      .showMessageBox(getParentWindow(), {
        type: "question",
        title: "更新已完成",
        message: `v${info.version} 已下载完成。`,
        detail: "是否立即重启并安装更新？",
        buttons: ["稍后", "立即重启"],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 1) {
          allowQuit = true;
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
      });
  });
};

const startBackgroundUpdateCheck = () => {
  if (!app.isPackaged || isPortable) {
    return;
  }

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 5000);
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const registerAppProtocol = () => {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname || pathname === "/") {
      pathname = "/index.html";
    }

    const filePath = normalize(join(rendererDir, pathname));
    if (!filePath.startsWith(`${rendererDir}${sep}`)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
};

const openExternal = (url: string) => {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    void shell.openExternal(url);
  }
};

const buildMenu = () => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "GitHub",
          click: () => openExternal(GITHUB_URL),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const blockRemoteRequests = () => {
  if (isDev) {
    return;
  }

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
};

const setupWindowIpc = () => {
  ipcMain.on("desktop:window-minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on("desktop:window-toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.on("desktop:window-close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("desktop:window-is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: isDev ? join(__dirname, "../../resources/icon.png") : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.on("maximize", () => {
    window.webContents.send("desktop:window-maximized-changed", true);
  });
  window.on("unmaximize", () => {
    window.webContents.send("desktop:window-maximized-changed", false);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL!)) {
      return;
    }
    if (url.startsWith("app://excalidraw/")) {
      return;
    }

    event.preventDefault();
    openExternal(url);
  });

  window.on("close", (event) => {
    if (allowQuit) {
      return;
    }

    event.preventDefault();
    confirmQuit();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadURL(APP_URL);
  }

  return window;
};

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId("com.ddz12123.excalidraw-desktop");

  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      return;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    buildMenu();
    blockRemoteRequests();
    setupAutoUpdater();
    setupWindowIpc();
    createWindow();
    startBackgroundUpdateCheck();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("before-quit", (event) => {
    if (allowQuit) {
      return;
    }

    event.preventDefault();
    confirmQuit();
  });

  app.on("window-all-closed", () => {
    if (allowQuit || process.platform !== "darwin") {
      app.quit();
    }
  });
}
