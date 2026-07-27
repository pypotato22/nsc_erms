import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { writeAudit, clientIp } from '../services/audit.js';
import {
  getStoragePaths,
  updateStoragePaths,
} from '../services/settings.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get(
  '/storage',
  requireRole('superadmin'),
  async (_req, res, next) => {
    try {
      res.json(await getStoragePaths());
    } catch (err) {
      next(err);
    }
  },
);

settingsRouter.post(
  '/storage/validate',
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const scanInboxPath =
        req.body?.scanInboxPath !== undefined
          ? String(req.body.scanInboxPath)
          : undefined;
      const backupsRoot =
        req.body?.backupsRoot !== undefined
          ? String(req.body.backupsRoot)
          : undefined;

      if (scanInboxPath === undefined && backupsRoot === undefined) {
        throw new HttpError(400, 'Provide scanInboxPath and/or backupsRoot', 'VALIDATION');
      }

      const checked = await updateStoragePaths(
        { scanInboxPath, backupsRoot },
        { persist: false },
      );
      res.json({ ok: true, ...checked });
    } catch (err) {
      if (err.code === 'VALIDATION') {
        return next(new HttpError(400, err.message, 'VALIDATION'));
      }
      if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM') {
        return next(
          new HttpError(400, `Cannot use path: ${err.message}`, 'PATH_ERROR'),
        );
      }
      next(err);
    }
  },
);

settingsRouter.put(
  '/storage',
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const scanInboxPath =
        req.body?.scanInboxPath !== undefined
          ? String(req.body.scanInboxPath)
          : undefined;
      const backupsRoot =
        req.body?.backupsRoot !== undefined
          ? String(req.body.backupsRoot)
          : undefined;

      if (scanInboxPath === undefined && backupsRoot === undefined) {
        throw new HttpError(400, 'Provide scanInboxPath and/or backupsRoot', 'VALIDATION');
      }

      const result = await updateStoragePaths(
        { scanInboxPath, backupsRoot },
        { persist: true },
      );

      await writeAudit({
        actorUserId: req.session.userId,
        action: 'settings.storage_update',
        entityType: 'app_settings',
        entityId: 'storage_paths',
        meta: {
          scanInboxPath: result.updated?.scanInboxPath || undefined,
          backupsRoot: result.updated?.backupsRoot || undefined,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        filesRoot: result.filesRoot,
        scanInboxPath: result.scanInboxPath,
        backupsRoot: result.backupsRoot,
        sources: result.sources,
      });
    } catch (err) {
      if (err.code === 'VALIDATION') {
        return next(new HttpError(400, err.message, 'VALIDATION'));
      }
      if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM') {
        return next(
          new HttpError(400, `Cannot use path: ${err.message}`, 'PATH_ERROR'),
        );
      }
      next(err);
    }
  },
);
