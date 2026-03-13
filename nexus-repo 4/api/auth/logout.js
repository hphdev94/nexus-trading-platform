// api/auth/logout.js
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  try {
    const user = await verifyToken(req);
    const token = req.headers.authorization?.split(' ')[1];
    const jwt   = require('jsonwebtoken');
    const payload = jwt.decode(token);
    if (payload?.sid) {
      await getPool().query('DELETE FROM sessions WHERE token_hash=$1', [payload.sid]);
    }
    await getPool().query(
      `INSERT INTO audit_log(user_id,action,severity) VALUES($1,'LOGOUT','INFO')`,
      [user.id]
    );
    return ok(res, { ok: true });
  } catch (e) {
    return ok(res, { ok: true }); // Always succeed logout
  }
}
