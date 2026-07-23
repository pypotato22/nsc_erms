const { app, BrowserWindow, shell, ipcMain, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SERVER_URL = 'https://localhost:3443';
const PROBE_TIMEOUT_MS = 5000;

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {string | null} */
let allowedOrigin = null;
/** @type {{ lastUrl: string, error: string | null, checking: boolean }} */
let bootState = { lastUrl: DEFAULT_SERVER_URL, error: null, checking: true };

function getConfigPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'config.json');
  }
  return path.join(__dirname, 'config.json');
}

/**
 * Resolve ERMS server URL from (in order):
 * 1. ERMS_SERVER_URL env
 * 2. config.json beside the exe (packaged) or electron/config.json (dev)
 * 3. Default HTTPS localhost
 */
function resolveServerUrl() {
  const fromEnv = process.env.ERMS_SERVER_URL?.trim();
  if (fromEnv) return normalizeServerUrl(fromEnv);

  try {
    const file = getConfigPath();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : '';
      if (url) return normalizeServerUrl(url);
    }
  } catch (err) {
    console.warn('[electron] Failed to read config:', err.message);
  }

  // Dev fallback: also check electron/config.json if packaged path differed
  if (!app.isPackaged) {
    try {
      const file = path.join(__dirname, 'config.json');
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const url = typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : '';
        if (url) return normalizeServerUrl(url);
      }
    } catch { /* ignore */ }
  }

  return DEFAULT_SERVER_URL;
}

function normalizeServerUrl(input) {
  const trimmed = String(input || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Server URL is empty.');

  let parsed;
  if (/^https?:\/\//i.test(trimmed)) {
    parsed = new URL(trimmed);
  } else {
    parsed = new URL(`https://${trimmed}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function saveServerUrl(url) {
  const file = getConfigPath();
  fs.writeFileSync(file, `${JSON.stringify({ serverUrl: url }, null, 2)}\n`, 'utf8');
}

function setAllowedOrigin(url) {
  allowedOrigin = new URL(url).origin;
}

function isAllowedNavigation(url) {
  // Print helpers use blank / blob windows
  if (!url || url === 'about:blank') return true;
  if (
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('file://')
  ) {
    return true;
  }
  if (!allowedOrigin) return false;
  try {
    return new URL(url).origin === allowedOrigin;
  } catch {
    return false;
  }
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

/**
 * Probe ERMS health endpoint. Accepts http and https.
 */
async function probeServer(serverUrl) {
  const healthUrl = new URL('/api/v1/health', `${serverUrl}/`).href;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await net.fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Server responded at ${serverUrl} but health check failed (HTTP ${res.status}).`,
      };
    }
    return { ok: true };
  } catch (err) {
    const reason =
      err?.name === 'AbortError'
        ? 'Timed out waiting for the server.'
        : err?.message || 'Network error.';
    return {
      ok: false,
      error: `Could not reach ${serverUrl}. ${reason}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadServerApp(serverUrl) {
  setAllowedOrigin(serverUrl);
  bootState = { lastUrl: serverUrl, error: null, checking: false };
  console.log(`[electron] Loading ${serverUrl}`);
  await mainWindow.loadURL(serverUrl);
}

async function showConnectionScreen(lastUrl, error, checking = false) {
  allowedOrigin = null;
  bootState = {
    lastUrl: lastUrl || DEFAULT_SERVER_URL,
    error: error || null,
    checking: Boolean(checking),
  };
  await mainWindow.loadFile(path.join(__dirname, 'connection.html'));
  if (!checking && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('boot:ready', bootState);
  }
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

ipcMain.handle('boot:get-state', () => bootState);

ipcMain.handle('boot:connect', async (_event, rawUrl) => {
  let serverUrl;
  try {
    serverUrl = normalizeServerUrl(rawUrl);
  } catch (err) {
    return { ok: false, error: err.message || 'Invalid server URL.' };
  }

  const probe = await probeServer(serverUrl);
  if (!probe.ok) return probe;

  try {
    saveServerUrl(serverUrl);
  } catch (err) {
    console.warn('[electron] Could not save config:', err.message);
  }

  try {
    await loadServerApp(serverUrl);
    return { ok: true };
  } catch (err) {
    const message = err?.message || 'Failed to open the ERMS app.';
    await showConnectionScreen(serverUrl, message);
    return { ok: false, error: message };
  }
});

async function createWindow() {
  const savedUrl = resolveServerUrl();
  bootState = { lastUrl: savedUrl, error: null, checking: true };

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'NSC-ERMS',
    icon: getIconPath(),
    show: false,
    frame: false,
    backgroundColor: '#062b6e',
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await showConnectionScreen(savedUrl, null, true);

  console.log(`[electron] Probing ${savedUrl}`);
  const probe = await probeServer(savedUrl);
  if (probe.ok) {
    try {
      await loadServerApp(savedUrl);
      return;
    } catch (err) {
      console.error('[electron] loadURL failed:', err.message);
      await showConnectionScreen(
        savedUrl,
        `Reached health check but could not open the app: ${err.message}`,
        false,
      );
      return;
    }
  }

  console.warn('[electron]', probe.error);
  bootState = { lastUrl: savedUrl, error: probe.error, checking: false };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('boot:ready', bootState);
  }
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
