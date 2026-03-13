// api/trades/index.js
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
    try {
      const { account_id, status, symbol, from, to, limit = 500 } = req.query;
      let sql = 'SELECT * FROM trades WHERE user_id=$1';
      const params = [user.id];
      let i = 2;
      if (account_id) { sql += ` AND account_id=$${i++}`; params.push(account_id); }
      if (status)     { sql += ` AND status=$${i++}`;     params.push(status); }
      if (symbol)     { sql += ` AND symbol=$${i++}`;     params.push(symbol.toUpperCase()); }
      if (from)       { sql += ` AND open_time>=$${i++}`; params.push(from); }
      if (to)         { sql += ` AND open_time<=$${i++}`; params.push(to); }
      sql += ` ORDER BY open_time DESC LIMIT $${i}`;
      params.push(Math.min(parseInt(limit) || 500, 5000));
      const { rows } = await db.query(sql, params);
      return ok(res, rows);
    } catch (e) { return err(res, e.message, 500); }
  }

  if (req.method === 'POST') {
    const {
      account_id, symbol, direction, lots, open_price, close_price,
      stop_loss, take_profit, commission, swap, profit, profit_pips,
      open_time, close_time, status, mt5_ticket, close_reason, tags, notes
    } = req.body || {};

    if (!account_id) return err(res, 'account_id required');
    if (!symbol)     return err(res, 'symbol required');
    if (!direction || !['BUY','SELL'].includes(direction)) return err(res, 'direction must be BUY or SELL');
    if (!lots || isNaN(lots)) return err(res, 'valid lots required');
    if (!open_price) return err(res, 'open_price required');

    const duration = close_time && open_time
      ? Math.floor((new Date(close_time) - new Date(open_time)) / 1000) : null;

    try {
      const { rows } = await db.query(
        `INSERT INTO trades(account_id,user_id,symbol,direction,lots,open_price,close_price,
         stop_loss,take_profit,commission,swap,profit,profit_pips,open_time,close_time,
         duration_secs,status,mt5_ticket,close_reason,tags,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [
          account_id, user.id, symbol.toUpperCase(), direction,
          parseFloat(lots), parseFloat(open_price),
          close_price ? parseFloat(close_price) : null,
          stop_loss ? parseFloat(stop_loss) : null,
          take_profit ? parseFloat(take_profit) : null,
          parseFloat(commission)||0, parseFloat(swap)||0,
          profit != null ? parseFloat(profit) : null,
          profit_pips != null ? parseFloat(profit_pips) : null,
          open_time || new Date().toISOString(),
          close_time || null, duration,
          status || 'OPEN',
          mt5_ticket ? parseInt(mt5_ticket) : null,
          close_reason || null,
          tags || null, notes || null
        ]
      );
      return ok(res, rows[0], 201);
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
}
