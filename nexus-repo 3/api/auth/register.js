// api/auth/register.js
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getPool } = require('../_lib/db');
const { cors, ok, err } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { email, password, name, gdpr } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return err(res, 'Invalid email');
  if (!password || password.length < 8)
    return err(res, 'Password must be 8+ characters');
  if (!/(?=.*[A-Z])(?=.*[0-9])/.test(password))
    return err(res, 'Password needs an uppercase letter and number');
  if (!name || !name.trim())
    return err(res, 'Name is required');
  if (!gdpr)
    return err(res, 'GDPR consent required');

  const db = getPool();
  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) return err(res, 'Email already registered', 409);

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users(email, password_hash, name, gdpr_consent, gdpr_at, terms_at)
       VALUES($1,$2,$3,true,NOW(),NOW()) RETURNING id, email, name, role`,
      [email.toLowerCase(), hash, name.trim()]
    );
    const user = rows[0];

    const sid   = uuid();
    const token = jwt.sign({ uid: user.id, sid }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const expiresAt = new Date(Date.now() + 86400000);

    await db.query(
      `INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,$3)`,
      [user.id, sid, expiresAt]
    );
    await db.query(
      `INSERT INTO audit_log(user_id, action, data, severity) VALUES($1,'REGISTER',$2,'INFO')`,
      [user.id, JSON.stringify({ email: user.email })]
    );

    return ok(res, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, 201);
  } catch (e) {
    console.error('register error:', e);
    return err(res, 'Server error', 500);
  }
}
