# Changelog

All notable changes to NEXUS Trading Platform are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Nothing yet — add your changes here when working on a feature branch

---

## [2.1.0] — 2025-03-13

### Added
- **17 Vercel serverless API functions** — complete REST backend deployable with zero infrastructure
  - `api/auth/` — register, login, logout, me
  - `api/accounts/` — MT5 account CRUD with dynamic `[id]` routes
  - `api/trades/` — full trade lifecycle management
  - `api/analytics/[account_id]` — advanced analytics (win rate, profit factor, drawdown, entry/exit accuracy, consecutive streaks, trade calendar, by-symbol breakdown)
  - `api/copy/` — unlimited copy trading account management
  - `api/ai/chat` — Claude claude-sonnet-4-20250514 AI trading agent with conversation history
  - `api/ai/conversations` — conversation listing
  - `api/admin/users` — user management (ADMIN role required)
  - `api/admin/stats` — platform-wide statistics (ADMIN role required)
  - `api/calendar/` — daily P&L calendar with month/year filtering
  - `api/notifications/` — user notification centre (GET/PATCH/DELETE)
  - `api/brokers/` — MT5 broker server fuzzy search (50+ servers seeded)
  - `api/instruments/` — instrument catalogue by category
  - `api/audit/` — audit log viewer
  - `api/health/` — health check with DB connectivity test
- **`api/_lib/db.js`** — singleton pg pool with SSL auto-detection, env guard, error handler
- **`api/_lib/auth.js`** — JWT verification with session cache, CORS helpers, typed JSDoc
- **`vercel.json`** — explicit route rewrites + security headers
- **`__tests__/auth.test.js`** — 15 auth tests (register, login, me, logout — happy path + error cases)
- **`__tests__/api.test.js`** — 20 API tests (health, brokers, trades, copy, instruments, audit)
- **`__tests__/helpers.test.js`** — 13 unit tests for db pool and auth utilities
- **`package.json`** — scripts (`test`, `test:ci`, `lint`, `dev`), jest config with coverage thresholds, devDependencies
- **`.github/workflows/deploy.yml`** — 5-job CI/CD: lint → test+coverage → Vercel preview (PRs) → Vercel production (main) → security scan
- **`CONTRIBUTING.md`** — full contributor guide with workflow, standards, testing requirements
- **`SECURITY.md`** — vulnerability disclosure policy and security measures documentation
- **`CODE_OF_CONDUCT.md`** — Contributor Covenant v2.1
- **`CHANGELOG.md`** — this file
- **GitHub Issue Templates** — bug report and feature request
- **GitHub PR Template** — standardised checklist
- **`docs/SETUP.md`** — detailed setup guide covering Docker, manual, VPS and SSL

### Changed
- **CRITICAL FIX** — all 17 API handler files converted from mixed ESM/CJS to pure CommonJS (`module.exports =`). Previous `export default` syntax would cause Vercel runtime crashes
- **`api/_lib/auth.js`** — session query now checks `u.active = true`; added JWT_SECRET presence guard
- **`api/_lib/db.js`** — added DATABASE_URL presence guard, pool error event handler, correct SSL detection for Neon/Supabase
- **`.env.example`** — `DATABASE_URL` added as primary variable (required for Vercel); Docker-specific vars moved to a separate section
- **`.github/workflows/deploy.yml`** — completely rewritten; old workflow only ran Docker/SSH deploy; new workflow is Vercel-native with preview environments and smoke tests

### Security
- Added `u.active = true` check in session validation — deactivated users can no longer authenticate
- Added `JWT_SECRET` and `DATABASE_URL` guard checks to surface misconfiguration early
- Added security scan job to CI (npm audit + hardcoded secret detection)
- All admin endpoints enforce `role === 'ADMIN'` server-side

---

## [2.0.0] — 2025-03-12

### Added
- Initial complete platform release
- Single-file frontend (`public/index.html`) with:
  - Real-time candlestick chart engine (MA20, OHLC, all timeframes M1–MN)
  - Live market feed with 50+ instruments
  - Full positions, analytics, AI signals, calendar, copy trading, audit panels
  - Emotion Shield (FOMO / revenge trading / overtrading protection)
  - High-converting landing page with pricing tiers
  - Mobile-responsive layout
- Docker Compose stack (PostgreSQL 16 + Redis 7 + Node.js API + Nginx)
- PostgreSQL schema with 12 tables, analytics views, drawdown functions, partitioned price_ticks
- 50+ MT5 broker servers seeded (IC Markets, Pepperstone, Exness, XM, FXCM, FP Markets, etc.)
- 50+ instruments seeded (Forex, Metals, Indices, Crypto, Energy)
- Express.js backend with WebSocket price feed (250ms ticks)
- JWT + Redis session auth with bcrypt 12 rounds
- Full audit logging
- `setup.sh` automated setup script with secret generation
- `docs/SETUP.md` deployment guide

---

[Unreleased]: https://github.com/hphdev94/nexus-trading-platform/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/hphdev94/nexus-trading-platform/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/hphdev94/nexus-trading-platform/releases/tag/v2.0.0
