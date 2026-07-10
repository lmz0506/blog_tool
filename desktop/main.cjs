const { existsSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { app, BrowserWindow, Menu, Tray, dialog, nativeImage } = require("electron");
const { autoUpdater } = require("electron-updater");

let serverHandle = null;
let isQuitting = false;
let mainWindow = null;
let tray = null;
let updaterConfigured = false;
let pendingManualUpdateCheck = false;

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "app-icon.png")
    : path.join(app.getAppPath(), "desktop", "app-icon.png");
}

function getTrayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "app-icon.ico")
    : path.join(app.getAppPath(), "desktop", "app-icon.ico");
}

function getUpdateConfigPath() {
  return path.join(process.resourcesPath, "app-update.yml");
}

function getInstallRoot() {
  return path.dirname(process.execPath);
}

function getRuntimeRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "app-runtime") : app.getAppPath();
}

function getStorageRoot() {
  return app.isPackaged ? path.join(getInstallRoot(), "storage") : path.join(app.getAppPath(), ".desktop-storage");
}

function canUseAutoUpdater() {
  return app.isPackaged && existsSync(getUpdateConfigPath());
}

async function importServerModule() {
  const serverEntry = app.isPackaged
    ? path.join(process.resourcesPath, "app", "server", "src", "index.js")
    : path.join(app.getAppPath(), "server", "src", "index.js");
  return import(pathToFileURL(serverEntry).href);
}

async function startEmbeddedServer() {
  process.env.BLOG_TOOL_RUNTIME = "desktop";
  process.env.BLOG_TOOL_PROJECT_ROOT = getRuntimeRoot();
  process.env.BLOG_TOOL_TOOL_ROOT = getRuntimeRoot();
  process.env.BLOG_TOOL_STORAGE_ROOT = getStorageRoot();

  const { startServer } = await importServerModule();
  return startServer({ port: 0 });
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.setSkipTaskbar(false);
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.hide();
  mainWindow.setSkipTaskbar(true);
}

function createTray() {
  if (tray) {
    return tray;
  }

  const trayIcon = nativeImage.createFromPath(getTrayIconPath()).resize({
    width: 16,
    height: 16,
  });

  tray = new Tray(trayIcon);
  tray.setToolTip("BlogTool");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开 BlogTool",
        click: restoreMainWindow,
      },
      {
        label: "检查更新",
        click: () => {
          void checkForAppUpdates({ manual: true });
        },
      },
      {
        type: "separator",
      },
      {
        label: "退出",
        click: () => {
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", restoreMainWindow);
  tray.on("double-click", restoreMainWindow);

  return tray;
}

function requestQuitAndInstallUpdate() {
  if (isQuitting) {
    return;
  }

  isQuitting = true;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }

  closeServer()
    .catch(() => {})
    .finally(() => {
      autoUpdater.quitAndInstall(false, true);
    });
}

function configureAutoUpdater() {
  if (!canUseAutoUpdater() || updaterConfigured) {
    return;
  }

  updaterConfigured = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", async (error) => {
    console.error("Auto update failed:", error);

    if (!pendingManualUpdateCheck) {
      return;
    }

    pendingManualUpdateCheck = false;
    await dialog.showMessageBox({
      type: "error",
      title: "检查更新失败",
      message: "无法检查更新。",
      detail: error?.message || String(error),
    });
  });

  autoUpdater.on("update-available", async (info) => {
    if (!pendingManualUpdateCheck) {
      return;
    }

    pendingManualUpdateCheck = false;
    await dialog.showMessageBox({
      type: "info",
      title: "发现新版本",
      message: `检测到新版本 ${info.version}，正在后台下载。`,
      detail: "下载完成后会再次提示安装。",
    });
  });

  autoUpdater.on("update-not-available", async () => {
    if (!pendingManualUpdateCheck) {
      return;
    }

    pendingManualUpdateCheck = false;
    await dialog.showMessageBox({
      type: "info",
      title: "已是最新版本",
      message: "当前已安装最新版本。",
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    pendingManualUpdateCheck = false;

    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "更新已下载",
      buttons: ["立即安装", "稍后"],
      defaultId: 0,
      cancelId: 1,
      message: `新版本 ${info.version} 已下载完成。`,
      detail: "点击“立即安装”将退出程序并安装更新；或者稍后通过退出程序自动安装。",
    });

    if (response === 0) {
      requestQuitAndInstallUpdate();
    }
  });
}

async function checkForAppUpdates({ manual = false } = {}) {
  if (!canUseAutoUpdater()) {
    return;
  }

  configureAutoUpdater();
  pendingManualUpdateCheck = manual;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("Check for updates failed:", error);
  }
}

async function createMainWindow() {
  serverHandle = await startEmbeddedServer();

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    show: false,
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    backgroundColor: "#f4efe6",
    title: "BlogTool",
  });
  mainWindow = window;
  createTray();

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    // 右上角 X 仅隐藏窗口到系统托盘，保持后台进程运行
    event.preventDefault();
    hideMainWindow();
  });

  window.once("ready-to-show", () => {
    window.setSkipTaskbar(false);
    window.show();
  });

  await window.loadURL(`http://127.0.0.1:${serverHandle.actualPort}`);

  if (canUseAutoUpdater()) {
    void checkForAppUpdates();
    setInterval(() => {
      void checkForAppUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
  }
}

function closeServer() {
  if (!serverHandle?.server) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    serverHandle.server.close(() => {
      resolve();
    });
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    restoreMainWindow();
  });
}

app.on("window-all-closed", () => {
  if (isQuitting) {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  event.preventDefault();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }

  closeServer()
    .catch(() => {})
    .finally(() => {
      app.quit();
    });
});

if (gotSingleInstanceLock) {
  app.whenReady()
    .then(createMainWindow)
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox("BlogTool 启动失败", error?.stack || error?.message || String(error));
      app.exit(1);
    });
}
