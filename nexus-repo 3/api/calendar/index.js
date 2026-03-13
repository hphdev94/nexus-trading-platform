/**
 * @module api/calendar
 * @description Trade calendar endpoint — daily P&L grouped by date.
 * Returns one entry per trading day for the requested account and year/month.
 * Used to power the monthly calendar view in the NEXUS frontend.
 */
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @query {string} account_id - MT5 account UUID (required)
 * @query {number} [year]     - Calendar year (defaults to current year)
 * @query {number} [month]    - Calendar month 1–12 (omit for full year)
 */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  const { account_id, year, month } = req.query;
  if (!account_id) return err(res, 'account_id required');

  const db = getPool();

  // Verify account ownership
  try {
    const { rows: acctRows } = await db.query(
      'SELECT id FROM mt5_accounts WHERE id=$1 AND user_id=$2',
      [account_id, user.id]
    );
    if (!acctRows.length) return err(res, 'Forbidden', 403);
  } catch (e) { return err(res, e.message, 500); }

  try {
    const targetYear  = parseInt(year)  || new Date().getFullYear();
    const targetMonth = parseInt(month) || null; // null = full year

    const { rows } = await db.query(
      `SELECT
         DATE(close_time)                     AS trade_date,
         COUNT(*)                             AS trades,
         ROUND(SUM(profit), 2)               AS daily_pl,
         COUNT(*) FILTER (WHERE profit > 0)  AS wins,
         COUNT(*) FILTER (WHERE profit <= 0) AS losses,
         ROUND(MAX(profit), 2)               AS best_trade,
         ROUND(MIN(profit), 2)               AS worst_trade,
         ROUND(SUM(commission), 2)           AS commission,
         ROUND(SUM(lots), 2)                 AS total_lots
       FROM trades
       WHERE account_id = $1
         AND user_id = $2
         AND status = 'CLOSED'
         AND close_time IS NOT NULL
         AND EXTRACT(YEAR FROM close_time) = $3
         AND ($4::int IS NULL OR EXTRACT(MONTH FROM close_time) = $4)
       GROUP BY DATE(close_time)
       ORDER BY trade_date`,
      [account_id, user.id, targetYear, targetMonth]
    );

    // Build a summary object too
    const totalPL    = rows.reduce((a, r) => a + parseFloat(r.daily_pl || 0), 0);
    const totalTrades = rows.reduce((a, r) => a + parseInt(r.trades || 0), 0);
    const profitDays = rows.filter(r => parseFloat(r.daily_pl) > 0).length;
    const lossDays   = rows.filter(r => parseFloat(r.daily_pl) <= 0).length;

    return ok(res, {
      days: rows,
      summary: {
        year: targetYear,
        month: targetMonth,
        total_pl: parseFloat(totalPL.toFixed(2)),
        total_trades: totalTrades,
        profit_days: profitDays,
        loss_days: lossDays,
        best_day:  rows.length ? Math.max(...rows.map(r => parseFloat(r.daily_pl))) : 0,
        worst_day: rows.length ? Math.min(...rows.map(r => parseFloat(r.daily_pl))) : 0
      }
    });
  } catch (e) {
    console.error('calendar error:', e);
    return err(res, e.message, 500);
  }
};
