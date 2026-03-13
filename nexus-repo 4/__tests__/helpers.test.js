/**
 * @file helpers.test.js
 * @description Unit tests for shared library helpers — db pool, auth utilities,
 * CORS headers and response formatters.
 */
'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const Pool = jest.fn(() => ({ query: mockQuery, on: jest.fn() }));
  Pool.__mockQuery = mockQuery;
  return { Pool };
});

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const { Pool } = require('pg');
const mockQuery = Pool.__mockQuery;
const jwt = require('jsonwebtoken');

// ─── db.js ────────────────────────────────────────────────────────────────────
describe('api/_lib/db', () => {
  beforeEach(() => {
    jest.resetModules(); // Fresh module each test
    mockQuery.mockReset();
  });

  test('throws if DATABASE_URL is not set', () => {
    delete process.env.DATABASE_URL;
    // Re-require fresh instance after clearing env
    jest.resetModules();
    const { getPool } = require('../api/_lib/db');
    expect(() => getPool()).toThrow(/DATABASE_URL/);
  });

  test('returns Pool instance when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    jest.resetModules();
    const { getPool } = require('../api/_lib/db');
    const pool = getPool();
    expect(pool).toBeDefined();
    expect(pool.query).toBeDefined();
  });

  test('returns singleton (same instance on multiple calls)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    jest.resetModules();
    const { getPool } = require('../api/_lib/db');
    const p1 = getPool();
    const p2 = getPool();
    expect(p1).toBe(p2);
  });

  test('configures SSL for non-localhost connections', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-abc.neon.tech/nexusdb?sslmode=require';
    jest.resetModules();
    const { getPool } = require('../api/_lib/db');
    getPool();
    const poolConfig = Pool.mock.calls[Pool.mock.calls.length - 1][0];
    expect(poolConfig.ssl).not.toBe(false);
  });

  test('disables SSL for localhost connections', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/nexusdb';
    jest.resetModules();
    const { getPool } = require('../api/_lib/db');
    getPool();
    const poolConfig = Pool.mock.calls[Pool.mock.calls.length - 1][0];
    expect(poolConfig.ssl).toBe(false);
  });
});

// ─── auth.js helpers ──────────────────────────────────────────────────────────
describe('api/_lib/auth — cors/ok/err helpers', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    jest.resetModules();
  });

  function mockRes() {
    const h = {};
    return {
      _status: 200, _body: null,
      status(c) { this._status = c; return this; },
      json(b)   { this._body = b;  return this; },
      end()     { return this; },
      setHeader(k, v) { h[k] = v; },
      _headers: h
    };
  }

  test('cors() sets required CORS headers', () => {
    const { cors } = require('../api/_lib/auth');
    const res = mockRes();
    cors(res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toBeDefined();
    expect(res._headers['Access-Control-Allow-Headers']).toBeDefined();
  });

  test('ok() sends 200 with data by default', () => {
    const { ok } = require('../api/_lib/auth');
    const res = mockRes();
    ok(res, { foo: 'bar' });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ foo: 'bar' });
  });

  test('ok() accepts custom status code', () => {
    const { ok } = require('../api/_lib/auth');
    const res = mockRes();
    ok(res, { id: '123' }, 201);
    expect(res._status).toBe(201);
  });

  test('err() sends 400 with error message by default', () => {
    const { err } = require('../api/_lib/auth');
    const res = mockRes();
    err(res, 'Something went wrong');
    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: 'Something went wrong' });
  });

  test('err() accepts custom status code', () => {
    const { err } = require('../api/_lib/auth');
    const res = mockRes();
    err(res, 'Not found', 404);
    expect(res._status).toBe(404);
  });
});

// ─── auth.js — verifyToken ────────────────────────────────────────────────────
describe('api/_lib/auth — verifyToken', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    process.env.JWT_SECRET   = 'test-jwt-secret-minimum-32-chars';
    jest.resetModules();
    mockQuery.mockReset();
  });

  test('throws when Authorization header is missing', async () => {
    const { verifyToken } = require('../api/_lib/auth');
    await expect(verifyToken({ headers: {} })).rejects.toThrow('No token');
  });

  test('throws when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();
    const { verifyToken } = require('../api/_lib/auth');
    await expect(verifyToken({ headers: { authorization: 'Bearer sometoken' } }))
      .rejects.toThrow(/JWT_SECRET/);
  });

  test('throws on invalid JWT signature', async () => {
    const jwtMock = require('jsonwebtoken');
    jwtMock.verify.mockImplementationOnce(() => { throw new Error('invalid signature'); });
    const { verifyToken } = require('../api/_lib/auth');
    await expect(verifyToken({ headers: { authorization: 'Bearer badtoken' } }))
      .rejects.toThrow('invalid signature');
  });

  test('throws when session not found in DB', async () => {
    const jwtMock = require('jsonwebtoken');
    jwtMock.verify.mockReturnValueOnce({ uid: 'u1', sid: 's1' });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no session
    const { verifyToken } = require('../api/_lib/auth');
    await expect(verifyToken({ headers: { authorization: 'Bearer tok' } }))
      .rejects.toThrow(/expired/i);
  });

  test('returns user when session is valid', async () => {
    const jwtMock = require('jsonwebtoken');
    const user = { id: 'u1', email: 'u@t.com', name: 'Test', role: 'USER' };
    jwtMock.verify.mockReturnValueOnce({ uid: 'u1', sid: 's1' });
    mockQuery.mockResolvedValueOnce({ rows: [user] });
    const { verifyToken } = require('../api/_lib/auth');
    const result = await verifyToken({ headers: { authorization: 'Bearer valid' } });
    expect(result.id).toBe('u1');
    expect(result.email).toBe('u@t.com');
  });

  test('uses session cache to avoid repeated DB queries', async () => {
    const jwtMock = require('jsonwebtoken');
    const user = { id: 'u1', email: 'u@t.com', name: 'Test', role: 'USER' };
    jwtMock.verify.mockReturnValue({ uid: 'u1', sid: 'cached-sid' });
    mockQuery.mockResolvedValueOnce({ rows: [user] }); // only once
    const { verifyToken } = require('../api/_lib/auth');
    // First call hits DB
    await verifyToken({ headers: { authorization: 'Bearer tok1' } });
    // Second call should use cache (no additional DB call)
    await verifyToken({ headers: { authorization: 'Bearer tok2' } });
    // Session query was called only once despite two verifyToken calls
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
