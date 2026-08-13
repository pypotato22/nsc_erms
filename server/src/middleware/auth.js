import { query as dbQuery } from '../db/pool.js';
import { HttpError } from './errors.js';

/** @type {typeof dbQuery} */
let queryImpl = dbQuery;

/** Test-only: swap the DB query function. */
export function __setQueryForTests(fn) {
  queryImpl = fn || dbQuery;
}

/**
 * Drop all express-session rows for a user (connect-pg-simple stores sess JSON).
 * Best-effort: callers should not fail the primary action if this throws.
 */
export async function clearUserSessions(userId) {
  if (!userId) return;
  await queryImpl(`DELETE FROM session WHERE (sess::jsonb ->> 'userId') = $1`, [
    String(userId),
  ]);
}

async function loadActiveUserRole(userId) {
  const { rows } = await queryImpl(
    `SELECT ur.code
     FROM users u
     JOIN user_roles ur ON ur.id = u.role_id
     WHERE u.id = $1 AND u.is_active = TRUE`,
    [userId],
  );
  return rows[0]?.code || null;
}

/**
 * Require a valid session belonging to an *active* user.
 * Sets req.userRole from the database (not from the session cookie alone).
 */
export async function requireAuth(req, _res, next) {
  try {
    if (!req.session?.userId) {
      throw new HttpError(401, 'Authentication required', 'UNAUTHORIZED');
    }
    const code = await loadActiveUserRole(req.session.userId);
    if (!code) {
      try {
        req.session.destroy(() => {});
      } catch {
        /* ignore */
      }
      throw new HttpError(401, 'Authentication required', 'UNAUTHORIZED');
    }
    req.userRole = code;
    req.session.roleCode = code;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...codes) {
  return async (req, _res, next) => {
    try {
      if (!req.session?.userId) {
        throw new HttpError(401, 'Authentication required', 'UNAUTHORIZED');
      }
      let code = req.userRole;
      if (!code) {
        code = await loadActiveUserRole(req.session.userId);
      }
      if (!code || !codes.includes(code)) {
        throw new HttpError(403, 'Insufficient permissions', 'FORBIDDEN');
      }
      req.userRole = code;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function getSetupCompleted() {
  const { rows } = await queryImpl(
    `SELECT value FROM app_settings WHERE key = 'setup_completed'`,
  );
  return rows[0]?.value === true;
}
