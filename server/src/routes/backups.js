import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { writeAudit, clientIp } from '../services/audit.js';
import {
  createBackup,
  listBackups,
  getBackupPaths,
  deleteBackup,
  ensureBackupsRoot,
  isBackupBusy,
} from '../services/backup.js';

export const backupsRouter = Router();

const manageRoles = requireRole('admin', 'superadmin');

backupsRouter.use(requireAuth);

backupsRouter.get('/', manageRoles, async (_req, res, next) => {
  try {
    const backupsRoot = await ensureBackupsRoot();
    res.json({
      backupsRoot,
      busy: isBackupBusy(),
      backups: await listBackups(),
    });
  } catch (err) {
    next(err);
  }
});

backupsRouter.post('/', manageRoles, async (req, res, next) => {
  try {
    if (isBackupBusy()) {
      throw new HttpError(409, 'A backup is already in progress', 'BUSY');
    }

    let displayName = null;
    try {
      const { rows } = await query(
        `SELECT display_name, username FROM users WHERE id = $1`,
        [req.session.userId],
      );
      displayName = rows[0]?.display_name || rows[0]?.username || null;
    } catch {
      /* ignore */
    }

    const meta = await createBackup({
      actorUserId: req.session.userId,
      actorDisplayName: displayName,
    });

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'backup.create',
      entityType: 'backup',
      entityId: meta.id,
      meta: { fileName: meta.fileName, sizeBytes: meta.sizeBytes },
      ip: clientIp(req),
    });

    res.status(201).json({ backup: meta });
  } catch (err) {
    if (err.code === 'BUSY') {
      return next(new HttpError(409, err.message, 'BUSY'));
    }
    if (err.code === 'MISSING_TOOL' || err.code === 'COMMAND_FAILED') {
      return next(new HttpError(503, err.message, err.code));
    }
    next(err);
  }
});

backupsRouter.get('/:id/download', manageRoles, async (req, res, next) => {
  try {
    const paths = await getBackupPaths(req.params.id);
    if (!paths) throw new HttpError(404, 'Backup not found', 'NOT_FOUND');

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'backup.download',
      entityType: 'backup',
      entityId: req.params.id,
      meta: { fileName: paths.meta.fileName },
      ip: clientIp(req),
    });

    res.download(paths.zipPath, paths.meta.fileName || `${req.params.id}.zip`);
  } catch (err) {
    next(err);
  }
});

backupsRouter.delete('/:id', manageRoles, async (req, res, next) => {
  try {
    await deleteBackup(req.params.id);

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'backup.delete',
      entityType: 'backup',
      entityId: req.params.id,
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return next(new HttpError(404, 'Backup not found', 'NOT_FOUND'));
    }
    next(err);
  }
});
