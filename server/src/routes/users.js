import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { query } from '../db/pool.js';
import { requireAuth, requireRole, clearUserSessions } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { writeAudit, clientIp } from '../services/audit.js';

export const usersRouter = Router();

const manageRoles = requireRole('admin', 'superadmin');

usersRouter.use(requireAuth);

function mapUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    isActive: u.is_active,
    mustChangePassword: u.must_change_password,
    lastLogin: u.last_login,
    employeeId: u.employee_id,
    role: { id: u.role_id, code: u.role_code, name: u.role_name },
  };
}

const USER_SELECT = `
  SELECT u.id, u.username, u.display_name, u.is_active, u.must_change_password,
         u.last_login, u.employee_id,
         ur.id AS role_id, ur.code AS role_code, ur.name AS role_name
  FROM users u
  JOIN user_roles ur ON ur.id = u.role_id
`;

usersRouter.get('/roles', manageRoles, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, code, name, description
       FROM user_roles
       WHERE is_active = TRUE
       ORDER BY
         CASE code
           WHEN 'superadmin' THEN 1
           WHEN 'admin' THEN 2
           WHEN 'staff' THEN 3
           WHEN 'viewer' THEN 4
           ELSE 9
         END`,
    );
    res.json({ roles: rows });
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/', manageRoles, async (_req, res, next) => {
  try {
    const { rows } = await query(`${USER_SELECT} ORDER BY u.username`);
    res.json({ users: rows.map(mapUser) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', manageRoles, async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const roleCode = String(req.body?.roleCode || 'staff').trim();
    const employeeId = req.body?.employeeId
      ? String(req.body.employeeId).trim()
      : null;

    if (!displayName || !username || !password) {
      throw new HttpError(400, 'displayName, username, and password are required', 'VALIDATION');
    }
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters', 'VALIDATION');
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      throw new HttpError(
        400,
        'Username must be 3–32 chars (letters, numbers, . _ -)',
        'VALIDATION',
      );
    }

    const actorRole = req.userRole;
    if (roleCode === 'superadmin' && actorRole !== 'superadmin') {
      throw new HttpError(403, 'Only superadmin can create superadmin users', 'FORBIDDEN');
    }
    if (actorRole === 'admin' && !['admin', 'staff', 'viewer'].includes(roleCode)) {
      throw new HttpError(403, 'Admins can only assign admin, staff, or viewer', 'FORBIDDEN');
    }

    const { rows: roleRows } = await query(
      `SELECT id, code, name FROM user_roles WHERE code = $1 AND is_active = TRUE`,
      [roleCode],
    );
    if (!roleRows[0]) throw new HttpError(400, 'Invalid role', 'VALIDATION');

    if (employeeId) {
      const { rows: emp } = await query(
        `SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`,
        [employeeId],
      );
      if (!emp[0]) throw new HttpError(400, 'Invalid employeeId', 'VALIDATION');
    }

    const hash = await bcrypt.hash(password, 12);
    const id = ulid();

    try {
      await query(
        `INSERT INTO users (
           id, employee_id, role_id, username, password_hash,
           display_name, is_active, must_change_password
         ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE)`,
        [id, employeeId, roleRows[0].id, username, hash, displayName],
      );
    } catch (err) {
      if (err.code === '23505') {
        throw new HttpError(409, 'Username already exists', 'CONFLICT');
      }
      throw err;
    }

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'user.create',
      entityType: 'user',
      entityId: id,
      meta: { username, roleCode },
      ip: clientIp(req),
    });

    const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [id]);
    res.status(201).json({ user: mapUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', manageRoles, async (req, res, next) => {
  try {
    const { rows: targetRows } = await query(`${USER_SELECT} WHERE u.id = $1`, [
      req.params.id,
    ]);
    const target = targetRows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');

    const actorRole = req.userRole;
    if (target.role_code === 'superadmin' && actorRole !== 'superadmin') {
      throw new HttpError(403, 'Cannot modify superadmin accounts', 'FORBIDDEN');
    }

    const updates = [];
    const params = [];
    let p = 1;

    if (typeof req.body?.isActive === 'boolean') {
      if (req.body.isActive === false && req.params.id === req.session.userId) {
        throw new HttpError(400, 'You cannot deactivate your own account', 'VALIDATION');
      }
      if (req.body.isActive === false && target.role_code === 'superadmin') {
        const { rows: countRows } = await query(
          `SELECT COUNT(*)::int AS n
           FROM users u
           JOIN user_roles ur ON ur.id = u.role_id
           WHERE ur.code = 'superadmin' AND u.is_active = TRUE`,
        );
        if (countRows[0].n <= 1) {
          throw new HttpError(400, 'Cannot deactivate the last active superadmin', 'VALIDATION');
        }
      }
      params.push(req.body.isActive);
      updates.push(`is_active = $${p++}`);
    }

    if (req.body?.displayName !== undefined) {
      const displayName = String(req.body.displayName || '').trim();
      if (!displayName) throw new HttpError(400, 'displayName cannot be empty', 'VALIDATION');
      params.push(displayName);
      updates.push(`display_name = $${p++}`);
    }

    if (req.body?.roleCode) {
      const roleCode = String(req.body.roleCode).trim();
      if (roleCode === 'superadmin' && actorRole !== 'superadmin') {
        throw new HttpError(403, 'Only superadmin can assign superadmin role', 'FORBIDDEN');
      }
      if (actorRole === 'admin' && !['admin', 'staff', 'viewer'].includes(roleCode)) {
        throw new HttpError(403, 'Invalid role for admin', 'FORBIDDEN');
      }
      const { rows: roleRows } = await query(
        `SELECT id FROM user_roles WHERE code = $1 AND is_active = TRUE`,
        [roleCode],
      );
      if (!roleRows[0]) throw new HttpError(400, 'Invalid role', 'VALIDATION');
      params.push(roleRows[0].id);
      updates.push(`role_id = $${p++}`);
    }

    if (!updates.length) {
      throw new HttpError(400, 'No changes provided', 'VALIDATION');
    }

    params.push(req.params.id);
    await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${p}`,
      params,
    );

    // Deactivate or role change: drop existing sessions so cookies cannot linger
    const shouldClearSessions =
      req.body?.isActive === false || Boolean(req.body?.roleCode);
    if (shouldClearSessions) {
      try {
        await clearUserSessions(req.params.id);
      } catch {
        /* session cleanup best-effort */
      }
    }

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'user.update',
      entityType: 'user',
      entityId: req.params.id,
      meta: req.body || {},
      ip: clientIp(req),
    });

    const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [req.params.id]);
    res.json({ user: mapUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/** Set a new password for an inactive user (admin must activate separately). */
usersRouter.post('/:id/reset-password', manageRoles, async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters', 'VALIDATION');
    }

    const { rows: targetRows } = await query(`${USER_SELECT} WHERE u.id = $1`, [
      req.params.id,
    ]);
    const target = targetRows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');

    if (target.is_active) {
      throw new HttpError(
        400,
        'Deactivate the user before resetting their password',
        'VALIDATION',
      );
    }

    const actorRole = req.userRole;
    if (target.role_code === 'superadmin' && actorRole !== 'superadmin') {
      throw new HttpError(403, 'Cannot reset superadmin password', 'FORBIDDEN');
    }

    const hash = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users
       SET password_hash = $1, must_change_password = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [hash, req.params.id],
    );

    try {
      await clearUserSessions(req.params.id);
    } catch {
      /* session cleanup best-effort */
    }

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: req.params.id,
      meta: { username: target.username },
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

usersRouter.delete('/:id', manageRoles, async (req, res, next) => {
  try {
    const { rows: targetRows } = await query(`${USER_SELECT} WHERE u.id = $1`, [
      req.params.id,
    ]);
    const target = targetRows[0];
    if (!target) throw new HttpError(404, 'User not found', 'NOT_FOUND');

    if (req.params.id === req.session.userId) {
      throw new HttpError(400, 'You cannot delete your own account', 'VALIDATION');
    }

    if (target.is_active) {
      throw new HttpError(
        400,
        'Deactivate the user first, then delete permanently',
        'VALIDATION',
      );
    }

    const actorRole = req.userRole;
    if (target.role_code === 'superadmin' && actorRole !== 'superadmin') {
      throw new HttpError(403, 'Only superadmin can delete superadmin accounts', 'FORBIDDEN');
    }

    if (target.role_code === 'superadmin') {
      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS n
         FROM users u
         JOIN user_roles ur ON ur.id = u.role_id
         WHERE ur.code = 'superadmin'`,
      );
      if (countRows[0].n <= 1) {
        throw new HttpError(400, 'Cannot delete the last superadmin account', 'VALIDATION');
      }
    }

    await writeAudit({
      actorUserId: req.session.userId,
      action: 'user.delete',
      entityType: 'user',
      entityId: req.params.id,
      meta: {
        username: target.username,
        roleCode: target.role_code,
        displayName: target.display_name,
      },
      ip: clientIp(req),
    });

    await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);

    try {
      await clearUserSessions(req.params.id);
    } catch {
      /* session cleanup best-effort */
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
