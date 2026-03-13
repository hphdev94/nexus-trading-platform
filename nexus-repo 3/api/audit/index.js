// api/audit/index.js
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  try {
    const isAdmin = user.role === 'ADMIN';
    const { rows } = await getPool().query(
      `SELECT * FROM audit_log
       WHERE ${isAdmin ? 'true' : 'user_id=$1'}
       ORDER BY created_at DESC LIMIT 500`,
      isAdmin ? [] : [user.id]
    );
    return ok(res, rows);
  } catch (e) { return err(res, e.message, 500); }
}
