import fs from 'node:fs';
import path from 'node:path';
import {
  getFilesRoot,
  getMaxUploadBytes,
  getScanInboxPath,
} from './settings.js';
import { isInsideRoot } from './files.js';
import { assertAllowedBuffer, MIME } from './fileMagic.js';

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']);

const MIME_BY_EXT = {
  '.pdf': MIME.PDF,
  '.jpg': MIME.JPEG,
  '.jpeg': MIME.JPEG,
  '.png': MIME.PNG,
  '.doc': MIME.DOC,
  '.docx': MIME.DOCX,
};

const ALLOWED_SCAN_MIME = new Set([
  MIME.PDF,
  MIME.JPEG,
  MIME.PNG,
  MIME.DOC,
  MIME.DOCX,
]);

export { getScanInboxPath };

/** Minimum age (ms) since last mtime before an inbox file is claimable. */
export const SCAN_STABLE_MS = 1500;

/**
 * True when the file exists, is non-empty, and has not been modified recently
 * (avoids claiming a scanner file still being written).
 * @param {string} absPath
 * @param {{ now?: number, stableMs?: number }} [opts]
 */
export function isStableFile(absPath, opts = {}) {
  const now = opts.now ?? Date.now();
  const stableMs = opts.stableMs ?? SCAN_STABLE_MS;
  try {
    const a = fs.statSync(absPath);
    if (!a.isFile() || a.size === 0) return false;
    const mtimeMs = a.mtimeMs ?? a.mtime.getTime();
    if (now - mtimeMs < stableMs) return false;
    return true;
  } catch {
    return false;
  }
}

export async function ensureInboxDirs() {
  const inbox = await getScanInboxPath();
  const processed = path.join(inbox, 'processed');
  const failed = path.join(inbox, 'failed');
  for (const dir of [inbox, processed, failed]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { inbox, processed, failed };
}

export async function listInboxFiles() {
  const { inbox } = await ensureInboxDirs();
  const maxBytes = await getMaxUploadBytes();
  const entries = fs.readdirSync(inbox, { withFileTypes: true });

  const files = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;

    const abs = path.join(inbox, ent.name);
    if (!isStableFile(abs)) continue;

    const st = fs.statSync(abs);
    files.push({
      name: ent.name,
      size: st.size,
      mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
      modifiedAt: st.mtime.toISOString(),
      tooLarge: st.size > maxBytes,
      maxBytes,
    });
  }

  files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  return { inboxPath: inbox, files };
}

export function resolveInboxFile(inbox, fileName) {
  const base = path.basename(fileName);
  if (base !== fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Invalid file name');
  }
  const abs = path.join(inbox, base);
  const resolved = path.resolve(abs);
  if (!isInsideRoot(inbox, resolved)) {
    throw new Error('Invalid file path');
  }
  return { base, abs: resolved };
}

export async function rejectInboxFile(fileName, reason = '') {
  const { inbox, failed } = await ensureInboxDirs();
  const { base, abs } = resolveInboxFile(inbox, fileName);
  if (!fs.existsSync(abs)) throw Object.assign(new Error('File not found'), { code: 'NOT_FOUND' });

  const destName = `${Date.now()}_${base}`;
  const dest = path.join(failed, destName);
  fs.renameSync(abs, dest);
  if (reason) {
    fs.writeFileSync(`${dest}.reason.txt`, reason, 'utf8');
  }
  return { movedTo: dest };
}

/**
 * Move inbox file into employee documents folder and return storage metadata.
 */
export async function claimInboxFileForEmployee({ fileName, employeeId, documentId }) {
  const { inbox, processed } = await ensureInboxDirs();
  const maxBytes = await getMaxUploadBytes();
  const { base, abs } = resolveInboxFile(inbox, fileName);

  if (!fs.existsSync(abs)) {
    throw Object.assign(new Error('File not found in inbox'), { code: 'NOT_FOUND' });
  }

  if (!isStableFile(abs)) {
    throw Object.assign(
      new Error('File is still being written; wait a moment and try again'),
      { code: 'VALIDATION' },
    );
  }

  const st = fs.statSync(abs);
  if (st.size > maxBytes) {
    throw Object.assign(new Error(`File exceeds ${maxBytes} bytes`), { code: 'TOO_LARGE' });
  }

  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw Object.assign(new Error('File type not allowed'), { code: 'VALIDATION' });
  }

  // Read a prefix for magic-byte check before moving the file
  const fd = fs.openSync(abs, 'r');
  let head;
  try {
    const len = Math.min(st.size, 8192);
    head = Buffer.alloc(len);
    fs.readSync(fd, head, 0, len, 0);
  } finally {
    fs.closeSync(fd);
  }

  let mimeType;
  try {
    mimeType = assertAllowedBuffer(head, ALLOWED_SCAN_MIME);
  } catch (magicErr) {
    throw Object.assign(new Error(magicErr.message || 'File type not allowed'), {
      code: 'VALIDATION',
    });
  }

  // Extension should agree with sniffed type (blocks .pdf that is really an exe, etc.)
  const expected = MIME_BY_EXT[ext];
  if (expected && expected !== mimeType) {
    throw Object.assign(
      new Error(`File extension ${ext} does not match file content`),
      { code: 'VALIDATION' },
    );
  }

  const root = await getFilesRoot();
  const empDir = path.join(root, 'employees', employeeId, 'documents');
  fs.mkdirSync(empDir, { recursive: true });

  const storedName = `${documentId}_${base}`;
  const destAbs = path.join(empDir, storedName);
  fs.renameSync(abs, destAbs);

  // Keep a copy reference in processed (empty marker with original name)
  try {
    fs.writeFileSync(
      path.join(processed, `${Date.now()}_${base}.claimed.txt`),
      `employeeId=${employeeId}\ndocumentId=${documentId}\n`,
      'utf8',
    );
  } catch {
    /* non-fatal */
  }

  const relativePath = path.relative(root, destAbs).split(path.sep).join('/');
  return {
    originalName: base,
    storedName,
    relativePath,
    absolutePath: destAbs,
    inboxAbsolutePath: abs,
    fileSize: st.size,
    mimeType,
  };
}

/**
 * If DB insert fails after a successful claim, move the file back into the inbox.
 */
export function restoreClaimedToInbox(inbox, absolutePath, originalName) {
  if (!absolutePath || !originalName) return false;
  if (!fs.existsSync(absolutePath)) return false;
  const preferred = path.join(inbox, path.basename(originalName));
  const dest = fs.existsSync(preferred)
    ? path.join(inbox, `${Date.now()}_restored_${path.basename(originalName)}`)
    : preferred;
  if (!isInsideRoot(inbox, dest)) {
    throw new Error('Invalid restore destination');
  }
  fs.renameSync(absolutePath, dest);
  return true;
}

export async function restoreClaimedInboxFile({ absolutePath, originalName }) {
  const { inbox } = await ensureInboxDirs();
  return restoreClaimedToInbox(inbox, absolutePath, originalName);
}

// ── Preview + rename ────────────────────────────────────────────────────────

const MAX_STEM_LENGTH = 150;
const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

function validationError(message) {
  return Object.assign(new Error(message), { code: 'VALIDATION' });
}

/**
 * Validate a user-supplied new name and return the final inbox file name.
 * The original extension is always kept (a typed extension that matches is
 * ignored; the extension of a scan can't be changed from the UI).
 */
export function buildRenamedInboxName(currentName, requestedName) {
  const ext = path.extname(currentName);
  let stem = String(requestedName ?? '').trim();
  if (ext && stem.toLowerCase().endsWith(ext.toLowerCase())) {
    stem = stem.slice(0, -ext.length);
  }
  // Windows silently strips trailing dots/spaces; reject instead of surprising users.
  stem = stem.replace(/[. ]+$/, '').trim();

  if (!stem) throw validationError('File name is required');
  if (stem.length > MAX_STEM_LENGTH) {
    throw validationError(`File name must be ${MAX_STEM_LENGTH} characters or fewer`);
  }
  if (ILLEGAL_NAME_CHARS.test(stem)) {
    throw validationError('File name cannot contain  < > : " / \\ | ? *');
  }
  if (RESERVED_WINDOWS_NAMES.test(stem)) {
    throw validationError('That file name is reserved by Windows');
  }
  return `${stem}${ext}`;
}

/** Rename a file inside the inbox. Returns { name } (the new file name). */
export async function renameInboxFile(fileName, requestedName) {
  const { inbox } = await ensureInboxDirs();
  const { base, abs } = resolveInboxFile(inbox, fileName);
  if (!fs.existsSync(abs)) {
    throw Object.assign(new Error('File not found'), { code: 'NOT_FOUND' });
  }
  if (!isStableFile(abs)) {
    throw validationError('File is still being written; wait a moment and try again');
  }

  const nextName = buildRenamedInboxName(base, requestedName);
  if (nextName === base) return { name: base, unchanged: true };

  const { abs: destAbs } = resolveInboxFile(inbox, nextName);
  const caseOnlyChange = nextName.toLowerCase() === base.toLowerCase();
  if (!caseOnlyChange && fs.existsSync(destAbs)) {
    throw Object.assign(new Error(`A file named "${nextName}" already exists in the inbox`), {
      code: 'EXISTS',
    });
  }
  fs.renameSync(abs, destAbs);
  return { name: nextName, unchanged: false };
}

/** Resolve an inbox file for streaming to the preview pane. */
export async function getInboxFileForRead(fileName) {
  const { inbox } = await ensureInboxDirs();
  const { base, abs } = resolveInboxFile(inbox, fileName);
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext) || !fs.existsSync(abs)) {
    throw Object.assign(new Error('File not found'), { code: 'NOT_FOUND' });
  }
  return {
    base,
    abs,
    mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
  };
}
