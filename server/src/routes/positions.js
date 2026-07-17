import { Router } from 'express';
import { ulid } from 'ulid';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { writeAudit, clientIp } from '../services/audit.js';

export const positionsRouter = Router();

const writeRoles = requireRole('staff', 'admin', 'superadmin');

positionsRouter.use(requireAuth);

positionsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.is_active, p.created_at, p.updated_at,
              COUNT(DISTINCT dp.department_id) FILTER (WHERE dp.is_active = TRUE)::int AS department_count,
              COUNT(ea.id) FILTER (
                WHERE ea.is_active = TRUE AND ea.end_date IS NULL AND dp.is_active = TRUE
              )::int AS employee_count
       FROM positions p
       LEFT JOIN department_positions dp ON dp.position_id = p.id
       LEFT JOIN employee_assignments ea ON ea.department_position_id = dp.id
       WHERE p.is_active = TRUE
       GROUP BY p.id
       ORDER BY p.name`,
    );
    res.json({
      positions: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        departmentCount: r.department_count,
        employeeCount: r.employee_count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

positionsRouter.post('/', writeRoles, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) throw new HttpError(400, 'Name is required', 'VALIDATION');
    if (name.length > 80) {
      throw new HttpError(400, 'Position name must be 80 characters or fewer', 'VALIDATION');
    }

    const id = ulid();
    try {
      const { rows } = await query(
        `INSERT INTO positions (id, name)
         VALUES ($1, $2)
         RETURNING id, name, is_active, created_at, updated_at`,
        [id, name],
      );

      await writeAudit({
        actorUserId: req.session.userId,
        action: 'position.create',
        entityType: 'position',
        entityId: id,
        meta: { name },
        ip: clientIp(req),
      });

      res.status(201).json({
        position: {
          id: rows[0].id,
          name: rows[0].name,
          isActive: rows[0].is_active,
          createdAt: rows[0].created_at,
          updatedAt: rows[0].updated_at,
          departmentCount: 0,
          employeeCount: 0,
        },
      });
    } catch (err) {
      if (err.code === '23505') {
        const { rows: existing } = await query(
          `SELECT id, name, is_active, created_at, updated_at
           FROM positions WHERE lower(name) = lower($1)`,
          [name],
        );
        if (existing[0] && !existing[0].is_active) {
          const { rows } = await query(
            `UPDATE positions
             SET is_active = TRUE, name = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, name, is_active, created_at, updated_at`,
            [existing[0].id, name],
          );
          await writeAudit({
            actorUserId: req.session.userId,
            action: 'position.reactivate',
            entityType: 'position',
            entityId: rows[0].id,
            meta: { name },
            ip: clientIp(req),
          });
          return res.status(200).json({
            position: {
              id: rows[0].id,
              name: rows[0].name,
              isActive: rows[0].is_active,
              createdAt: rows[0].created_at,
              updatedAt: rows[0].updated_at,
              departmentCount: 0,
              employeeCount: 0,
            },
            reactivated: true,
          });
        }
        throw new HttpError(409, 'Position name already exists', 'CONFLICT');
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

positionsRouter.patch('/:id', writeRoles, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) throw new HttpError(400, 'Name is required', 'VALIDATION');
    if (name.length > 80) {
      throw new HttpError(400, 'Position name must be 80 characters or fewer', 'VALIDATION');
    }

    const { rows } = await query(
      `UPDATE positions
       SET name = $2, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, name, is_active, created_at, updated_at`,
      [req.params.id, name],
    );
    if (!rows[0]) throw new HttpError(404, 'Position not found', 'NOT_FOUND');

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'position.update',
      entityType: 'position',
      entityId: req.params.id,
      meta: { name },
      ip: clientIp(req),
    });

    res.json({
      position: {
        id: rows[0].id,
        name: rows[0].name,
        isActive: rows[0].is_active,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return next(new HttpError(409, 'Position name already exists', 'CONFLICT'));
    }
    next(err);
  }
});

/** Soft-delete position catalog entry */
positionsRouter.delete('/:id', writeRoles, async (req, res, next) => {
  try {
    const { rows: inUse } = await query(
      `SELECT 1
       FROM employee_assignments ea
       JOIN department_positions dp ON dp.id = ea.department_position_id
       WHERE dp.position_id = $1
         AND dp.is_active = TRUE
         AND ea.is_active = TRUE
         AND ea.end_date IS NULL
       LIMIT 1`,
      [req.params.id],
    );
    if (inUse.length) {
      throw new HttpError(
        400,
        'Cannot remove: employees are still assigned to this position',
        'IN_USE',
      );
    }

    const { rows } = await query(
      `UPDATE positions
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, name`,
      [req.params.id],
    );
    if (!rows[0]) throw new HttpError(404, 'Position not found', 'NOT_FOUND');

    await query(
      `UPDATE department_positions
       SET is_active = FALSE, updated_at = NOW()
       WHERE position_id = $1 AND is_active = TRUE`,
      [req.params.id],
    );

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'position.delete',
      entityType: 'position',
      entityId: req.params.id,
      meta: { name: rows[0].name },
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
