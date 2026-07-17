import fs from 'node:fs';
import path from 'node:path';
import { getFilesRoot } from './settings.js';

const SAFE_NAME = /[^a-zA-Z0-9._-]+/g;

export function sanitizeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(SAFE_NAME, '_');
  return base.slice(0, 180) || 'file';
}

export async function ensureEmployeeDir(employeeId) {
  const root = await getFilesRoot();
  const dir = path.join(root, 'employees', employeeId, 'documents');
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}

export async function ensureEmployeePhotoDir(employeeId) {
  const root = await getFilesRoot();
  const dir = path.join(root, 'employees', employeeId);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}

export function absoluteFromRelative(root, relativePath) {
  const abs = path.resolve(root, relativePath);
  const rootAbs = path.resolve(root);
  if (!abs.startsWith(rootAbs)) {
    throw new Error('Invalid storage path');
  }
  return abs;
}

export async function writeEmployeeDocument({
  employeeId,
  documentId,
  originalName,
  buffer,
}) {
  const { root, dir } = await ensureEmployeeDir(employeeId);
  const safe = sanitizeFileName(originalName);
  const storedName = `${documentId}_${safe}`;
  const abs = path.join(dir, storedName);
  fs.writeFileSync(abs, buffer);
  const relative = path
    .relative(root, abs)
    .split(path.sep)
    .join('/');
  return { root, storedName, relativePath: relative, absolutePath: abs };
}

export async function writeEmployeePhoto({ employeeId, originalName, buffer }) {
  const { root, dir } = await ensureEmployeePhotoDir(employeeId);
  const ext = path.extname(sanitizeFileName(originalName)) || '.jpg';
  const storedName = `photo${ext}`;
  const abs = path.join(dir, storedName);
  fs.writeFileSync(abs, buffer);
  const relative = path
    .relative(root, abs)
    .split(path.sep)
    .join('/');
  return { root, storedName, relativePath: relative, absolutePath: abs };
}

/** Permanently remove a file under FILES_ROOT. Returns true if deleted. */
export async function removeStoredFile(relativePath) {
  if (!relativePath) return false;
  const root = await getFilesRoot();
  const abs = absoluteFromRelative(root, relativePath);
  if (!fs.existsSync(abs)) return false;
  fs.unlinkSync(abs);
  return true;
}
