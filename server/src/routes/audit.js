import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const auditRouter = Router();

const manageRoles = requireRole('admin', 'superadmin');

auditRouter.use(requireAuth);

auditRouter.get('/', manageRoles, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limitRaw = Number(req.query.limit);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 25));
    const action = String(req.query.action || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();

    const params = [];
    let where = 'WHERE 1=1';

    if (action) {
      params.push(action);
      where += ` AND a.action = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        lower(a.action) LIKE $${params.length}
        OR lower(a.entity_type) LIKE $${params.length}
        OR lower(COALESCE(a.entity_id, '')) LIKE $${params.length}
        OR lower(COALESCE(u.username, '')) LIKE $${params.length}
        OR lower(COALESCE(u.display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(a.ip, '')) LIKE $${params.length}
      )`;
    }

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}`,
      params,
    );
    const total = countRows[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageOut = Math.min(page, totalPages);
    const offset = (pageOut - 1) * limit;

    const listParams = [...params, limit, offset];
    const { rows } = await query(
      `SELECT a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id,
              a.meta, a.ip, a.created_at,
              u.username AS actor_username, u.display_name AS actor_display_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        meta: r.meta || {},
        ip: r.ip,
        createdAt: r.created_at,
        actor: r.actor_user_id
          ? {
              id: r.actor_user_id,
              username: r.actor_username,
              displayName: r.actor_display_name,
            }
          : null,
      })),
      page: pageOut,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
});
