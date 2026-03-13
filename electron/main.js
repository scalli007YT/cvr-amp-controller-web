const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");

const PORT = 3000;
const isDev = !!process.env.ELECTRON_DEV;

let mainWindow;
let server;

// Prevent multiple app instances.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// --- Server ---------------------------------------------------------------

/** Dev: poll until the external `next dev` process responds. */
function waitForDevServer() {
  return new Promise((resolve) => {
    const poll = () => {
      http
        .get(`http://localhost:${PORT}/`, (res) => {
          if (res.statusCode < 500) resolve();
          else setTimeout(poll, 300);
        })
        .on("error", () => setTimeout(poll, 300));
    };
    poll();
  });
}

/** Prod: start Next.js server in-process (packaged-safe, no child fork). */
async function startServer() {
  const appRoot = path.join(__dirname, "..");
  process.env.APP_USER_DATA = app.getPath("userData");

  // Resolve from packaged app dependencies.
  const next = require("next");
  const nextApp = next({
    dev: false,
    dir: appRoot,
    port: PORT,
    hostname: "127.0.0.1",
  });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  await new Promise((resolve, reject) => {
    server = http
      .createServer((req, res) => handle(req, res))
      .listen(PORT, "127.0.0.1", (err) => {
        if (err) reject(err);
        else resolve();
      });
  });
}

// --- Window ---------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#121212",
    show: true,
    title: "CVR AMP Controller",
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const emitWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(
      "window:maximized-changed",
      mainWindow.isMaximized(),
    );
  };

  mainWindow.on("maximize", emitWindowState);
  mainWindow.on("unmaximize", emitWindowState);
  mainWindow.on("enter-full-screen", emitWindowState);
  mainWindow.on("leave-full-screen", emitWindowState);

  mainWindow.loadFile(path.join(__dirname, "splash.html"));
}

ipcMain.handle("window:minimize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.minimize();
  return true;
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.close();
  return true;
});

ipcMain.handle("window:is-maximized", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isMaximized();
});

// --- Lifecycle ------------------------------------------------------------

app.whenReady().then(() => {
  const serverReady = isDev ? waitForDevServer() : startServer();

  createWindow();

  serverReady
    .then(async () => {
      const url = isDev
        ? `http://localhost:${PORT}`
        : `http://127.0.0.1:${PORT}`;

      if (!mainWindow || mainWindow.isDestroyed()) return;

      try {
        // Ask splash page to fade out before navigation.
        const fadeMs = await mainWindow.webContents.executeJavaScript(
          "window.startFadeOut ? window.startFadeOut() : 0",
        );
        setTimeout(
          () => {
            if (mainWindow && !mainWindow.isDestroyed())
              mainWindow.loadURL(url);
          },
          Number(fadeMs) || 0,
        );
      } catch {
        // If JS execution fails, fall back to immediate navigation.
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(url);
      }
    })
    .catch((err) => {
      console.error("Failed to start app server:", err);
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (server) server.close();
  app.quit();
});
