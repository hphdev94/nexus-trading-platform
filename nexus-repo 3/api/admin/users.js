/**
 * @module api/admin/users
 * @description Admin-only user management endpoint.
 * Lists all users and allows role/active status updates.
 * Requires ADMIN role.
 */
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }
  if (user.role !== 'ADMIN') return err(res, 'Forbidden', 403);

  const db = getPool();

  // GET — list all users
  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT id, email, name, role, active, created_at, last_login, login_fails, locked_until
         FROM users ORDER BY created_at DESC`
      );
      return ok(res, rows);
    } catch (e) { return err(res, e.message, 500); }
  }

  // PATCH — update user role or active status
  if (req.method === 'PATCH') {
    const { id } = req.query;
    const { active, role } = req.body || {};
    if (!id) return err(res, 'User id required');
    try {
      const { rows } = await db.query(
        `UPDATE users SET
          active = COALESCE($1, active),
          role   = COALESCE($2, role)
         WHERE id = $3
         RETURNING id, email, name, role, active`,
        [active ?? null, role ?? null, id]
      );
      if (!rows.length) return err(res, 'User not found', 404);
      await db.query(
        `INSERT INTO audit_log(user_id, action, data, severity) VALUES($1,'ADMIN_USER_UPDATE',$2,'WARN')`,
        [user.id, JSON.stringify({ target_id: id, active, role })]
      );
      return ok(res, rows[0]);
    } catch (e) { return err(res, e.message, 500); }
  }

  // DELETE — deactivate user (soft delete)
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return err(res, 'User id required');
    if (id === user.id) return err(res, 'Cannot deactivate your own account', 400);
    try {
      await db.query('UPDATE users SET active=false WHERE id=$1', [id]);
      await db.query(
        `INSERT INTO audit_log(user_id, action, data, severity) VALUES($1,'ADMIN_USER_DEACTIVATE',$2,'WARN')`,
        [user.id, JSON.stringify({ target_id: id })]
      );
      return ok(res, { ok: true });
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
};
