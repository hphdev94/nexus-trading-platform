// api/copy/index.js
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  const db = getPool();

  if (req.method === 'GET') {
    const { rows } = await db.query(
      'SELECT * FROM copy_accounts WHERE user_id=$1 ORDER BY created_at DESC',
      [user.id]
    );
    return ok(res, rows);
  }

  if (req.method === 'POST') {
    const { label, server, login, source_id, risk_pct, max_lots, reverse } = req.body || {};
    if (!label?.trim()) return err(res, 'Label required');
    if (!server?.trim()) return err(res, 'Server required');
    if (!login?.trim())  return err(res, 'Login required');
    try {
      const { rows } = await db.query(
        `INSERT INTO copy_accounts(user_id,source_id,label,server,login,risk_pct,max_lots,reverse)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [user.id, source_id||null, label.trim(), server.trim(), login.trim(),
         parseFloat(risk_pct)||100, max_lots?parseFloat(max_lots):null, !!reverse]
      );
      await db.query(
        `INSERT INTO audit_log(user_id,action,data,severity) VALUES($1,'COPY_ADD',$2,'INFO')`,
        [user.id, JSON.stringify({ label, server })]
      );
      return ok(res, rows[0], 201);
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
}
