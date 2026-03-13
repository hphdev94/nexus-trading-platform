// api/analytics/[account_id].js — Full advanced analytics
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  const { account_id } = req.query;
  const db = getPool();

  // Verify ownership
  try {
    const acct = await db.query(
      'SELECT id FROM mt5_accounts WHERE id=$1 AND user_id=$2',
      [account_id, user.id]
    );
    if (!acct.rows.length) return err(res, 'Forbidden', 403);
  } catch (e) { return err(res, e.message, 500); }

  try {
    const [overview, bySymbol, daily, trades] = await Promise.all([
      // Overview stats
      db.query(`
        SELECT
          COUNT(*)                                                            AS total_trades,
          COUNT(*) FILTER (WHERE profit > 0)                                 AS wins,
          COUNT(*) FILTER (WHERE profit <= 0)                                AS losses,
          ROUND(COUNT(*) FILTER (WHERE profit>0)*100.0/NULLIF(COUNT(*),0),2) AS win_rate_pct,
          ROUND(SUM(profit),2)                                               AS total_profit,
          ROUND(AVG(profit) FILTER (WHERE profit>0),2)                       AS avg_win,
          ROUND(AVG(ABS(profit)) FILTER (WHERE profit<=0),2)                 AS avg_loss,
          MAX(profit)                                                         AS best_trade,
          MIN(profit)                                                         AS worst_trade,
          ROUND(SUM(profit) FILTER (WHERE profit>0),2)                       AS gross_profit,
          ROUND(ABS(SUM(profit) FILTER (WHERE profit<=0)),2)                 AS gross_loss,
          ROUND(
            ABS(SUM(profit) FILTER (WHERE profit>0)) /
            NULLIF(ABS(SUM(profit) FILTER (WHERE profit<=0)),0), 2
          )                                                                   AS profit_factor,
          MAX(duration_secs) FILTER (WHERE profit>0)                         AS longest_win_secs,
          MIN(duration_secs) FILTER (WHERE profit>0 AND duration_secs>0)     AS shortest_win_secs,
          MAX(duration_secs) FILTER (WHERE profit<=0)                        AS longest_loss_secs,
          MIN(duration_secs) FILTER (WHERE profit<=0 AND duration_secs>0)    AS shortest_loss_secs,
          ROUND(AVG(lots),2)                                                  AS avg_lots,
          ROUND(SUM(commission),2)                                            AS total_commission,
          ROUND(SUM(swap),2)                                                  AS total_swap,
          COUNT(DISTINCT symbol)                                              AS symbols_traded,
          ROUND(AVG(entry_accuracy),2)                                        AS avg_entry_accuracy,
          ROUND(AVG(exit_accuracy),2)                                         AS avg_exit_accuracy
        FROM trades
        WHERE account_id=$1 AND status='CLOSED'
      `, [account_id]),

      // By symbol
      db.query(`
        SELECT
          symbol,
          COUNT(*)                                                             AS total_trades,
          COUNT(*) FILTER (WHERE profit>0)                                    AS wins,
          COUNT(*) FILTER (WHERE profit<=0)                                   AS losses,
          ROUND(COUNT(*) FILTER (WHERE profit>0)*100.0/NULLIF(COUNT(*),0),2) AS win_rate_pct,
          ROUND(SUM(profit),2)                                                AS total_profit,
          ROUND(AVG(profit),2)                                                AS avg_profit,
          MAX(profit)                                                          AS best,
          MIN(profit)                                                          AS worst,
          ROUND(AVG(lots),2)                                                   AS avg_lots
        FROM trades
        WHERE account_id=$1 AND status='CLOSED'
        GROUP BY symbol ORDER BY total_profit DESC
      `, [account_id]),

      // Daily snapshots
      db.query(`
        SELECT * FROM daily_snapshots
        WHERE account_id=$1
        ORDER BY snap_date DESC LIMIT 365
      `, [account_id]),

      // All closed trades for streak/calendar computation
      db.query(`
        SELECT id, symbol, direction, lots, open_price, close_price,
               profit, profit_pips, open_time, close_time, duration_secs, close_reason
        FROM trades
        WHERE account_id=$1 AND status='CLOSED'
        ORDER BY close_time DESC LIMIT 1000
      `, [account_id])
    ]);

    // Compute consecutive win/loss streaks
    const tradeList = trades.rows;
    let maxCW = 0, maxCL = 0, curStreak = 0;
    tradeList.slice().reverse().forEach(t => {
      if ((t.profit || 0) > 0) {
        curStreak = curStreak > 0 ? curStreak + 1 : 1;
        maxCW = Math.max(maxCW, curStreak);
      } else {
        curStreak = curStreak < 0 ? curStreak - 1 : -1;
        maxCL = Math.max(maxCL, Math.abs(curStreak));
      }
    });

    // Build calendar data
    const calendar = {};
    tradeList.forEach(t => {
      const day = (t.close_time || t.open_time || '').slice(0, 10);
      if (!day) return;
      if (!calendar[day]) calendar[day] = { trades: 0, pl: 0, wins: 0, losses: 0, best: -Infinity, worst: Infinity };
      const d = calendar[day];
      d.trades++;
      d.pl = parseFloat((d.pl + parseFloat(t.profit || 0)).toFixed(4));
      if ((t.profit || 0) > 0) { d.wins++; d.best = Math.max(d.best, t.profit); }
      else { d.losses++; d.worst = Math.min(d.worst, t.profit); }
    });

    // Fix Infinity
    Object.values(calendar).forEach(d => {
      if (!isFinite(d.best))  d.best  = 0;
      if (!isFinite(d.worst)) d.worst = 0;
    });

    return ok(res, {
      overview:       { ...overview.rows[0], max_consec_wins: maxCW, max_consec_losses: maxCL },
      by_symbol:      bySymbol.rows,
      daily:          daily.rows,
      calendar,
      recent_trades:  tradeList.slice(0, 50)
    });
  } catch (e) {
    console.error('analytics error:', e);
    return err(res, e.message, 500);
  }
}
