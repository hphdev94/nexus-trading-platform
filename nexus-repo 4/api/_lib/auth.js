/**
 * @module auth
 * @description Shared authentication utilities for Vercel serverless functions.
 * Provides JWT verification, CORS headers, and standardised response helpers.
 */
const jwt = require('jsonwebtoken');
const { getPool } = require('./db');

/**
 * In-memory session cache keyed by JWT sid claim.
 * Reduces DB round-trips on warm serverless instances.
 * @type {Map<string, {id:string, email:string, name:string, role:string}>}
 */
const sessionCache = new Map();

/**
 * Verifies a Bearer JWT from the Authorization header and validates the session in DB.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{id:string, email:string, name:string, role:string}>}
 * @throws {Error} If token is missing, invalid, or session is expired
 */
async function verifyToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new Error('No token');

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  const payload = jwt.verify(token, secret);

  if (sessionCache.has(payload.sid)) return sessionCache.get(payload.sid);

  const db = getPool();
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.name, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = true`,
    [payload.sid]
  );
  if (!rows.length) throw new Error('Session expired or user inactive');

  const user = rows[0];
  sessionCache.set(payload.sid, user);
  // Auto-expire from cache after 60 seconds
  setTimeout(() => sessionCache.delete(payload.sid), 60000);
  return user;
}

/**
 * Sets CORS headers permitting cross-origin API access.
 * @param {import('http').ServerResponse} res
 */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Sends a JSON success response.
 * @param {import('http').ServerResponse} res
 * @param {*} data - Payload to serialise
 * @param {number} [status=200] - HTTP status code
 */
function ok(res, data, status = 200) {
  cors(res);
  res.status(status).json(data);
}

/**
 * Sends a JSON error response.
 * @param {import('http').ServerResponse} res
 * @param {string} message - Error message
 * @param {number} [status=400] - HTTP status code
 */
function err(res, message, status = 400) {
  cors(res);
  res.status(status).json({ error: message });
}

module.exports = { verifyToken, cors, ok, err };
