// api/accounts/[id].js
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
    try {
      await db.query('DELETE FROM mt5_accounts WHERE id=$1 AND user_id=$2', [id, user.id]);
      return ok(res, { ok: true });
    } catch (e) { return err(res, e.message, 500); }
  }

  if (req.method === 'PATCH') {
    const { label, connected, balance, equity } = req.body || {};
    try {
      const { rows } = await db.query(
        `UPDATE mt5_accounts SET
          label=COALESCE($1,label),
          connected=COALESCE($2,connected),
          balance=COALESCE($3,balance),
          equity=COALESCE($4,equity),
          last_sync=NOW(),
          updated_at=NOW()
         WHERE id=$5 AND user_id=$6 RETURNING *`,
        [label||null, connected??null, balance??null, equity??null, id, user.id]
      );
      return ok(res, rows[0]);
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
}
