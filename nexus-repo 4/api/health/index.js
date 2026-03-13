// api/health/index.js
const { getPool } = require('../_lib/db');
const { cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await getPool().query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'ok', ts: new Date().toISOString(), version: '2.1.0' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'error', error: e.message });
  }
}
