import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { ulid } from 'ulid';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { getFilesRoot, getMaxUploadBytes } from '../services/settings.js';
import {
  absoluteFromRelative,
  writeEmployeeDocument,
  removeStoredFile,
} from '../services/files.js';

export const documentsRouter = Router({ mergeParams: true });

const writeRoles = requireRole('staff', 'admin', 'superadmin');

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function makeUpload(maxBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter(_req, file, cb) {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        return cb(new HttpError(400, 'File type not allowed', 'VALIDATION'));
      }
      cb(null, true);
    },
  });
}

documentsRouter.use(requireAuth);

function mapDoc(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    documentTypeId: row.document_type_id,
    documentTypeName: row.document_type_name,
    documentTypeRequired: row.is_required,
    fileName: row.file_name,
    storedName: row.stored_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    source: row.source,
    versionNumber: row.version_number,
    replacesId: row.replaces_id,
    issuedDate: row.issued_date,
    expiryDate: row.expiry_date,
    remarks: row.remarks,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
  };
}

/** List documents for employee — newest first */
documentsRouter.get('/', async (req, res, next) => {
  try {
    const employeeId = req.params.employeeId;
    const { rows: emp } = await query(
      `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
      [employeeId],
    );
    if (!emp[0]) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');

    const { rows } = await query(
      `SELECT d.*, dt.name AS document_type_name, dt.is_required
       FROM documents d
       JOIN document_types dt ON dt.id = d.document_type_id
       WHERE d.employee_id = $1 AND d.deleted_at IS NULL
       ORDER BY d.uploaded_at DESC, d.version_number DESC`,
      [employeeId],
    );

    const { rows: types } = await query(
      `SELECT id, name, is_required
       FROM document_types
       WHERE is_active = TRUE
       ORDER BY name`,
    );

    const presentTypes = new Set(rows.map((r) => r.document_type_id));
    const checklist = types.map((t) => ({
      id: t.id,
      name: t.name,
      isRequired: t.is_required,
      satisfied: presentTypes.has(t.id),
    }));

    res.json({
      documents: rows.map(mapDoc),
      checklist,
    });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/', writeRoles, async (req, res, next) => {
  try {
    const maxBytes = await getMaxUploadBytes();
    const upload = makeUpload(maxBytes).single('file');

    upload(req, res, async (err) => {
      try {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            throw new HttpError(400, `File exceeds ${maxBytes} bytes`, 'VALIDATION');
          }
          throw new HttpError(400, err.message, 'VALIDATION');
        }
        if (err) throw err;

        const employeeId = req.params.employeeId;
        const documentTypeId = String(req.body?.documentTypeId || '').trim();
        const remarks = String(req.body?.remarks || '').trim() || null;
        const displayNameRaw = String(req.body?.displayName || '').trim();
        const issuedDate = String(req.body?.issuedDate || '').trim() || null;
        const expiryDate = String(req.body?.expiryDate || '').trim() || null;

        if (!documentTypeId) {
          throw new HttpError(400, 'documentTypeId is required', 'VALIDATION');
        }
        if (!req.file) {
          throw new HttpError(400, 'file is required', 'VALIDATION');
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
        if (!dtype[0]) {
          throw new HttpError(400, 'Invalid document type', 'VALIDATION');
        }

        if (issuedDate && expiryDate && expiryDate < issuedDate) {
          throw new HttpError(400, 'Expiry date must be on or after issued date', 'VALIDATION');
        }

        const originalName = req.file.originalname;
        const ext = originalName.includes('.')
          ? originalName.slice(originalName.lastIndexOf('.'))
          : '';
        let displayName = displayNameRaw || originalName;
        // Preserve extension if user renamed without one
        if (ext && !displayName.toLowerCase().endsWith(ext.toLowerCase())) {
          displayName = `${displayName}${ext}`;
        }

        const { rows: latest } = await query(
          `SELECT id, version_number
           FROM documents
           WHERE employee_id = $1
             AND document_type_id = $2
             AND deleted_at IS NULL
           ORDER BY version_number DESC
           LIMIT 1`,
          [employeeId, documentTypeId],
        );

        const versionNumber = (latest[0]?.version_number ?? 0) + 1;
        const replacesId = latest[0]?.id ?? null;
        const documentId = ulid();

        const saved = await writeEmployeeDocument({
          employeeId,
          documentId,
          originalName,
          buffer: req.file.buffer,
        });

        const { rows } = await query(
          `INSERT INTO documents (
             id, employee_id, document_type_id, file_name, stored_name, file_path,
             file_size, mime_type, source, version_number, replaces_id,
             issued_date, expiry_date, remarks,
             uploaded_by, updated_by
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,'upload',$9,$10,$11,$12,$13,$14,$14
           )
           RETURNING *`,
          [
            documentId,
            employeeId,
            documentTypeId,
            displayName,
            saved.storedName,
            saved.relativePath,
            req.file.size,
            req.file.mimetype,
            versionNumber,
            replacesId,
            issuedDate,
            expiryDate,
            remarks,
            req.session.userId,
          ],
        );

        const { rows: joined } = await query(
          `SELECT d.*, dt.name AS document_type_name, dt.is_required
           FROM documents d
           JOIN document_types dt ON dt.id = d.document_type_id
           WHERE d.id = $1`,
          [rows[0].id],
        );

        res.status(201).json({ document: mapDoc(joined[0]) });
      } catch (e) {
        next(e);
      }
    });
  } catch (err) {
    next(err);
  }
});

export const documentItemRouter = Router();

documentItemRouter.use(requireAuth);

documentItemRouter.get('/trash', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.*, dt.name AS document_type_name, dt.is_required,
              e.first_name, e.last_name, e.employee_no
       FROM documents d
       JOIN document_types dt ON dt.id = d.document_type_id
       JOIN employees e ON e.id = d.employee_id
       WHERE d.deleted_at IS NOT NULL
       ORDER BY d.deleted_at DESC`,
    );
    res.json({
      documents: rows.map((row) => ({
        ...mapDoc(row),
        deletedAt: row.deleted_at,
        employee: {
          id: row.employee_id,
          employeeNo: row.employee_no,
          firstName: row.first_name,
          lastName: row.last_name,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

documentItemRouter.get('/:id/download', async (req, res, next) => {
  try {
    // Allow download of trashed files too (for review before permanent delete)
    const { rows } = await query(`SELECT * FROM documents WHERE id = $1`, [
      req.params.id,
    ]);
    const doc = rows[0];
    if (!doc) throw new HttpError(404, 'Document not found', 'NOT_FOUND');

    const root = await getFilesRoot();
    const abs = absoluteFromRelative(root, doc.file_path);
    if (!fs.existsSync(abs)) {
      throw new HttpError(404, 'File missing on disk', 'NOT_FOUND');
    }

    res.download(abs, doc.file_name);
  } catch (err) {
    next(err);
  }
});

/** Soft-delete — keeps file on disk; appears in Trash */
documentItemRouter.delete('/:id', writeRoles, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE documents
       SET deleted_at = NOW(), updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, file_name`,
      [req.params.id, req.session.userId],
    );
    if (!rows[0]) throw new HttpError(404, 'Document not found', 'NOT_FOUND');
    res.json({
      ok: true,
      id: rows[0].id,
      fileName: rows[0].file_name,
      softDeleted: true,
    });
  } catch (err) {
    next(err);
  }
});

documentItemRouter.post('/:id/restore', writeRoles, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE documents
       SET deleted_at = NULL, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id, employee_id, file_name`,
      [req.params.id, req.session.userId],
    );
    if (!rows[0]) throw new HttpError(404, 'Trashed document not found', 'NOT_FOUND');
    res.json({
      ok: true,
      id: rows[0].id,
      employeeId: rows[0].employee_id,
      fileName: rows[0].file_name,
    });
  } catch (err) {
    next(err);
  }
});

/** Permanent delete — removes DB row and file from disk */
documentItemRouter.delete('/:id/permanent', writeRoles, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, file_path FROM documents WHERE id = $1 AND deleted_at IS NOT NULL`,
      [req.params.id],
    );
    if (!rows[0]) {
      throw new HttpError(404, 'Trashed document not found', 'NOT_FOUND');
    }

    let fileRemoved = false;
    try {
      fileRemoved = await removeStoredFile(rows[0].file_path);
    } catch (err) {
      console.error('Failed to remove document file from disk:', err.message);
    }

    await query(`DELETE FROM documents WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, fileRemoved });
  } catch (err) {
    next(err);
  }
});
