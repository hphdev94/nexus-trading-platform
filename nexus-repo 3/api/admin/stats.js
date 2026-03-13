/**
 * @module api/admin/stats
 * @description Admin platform-wide statistics endpoint.
 * Returns aggregated counts, growth metrics and system health.
 * Requires ADMIN role.
 */
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }
  if (user.role !== 'ADMIN') return err(res, 'Forbidden', 403);

  const db = getPool();
  try {
    const [users, accounts, trades, copy, recentAudit] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)                                                        AS total,
          COUNT(*) FILTER (WHERE active = true)                          AS active,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_7d,
          COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '24 hours') AS active_24h,
          COUNT(*) FILTER (WHERE role = 'ADMIN')                         AS admins
        FROM users
      `),
      db.query(`
        SELECT
          COUNT(*)                                                                AS total,
          COUNT(*) FILTER (WHERE account_type = 'LIVE')                          AS live,
          COUNT(*) FILTER (WHERE account_type = 'DEMO')                          AS demo,
          COUNT(*) FILTER (WHERE connected = true)                               AS connected,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')         AS new_7d
        FROM mt5_accounts
      `),
      db.query(`
        SELECT
          COUNT(*)                                                                  AS total,
          COUNT(*) FILTER (WHERE status = 'OPEN')                                  AS open,
          COUNT(*) FILTER (WHERE status = 'CLOSED')                                AS closed,
          ROUND(SUM(profit) FILTER (WHERE status = 'CLOSED'), 2)                   AS total_profit,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')         AS trades_24h
        FROM trades
      `),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE active=true) AS active FROM copy_accounts`),
      db.query(`
        SELECT action, severity, created_at, data
        FROM audit_log ORDER BY created_at DESC LIMIT 20
      `)
    ]);

    return ok(res, {
      users:       users.rows[0],
      accounts:    accounts.rows[0],
      trades:      trades.rows[0],
      copy:        copy.rows[0],
      recent_audit: recentAudit.rows,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('admin/stats error:', e);
    return err(res, e.message, 500);
  }
};
