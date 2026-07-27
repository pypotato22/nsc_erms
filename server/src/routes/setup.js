import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { writeAudit, clientIp } from '../services/audit.js';

export const setupRouter = Router();

async function getSetting(key) {
  const { rows } = await query(
    'SELECT value FROM app_settings WHERE key = $1',
    [key],
  );
  return rows[0]?.value;
}

function isSetupCompletedValue(value) {
  return value === true || value === 'true' || value === 1;
}

setupRouter.get('/status', async (_req, res, next) => {
  try {
    const setupCompleted = isSetupCompletedValue(await getSetting('setup_completed'));
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       WHERE ur.code = 'superadmin' AND u.is_active = TRUE`,
    );
    res.json({
      setupCompleted,
      hasSuperadmin: rows[0].count > 0,
      orgName: (await getSetting('org_name')) ?? null,
      filesRoot: (await getSetting('files_root')) ?? config.filesRoot,
      scanInboxPath: (await getSetting('scan_inbox_path')) ?? null,
      backupsRoot: (await getSetting('backups_root')) ?? config.backupsRoot,
      maxUploadBytes: Number(await getSetting('max_upload_bytes')) || config.maxUploadBytes,
    });
  } catch (err) {
    next(err);
  }
});

setupRouter.post(
  '/complete',
  requireAuth,
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const setupCompleted = isSetupCompletedValue(await getSetting('setup_completed'));
      if (setupCompleted) {
        throw new HttpError(400, 'Setup already completed', 'SETUP_DONE');
      }

      const orgName = String(req.body?.orgName || '').trim();
      if (!orgName) {
        throw new HttpError(400, 'orgName is required', 'VALIDATION');
      }

      const filesRoot = String(req.body?.filesRoot || config.filesRoot).trim();
      const scanInboxPath = String(
        req.body?.scanInboxPath || path.join(filesRoot, 'inbox'),
      ).trim();
      const backupsRoot = String(
        req.body?.backupsRoot || config.backupsRoot,
      ).trim();
      const maxUploadBytes = Number(
        req.body?.maxUploadBytes || config.maxUploadBytes,
      );

      if (maxUploadBytes <= 0 || maxUploadBytes > 31457280) {
        throw new HttpError(
          400,
          'maxUploadBytes must be between 1 and 31457280 (30 MB)',
          'VALIDATION',
        );
      }

      for (const dir of [
        filesRoot,
        path.join(filesRoot, 'employees'),
        scanInboxPath,
        path.join(scanInboxPath, 'processed'),
        path.join(scanInboxPath, 'failed'),
        backupsRoot,
      ]) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Writable check
      fs.accessSync(filesRoot, fs.constants.W_OK);
      fs.accessSync(scanInboxPath, fs.constants.W_OK);
      fs.accessSync(backupsRoot, fs.constants.W_OK);

      const updates = {
        org_name: orgName,
        files_root: filesRoot,
        scan_inbox_path: scanInboxPath,
        backups_root: backupsRoot,
        max_upload_bytes: maxUploadBytes,
        setup_completed: true,
      };

      for (const [key, value] of Object.entries(updates)) {
        await query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(value)],
        );
      }

      await writeAudit({
        actorUserId: req.session.userId,
        action: 'setup.complete',
        entityType: 'app_settings',
        entityId: 'setup_completed',
        meta: { orgName, filesRoot, scanInboxPath, backupsRoot, maxUploadBytes },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        setupCompleted: true,
        orgName,
        filesRoot,
        scanInboxPath,
        backupsRoot,
        maxUploadBytes,
      });
    } catch (err) {
      next(err);
    }
  },
);
