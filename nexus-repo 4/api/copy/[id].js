// api/copy/[id].js
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

  if (req.method === 'PATCH') {
    const { active, risk_pct, max_lots, reverse } = req.body || {};
    const { rows } = await db.query(
      `UPDATE copy_accounts SET
        active=COALESCE($1,active),
        risk_pct=COALESCE($2,risk_pct),
        max_lots=COALESCE($3,max_lots),
        reverse=COALESCE($4,reverse)
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [active??null, risk_pct??null, max_lots??null, reverse??null, id, user.id]
    );
    return ok(res, rows[0]);
  }

  if (req.method === 'DELETE') {
    await db.query('DELETE FROM copy_accounts WHERE id=$1 AND user_id=$2', [id, user.id]);
    return ok(res, { ok: true });
  }

  return err(res, 'Method not allowed', 405);
}
