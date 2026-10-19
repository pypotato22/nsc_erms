import { Router } from 'express';
import { ulid } from 'ulid';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import {
  listInboxFiles,
  rejectInboxFile,
  renameInboxFile,
  getInboxFileForRead,
  claimInboxFileForEmployee,
  restoreClaimedInboxFile,
  ensureInboxDirs,
} from '../services/scanInbox.js';
import { writeAudit, clientIp } from '../services/audit.js';
import { publish } from '../services/liveEvents.js';
import {
  nextDocumentVersion,
  latestActiveDocumentId,
} from '../services/documentVersion.js';

export const scanInboxRouter = Router();

const writeRoles = requireRole('staff', 'admin', 'superadmin');

scanInboxRouter.use(requireAuth);

scanInboxRouter.get('/', async (_req, res, next) => {
  try {
    await ensureInboxDirs();
    const { inboxPath, files } = await listInboxFiles();
    res.json({ inboxPath, files });
  } catch (err) {
    next(err);
  }
});

/**
 * Stream an inbox file for the in-app preview (inline) or download (?download=1).
 * Content-Type comes from our own extension map, never from file contents.
 */
scanInboxRouter.get('/:fileName/file', async (req, res, next) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);
    const { base, abs, mimeType } = await getInboxFileForRead(fileName);
    const asDownload = String(req.query.download || '') === '1';
    const disposition = `${asDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(base)}`;
    res.sendFile(
      abs,
      {
        dotfiles: 'allow',
        cacheControl: false,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': disposition,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
      (err) => {
        if (err && !res.headersSent) next(err);
      },
    );
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return next(new HttpError(404, 'File not found in inbox', 'NOT_FOUND'));
    }
    if (err.message === 'Invalid file name' || err.message === 'Invalid file path') {
      return next(new HttpError(400, err.message, 'VALIDATION'));
    }
    next(err);
  }
});

scanInboxRouter.post('/:fileName/rename', writeRoles, async (req, res, next) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);
    const newName = String(req.body?.newName ?? '');
    const result = await renameInboxFile(fileName, newName);

    if (!result.unchanged) {
      await writeAudit({
        actorUserId: req.session.userId,
        action: 'scan.rename',
        entityType: 'scan_inbox',
        entityId: fileName,
        meta: { from: fileName, to: result.name },
        ip: clientIp(req),
      });
      publish('scan.changed', {
        action: 'renamed',
        actorUserId: req.session.userId,
      });
    }

    res.json({ ok: true, name: result.name });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return next(new HttpError(404, 'File not found in inbox', 'NOT_FOUND'));
    }
    if (err.code === 'EXISTS') return next(new HttpError(409, err.message, 'CONFLICT'));
    if (err.code === 'VALIDATION') return next(new HttpError(400, err.message, 'VALIDATION'));
    if (err.message === 'Invalid file name' || err.message === 'Invalid file path') {
      return next(new HttpError(400, err.message, 'VALIDATION'));
    }
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      return next(
        new HttpError(409, 'File is in use by another program; close it and try again', 'FILE_BUSY'),
      );
    }
    next(err);
  }
});

scanInboxRouter.post('/:fileName/reject', writeRoles, async (req, res, next) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);
    const reason = String(req.body?.reason || 'Rejected by user').trim();
    await rejectInboxFile(fileName, reason);

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'scan.reject',
      entityType: 'scan_inbox',
      entityId: fileName,
      meta: { reason },
      ip: clientIp(req),
    });

    publish('scan.changed', {
      action: 'rejected',
      actorUserId: req.session.userId,
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return next(new HttpError(404, 'File not found in inbox', 'NOT_FOUND'));
    }
    next(err);
  }
});

scanInboxRouter.post('/:fileName/assign', writeRoles, async (req, res, next) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);
    const employeeId = String(req.body?.employeeId || '').trim();
    const documentTypeId = String(req.body?.documentTypeId || '').trim();
    const displayNameRaw = String(req.body?.displayName || '').trim();
    const remarks = String(req.body?.remarks || '').trim() || null;
    const issuedDate = String(req.body?.issuedDate || '').trim() || null;
    const expiryDate = String(req.body?.expiryDate || '').trim() || null;

    if (!employeeId || !documentTypeId) {
      throw new HttpError(400, 'employeeId and documentTypeId are required', 'VALIDATION');
    }
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      throw new HttpError(400, 'Expiry date must be on or after issued date', 'VALIDATION');
    }

    const { rows: emp } = await query(
      `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
      [employeeId],
    );
    if (!emp[0]) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');

    const { rows: dtype } = await query(
      `SELECT id FROM document_types WHERE id = $1 AND is_active = TRUE`,
      [documentTypeId],
    );
    if (!dtype[0]) throw new HttpError(400, 'Invalid document type', 'VALIDATION');

    const documentId = ulid();

    let claimed;
    try {
      claimed = await claimInboxFileForEmployee({
        fileName,
        employeeId,
        documentId,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        throw new HttpError(404, 'File not found in inbox', 'NOT_FOUND');
      }
      if (err.code === 'TOO_LARGE' || err.code === 'VALIDATION') {
        throw new HttpError(400, err.message, err.code);
      }
      throw err;
    }

    let displayName = displayNameRaw || claimed.originalName;
    const ext = claimed.originalName.includes('.')
      ? claimed.originalName.slice(claimed.originalName.lastIndexOf('.'))
      : '';
    if (ext && !displayName.toLowerCase().endsWith(ext.toLowerCase())) {
      displayName = `${displayName}${ext}`;
    }

    let versionNumber;
    let replacesId;
    let rows;
    const maxAttempts = 5;
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        versionNumber = await nextDocumentVersion(employeeId, documentTypeId);
        replacesId = await latestActiveDocumentId(employeeId, documentTypeId);
        try {
          ({ rows } = await query(
            `INSERT INTO documents (
               id, employee_id, document_type_id, file_name, stored_name, file_path,
               file_size, mime_type, source, scan_inbox_filename,
               version_number, replaces_id, issued_date, expiry_date, remarks,
               uploaded_by, updated_by
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,'scan_folder',$9,$10,$11,$12,$13,$14,$15,$15
             )
             RETURNING id`,
            [
              documentId,
              employeeId,
              documentTypeId,
              displayName,
              claimed.storedName,
              claimed.relativePath,
              claimed.fileSize,
              claimed.mimeType,
              claimed.originalName,
              versionNumber,
              replacesId,
              issuedDate,
              expiryDate,
              remarks,
              req.session.userId,
            ],
          ));
          break;
        } catch (dbErr) {
          if (dbErr.code === '23505' && attempt < maxAttempts - 1) {
            continue;
          }
          throw dbErr;
        }
      }
    } catch (dbErr) {
      try {
        await restoreClaimedInboxFile({
          absolutePath: claimed.absolutePath,
          originalName: claimed.originalName,
        });
      } catch (restoreErr) {
        console.error('Failed to restore inbox file after DB error:', restoreErr.message);
      }
      throw dbErr;
    }

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'scan.assign',
      entityType: 'document',
      entityId: rows[0].id,
      meta: { employeeId, documentTypeId, sourceFile: fileName, versionNumber },
      ip: clientIp(req),
    });

    publish('scan.changed', {
      action: 'assigned',
      employeeId,
      documentId: rows[0].id,
      actorUserId: req.session.userId,
    });
    publish('documents.changed', {
      action: 'uploaded',
      documentId: rows[0].id,
      employeeId,
      actorUserId: req.session.userId,
    });

    res.status(201).json({
      documentId: rows[0].id,
      versionNumber,
      fileName: displayName,
    });
  } catch (err) {
    next(err);
  }
});
