import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getFilesRoot } from './settings.js';
import { coercePdsFromRow, normalizePds } from './pds.js';
import { PDS_TEMPLATE_PATH } from './pdsExcel.js';

/** Bump when cache payload shape or Excel/PDF layout (e.g. photo size) changes. */
const CACHE_SCHEMA = 3;

/** Default max-age for cached PDFs (7 days). Override via PDS_PDF_CACHE_TTL_MS env. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheTtlMs() {
  const env = process.env.PDS_PDF_CACHE_TTL_MS;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TTL_MS;
}

function cacheEnabled() {
  const v = String(process.env.PDS_PDF_CACHE ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function templateFingerprint() {
  try {
    const st = fsSync.statSync(PDS_TEMPLATE_PATH);
    return `${st.size}-${Math.floor(st.mtimeMs)}`;
  } catch {
    return 'missing';
  }
}

/**
 * Stable hash of everything that affects generated PDS Excel/PDF output.
 * @param {object} employee mapped employee row (from mapEmployee)
 */
export function pdsPdfCacheKey(employee) {
  const pds = normalizePds(
    coercePdsFromRow(employee?.pds, {
      first_name: employee?.firstName,
      last_name: employee?.lastName,
      middle_name: employee?.middleName,
      name_extension: employee?.nameExtension,
      email: employee?.email,
      contact_number: employee?.contactNumber,
      employee_no: employee?.employeeNo,
      sex: employee?.sex,
      birth_date: employee?.birthDate,
      address: employee?.address,
    }),
  );

  const payload = JSON.stringify({
    schema: CACHE_SCHEMA,
    template: templateFingerprint(),
    profilePicturePath: employee?.profilePicturePath || null,
    pds,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function employeeCacheDir(employeeId) {
  const root = await getFilesRoot();
  return path.join(root, 'cache', 'pds-pdf', String(employeeId));
}

function cachePaths(employeeId, key) {
  const dir = path.join('cache', 'pds-pdf', String(employeeId));
  return {
    pdfRel: path.join(dir, `${key}.pdf`),
    metaRel: path.join(dir, `${key}.json`),
  };
}

/**
 * @param {object} employee
 * @returns {Promise<{ pdf: Buffer, engine: string } | null>}
 */
export async function getCachedPdsPdf(employee) {
  if (!cacheEnabled() || !employee?.id) return null;

  const key = pdsPdfCacheKey(employee);
  const root = await getFilesRoot();
  const { pdfRel, metaRel } = cachePaths(employee.id, key);
  const pdfAbs = path.join(root, pdfRel);
  const metaAbs = path.join(root, metaRel);

  if (!fsSync.existsSync(pdfAbs)) return null;

  try {
    const stat = await fs.stat(pdfAbs);
    if (Date.now() - stat.mtimeMs > cacheTtlMs()) {
      await fs.rm(path.dirname(pdfAbs), { recursive: true, force: true }).catch(() => {});
      return null;
    }
  } catch {
    return null;
  }

  const pdf = await fs.readFile(pdfAbs);
  let engine = 'excel-com';
  try {
    if (fsSync.existsSync(metaAbs)) {
      const meta = JSON.parse(await fs.readFile(metaAbs, 'utf8'));
      if (meta?.engine) engine = String(meta.engine);
    }
  } catch {
    /* ignore corrupt meta */
  }

  return { pdf, engine };
}

/**
 * @param {object} employee
 * @param {Buffer} pdf
 * @param {'libreoffice'|'excel-com'} engine
 */
export async function putCachedPdsPdf(employee, pdf, engine) {
  if (!cacheEnabled() || !employee?.id || !pdf?.length) return;

  const key = pdsPdfCacheKey(employee);
  const dir = await employeeCacheDir(employee.id);
  await fs.mkdir(dir, { recursive: true });

  const pdfPath = path.join(dir, `${key}.pdf`);
  const metaPath = path.join(dir, `${key}.json`);
  await fs.writeFile(pdfPath, pdf);
  await fs.writeFile(
    metaPath,
    JSON.stringify({ engine, key, createdAt: new Date().toISOString() }),
    'utf8',
  );

  await pruneStaleCacheEntries(dir, key);
}

async function pruneStaleCacheEntries(dir, keepKey) {
  const files = await fs.readdir(dir).catch(() => []);
  for (const name of files) {
    const base = name.replace(/\.(pdf|json)$/i, '');
    if (base && base !== keepKey) {
      await fs.unlink(path.join(dir, name)).catch(() => {});
    }
  }
}

/** Remove all cached PDFs for an employee (call after PDS/photo changes). */
export async function invalidatePdsPdfCache(employeeId) {
  if (!employeeId) return;
  const dir = await employeeCacheDir(employeeId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Remove all cache entries older than the configured TTL.
 * Safe to call periodically (e.g. on server start or via cron).
 * @returns {Promise<number>} number of employee dirs pruned
 */
export async function pruneExpiredPdsPdfCache() {
  if (!cacheEnabled()) return 0;
  const root = await getFilesRoot();
  const cacheRoot = path.join(root, 'cache', 'pds-pdf');
  let dirs;
  try {
    dirs = await fs.readdir(cacheRoot);
  } catch {
    return 0;
  }
  const ttl = cacheTtlMs();
  let pruned = 0;
  for (const empDir of dirs) {
    const empPath = path.join(cacheRoot, empDir);
    let files;
    try {
      files = await fs.readdir(empPath);
    } catch {
      continue;
    }
    let allExpired = true;
    for (const file of files) {
      if (!file.endsWith('.pdf')) continue;
      try {
        const stat = await fs.stat(path.join(empPath, file));
        if (Date.now() - stat.mtimeMs <= ttl) {
          allExpired = false;
        }
      } catch {
        /* skip */
      }
    }
    if (allExpired && files.length > 0) {
      await fs.rm(empPath, { recursive: true, force: true }).catch(() => {});
      pruned++;
    }
  }
  return pruned;
}

export function isPdsPdfCacheEnabled() {
  return cacheEnabled();
}
