import fs from 'node:fs';
import path from 'node:path';
import {
  getFilesRoot,
  getMaxUploadBytes,
  getScanInboxPath,
} from './settings.js';
import { isInsideRoot } from './files.js';

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']);

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export { getScanInboxPath };

export async function ensureInboxDirs() {
  const inbox = await getScanInboxPath();
  const processed = path.join(inbox, 'processed');
  const failed = path.join(inbox, 'failed');
  for (const dir of [inbox, processed, failed]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { inbox, processed, failed };
}

function isStableFile(absPath) {
  try {
    const a = fs.statSync(absPath);
    // Skip directories and zero-byte placeholders still being written
    if (!a.isFile() || a.size === 0) return false;
    return true;
  } catch {
    return false;
  }
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

  const st = fs.statSync(abs);
  if (st.size > maxBytes) {
    throw Object.assign(new Error(`File exceeds ${maxBytes} bytes`), { code: 'TOO_LARGE' });
  }

  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw Object.assign(new Error('File type not allowed'), { code: 'VALIDATION' });
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
    mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
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
