// api/auth/login.js
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getPool } = require('../_lib/db');
const { cors, ok, err } = require('../_lib/auth');

// In-memory rate limit (per serverless instance; resets on cold start)
const attempts = new Map();
function checkRateLimit(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, resetAt: now + 900000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 900000; }
  entry.count++;
  attempts.set(key, entry);
  return entry.count;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  if (checkRateLimit(ip) > 20) return err(res, 'Too many attempts. Try again later.', 429);

  // Constant-time delay to prevent timing attacks
  await new Promise(r => setTimeout(r, 400 + Math.random() * 200));

  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 'Email and password required');

  const db = getPool();
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];

    if (!user || !user.active) {
      return err(res, 'Invalid credentials', 401);
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return err(res, 'Account locked. Try again in 15 minutes.', 429);
    }

    const ok_ = await bcrypt.compare(password, user.password_hash);
    if (!ok_) {
      const fails = (user.login_fails || 0) + 1;
      const lockUntil = fails >= 5 ? new Date(Date.now() + 900000) : null;
      await db.query(
        'UPDATE users SET login_fails=$1, locked_until=$2 WHERE id=$3',
        [fails, lockUntil, user.id]
      );
      await db.query(
        `INSERT INTO audit_log(user_id, action, data, severity) VALUES($1,'LOGIN_FAIL',$2,'WARN')`,
        [user.id, JSON.stringify({ fails })]
      );
      return err(res, `Invalid credentials. ${Math.max(0, 5 - fails)} attempts remaining.`, 401);
    }

    await db.query(
      'UPDATE users SET login_fails=0, locked_until=NULL, last_login=NOW() WHERE id=$1',
      [user.id]
    );

    const sid   = uuid();
    const token = jwt.sign({ uid: user.id, sid }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const expiresAt = new Date(Date.now() + 86400000);

    await db.query(
      `INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,$3)`,
      [user.id, sid, expiresAt]
    );
    await db.query(
      `INSERT INTO audit_log(user_id, action, data, severity) VALUES($1,'LOGIN_OK',$2,'INFO')`,
      [user.id, JSON.stringify({ email: user.email })]
    );

    return ok(res, {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (e) {
    console.error('login error:', e);
    return err(res, 'Server error', 500);
  }
}
