/**
 * @file api.test.js
 * @description Integration tests for core trading API endpoints.
 * Covers trades CRUD, analytics, copy trading, brokers and health check.
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
  sign:   jest.fn(() => 'mock.jwt.token'),
  verify: jest.fn((token) => {
    if (token === 'valid.jwt.token') return { uid: 'user-123', sid: 'session-abc' };
    throw new Error('invalid token');
  }),
  decode: jest.fn(() => ({ sid: 'session-abc' }))
}));

const { Pool } = require('pg');
const mockQuery = Pool.__mockQuery;

const MOCK_USER = { id: 'user-123', email: 'trader@nexus.com', name: 'Howard', role: 'USER' };
const AUTH_HEADER = { authorization: 'Bearer valid.jwt.token' };

function mockRes() {
  return {
    _status: 200, _body: null, _headers: {},
    status(c) { this._status = c; return this; },
    json(b)   { this._body = b;  return this; },
    end()     { return this; },
    setHeader(k, v) { this._headers[k] = v; }
  };
}
function mockReq(method, opts = {}) {
  return {
    method,
    body:    opts.body    || {},
    headers: opts.headers || {},
    query:   opts.query   || {},
    socket:  {}
  };
}

// Seed session query (called by verifyToken for every authenticated request)
function seedSession() {
  mockQuery.mockResolvedValueOnce({ rows: [MOCK_USER] }); // session DB check
}

// ─── Health Check ─────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  const handler = require('../api/health/index');
  beforeEach(() => mockQuery.mockReset());

  test('returns ok when DB responds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.status).toBe('ok');
    expect(res._body.db).toBe('ok');
    expect(res._body).toHaveProperty('version');
  });

  test('returns 500 when DB fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(500);
    expect(res._body.status).toBe('error');
  });
});

// ─── Brokers ──────────────────────────────────────────────────────────────────
describe('GET /api/brokers', () => {
  const handler = require('../api/brokers/index');
  beforeEach(() => mockQuery.mockReset());

  test('returns broker list', async () => {
    const brokers = [
      { id: '1', broker_name: 'IC Markets', server_name: 'ICMarketsSC-Demo', account_type: 'DEMO' },
      { id: '2', broker_name: 'Pepperstone', server_name: 'Pepperstone-Edge-1', account_type: 'LIVE' }
    ];
    mockQuery.mockResolvedValueOnce({ rows: brokers });
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body)).toBe(true);
    expect(res._body.length).toBe(2);
  });

  test('accepts search query param', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = mockReq('GET', { query: { q: 'ICM' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    // Verify the query param was used
    const calledSQL = mockQuery.mock.calls[0][0];
    expect(calledSQL).toMatch(/ILIKE/);
  });

  test('returns 405 for POST', async () => {
    const req = mockReq('POST');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});

// ─── Trades ───────────────────────────────────────────────────────────────────
describe('GET /api/trades', () => {
  const handler = require('../api/trades/index');
  beforeEach(() => { mockQuery.mockReset(); process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc'; });

  test('returns 401 without auth', async () => {
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('returns trades for authenticated user', async () => {
    seedSession();
    const trades = [
      { id: 't1', symbol: 'EUR/USD', direction: 'BUY', lots: 0.1, profit: 25.50 },
      { id: 't2', symbol: 'GBP/USD', direction: 'SELL', lots: 0.05, profit: -12.30 }
    ];
    mockQuery.mockResolvedValueOnce({ rows: trades });
    const req = mockReq('GET', { headers: AUTH_HEADER });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.length).toBe(2);
    expect(res._body[0].symbol).toBe('EUR/USD');
  });

  test('filters by status query param', async () => {
    seedSession();
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = mockReq('GET', { headers: AUTH_HEADER, query: { status: 'CLOSED' } });
    const res = mockRes();
    await handler(req, res);
    const sql = mockQuery.mock.calls[1][0]; // 2nd call is the trades query
    expect(sql).toMatch(/status/);
  });
});

describe('POST /api/trades', () => {
  const handler = require('../api/trades/index');
  beforeEach(() => { mockQuery.mockReset(); process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc'; });

  test('returns 401 without auth', async () => {
    const req = mockReq('POST', { body: { symbol: 'EUR/USD' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('returns 400 for missing required fields', async () => {
    seedSession();
    const req = mockReq('POST', { headers: AUTH_HEADER, body: { symbol: 'EUR/USD' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('creates trade successfully', async () => {
    seedSession();
    const newTrade = { id: 'new-t', symbol: 'EUR/USD', direction: 'BUY', lots: 0.1, open_price: 1.0892 };
    mockQuery.mockResolvedValueOnce({ rows: [newTrade] });
    const req = mockReq('POST', {
      headers: AUTH_HEADER,
      body: {
        account_id: 'acc-1', symbol: 'EUR/USD', direction: 'BUY',
        lots: 0.1, open_price: 1.0892, open_time: new Date().toISOString()
      }
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(201);
    expect(res._body.symbol).toBe('EUR/USD');
  });

  test('rejects invalid direction', async () => {
    seedSession();
    const req = mockReq('POST', {
      headers: AUTH_HEADER,
      body: { account_id: 'a1', symbol: 'EUR/USD', direction: 'INVALID', lots: 0.1, open_price: 1.089 }
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

// ─── Copy Trading ─────────────────────────────────────────────────────────────
describe('GET /api/copy', () => {
  const handler = require('../api/copy/index');
  beforeEach(() => { mockQuery.mockReset(); process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc'; });

  test('returns copy accounts for user', async () => {
    seedSession();
    const accounts = [{ id: 'ca1', label: 'Account A', server: 'ICMarkets', risk_pct: 100 }];
    mockQuery.mockResolvedValueOnce({ rows: accounts });
    const req = mockReq('GET', { headers: AUTH_HEADER });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body[0].label).toBe('Account A');
  });
});

describe('POST /api/copy', () => {
  const handler = require('../api/copy/index');
  beforeEach(() => { mockQuery.mockReset(); process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc'; });

  test('creates copy account', async () => {
    seedSession();
    const newAcc = { id: 'ca-new', label: 'Copy 1', server: 'Exness-MT5Real5', login: '123456', risk_pct: 50 };
    mockQuery
      .mockResolvedValueOnce({ rows: [newAcc] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });       // audit
    const req = mockReq('POST', {
      headers: AUTH_HEADER,
      body: { label: 'Copy 1', server: 'Exness-MT5Real5', login: '123456', risk_pct: 50 }
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(201);
    expect(res._body.label).toBe('Copy 1');
  });

  test('validates required fields', async () => {
    seedSession();
    const req = mockReq('POST', { headers: AUTH_HEADER, body: { label: 'Test' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

// ─── Instruments ──────────────────────────────────────────────────────────────
describe('GET /api/instruments', () => {
  const handler = require('../api/instruments/index');
  beforeEach(() => mockQuery.mockReset());

  test('returns instrument list', async () => {
    const instruments = [
      { symbol: 'EUR/USD', category: 'FOREX', pip_size: 0.00001 },
      { symbol: 'XAU/USD', category: 'METALS', pip_size: 0.01 }
    ];
    mockQuery.mockResolvedValueOnce({ rows: instruments });
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.length).toBe(2);
  });

  test('filters by category', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = mockReq('GET', { query: { category: 'CRYPTO' } });
    const res = mockRes();
    await handler(req, res);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/category/);
  });
});

// ─── Audit Log ────────────────────────────────────────────────────────────────
describe('GET /api/audit', () => {
  const handler = require('../api/audit/index');
  beforeEach(() => { mockQuery.mockReset(); process.env.JWT_SECRET = 'test-secret-32-chars-minimum-abc'; });

  test('returns audit entries for authenticated user', async () => {
    seedSession();
    const entries = [
      { id: 1, action: 'LOGIN_OK', severity: 'INFO', created_at: new Date().toISOString() }
    ];
    mockQuery.mockResolvedValueOnce({ rows: entries });
    const req = mockReq('GET', { headers: AUTH_HEADER });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(Array.isArray(res._body)).toBe(true);
  });

  test('returns 401 without token', async () => {
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});
