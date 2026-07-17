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
} from '../services/files.js';
import { writeAudit, clientIp } from '../services/audit.js';

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

function mapEmployee(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeNo: row.employee_no,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    nameExtension: row.name_extension,
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
}

async function nextEmployeeNo(client) {
  const { rows } = await client.query(
    `SELECT employee_no FROM employees
     WHERE employee_no ~ '^[0-9]+$'
     ORDER BY employee_no::bigint DESC
     LIMIT 1`,
  );
  const last = rows[0]?.employee_no ? Number(rows[0].employee_no) : 100000;
  return String(last + 1);
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
    };
    const sortKey = String(req.query.sort || 'name');
    const sortExpr = SORT_MAP[sortKey] || SORT_MAP.name;
    const dir =
      String(req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    // Apply ASC/DESC to each comma-separated key (name uses two columns)
    const orderBy = sortExpr
      .split(',')
      .map((part) => `${part.trim()} ${dir}`)
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
      employees: rows.map(mapEmployee),
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
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const contactNumber = String(body.contactNumber || '').trim();
    const address = String(body.address || '').trim();
    const departmentPositionId = String(body.departmentPositionId || '').trim();
    const employmentTypeId = String(body.employmentTypeId || '').trim();
    const employmentStatusId = String(body.employmentStatusId || '').trim();
    const startDate = String(body.startDate || '').trim();

    if (!firstName || !lastName || !email) {
      throw new HttpError(400, 'First name, last name, and email are required', 'VALIDATION');
    }
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
        const employeeNo = body.employeeNo
          ? String(body.employeeNo).trim()
          : await nextEmployeeNo(client);

        await client.query(
          `INSERT INTO employees (
             id, employee_no, first_name, last_name, email, contact_number, address,
             created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
          [
            empId,
            employeeNo,
            firstName,
            lastName,
            email,
            contactNumber,
            address,
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
      meta: { firstName, lastName, email },
      ip: clientIp(req),
    });

    const row = await getEmployeeRow(employee);
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
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const contactNumber = String(body.contactNumber || '').trim();
    const address = String(body.address || '').trim();
    const departmentPositionId = String(body.departmentPositionId || '').trim();
    const employmentTypeId = String(body.employmentTypeId || '').trim();
    const employmentStatusId = String(body.employmentStatusId || '').trim();
    const startDate = String(body.startDate || '').trim();

    if (!firstName || !lastName || !email) {
      throw new HttpError(400, 'First name, last name, and email are required', 'VALIDATION');
    }
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
           SET first_name = $2, last_name = $3, email = $4,
               contact_number = $5, address = $6,
               updated_by = $7, updated_at = NOW()
           WHERE id = $1`,
          [
            req.params.id,
            firstName,
            lastName,
            email,
            contactNumber,
            address,
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
      meta: { firstName, lastName, email },
      ip: clientIp(req),
    });

    const row = await getEmployeeRow(req.params.id);
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

    await query(
      `UPDATE employee_assignments
       SET is_active = FALSE, end_date = COALESCE(end_date, CURRENT_DATE), updated_at = NOW()
       WHERE employee_id = $1 AND is_active = TRUE`,
      [req.params.id],
    );

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'employee.delete',
      entityType: 'employee',
      entityId: req.params.id,
      ip: clientIp(req),
    });

    res.json({ ok: true });
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
    const { rows } = await query(
      `SELECT profile_picture_path FROM employees WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    const pathRel = rows[0]?.profile_picture_path;
    if (!pathRel) throw new HttpError(404, 'No photo', 'NOT_FOUND');

    const root = await getFilesRoot();
    const abs = absoluteFromRelative(root, pathRel);
    if (!fs.existsSync(abs)) throw new HttpError(404, 'Photo missing on disk', 'NOT_FOUND');
    res.sendFile(abs);
  } catch (err) {
    next(err);
  }
});
