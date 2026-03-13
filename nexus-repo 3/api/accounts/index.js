// api/accounts/index.js — MT5 account management
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  const db = getPool();

  // GET — list accounts
  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        'SELECT * FROM mt5_accounts WHERE user_id=$1 ORDER BY created_at DESC',
        [user.id]
      );
      return ok(res, rows);
    } catch (e) { return err(res, e.message, 500); }
  }

  // POST — add account
  if (req.method === 'POST') {
    const { label, login, server, broker, account_type, currency, leverage } = req.body || {};
    if (!label?.trim()) return err(res, 'Label required');
    if (!login?.trim())  return err(res, 'Login required');
    if (!server?.trim()) return err(res, 'Server required');
    try {
      const { rows } = await db.query(
        `INSERT INTO mt5_accounts(user_id, label, login, server, broker, account_type, currency, leverage)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [user.id, label.trim(), login.trim(), server.trim(),
         broker || null, account_type || 'LIVE', currency || 'USD', leverage || 100]
      );
      await db.query(
        `INSERT INTO audit_log(user_id,action,data,severity) VALUES($1,'MT5_ACCOUNT_ADD',$2,'INFO')`,
        [user.id, JSON.stringify({ server, login: login.slice(0,4)+'***' })]
      );
      return ok(res, rows[0], 201);
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
}
