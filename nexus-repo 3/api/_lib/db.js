/**
 * @module db
 * @description Shared PostgreSQL connection pool for Vercel serverless functions.
 * Uses a module-level singleton to reuse connections across warm invocations.
 */
const { Pool } = require('pg');

/** @type {Pool|null} */
let pool = null;

/**
 * Returns a singleton pg Pool instance.
 * Configures SSL automatically for non-local connections (Neon, Supabase, etc.)
 * @returns {Pool}
 */
function getPool() {
  if (!pool) {
    const connStr = process.env.DATABASE_URL;
    if (!connStr) throw new Error('DATABASE_URL environment variable is not set');
    pool = new Pool({
      connectionString: connStr,
      max: 3, // Vercel serverless: keep pool small to avoid connection exhaustion
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: connStr.includes('localhost') || connStr.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
    });
    pool.on('error', (err) => console.error('pg pool error:', err.message));
  }
  return pool;
}

module.exports = { getPool };
