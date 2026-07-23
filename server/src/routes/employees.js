import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { ulid } from 'ulid';
import { query, withClient } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { getFilesRoot, getMaxUploadBytes } from '../services/settings.js';
import {
  absoluteFromRelative,
  writeEmployeePhoto,
  removeStoredFile,
  removeEmployeeStorage,
} from '../services/files.js';
import { writeAudit, clientIp } from '../services/audit.js';
import { publish } from '../services/liveEvents.js';
import {
  normalizePds,
  assertPdsIdentity,
  syncEmployeeColumnsFromPds,
  coercePdsFromRow,
} from '../services/pds.js';

export const employeesRouter = Router();

const writeRoles = requireRole('staff', 'admin', 'superadmin');

employeesRouter.use(requireAuth);

const EMPLOYEE_LIST_SQL = `
  SELECT
    e.id,
    e.employee_no,
    e.first_name,
    e.middle_name,
    e.last_name,
    e.name_extension,
    e.sex,
    e.birth_date,
    e.email,
    e.contact_number,
    e.address,
    e.profile_picture_path,
    e.remarks,
    e.pds,
    ea.id AS assignment_id,
    ea.start_date,
    ea.end_date,
    ea.is_primary,
    ea.department_position_id,
    d.id AS department_id,
    d.name AS department_name,
    p.id AS position_id,
    p.name AS position_name,
    et.id AS employment_type_id,
    et.name AS employment_type_name,
    es.id AS employment_status_id,
    es.name AS employment_status_name
  FROM employees e
  LEFT JOIN employee_assignments ea
    ON ea.employee_id = e.id
   AND ea.is_primary = TRUE
   AND ea.is_active = TRUE
   AND ea.end_date IS NULL
  LEFT JOIN department_positions dp ON dp.id = ea.department_position_id
  LEFT JOIN departments d ON d.id = dp.department_id
  LEFT JOIN positions p ON p.id = dp.position_id
  LEFT JOIN employment_types et ON et.id = ea.employment_type_id
  LEFT JOIN employment_statuses es ON es.id = ea.employment_status_id
  WHERE e.deleted_at IS NULL
    AND e.is_archived = FALSE
`;

function mapEmployee(row, { includePds = true } = {}) {
  if (!row) return null;
  const mapped = {
    id: row.id,
    employeeNo: row.employee_no,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    nameExtension: row.name_extension,
    sex: row.sex || null,
    birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    email: row.email,
    contactNumber: row.contact_number,
    address: row.address,
    profilePicturePath: row.profile_picture_path,
    photoUrl: row.profile_picture_path
      ? `/api/v1/employees/${row.id}/photo`
      : null,
    remarks: row.remarks,
    assignment: row.assignment_id
      ? {
          id: row.assignment_id,
          departmentPositionId: row.department_position_id,
          departmentId: row.department_id,
          departmentName: row.department_name,
          positionId: row.position_id,
          positionName: row.position_name,
          employmentTypeId: row.employment_type_id,
          employmentTypeName: row.employment_type_name,
          employmentStatusId: row.employment_status_id,
          employmentStatusName: row.employment_status_name,
          startDate: row.start_date,
          endDate: row.end_date,
          isPrimary: row.is_primary,
        }
      : null,
  };
  if (includePds) {
    mapped.pds = coercePdsFromRow(row.pds, row);
  }
  return mapped;
}

async function getEmployeeRow(id) {
  const { rows } = await query(`${EMPLOYEE_LIST_SQL} AND e.id = $1`, [id]);
  return rows[0] ?? null;
}

employeesRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const departmentId = String(req.query.departmentId || '').trim();
    const statusId = String(req.query.statusId || '').trim();
    const wantAll = String(req.query.all || '') === '1' || String(req.query.all || '') === 'true';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = wantAll
      ? null
      : Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 25));

    const SORT_MAP = {
      name: 'e.last_name, e.first_name',
      employeeNo: 'e.employee_no',
      contact: 'e.contact_number',
      position: 'p.name',
      department: 'd.name',
      status: 'es.name',
      startDate: 'ea.start_date',
      createdAt: 'e.created_at',
    };
    const sortKey = String(req.query.sort || 'name');
    const sortExpr = SORT_MAP[sortKey] || SORT_MAP.name;
    const dir =
      String(req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    // Apply ASC/DESC to each comma-separated key (name uses two columns)
    const nulls =
      sortKey === 'startDate' || sortKey === 'createdAt' ? ' NULLS LAST' : '';
    const orderBy = sortExpr
      .split(',')
      .map((part) => `${part.trim()} ${dir}${nulls}`)
      .join(', ');

    const params = [];
    let where = `
  FROM employees e
  LEFT JOIN employee_assignments ea
    ON ea.employee_id = e.id
   AND ea.is_primary = TRUE
   AND ea.is_active = TRUE
   AND ea.end_date IS NULL
  LEFT JOIN department_positions dp ON dp.id = ea.department_position_id
  LEFT JOIN departments d ON d.id = dp.department_id
  LEFT JOIN positions p ON p.id = dp.position_id
  LEFT JOIN employment_types et ON et.id = ea.employment_type_id
  LEFT JOIN employment_statuses es ON es.id = ea.employment_status_id
  WHERE e.deleted_at IS NULL
    AND e.is_archived = FALSE
`;

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        lower(e.first_name) LIKE $${params.length}
        OR lower(e.last_name) LIKE $${params.length}
        OR lower(e.email) LIKE $${params.length}
        OR lower(COALESCE(p.name, '')) LIKE $${params.length}
        OR lower(COALESCE(d.name, '')) LIKE $${params.length}
        OR lower(e.employee_no) LIKE $${params.length}
      )`;
    }
    if (departmentId) {
      params.push(departmentId);
      where += ` AND d.id = $${params.length}`;
    }
    if (statusId) {
      params.push(statusId);
      where += ` AND es.id = $${params.length}`;
    }

    const countSql = `SELECT COUNT(*)::int AS total ${where}`;
    const { rows: countRows } = await query(countSql, params);
    const total = countRows[0]?.total ?? 0;

    const selectCols = `
    e.id,
    e.employee_no,
    e.first_name,
    e.middle_name,
    e.last_name,
    e.name_extension,
    e.email,
    e.contact_number,
    e.address,
    e.profile_picture_path,
    e.remarks,
    ea.id AS assignment_id,
    ea.start_date,
    ea.end_date,
    ea.is_primary,
    ea.department_position_id,
    d.id AS department_id,
    d.name AS department_name,
    p.id AS position_id,
    p.name AS position_name,
    et.id AS employment_type_id,
    et.name AS employment_type_name,
    es.id AS employment_status_id,
    es.name AS employment_status_name
`;

    let sql = `SELECT ${selectCols} ${where} ORDER BY ${orderBy}, e.id ASC`;
    const listParams = [...params];
    let totalPages = 1;
    let pageOut = 1;

    if (limit != null) {
      totalPages = Math.max(1, Math.ceil(total / limit));
      pageOut = Math.min(page, totalPages);
      const offset = (pageOut - 1) * limit;
      listParams.push(limit, offset);
      sql += ` LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`;
    }

    const { rows } = await query(sql, listParams);
    res.json({
      employees: rows.map((row) => mapEmployee(row, { includePds: false })),
      page: pageOut,
      limit: limit ?? total,
      total,
      totalPages: limit == null ? 1 : totalPages,
      sort: SORT_MAP[sortKey] ? sortKey : 'name',
      dir: dir.toLowerCase(),
    });
  } catch (err) {
    next(err);
  }
});

/** Soft-deleted employees — Archived Employees page */
employeesRouter.get('/trash', async (req, res, next) => {
  try {
    const wantAll = String(req.query.all || '') === '1' || String(req.query.all || '') === 'true';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = wantAll
      ? null
      : Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 25));

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM employees WHERE deleted_at IS NOT NULL`,
    );
    const total = countRows[0]?.total ?? 0;

    let sql = `
      SELECT e.id, e.employee_no, e.first_name, e.last_name, e.email,
             e.profile_picture_path, e.deleted_at, e.is_archived,
             (SELECT COUNT(*)::int FROM documents d WHERE d.employee_id = e.id) AS document_count
      FROM employees e
      WHERE e.deleted_at IS NOT NULL
      ORDER BY e.deleted_at DESC`;
    const params = [];
    let totalPages = 1;
    let pageOut = 1;
    if (limit != null) {
      totalPages = Math.max(1, Math.ceil(total / limit));
      pageOut = Math.min(page, totalPages);
      const offset = (pageOut - 1) * limit;
      params.push(limit, offset);
      sql += ` LIMIT $1 OFFSET $2`;
    }

    const { rows } = await query(sql, params);
    res.json({
      employees: rows.map((row) => ({
        id: row.id,
        employeeNo: row.employee_no,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        isArchived: row.is_archived,
        deletedAt: row.deleted_at,
        profilePicturePath: row.profile_picture_path,
        photoUrl: row.profile_picture_path
          ? `/api/v1/employees/${row.id}/photo`
          : null,
        documentCount: row.document_count ?? 0,
      })),
      page: pageOut,
      limit: limit ?? total,
      total,
      totalPages: limit == null ? 1 : totalPages,
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.get('/:id/assignments', async (req, res, next) => {
  try {
    const { rows: emp } = await query(
      `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (!emp[0]) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');

    const { rows } = await query(
      `SELECT ea.id, ea.start_date, ea.end_date, ea.is_primary, ea.is_active,
              d.name AS department_name, p.name AS position_name,
              et.name AS employment_type_name, es.name AS employment_status_name
       FROM employee_assignments ea
       JOIN department_positions dp ON dp.id = ea.department_position_id
       JOIN departments d ON d.id = dp.department_id
       JOIN positions p ON p.id = dp.position_id
       LEFT JOIN employment_types et ON et.id = ea.employment_type_id
       LEFT JOIN employment_statuses es ON es.id = ea.employment_status_id
       WHERE ea.employee_id = $1
       ORDER BY ea.start_date DESC NULLS LAST, ea.created_at DESC`,
      [req.params.id],
    );

    res.json({
      assignments: rows.map((r) => ({
        id: r.id,
        startDate: r.start_date,
        endDate: r.end_date,
        isPrimary: r.is_primary,
        isActive: r.is_active,
        departmentName: r.department_name,
        positionName: r.position_name,
        employmentTypeName: r.employment_type_name,
        employmentStatusName: r.employment_status_name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await getEmployeeRow(req.params.id);
    if (!row) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');
    res.json({ employee: mapEmployee(row) });
  } catch (err) {
    next(err);
  }
});

employeesRouter.post('/', writeRoles, async (req, res, next) => {
  try {
    const body = req.body || {};
    const pds = normalizePds(body.pds || {
      personal: {
        firstName: body.firstName,
        surname: body.lastName,
        middleName: body.middleName,
        nameExtension: body.nameExtension,
        email: body.email,
        mobileNo: body.contactNumber,
        agencyEmployeeNo: body.employeeNo,
        residentialAddress: body.address ? { street: body.address } : undefined,
      },
    });
    assertPdsIdentity(pds);

    const cols = syncEmployeeColumnsFromPds(pds, {
      employeeNo: body.employeeNo !== undefined ? body.employeeNo : undefined,
    });
    const departmentPositionId = String(body.departmentPositionId || '').trim();
    const employmentTypeId = String(body.employmentTypeId || '').trim();
    const employmentStatusId = String(body.employmentStatusId || '').trim();
    const startDate = String(body.startDate || '').trim();

    if (!departmentPositionId || !employmentTypeId || !employmentStatusId || !startDate) {
      throw new HttpError(
        400,
        'Department/position, employment type, status, and start date are required',
        'VALIDATION',
      );
    }

    const employee = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const empId = ulid();

        await client.query(
          `INSERT INTO employees (
             id, employee_no, first_name, middle_name, last_name, name_extension,
             sex, birth_date, email, contact_number, address, pds,
             created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$13)`,
          [
            empId,
            cols.employeeNo,
            cols.firstName,
            cols.middleName,
            cols.lastName,
            cols.nameExtension,
            cols.sex,
            cols.birthDate,
            cols.email,
            cols.contactNumber,
            cols.address,
            JSON.stringify(pds),
            req.session.userId,
          ],
        );

        const assignmentId = ulid();
        await client.query(
          `INSERT INTO employee_assignments (
             id, employee_id, department_position_id, employment_type_id,
             employment_status_id, start_date, is_active, is_primary
           ) VALUES ($1,$2,$3,$4,$5,$6, TRUE, TRUE)`,
          [
            assignmentId,
            empId,
            departmentPositionId,
            employmentTypeId,
            employmentStatusId,
            startDate,
          ],
        );

        await client.query('COMMIT');
        return empId;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'employee.create',
      entityType: 'employee',
      entityId: employee,
      meta: { firstName: cols.firstName, lastName: cols.lastName, email: cols.email },
      ip: clientIp(req),
    });

    const row = await getEmployeeRow(employee);
    publish('employees.changed', {
      action: 'created',
      employeeId: employee,
      actorUserId: req.session.userId,
    });
    res.status(201).json({ employee: mapEmployee(row) });
  } catch (err) {
    if (err.code === '23505') {
      return next(new HttpError(409, 'Employee number already exists', 'CONFLICT'));
    }
    if (err.code === '23503') {
      return next(new HttpError(400, 'Invalid department, position, type, or status', 'VALIDATION'));
    }
    next(err);
  }
});

employeesRouter.patch('/:id', writeRoles, async (req, res, next) => {
  try {
    const body = req.body || {};
    const pds = normalizePds(body.pds || {
      personal: {
        firstName: body.firstName,
        surname: body.lastName,
        middleName: body.middleName,
        nameExtension: body.nameExtension,
        email: body.email,
        mobileNo: body.contactNumber,
        agencyEmployeeNo: body.employeeNo,
        residentialAddress: body.address ? { street: body.address } : undefined,
      },
    });
    assertPdsIdentity(pds);

    const cols = syncEmployeeColumnsFromPds(pds, {
      employeeNo: body.employeeNo !== undefined ? body.employeeNo : undefined,
    });
    const departmentPositionId = String(body.departmentPositionId || '').trim();
    const employmentTypeId = String(body.employmentTypeId || '').trim();
    const employmentStatusId = String(body.employmentStatusId || '').trim();
    const startDate = String(body.startDate || '').trim();

    if (!departmentPositionId || !employmentTypeId || !employmentStatusId || !startDate) {
      throw new HttpError(
        400,
        'Department/position, employment type, status, and start date are required',
        'VALIDATION',
      );
    }

    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const { rows: existing } = await client.query(
          `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
          [req.params.id],
        );
        if (!existing[0]) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');

        await client.query(
          `UPDATE employees
           SET employee_no = $2, first_name = $3, middle_name = $4, last_name = $5,
               name_extension = $6, sex = $7, birth_date = $8, email = $9,
               contact_number = $10, address = $11, pds = $12::jsonb,
               updated_by = $13, updated_at = NOW()
           WHERE id = $1`,
          [
            req.params.id,
            cols.employeeNo,
            cols.firstName,
            cols.middleName,
            cols.lastName,
            cols.nameExtension,
            cols.sex,
            cols.birthDate,
            cols.email,
            cols.contactNumber,
            cols.address,
            JSON.stringify(pds),
            req.session.userId,
          ],
        );

        const { rows: primary } = await client.query(
          `SELECT id FROM employee_assignments
           WHERE employee_id = $1 AND is_primary = TRUE AND is_active = TRUE AND end_date IS NULL
           LIMIT 1`,
          [req.params.id],
        );

        if (primary[0]) {
          await client.query(
            `UPDATE employee_assignments
             SET department_position_id = $2,
                 employment_type_id = $3,
                 employment_status_id = $4,
                 start_date = $5,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              primary[0].id,
              departmentPositionId,
              employmentTypeId,
              employmentStatusId,
              startDate,
            ],
          );
        } else {
          await client.query(
            `INSERT INTO employee_assignments (
               id, employee_id, department_position_id, employment_type_id,
               employment_status_id, start_date, is_active, is_primary
             ) VALUES ($1,$2,$3,$4,$5,$6, TRUE, TRUE)`,
            [
              ulid(),
              req.params.id,
              departmentPositionId,
              employmentTypeId,
              employmentStatusId,
              startDate,
            ],
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'employee.update',
      entityType: 'employee',
      entityId: req.params.id,
      meta: { firstName: cols.firstName, lastName: cols.lastName, email: cols.email },
      ip: clientIp(req),
    });

    const row = await getEmployeeRow(req.params.id);
    publish('employees.changed', {
      action: 'updated',
      employeeId: req.params.id,
      actorUserId: req.session.userId,
    });
    res.json({ employee: mapEmployee(row) });
  } catch (err) {
    if (err.code === '23503') {
      return next(new HttpError(400, 'Invalid department, position, type, or status', 'VALIDATION'));
    }
    next(err);
  }
});

employeesRouter.delete('/:id', writeRoles, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE employees
       SET deleted_at = NOW(), is_archived = TRUE, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.session.userId],
    );
    if (!rows[0]) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');

    // Keep assignment rows intact (position, department, start date, etc.)
    // so restore can bring them back. Lists already hide soft-deleted employees.

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'employee.delete',
      entityType: 'employee',
      entityId: req.params.id,
      ip: clientIp(req),
    });

    publish('employees.changed', {
      action: 'deleted',
      employeeId: req.params.id,
      actorUserId: req.session.userId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

employeesRouter.post('/:id/restore', writeRoles, async (req, res, next) => {
  try {
    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const { rows } = await client.query(
          `UPDATE employees
           SET deleted_at = NULL, is_archived = FALSE, updated_at = NOW(), updated_by = $2
           WHERE id = $1 AND deleted_at IS NOT NULL
           RETURNING id, employee_no, first_name, last_name`,
          [req.params.id, req.session.userId],
        );
        if (!rows[0]) {
          throw new HttpError(404, 'Archived employee not found', 'NOT_FOUND');
        }

        const { rows: inactiveStatus } = await client.query(
          `SELECT id FROM employment_statuses
           WHERE is_active = TRUE AND lower(name) = 'inactive'
           LIMIT 1`,
        );
        const inactiveId = inactiveStatus[0]?.id || null;

        // Reopen the latest primary assignment so dept/position/start date return.
        // Prefer Inactive status on restore; keep type, position, and start_date.
        await client.query(
          `UPDATE employee_assignments ea
           SET is_active = TRUE,
               end_date = NULL,
               employment_status_id = COALESCE($2::char(26), ea.employment_status_id),
               updated_at = NOW()
           WHERE ea.id = (
             SELECT id FROM employee_assignments
             WHERE employee_id = $1 AND is_primary = TRUE
             ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
             LIMIT 1
           )`,
          [req.params.id, inactiveId],
        );

        await client.query('COMMIT');

        await writeAudit({
          actorUserId: req.session.userId,
          action: 'employee.restore',
          entityType: 'employee',
          entityId: rows[0].id,
          meta: {
            employeeNo: rows[0].employee_no,
            name: `${rows[0].first_name} ${rows[0].last_name}`,
            statusSetInactive: Boolean(inactiveId),
          },
          ip: clientIp(req),
        });

        publish('employees.changed', {
          action: 'restored',
          employeeId: rows[0].id,
          actorUserId: req.session.userId,
        });

        res.json({ ok: true, id: rows[0].id });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.delete('/:id/permanent', writeRoles, async (req, res, next) => {
  try {
    const { rows: empRows } = await query(
      `SELECT id, employee_no, first_name, last_name, profile_picture_path
       FROM employees
       WHERE id = $1 AND deleted_at IS NOT NULL`,
      [req.params.id],
    );
    if (!empRows[0]) {
      throw new HttpError(404, 'Archived employee not found', 'NOT_FOUND');
    }
    const emp = empRows[0];

    const { rows: docs } = await query(
      `SELECT id, file_path FROM documents WHERE employee_id = $1`,
      [emp.id],
    );

    let fileRemovedCount = 0;
    for (const doc of docs) {
      try {
        if (await removeStoredFile(doc.file_path)) fileRemovedCount += 1;
      } catch (err) {
        console.error('Failed to remove document file:', err.message);
      }
    }

    let photoRemoved = false;
    try {
      if (emp.profile_picture_path) {
        photoRemoved = await removeStoredFile(emp.profile_picture_path);
      }
    } catch (err) {
      console.error('Failed to remove employee photo:', err.message);
    }

    await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`DELETE FROM documents WHERE employee_id = $1`, [emp.id]);
        await client.query(`DELETE FROM employee_assignments WHERE employee_id = $1`, [
          emp.id,
        ]);
        await client.query(`DELETE FROM employees WHERE id = $1`, [emp.id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });

    let storageRemoved = false;
    try {
      storageRemoved = await removeEmployeeStorage(emp.id);
    } catch (err) {
      console.error('Failed to remove employee storage dir:', err.message);
    }

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'employee.permanent_delete',
      entityType: 'employee',
      entityId: emp.id,
      meta: {
        employeeNo: emp.employee_no,
        name: `${emp.first_name} ${emp.last_name}`,
        documentsPurged: docs.length,
        fileRemovedCount,
        photoRemoved,
        storageRemoved,
      },
      ip: clientIp(req),
    });

    publish('employees.changed', {
      action: 'purged',
      employeeId: emp.id,
      actorUserId: req.session.userId,
    });

    res.json({
      ok: true,
      documentsPurged: docs.length,
      fileRemovedCount,
      photoRemoved,
      storageRemoved,
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.post('/:id/photo', writeRoles, async (req, res, next) => {
  try {
    const maxBytes = await getMaxUploadBytes();
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: maxBytes },
      fileFilter(_req, file, cb) {
        if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.mimetype)) {
          return cb(new Error('Only JPEG/PNG/WebP photos are allowed'));
        }
        cb(null, true);
      },
    }).single('photo');

    upload(req, res, async (err) => {
      try {
        if (err) {
          throw new HttpError(400, err.message || 'Upload failed', 'VALIDATION');
        }
        if (!req.file) throw new HttpError(400, 'photo is required', 'VALIDATION');

        const { rows: emp } = await query(
          `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
          [req.params.id],
        );
        if (!emp[0]) throw new HttpError(404, 'Employee not found', 'NOT_FOUND');

        const saved = await writeEmployeePhoto({
          employeeId: req.params.id,
          originalName: req.file.originalname,
          buffer: req.file.buffer,
        });

        const { rows } = await query(
          `UPDATE employees
           SET profile_picture_path = $2, updated_at = NOW(), updated_by = $3
           WHERE id = $1
           RETURNING id, profile_picture_path`,
          [req.params.id, saved.relativePath, req.session.userId],
        );

        await writeAudit({
          actorUserId: req.session.userId,
          action: 'employee.photo_upload',
          entityType: 'employee',
          entityId: req.params.id,
          ip: clientIp(req),
        });

        publish('employees.changed', {
          action: 'photo',
          employeeId: req.params.id,
          actorUserId: req.session.userId,
        });
        res.json({
          employeeId: rows[0].id,
          profilePicturePath: rows[0].profile_picture_path,
          photoUrl: `/api/v1/employees/${rows[0].id}/photo`,
        });
      } catch (e) {
        next(e);
      }
    });
  } catch (err) {
    next(err);
  }
});

employeesRouter.get('/:id/photo', async (req, res, next) => {
  try {
    // Allow photo for soft-deleted (Archived Employees preview)
    const { rows } = await query(
      `SELECT profile_picture_path FROM employees WHERE id = $1`,
      [req.params.id],
    );
    const pathRel = rows[0]?.profile_picture_path;
    if (!pathRel) throw new HttpError(404, 'No photo', 'NOT_FOUND');

    const root = await getFilesRoot();
    const abs = absoluteFromRelative(root, pathRel);
    if (!fs.existsSync(abs)) {
      // Heal orphaned DB path so clients stop requesting a missing file
      await query(
        `UPDATE employees
         SET profile_picture_path = NULL, updated_at = NOW()
         WHERE id = $1 AND profile_picture_path IS NOT NULL`,
        [req.params.id],
      );
      throw new HttpError(404, 'Photo missing on disk', 'NOT_FOUND');
    }
    res.sendFile(abs);
  } catch (err) {
    next(err);
  }
});
