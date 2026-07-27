import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db/pool.js';
import { config } from '../config.js';

export async function getAppSetting(key, fallback = null) {
  const { rows } = await query(
    'SELECT value FROM app_settings WHERE key = $1',
    [key],
  );
  if (!rows[0]) return fallback;
  return rows[0].value;
}

export async function setAppSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export async function getFilesRoot() {
  const fromDb = await getAppSetting('files_root', null);
  if (typeof fromDb === 'string' && fromDb.trim()) return fromDb.trim();
  return config.filesRoot;
}

export async function getMaxUploadBytes() {
  const fromDb = await getAppSetting('max_upload_bytes', null);
  const n = Number(fromDb);
  if (Number.isFinite(n) && n > 0) return Math.min(n, 31457280);
  return config.maxUploadBytes;
}

export async function getScanInboxPath() {
  const fromDb = await getAppSetting('scan_inbox_path', null);
  if (typeof fromDb === 'string' && fromDb.trim()) return fromDb.trim();
  if (config.scanInboxPath) return config.scanInboxPath;
  const root = await getFilesRoot();
  return path.join(root, 'inbox');
}

export async function getBackupsRoot() {
  const fromDb = await getAppSetting('backups_root', null);
  if (typeof fromDb === 'string' && fromDb.trim()) return fromDb.trim();
  return config.backupsRoot;
}

/**
 * Require an absolute filesystem path (Windows drive / UNC / POSIX root).
 * @returns {string} normalized absolute path
 */
export function assertAbsolutePath(input, label = 'Path') {
  const raw = String(input ?? '').trim();
  if (!raw) {
    const err = new Error(`${label} is required`);
    err.code = 'VALIDATION';
    throw err;
  }
  if (!path.isAbsolute(raw)) {
    const err = new Error(
      `${label} must be an absolute path (e.g. C:\\\\nsc-erms-files\\\\inbox)`,
    );
    err.code = 'VALIDATION';
    throw err;
  }
  return path.normalize(raw);
}

function ensureWritableDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.accessSync(dirPath, fs.constants.W_OK);
  return dirPath;
}

/**
 * Create/validate scan inbox (+ processed/failed) or backups root.
 */
export function ensureStorageDir(kind, dirPath) {
  const abs = assertAbsolutePath(dirPath, kind === 'inbox' ? 'Scan inbox path' : 'Backup path');
  if (kind === 'inbox') {
    ensureWritableDir(abs);
    ensureWritableDir(path.join(abs, 'processed'));
    ensureWritableDir(path.join(abs, 'failed'));
  } else {
    ensureWritableDir(abs);
  }
  return abs;
}

export async function getStoragePaths() {
  const [filesRootDb, scanFromDb, backupsFromDb] = await Promise.all([
    getAppSetting('files_root', null),
    getAppSetting('scan_inbox_path', null),
    getAppSetting('backups_root', null),
  ]);

  const filesRoot =
    typeof filesRootDb === 'string' && filesRootDb.trim()
      ? filesRootDb.trim()
      : config.filesRoot;

  const scanInboxPath =
    typeof scanFromDb === 'string' && scanFromDb.trim()
      ? scanFromDb.trim()
      : config.scanInboxPath || path.join(filesRoot, 'inbox');

  const backupsRoot =
    typeof backupsFromDb === 'string' && backupsFromDb.trim()
      ? backupsFromDb.trim()
      : config.backupsRoot;

  return {
    filesRoot,
    scanInboxPath,
    backupsRoot,
    sources: {
      filesRoot: typeof filesRootDb === 'string' && filesRootDb.trim() ? 'settings' : 'env',
      scanInboxPath:
        typeof scanFromDb === 'string' && String(scanFromDb).trim()
          ? 'settings'
          : config.scanInboxPath
            ? 'env'
            : 'default',
      backupsRoot:
        typeof backupsFromDb === 'string' && String(backupsFromDb).trim()
          ? 'settings'
          : 'env',
    },
  };
}

/**
 * Validate and optionally persist scan inbox / backup paths.
 * Does not move existing files.
 */
export async function updateStoragePaths(
  { scanInboxPath, backupsRoot },
  { persist = true } = {},
) {
  const next = {};

  if (scanInboxPath !== undefined) {
    next.scanInboxPath = ensureStorageDir('inbox', scanInboxPath);
  }
  if (backupsRoot !== undefined) {
    next.backupsRoot = ensureStorageDir('backups', backupsRoot);
  }

  if (!persist) {
    return next;
  }

  if (next.scanInboxPath) {
    await setAppSetting('scan_inbox_path', next.scanInboxPath);
  }
  if (next.backupsRoot) {
    await setAppSetting('backups_root', next.backupsRoot);
  }

  return {
    ...(await getStoragePaths()),
    updated: next,
  };
}
