// ═══════════════════════════════════════════════════════════
//  NEXUS TRADING PLATFORM — Backend API Server v2.1
// ═══════════════════════════════════════════════════════════
require('dotenv').config();
const express    = require('express');
const { Pool }   = require('pg');
const redis      = require('redis');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const compression= require('compression');
const morgan     = require('morgan');
const { v4: uuid}= require('uuid');
const { body, validationResult } = require('express-validator');
const Anthropic  = require('@anthropic-ai/sdk');
const WebSocket  = require('ws');
const http       = require('http');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── DB ──────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000
});

// ─── REDIS ───────────────────────────────────────────────
const rc = redis.createClient({ url: process.env.REDIS_URL });
rc.on('error', e => console.error('Redis error:', e));
rc.connect().catch(console.error);

// ─── ANTHROPIC ───────────────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// ─── MIDDLEWARE ───────────────────────────────────────────
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Too many auth attempts' }});
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ─── JWT MIDDLEWARE ───────────────────────────────────────
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const cached  = await rc.get(`sess:${payload.sid}`);
    if (!cached) return res.status(401).json({ error: 'Session expired' });
    req.user = JSON.parse(cached);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

async function adminAuth(req, res, next) {
  await auth(req, res, () => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

function validate(req, res, next) {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() });
  next();
}

async function logAudit(userId, action, data = {}, severity = 'INFO', req = null) {
  try {
    await db.query(
      `INSERT INTO audit_log(user_id,action,data,ip_address,severity) VALUES($1,$2,$3,$4,$5)`,
      [userId, action, JSON.stringify(data), req?.ip || null, severity]
    );
  } catch(e) { console.error('Audit log error:', e.message); }
}

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/(?=.*[A-Z])(?=.*[0-9])/),
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('gdpr').equals('true'),
  validate,
  async (req, res) => {
    try {
      const { email, password, name } = req.body;
      const exists = await db.query('SELECT id FROM users WHERE email=$1', [email]);
      if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await db.query(
        `INSERT INTO users(email,password_hash,name,gdpr_consent,gdpr_at,terms_at) VALUES($1,$2,$3,true,NOW(),NOW()) RETURNING id,email,name,role`,
        [email, hash, name]
      );
      const user = rows[0];
      const sid  = uuid();
      const token = jwt.sign({ uid: user.id, sid }, process.env.JWT_SECRET, { expiresIn: '24h' });
      await rc.setEx(`sess:${sid}`, 86400, JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }));
      await logAudit(user.id, 'REGISTER', { email }, 'INFO', req);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role }});
    } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
  }
);

app.post('/api/auth/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    // Deliberate delay to prevent timing attacks
    await new Promise(r => setTimeout(r, 400 + Math.random() * 200));
    try {
      const { email, password } = req.body;
      const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      // Check lockout
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(429).json({ error: 'Account locked. Try again later.' });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok || !user.active) {
        const fails = (user.login_fails || 0) + 1;
        const lockUntil = fails >= 5 ? new Date(Date.now() + 15*60*1000) : null;
        await db.query('UPDATE users SET login_fails=$1, locked_until=$2 WHERE id=$3', [fails, lockUntil, user.id]);
        await logAudit(user.id, 'LOGIN_FAIL', { fails }, 'WARN', req);
        return res.status(401).json({ error: `Invalid credentials. ${Math.max(0, 5 - fails)} attempts remaining.` });
      }

      await db.query('UPDATE users SET login_fails=0, locked_until=NULL, last_login=NOW() WHERE id=$1', [user.id]);
      const sid   = uuid();
      const token = jwt.sign({ uid: user.id, sid }, process.env.JWT_SECRET, { expiresIn: '24h' });
      await rc.setEx(`sess:${sid}`, 86400, JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }));
      await logAudit(user.id, 'LOGIN_OK', { email }, 'INFO', req);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role }});
    } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
  }
);

app.post('/api/auth/logout', auth, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const payload = jwt.decode(token);
    await rc.del(`sess:${payload.sid}`);
    await logAudit(req.user.id, 'LOGOUT', {}, 'INFO', req);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

// ═══════════════════════════════════════════════════════════
//  MT5 BROKER SERVERS
// ═══════════════════════════════════════════════════════════
app.get('/api/brokers', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let sql = 'SELECT * FROM mt5_broker_servers WHERE active=true';
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (broker_name ILIKE $1 OR server_name ILIKE $1)`;
    }
    sql += ' ORDER BY broker_name, account_type DESC LIMIT 100';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  MT5 ACCOUNTS
// ═══════════════════════════════════════════════════════════
app.get('/api/accounts', auth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM mt5_accounts WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]
  );
  res.json(rows);
});

app.post('/api/accounts', auth,
  body('label').trim().notEmpty(),
  body('login').trim().notEmpty(),
  body('server').trim().notEmpty(),
  validate,
  async (req, res) => {
    try {
      const { label, login, server, broker, account_type } = req.body;
      const { rows } = await db.query(
        `INSERT INTO mt5_accounts(user_id,label,login,server,broker,account_type) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, label, login, server, broker || null, account_type || 'LIVE']
      );
      await logAudit(req.user.id, 'MT5_ACCOUNT_ADD', { server, login: login.slice(0,4)+'***' }, 'INFO', req);
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

app.delete('/api/accounts/:id', auth, async (req, res) => {
  await db.query('DELETE FROM mt5_accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  TRADES
// ═══════════════════════════════════════════════════════════
app.get('/api/trades', auth, async (req, res) => {
  try {
    const { account_id, status, symbol, from, to, limit = 500 } = req.query;
    let sql = 'SELECT * FROM trades WHERE user_id=$1';
    const params = [req.user.id];
    let i = 2;
    if (account_id) { sql += ` AND account_id=$${i++}`; params.push(account_id); }
    if (status)     { sql += ` AND status=$${i++}`;     params.push(status); }
    if (symbol)     { sql += ` AND symbol=$${i++}`;     params.push(symbol.toUpperCase()); }
    if (from)       { sql += ` AND open_time>=$${i++}`; params.push(from); }
    if (to)         { sql += ` AND open_time<=$${i++}`; params.push(to); }
    sql += ` ORDER BY open_time DESC LIMIT $${i}`;
    params.push(Math.min(parseInt(limit), 5000));
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trades', auth, async (req, res) => {
  try {
    const { account_id, symbol, direction, lots, open_price, close_price, stop_loss, take_profit,
            commission, swap, profit, profit_pips, open_time, close_time, status, mt5_ticket, tags, notes } = req.body;
    const duration = close_time && open_time
      ? Math.floor((new Date(close_time) - new Date(open_time)) / 1000) : null;
    const { rows } = await db.query(
      `INSERT INTO trades(account_id,user_id,symbol,direction,lots,open_price,close_price,stop_loss,take_profit,
       commission,swap,profit,profit_pips,open_time,close_time,duration_secs,status,mt5_ticket,tags,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [account_id, req.user.id, symbol.toUpperCase(), direction, lots, open_price, close_price, stop_loss, take_profit,
       commission||0, swap||0, profit||null, profit_pips||null, open_time, close_time||null, duration,
       status||'OPEN', mt5_ticket||null, tags||null, notes||null]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trades/:id', auth, async (req, res) => {
  await db.query('DELETE FROM trades WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════════
app.get('/api/analytics/:account_id', auth, async (req, res) => {
  try {
    const { account_id } = req.params;
    // Verify ownership
    const acct = await db.query('SELECT id FROM mt5_accounts WHERE id=$1 AND user_id=$2', [account_id, req.user.id]);
    if (!acct.rows.length) return res.status(403).json({ error: 'Forbidden' });

    const [overview, bySymbol, daily, drawdown] = await Promise.all([
      db.query(`SELECT * FROM trade_analytics WHERE account_id=$1 AND symbol IS NULL`, [account_id]),
      db.query(`SELECT * FROM trade_analytics WHERE account_id=$1 ORDER BY total_profit DESC`, [account_id]),
      db.query(`SELECT * FROM daily_snapshots WHERE account_id=$1 ORDER BY snap_date DESC LIMIT 90`, [account_id]),
      db.query(`SELECT * FROM get_drawdown_series($1)`, [account_id])
    ]);

    // Advanced trade stats
    const adv = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE profit > 0) as wins,
        COUNT(*) FILTER (WHERE profit <= 0) as losses,
        MAX(profit) as best_trade_profit,
        MIN(profit) as worst_trade_profit,
        (SELECT symbol FROM trades WHERE account_id=$1 AND status='CLOSED' ORDER BY profit DESC LIMIT 1) as best_trade_symbol,
        (SELECT symbol FROM trades WHERE account_id=$1 AND status='CLOSED' ORDER BY profit ASC LIMIT 1) as worst_trade_symbol,
        MAX(duration_secs) FILTER (WHERE profit > 0) as longest_win_secs,
        MIN(duration_secs) FILTER (WHERE profit > 0) as shortest_win_secs,
        MAX(duration_secs) FILTER (WHERE profit <= 0) as longest_loss_secs,
        MIN(duration_secs) FILTER (WHERE profit <= 0) as shortest_loss_secs,
        AVG(entry_accuracy) as avg_entry_acc,
        AVG(exit_accuracy) as avg_exit_acc,
        SUM(profit) FILTER (WHERE profit > 0) as gross_profit,
        ABS(SUM(profit) FILTER (WHERE profit <= 0)) as gross_loss,
        COUNT(DISTINCT symbol) as symbols_traded,
        AVG(lots) as avg_lots,
        SUM(commission) as total_commission,
        SUM(swap) as total_swap,
        -- Consecutive stats
        MAX(consec_wins) as max_consec_wins,
        MAX(consec_losses) as max_consec_losses
      FROM trades t
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) OVER (PARTITION BY grp) as consec_wins,
          0 as consec_losses
        FROM (
          SELECT *, SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) OVER (ORDER BY open_time) as grp
          FROM trades WHERE account_id=$1 AND status='CLOSED' AND profit > 0
        ) x
      ) cw ON true
      LEFT JOIN LATERAL (
        SELECT 0 as consec_wins, COUNT(*) OVER (PARTITION BY grp) as consec_losses
        FROM (
          SELECT *, SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) OVER (ORDER BY open_time) as grp
          FROM trades WHERE account_id=$1 AND status='CLOSED' AND profit <= 0
        ) x
      ) cl ON true
      WHERE t.account_id=$1 AND t.status='CLOSED'
    `, [account_id]);

    res.json({
      overview:  overview.rows[0] || {},
      by_symbol: bySymbol.rows,
      daily:     daily.rows,
      drawdown:  drawdown.rows,
      advanced:  adv.rows[0] || {}
    });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Calendar P&L
app.get('/api/calendar/:account_id', auth, async (req, res) => {
  try {
    const { account_id } = req.params;
    const { year, month } = req.query;
    const { rows } = await db.query(`
      SELECT
        DATE(open_time) as trade_date,
        COUNT(*) as trades,
        SUM(profit) as daily_pl,
        COUNT(*) FILTER (WHERE profit > 0) as wins,
        COUNT(*) FILTER (WHERE profit <= 0) as losses,
        MAX(profit) as best,
        MIN(profit) as worst
      FROM trades
      WHERE account_id=$1 AND user_id=$2 AND status='CLOSED'
        AND EXTRACT(YEAR FROM open_time)=$3
        AND ($4::int IS NULL OR EXTRACT(MONTH FROM open_time)=$4)
      GROUP BY DATE(open_time)
      ORDER BY trade_date
    `, [account_id, req.user.id, year || new Date().getFullYear(), month || null]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  COPY TRADING
// ═══════════════════════════════════════════════════════════
app.get('/api/copy', auth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM copy_accounts WHERE user_id=$1', [req.user.id]);
  res.json(rows);
});

app.post('/api/copy', auth,
  body('label').trim().notEmpty(),
  body('server').trim().notEmpty(),
  body('login').trim().notEmpty(),
  validate,
  async (req, res) => {
    try {
      const { label, server, login, source_id, risk_pct, max_lots, reverse } = req.body;
      const { rows } = await db.query(
        `INSERT INTO copy_accounts(user_id,source_id,label,server,login,risk_pct,max_lots,reverse) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.id, source_id||null, label, server, login, risk_pct||100, max_lots||null, reverse||false]
      );
      await logAudit(req.user.id, 'COPY_ADD', { label, server }, 'INFO', req);
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  }
);

app.patch('/api/copy/:id', auth, async (req, res) => {
  const { active, risk_pct } = req.body;
  const { rows } = await db.query(
    'UPDATE copy_accounts SET active=$1, risk_pct=COALESCE($2,risk_pct) WHERE id=$3 AND user_id=$4 RETURNING *',
    [active, risk_pct, req.params.id, req.user.id]
  );
  res.json(rows[0]);
});

app.delete('/api/copy/:id', auth, async (req, res) => {
  await db.query('DELETE FROM copy_accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  AI AGENT
// ═══════════════════════════════════════════════════════════
app.get('/api/ai/conversations', auth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, title, created_at, updated_at FROM ai_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/ai/conversations/:id', auth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM ai_conversations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.post('/api/ai/chat', auth, async (req, res) => {
  if (!anthropic) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { message, conversation_id, context } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    // Load conversation history
    let conv = null;
    if (conversation_id) {
      const { rows } = await db.query(
        'SELECT * FROM ai_conversations WHERE id=$1 AND user_id=$2', [conversation_id, req.user.id]
      );
      conv = rows[0];
    }

    const history = conv?.messages || [];
    history.push({ role: 'user', content: message });

    // Build system prompt with trading context
    const systemPrompt = `You are NEXUS AI, an institutional-grade trading intelligence assistant for the NEXUS trading platform. You have deep expertise in:
- Forex, CFD, commodities, indices and cryptocurrency trading
- Technical analysis (candlestick patterns, indicators, Elliott Wave, Fibonacci)
- Risk management and position sizing
- Trade psychology and cognitive bias
- MetaTrader 5 platform and MQL5 programming
- Portfolio analytics and performance metrics
- Market microstructure and order flow

${context?.account ? `Current account context: Balance $${context.account.balance}, Equity $${context.account.equity}, Open trades: ${context.account.open_trades}` : ''}
${context?.recent_trades ? `Recent trades: ${JSON.stringify(context.recent_trades?.slice(0,5))}` : ''}

Provide actionable, specific trading insights. When discussing strategies, always include risk warnings. Format responses clearly with markdown when helpful.
Today's date: ${new Date().toISOString().slice(0,10)}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: history.map(m => ({ role: m.role, content: m.content }))
    });

    const reply = response.content[0].text;
    history.push({ role: 'assistant', content: reply });

    // Save/update conversation
    let savedId = conversation_id;
    if (conv) {
      await db.query(
        'UPDATE ai_conversations SET messages=$1, updated_at=NOW() WHERE id=$2',
        [JSON.stringify(history), conv.id]
      );
    } else {
      const title = message.slice(0, 80);
      const { rows } = await db.query(
        'INSERT INTO ai_conversations(user_id,title,messages) VALUES($1,$2,$3) RETURNING id',
        [req.user.id, title, JSON.stringify(history)]
      );
      savedId = rows[0].id;
    }

    res.json({ reply, conversation_id: savedId, history });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  INSTRUMENTS
// ═══════════════════════════════════════════════════════════
app.get('/api/instruments', async (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM instruments WHERE active=true';
  const params = [];
  if (category) { sql += ' AND category=$1'; params.push(category.toUpperCase()); }
  sql += ' ORDER BY category, symbol';
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════════
app.get('/api/audit', auth, async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const { rows } = await db.query(
    `SELECT * FROM audit_log WHERE ${isAdmin ? 'true' : 'user_id=$1'} ORDER BY created_at DESC LIMIT 500`,
    isAdmin ? [] : [req.user.id]
  );
  res.json(rows);
});

// ═══════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ═══════════════════════════════════════════════════════════
app.get('/api/admin/users', adminAuth, async (req, res) => {
  const { rows } = await db.query('SELECT id,email,name,role,active,created_at,last_login,login_fails FROM users ORDER BY created_at DESC');
  res.json(rows);
});

app.patch('/api/admin/users/:id', adminAuth, async (req, res) => {
  const { active, role } = req.body;
  const { rows } = await db.query(
    'UPDATE users SET active=COALESCE($1,active), role=COALESCE($2,role) WHERE id=$3 RETURNING id,email,name,role,active',
    [active, role, req.params.id]
  );
  res.json(rows[0]);
});

// ═══════════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════════
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await rc.ping();
    res.json({ status: 'ok', db: 'ok', redis: 'ok', ts: new Date().toISOString() });
  } catch(e) { res.status(500).json({ status: 'error', error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
//  WEBSOCKET — Live Price Feed Simulation
// ═══════════════════════════════════════════════════════════
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });

const SYMBOLS = {
  'EURUSD':1.0892,'GBPUSD':1.2645,'USDJPY':149.82,'USDCHF':0.8951,'AUDUSD':0.6523,
  'USDCAD':1.3621,'NZDUSD':0.6012,'EURGBP':0.8614,'EURJPY':163.21,'GBPJPY':189.45,
  'XAUUSD':2342.5,'XAGUSD':27.83,'US30':38945,'NAS100':17823,'SPX500':5187,
  'UK100':8042,'GER40':18312,'BTCUSD':67234,'ETHUSD':3456,'LTCUSD':89.45
};
const SPREADS = {
  'EURUSD':0.00010,'GBPUSD':0.00012,'USDJPY':0.012,'USDCHF':0.00015,'AUDUSD':0.00013,
  'USDCAD':0.00014,'NZDUSD':0.00016,'EURGBP':0.00014,'EURJPY':0.015,'GBPJPY':0.018,
  'XAUUSD':0.35,'XAGUSD':0.04,'US30':2.5,'NAS100':1.2,'SPX500':0.8,
  'UK100':1.5,'GER40':1.2,'BTCUSD':15,'ETHUSD':1.8,'LTCUSD':0.12
};

let prices = {};
Object.keys(SYMBOLS).forEach(sym => {
  prices[sym] = { bid: SYMBOLS[sym], ask: SYMBOLS[sym] + (SPREADS[sym]||0.0001), chg: 0, pct: 0 };
});

function tickPrices() {
  Object.keys(prices).forEach(sym => {
    const vol = (SPREADS[sym]||0.0001) * 3;
    const prev = prices[sym].bid;
    const nb   = Math.max(prev * 0.93, prev + (Math.random() - 0.499) * vol * 0.8);
    const sp   = SPREADS[sym] || 0.0001;
    prices[sym] = {
      bid: nb, ask: nb + sp,
      chg: nb - SYMBOLS[sym],
      pct: ((nb - SYMBOLS[sym]) / SYMBOLS[sym]) * 100,
      hi:  Math.max(prices[sym].hi || nb, nb),
      lo:  Math.min(prices[sym].lo || nb, nb),
      ts:  Date.now()
    };
  });
}

setInterval(() => {
  tickPrices();
  const payload = JSON.stringify({ type: 'tick', prices });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch(e) {}
    }
  });
}, 250);

wss.on('connection', (ws, req) => {
  console.log('WS client connected');
  ws.send(JSON.stringify({ type: 'init', prices }));
  ws.on('error', e => console.error('WS error:', e.message));
});

// ─── START ───────────────────────────────────────────────
server.listen(PORT, () => console.log(`NEXUS API running on :${PORT}`));
module.exports = { app, server };
