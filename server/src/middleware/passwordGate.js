import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

/** Paths allowed while must_change_password is true (prefix match on /api/v1). */
const ALLOWED = [
  '/api/v1/health',
  '/api/v1/setup/status',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
  '/api/v1/auth/change-password',
];

/**
 * Block authenticated API use until the user sets a new password.
 */
export async function passwordChangeGate(req, _res, next) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!path.startsWith('/api/v1')) return next();
  if (ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return next();
  if (!req.session?.userId) return next();

  try {
    const { rows } = await query(
      `SELECT must_change_password
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [req.session.userId],
    );
    if (rows[0]?.must_change_password) {
      throw new HttpError(
        403,
        'You must change your password before using the system',
        'PASSWORD_CHANGE_REQUIRED',
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
