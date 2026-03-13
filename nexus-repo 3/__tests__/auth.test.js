/**
 * @file auth.test.js
 * @description Integration tests for authentication API endpoints.
 * Tests register, login, token validation, rate limiting and logout.
 * Uses an in-memory mock of pg and jwt to avoid a live DB dependency.
 */
'use strict';

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const Pool = jest.fn(() => ({ query: mockQuery, on: jest.fn() }));
  Pool.__mockQuery = mockQuery;
  return { Pool };
});

jest.mock('bcrypt', () => ({
  hash:    jest.fn(async (pw) => `hashed_${pw}`),
  compare: jest.fn(async (plain, hashed) => hashed === `hashed_${plain}`)
}));

jest.mock('jsonwebtoken', () => ({
  sign:   jest.fn(() => 'mock.jwt.token'),
  verify: jest.fn((token) => {
    if (token === 'valid.jwt.token') return { uid: 'user-123', sid: 'session-abc' };
    throw new Error('invalid token');
  }),
  decode: jest.fn(() => ({ uid: 'user-123', sid: 'session-abc' }))
}));

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid-1234') }));

const { Pool } = require('pg');
const mockQuery = Pool.__mockQuery;

// ─── Helper: create mock req/res ──────────────────────────────────────────────
function mockRes() {
  const res = {
    _status: 200,
    _body:   null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body; return this; },
    end()        { return this; },
    setHeader(k, v) { this._headers[k] = v; }
  };
  return res;
}

function mockReq(method, body = {}, headers = {}) {
  return { method, body, headers, query: {}, socket: {} };
}

// ─── Tests: /api/auth/register ────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  const handler = require('../api/auth/register');

  beforeEach(() => {
    mockQuery.mockReset();
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc';
  });

  test('returns 405 for non-POST', async () => {
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  test('returns 422 for missing email', async () => {
    const req = mockReq('POST', { password: 'Password1', name: 'Test', gdpr: true });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/email/i);
  });

  test('returns 422 for weak password', async () => {
    const req = mockReq('POST', { email: 'test@test.com', password: 'weak', name: 'Test', gdpr: true });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('returns 409 for duplicate email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] }); // EXISTS check
    const req = mockReq('POST', { email: 'existing@test.com', password: 'Password1!', name: 'Test', gdpr: 'true' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(409);
    expect(res._body.error).toMatch(/already registered/i);
  });

  test('registers new user and returns token', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // not existing
      .mockResolvedValueOnce({ rows: [{ id: 'new-id', email: 'new@test.com', name: 'New User', role: 'USER' }] }) // INSERT user
      .mockResolvedValueOnce({ rows: [] }) // INSERT session
      .mockResolvedValueOnce({ rows: [] }); // INSERT audit_log

    const req = mockReq('POST', {
      email: 'new@test.com', password: 'Password1!', name: 'New User', gdpr: 'true'
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(201);
    expect(res._body).toHaveProperty('token', 'mock.jwt.token');
    expect(res._body.user.email).toBe('new@test.com');
  });

  test('returns 400 when GDPR not accepted', async () => {
    const req = mockReq('POST', { email: 'x@x.com', password: 'Password1!', name: 'X', gdpr: false });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/gdpr/i);
  });

  test('handles OPTIONS preflight', async () => {
    const req = mockReq('OPTIONS');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});

// ─── Tests: /api/auth/login ───────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  const handler = require('../api/auth/login');

  beforeEach(() => {
    mockQuery.mockReset();
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc';
  });

  test('returns 405 for GET', async () => {
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  test('returns 400 for missing credentials', async () => {
    const req = mockReq('POST', {});
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('returns 401 for unknown user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // user not found
    const req = mockReq('POST', { email: 'nobody@test.com', password: 'Password1!' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('returns 401 for wrong password', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'u@t.com', password_hash: 'hashed_right', active: true, login_fails: 0, locked_until: null }] })
      .mockResolvedValueOnce({ rows: [] }) // update fails
      .mockResolvedValueOnce({ rows: [] }); // audit log
    const req = mockReq('POST', { email: 'u@t.com', password: 'WrongPass1!' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('returns 200 with token for correct credentials', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'u@t.com', name: 'User', role: 'USER', password_hash: 'hashed_Password1!', active: true, login_fails: 0, locked_until: null }] })
      .mockResolvedValueOnce({ rows: [] }) // update last_login
      .mockResolvedValueOnce({ rows: [] }) // insert session
      .mockResolvedValueOnce({ rows: [] }); // audit
    const req = mockReq('POST', { email: 'u@t.com', password: 'Password1!' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty('token');
    expect(res._body.user.email).toBe('u@t.com');
  });

  test('returns 429 when account is locked', async () => {
    const lockedUntil = new Date(Date.now() + 60000).toISOString();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'u@t.com', password_hash: 'x', active: true, login_fails: 5, locked_until: lockedUntil }] });
    const req = mockReq('POST', { email: 'u@t.com', password: 'anything' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(429);
    expect(res._body.error).toMatch(/locked/i);
  });
});

// ─── Tests: /api/auth/me ──────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  const handler = require('../api/auth/me');

  beforeEach(() => {
    mockQuery.mockReset();
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc';
  });

  test('returns 401 without token', async () => {
    const req = mockReq('GET', {}, {});
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('returns 401 with invalid token', async () => {
    const req = mockReq('GET', {}, { authorization: 'Bearer bad.token.here' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('returns user for valid token with active session', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-123', email: 'u@t.com', name: 'User', role: 'USER' }]
    });
    const req = mockReq('GET', {}, { authorization: 'Bearer valid.jwt.token' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.user.id).toBe('user-123');
  });

  test('returns 405 for POST', async () => {
    const req = mockReq('POST');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});

// ─── Tests: /api/auth/logout ──────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  const handler = require('../api/auth/logout');

  beforeEach(() => {
    mockQuery.mockReset();
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc';
  });

  test('returns 200 even without valid token (graceful)', async () => {
    const req = mockReq('POST', {}, {});
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
  });
});
