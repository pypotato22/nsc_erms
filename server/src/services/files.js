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

/**
 * Resolve a path under FILES_ROOT and reject traversal / sibling-prefix escapes
 * (e.g. root `C:\storage` must not allow `C:\storage2\...`).
 */
export function isInsideRoot(root, candidateAbs) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(candidateAbs);
  const rel = path.relative(rootAbs, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function absoluteFromRelative(root, relativePath) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, relativePath);
  if (!isInsideRoot(rootAbs, abs)) {
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

export async function writeEmployeeSignature({ employeeId, originalName, buffer }) {
  const { root, dir } = await ensureEmployeePhotoDir(employeeId);
  const ext = path.extname(sanitizeFileName(originalName)) || '.png';
  const storedName = `signature${ext}`;
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

/** Best-effort unlink of an absolute path previously written under FILES_ROOT. */
export function rollbackAbsoluteFile(absolutePath) {
  if (!absolutePath) return false;
  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
  } catch (err) {
    console.error('Failed to rollback written file:', err.message);
  }
  return false;
}

/**
 * Remove an employee's storage directory (photo, signature + documents folder).
 * Safe if the directory is missing.
 */
export async function removeEmployeeStorage(employeeId) {
  if (!employeeId) return false;
  const root = await getFilesRoot();
  const dir = path.join(root, 'employees', String(employeeId));
  const rootAbs = path.resolve(root);
  const dirAbs = path.resolve(dir);
  if (!isInsideRoot(rootAbs, dirAbs)) {
    throw new Error('Invalid employee storage path');
  }
  if (!fs.existsSync(dirAbs)) return false;
  fs.rmSync(dirAbs, { recursive: true, force: true });
  return true;
}
