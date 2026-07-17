import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { writeAudit, clientIp } from '../services/audit.js';

export const authRouter = Router();

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: {
      id: row.role_id,
      code: row.role_code,
      name: row.role_name,
    },
    employeeId: row.employee_id,
    mustChangePassword: row.must_change_password,
    lastLogin: row.last_login,
  };
}

const USER_SELECT = `
  SELECT u.id, u.username, u.display_name, u.employee_id,
         u.must_change_password, u.last_login, u.password_hash,
         u.is_active, ur.id AS role_id, ur.code AS role_code, ur.name AS role_name
  FROM users u
  JOIN user_roles ur ON ur.id = u.role_id
`;

authRouter.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const ip = clientIp(req);

    if (!username || !password) {
      throw new HttpError(400, 'Username and password are required', 'VALIDATION');
    }

    const { rows } = await query(
      `${USER_SELECT} WHERE lower(u.username::text) = $1`,
      [username],
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      await writeAudit({
        actorUserId: null,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: null,
        meta: { username },
        ip,
      });
      throw new HttpError(401, 'Invalid username or password', 'INVALID_CREDENTIALS');
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await writeAudit({
        actorUserId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        meta: { username },
        ip,
      });
      throw new HttpError(401, 'Invalid username or password', 'INVALID_CREDENTIALS');
    }

    req.session.userId = user.id;
    req.session.roleCode = user.role_code;

    await query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [
      user.id,
    ]);

    await writeAudit({
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      meta: { username: user.username },
      ip,
    });

    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const userId = req.session?.userId || null;
    const ip = clientIp(req);
    if (userId) {
      await writeAudit({
        actorUserId: userId,
        action: 'auth.logout',
        entityType: 'user',
        entityId: userId,
        ip,
      });
    }

    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('nsc_erms.sid');
      res.json({ ok: true });
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [req.session.userId]);
    if (!rows[0] || !rows[0].is_active) {
      throw new HttpError(401, 'Session invalid', 'UNAUTHORIZED');
    }
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      throw new HttpError(400, 'currentPassword and newPassword are required', 'VALIDATION');
    }
    if (newPassword.length < 8) {
      throw new HttpError(400, 'New password must be at least 8 characters', 'VALIDATION');
    }

    const { rows } = await query(
      'SELECT id, password_hash FROM users WHERE id = $1 AND is_active = TRUE',
      [req.session.userId],
    );
    const user = rows[0];
    if (!user) throw new HttpError(401, 'Session invalid', 'UNAUTHORIZED');

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      throw new HttpError(400, 'Current password is incorrect', 'VALIDATION');
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE users
       SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
       WHERE id = $2`,
      [hash, user.id],
    );

    await writeAudit({
      actorUserId: user.id,
      action: 'auth.change_password',
      entityType: 'user',
      entityId: user.id,
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
