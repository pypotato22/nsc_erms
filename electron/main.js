const { app, BrowserWindow, shell, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SERVER_URL = 'https://localhost:3443';

/**
 * Resolve ERMS server URL from (in order):
 * 1. ERMS_SERVER_URL env
 * 2. config.json beside the exe (packaged) or electron/config.json (dev)
 * 3. Default HTTPS localhost
 */
function resolveServerUrl() {
  const fromEnv = process.env.ERMS_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(path.dirname(process.execPath), 'config.json'));
  }
  candidates.push(path.join(__dirname, 'config.json'));

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : '';
      if (url) return url.replace(/\/$/, '');
    } catch (err) {
      console.warn(`[electron] Failed to read ${file}:`, err.message);
    }
  }

  return DEFAULT_SERVER_URL;
}

function getIconPath() {
  const ico = path.join(__dirname, 'assets', 'icon.ico');
  const png = path.join(__dirname, 'assets', 'icon.png');
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return undefined;
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.handle('window:minimize', (event) => {
  windowFromEvent(event)?.minimize();
});

ipcMain.handle('window:maximize-toggle', (event) => {
  const win = windowFromEvent(event);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle('window:close', (event) => {
  windowFromEvent(event)?.close();
});

ipcMain.handle('window:is-maximized', (event) => {
  return Boolean(windowFromEvent(event)?.isMaximized());
});

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  const serverUrl = resolveServerUrl();
  let allowedOrigin;
  try {
    allowedOrigin = new URL(serverUrl).origin;
  } catch {
    console.error(`[electron] Invalid server URL: ${serverUrl}`);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'NSC-ERMS',
    icon: getIconPath(),
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const notifyMaximize = () => {
    mainWindow?.webContents.send(
      'window:maximize-changed',
      mainWindow.isMaximized(),
    );
  };
  mainWindow.on('maximize', notifyMaximize);
  mainWindow.on('unmaximize', notifyMaximize);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === allowedOrigin) {
        return { action: 'allow' };
      }
    } catch { /* ignore */ }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === allowedOrigin) return;
    } catch { /* deny below */ }
    event.preventDefault();
    shell.openExternal(url);
  });

  console.log(`[electron] Loading ${serverUrl}`);
  mainWindow.loadURL(serverUrl).catch((err) => {
    console.error('[electron] Failed to load server URL:', err.message);
    const msg =
      `Could not reach ERMS at ${serverUrl}. ` +
      'Check that the server is running and set ERMS_SERVER_URL or electron/config.json.';
    mainWindow?.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:36rem">' +
            `<h1>NSC-ERMS</h1><p>${msg}</p></body></html>`,
        ),
    );
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
