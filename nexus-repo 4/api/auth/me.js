// api/auth/me.js
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);
  try {
    const user = await verifyToken(req);
    return ok(res, { user });
  } catch (e) {
    return err(res, 'Unauthorized', 401);
  }
}
