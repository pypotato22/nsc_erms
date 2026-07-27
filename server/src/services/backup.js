import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ulid } from 'ulid';
import { config, getPgConfig } from '../config.js';
import { getFilesRoot, getBackupsRoot } from './settings.js';

let _busy = false;

export function isBackupBusy() {
  return _busy;
}

export async function ensureBackupsRoot() {
  const root = await getBackupsRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(
          Object.assign(
            new Error(
              `"${command}" not found. Install PostgreSQL client tools and ensure they are on PATH, or set PG_DUMP_PATH.`,
            ),
            { code: 'MISSING_TOOL' },
          ),
        );
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          Object.assign(
            new Error(
              stderr.trim() || stdout.trim() || `${command} exited with code ${code}`,
            ),
            { code: 'COMMAND_FAILED', exitCode: code },
          ),
        );
      }
    });
  });
}

async function dumpDatabase(sqlPath) {
  const pg = getPgConfig();
  const pgDump = config.pgDumpPath || 'pg_dump';
  const env = { ...process.env };

  const args = ['--no-owner', '--no-acl', '-F', 'p', '-f', sqlPath];

  if (pg.connectionString) {
    args.push(pg.connectionString);
  } else {
    args.push('-h', String(pg.host));
    args.push('-p', String(pg.port));
    args.push('-U', String(pg.user));
    args.push('-d', String(pg.database));
    if (pg.password != null) env.PGPASSWORD = String(pg.password);
  }

  await runCommand(pgDump, args, { env });
}

async function archiveFolder(sourceDir, zipPath) {
  const entries = fs.readdirSync(sourceDir);
  if (!entries.length) {
    throw Object.assign(new Error('Nothing to archive'), { code: 'VALIDATION' });
  }

  if (process.platform === 'win32') {
    try {
      await runCommand('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path @(${entries
          .map((e) => `'${path.join(sourceDir, e).replace(/'/g, "''")}'`)
          .join(',')}) -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ]);
      return;
    } catch (err) {
      console.warn('[backup] Compress-Archive failed, falling back to tar:', err.message);
    }
  }

  await runCommand('tar', ['-a', '-c', '-f', zipPath, '-C', sourceDir, ...entries]);
}

function readMeta(metaPath) {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

export async function listBackups() {
  const root = await ensureBackupsRoot();
  const names = fs.readdirSync(root).filter((n) => n.endsWith('.meta.json'));
  const items = [];
  for (const name of names) {
    const meta = readMeta(path.join(root, name));
    if (!meta?.id) continue;
    const zipPath = path.join(root, meta.fileName || `${meta.id}.zip`);
    if (!fs.existsSync(zipPath)) continue;
    const st = fs.statSync(zipPath);
    items.push({
      id: meta.id,
      fileName: path.basename(zipPath),
      createdAt: meta.createdAt || st.mtime.toISOString(),
      createdBy: meta.createdBy || null,
      createdByName: meta.createdByName || null,
      sizeBytes: st.size,
      includesDatabase: meta.includesDatabase !== false,
      includesFiles: meta.includesFiles !== false,
    });
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

export async function getBackupPaths(id) {
  const root = await ensureBackupsRoot();
  const safeId = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeId) return null;
  const metaPath = path.join(root, `${safeId}.meta.json`);
  const meta = readMeta(metaPath);
  if (!meta) return null;
  const zipPath = path.join(root, meta.fileName || `${safeId}.zip`);
  if (!fs.existsSync(zipPath)) return null;
  return { meta, zipPath, metaPath };
}

/**
 * Creates a zip containing database.sql + files/ (copy of FILES_ROOT).
 */
export async function createBackup({ actorUserId, actorDisplayName }) {
  if (_busy) {
    const err = new Error('A backup is already in progress');
    err.code = 'BUSY';
    throw err;
  }
  _busy = true;

  const backupsRoot = await ensureBackupsRoot();
  const id = `nsc-erms-${stamp()}-${ulid().slice(-6).toLowerCase()}`;
  const workDir = path.join(backupsRoot, `.work-${id}`);
  const zipName = `${id}.zip`;
  const zipPath = path.join(backupsRoot, zipName);
  const metaPath = path.join(backupsRoot, `${id}.meta.json`);

  try {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });

    const sqlPath = path.join(workDir, 'database.sql');
    await dumpDatabase(sqlPath);

    const filesRoot = await getFilesRoot();
    const filesDest = path.join(workDir, 'files');
    fs.mkdirSync(filesDest, { recursive: true });
    if (fs.existsSync(filesRoot)) {
      fs.cpSync(filesRoot, filesDest, {
        recursive: true,
        filter: (src) => {
          const resolved = path.resolve(src);
          return (
            resolved !== path.resolve(backupsRoot) &&
            !resolved.startsWith(path.resolve(backupsRoot) + path.sep)
          );
        },
      });
    }

    const readme = [
      'NSC-ERMS backup archive',
      `Created: ${new Date().toISOString()}`,
      '',
      'Contents:',
      '  database.sql  — PostgreSQL dump (pg_dump plain SQL)',
      '  files/        — Copy of FILES_ROOT (employee photos & documents)',
      '',
      'Restore (ops — do this carefully on a maintenance window):',
      '  1. Stop the NSC-ERMS API',
      '  2. Unzip this archive (Windows: right-click → Extract All,',
      '     or PowerShell: Expand-Archive .\\this.zip -DestinationPath .\\restore)',
      '  3. Restore DB:  psql -U <user> -d <db> -f database.sql',
      '  4. Replace FILES_ROOT contents with the files/ folder',
      '  5. Start the API and verify login',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(workDir, 'README.txt'), readme, 'utf8');

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    await archiveFolder(workDir, zipPath);

    const sizeBytes = fs.statSync(zipPath).size;
    const meta = {
      id,
      fileName: zipName,
      createdAt: new Date().toISOString(),
      createdBy: actorUserId || null,
      createdByName: actorDisplayName || null,
      sizeBytes,
      includesDatabase: true,
      includesFiles: true,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    return meta;
  } catch (err) {
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch {
      /* ignore cleanup */
    }
    throw err;
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    _busy = false;
  }
}

export async function deleteBackup(id) {
  const paths = await getBackupPaths(id);
  if (!paths) {
    const err = new Error('Backup not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  fs.unlinkSync(paths.zipPath);
  if (fs.existsSync(paths.metaPath)) fs.unlinkSync(paths.metaPath);
  return true;
}
