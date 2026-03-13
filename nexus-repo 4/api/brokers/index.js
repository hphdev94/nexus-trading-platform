// api/brokers/index.js — MT5 broker server search
const { getPool } = require('../_lib/db');
const { cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try {
    const q = (req.query.q || '').trim();
    let sql = 'SELECT * FROM mt5_broker_servers WHERE active=true';
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (broker_name ILIKE $1 OR server_name ILIKE $1)`;
    }
    sql += ' ORDER BY broker_name, account_type DESC LIMIT 100';
    const { rows } = await getPool().query(sql, params);
    return ok(res, rows);
  } catch (e) {
    console.error('brokers error:', e);
    return err(res, e.message, 500);
  }
}
