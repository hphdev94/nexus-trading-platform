// api/instruments/index.js
const { getPool } = require('../_lib/db');
const { cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM instruments WHERE active=true';
    const params = [];
    if (category) { sql += ' AND category=$1'; params.push(category.toUpperCase()); }
    sql += ' ORDER BY category, symbol';
    const { rows } = await getPool().query(sql, params);
    return ok(res, rows);
  } catch (e) { return err(res, e.message, 500); }
}
