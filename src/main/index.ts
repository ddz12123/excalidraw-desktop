import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  session,
  shell,
  Tray,
} from "electron";
import { autoUpdater } from "electron-updater";

import { setupMcp, shutdownMcp } from "./mcp";

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
let isPrompting = false;
let tray: Tray | null = null;
let interactiveUpdateCheck = false;

const getParentWindow = () =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

const quitApp = () => {
  allowQuit = true;
  app.quit();
};

const showWindow = () => {
  const window = BrowserWindow.getAllWindows()[0];

  if (!window) {
    createWindow();
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
};

const promptClose = (window: BrowserWindow) => {
  if (allowQuit || isPrompting) {
    return;
  }

  const canMinimizeToTray = !!tray && !tray.isDestroyed();
  const buttons = canMinimizeToTray
    ? ["取消", "最小化到托盘", "退出应用"]
    : ["取消", "退出应用"];
  const minimizeIndex = canMinimizeToTray ? 1 : -1;
  const exitIndex = canMinimizeToTray ? 2 : 1;

  isPrompting = true;
  void dialog
    .showMessageBox(window, {
      type: "question",
      title: "关闭 Excalidraw",
      message: canMinimizeToTray
        ? "要最小化到系统托盘，还是退出应用？"
        : "确定要退出 Excalidraw 吗？",
      detail: canMinimizeToTray
        ? "最小化到托盘后应用会继续在后台运行，可以从系统托盘图标重新打开。"
        : "当前画布会自动保存到本地，下次启动后可以继续编辑。",
      buttons,
      defaultId: canMinimizeToTray ? minimizeIndex : 0,
      cancelId: 0,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === exitIndex) {
        quitApp();
        return;
      }

      if (
        response === minimizeIndex &&
        tray &&
        !tray.isDestroyed() &&
        !window.isDestroyed()
      ) {
        window.hide();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      isPrompting = false;
    });
};

const promptQuit = () => {
  if (allowQuit || isPrompting) {
    return;
  }

  isPrompting = true;
  void dialog
    .showMessageBox(getParentWindow(), {
      type: "question",
      title: "确认退出",
      message: "确定要退出 Excalidraw 吗？",
      detail: "当前画布会自动保存到本地，下次启动后可以继续编辑。",
      buttons: ["取消", "退出应用"],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 1) {
        quitApp();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      isPrompting = false;
    });
};

const loadTrayIcon = () => {
  const iconPath = isDev
    ? join(__dirname, "../../resources/icon.png")
    : join(process.resourcesPath, "icon.png");
  const image = nativeImage.createFromPath(iconPath);

  if (image.isEmpty()) {
    return null;
  }

  const size = process.platform === "darwin" ? 18 : 16;
  return image.resize({ width: size, height: size });
};

const createTray = async () => {
  if (tray) {
    return;
  }

  let icon = loadTrayIcon();

  if (!icon) {
    try {
      icon = await app.getFileIcon(process.execPath, { size: "small" });
    } catch (error) {
      console.warn("[tray] failed to load the executable icon", error);
    }
  }

  try {
    tray = new Tray(icon ?? nativeImage.createEmpty());
    tray.setToolTip("Excalidraw");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示主窗口", click: showWindow },
        { type: "separator" },
        { label: "退出应用", click: quitApp },
      ]),
    );

    if (process.platform !== "darwin") {
      tray.on("click", showWindow);
    }
  } catch (error) {
    console.error("[tray] failed to create", error);
    tray = null;
  }
};

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

  window.webContents.on("will-prevent-unload", (event) => {
    // quit already confirmed; the renderer's beforeunload guard (in-flight
    // image saves) must not cancel it silently
    if (allowQuit) {
      event.preventDefault();
    }
  });

  window.on("close", (event) => {
    if (allowQuit) {
      return;
    }

    event.preventDefault();
    promptClose(window);
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
    showWindow();
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    buildMenu();
    blockRemoteRequests();
    setupAutoUpdater();
    setupWindowIpc();
    createWindow();
    void createTray();
    try {
      setupMcp();
    } catch (error) {
      console.error("[mcp] setup failed", error);
    }
    startBackgroundUpdateCheck();

    app.on("activate", () => {
      showWindow();
    });
  });

  app.on("before-quit", (event) => {
    if (allowQuit) {
      return;
    }

    event.preventDefault();
    promptQuit();
  });

  app.on("will-quit", () => {
    tray?.destroy();
    tray = null;
    shutdownMcp();
  });

  app.on("window-all-closed", () => {
    if (allowQuit || process.platform !== "darwin") {
      app.quit();
    }
  });
}
