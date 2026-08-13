import { query as dbQuery } from '../db/pool.js';
import { HttpError } from './errors.js';

/** @type {typeof dbQuery} */
let queryImpl = dbQuery;

/** Test-only: swap the DB query function. */
export function __setQueryForTests(fn) {
  queryImpl = fn || dbQuery;
}

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
 * Also rejects deactivated users so a stale cookie cannot pass the gate.
 */
export async function passwordChangeGate(req, _res, next) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!path.startsWith('/api/v1')) return next();
  if (ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return next();
  if (!req.session?.userId) return next();

  try {
    const { rows } = await queryImpl(
      `SELECT must_change_password, is_active
       FROM users
       WHERE id = $1`,
      [req.session.userId],
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw new HttpError(401, 'Authentication required', 'UNAUTHORIZED');
    }
    if (user.must_change_password) {
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
