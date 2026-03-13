// api/trades/[id].js
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  const { id } = req.query;
  const db = getPool();

  if (req.method === 'DELETE') {
    await db.query('DELETE FROM trades WHERE id=$1 AND user_id=$2', [id, user.id]);
    return ok(res, { ok: true });
  }

  if (req.method === 'PATCH') {
    const { close_price, close_time, status, profit, close_reason } = req.body || {};
    try {
      const { rows } = await db.query(
        `UPDATE trades SET
          close_price=COALESCE($1,close_price),
          close_time=COALESCE($2,close_time),
          status=COALESCE($3,status),
          profit=COALESCE($4,profit),
          close_reason=COALESCE($5,close_reason),
          updated_at=NOW()
         WHERE id=$6 AND user_id=$7 RETURNING *`,
        [close_price||null, close_time||null, status||null, profit??null, close_reason||null, id, user.id]
      );
      return ok(res, rows[0]);
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
}
