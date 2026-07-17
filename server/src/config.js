import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const rendererDist = path.resolve(projectRoot, 'renderer/dist');
const rendererSrc = path.resolve(projectRoot, 'renderer');
const clientDist = fs.existsSync(path.join(rendererDist, 'index.html'))
  ? rendererDist
  : rendererSrc;

/**
 * Prefer discrete DB_* vars (as in .env) over DATABASE_URL.
 */
export function getPgConfig() {
  if (process.env.DB_USER && process.env.DB_NAME) {
    return {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ?? '',
    };
  }
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  throw new Error(
    'Database config missing. Set DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD or DATABASE_URL in .env',
  );
}

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const allowHttpDev =
  process.env.ALLOW_HTTP_DEV === 'true' || process.env.NODE_ENV !== 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3443),
  sessionSecret: required('SESSION_SECRET', 'dev-only-change-me'),
  tlsCertPath: process.env.TLS_CERT_PATH || '',
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  allowHttpDev,
  filesRoot: process.env.FILES_ROOT || path.join(projectRoot, 'storage'),
  backupsRoot:
    process.env.BACKUPS_ROOT || path.join(projectRoot, 'backups'),
  pgDumpPath: process.env.PG_DUMP_PATH || '',
  scanInboxPath: process.env.SCAN_INBOX_PATH || '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 31457280),
  /** Prefer Vite build output when present; fall back to source for local API-only runs. */
  clientDist,
  projectRoot,
};
