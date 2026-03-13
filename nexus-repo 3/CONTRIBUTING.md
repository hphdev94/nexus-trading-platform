# Contributing to NEXUS Trading Platform

Thank you for your interest in contributing! This document covers everything you need to get started.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Project Structure](#project-structure)
5. [Coding Standards](#coding-standards)
6. [Testing Requirements](#testing-requirements)
7. [Submitting a Pull Request](#submitting-a-pull-request)
8. [Reporting Bugs](#reporting-bugs)
9. [Requesting Features](#requesting-features)
10. [Security Vulnerabilities](#security-vulnerabilities)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold these standards. Report unacceptable behaviour to the maintainers.

---

## Getting Started

### Prerequisites

- Node.js 20+
- A free [Neon Postgres](https://neon.tech) account (or local PostgreSQL 16+)
- A free [Vercel](https://vercel.com) account (for deployments)
- Git

### Fork & Clone

```bash
# 1. Fork the repo on GitHub (click Fork button)
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/nexus-trading-platform.git
cd nexus-trading-platform

# 3. Add upstream remote
git remote add upstream https://github.com/hphdev94/nexus-trading-platform.git
```

### Install & Configure

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET
```

### Run Database Schema

```bash
# With Neon (replace with your connection string):
psql "$DATABASE_URL" -f database/init.sql

# Or with local PostgreSQL:
psql postgresql://localhost/nexus_trading -f database/init.sql
```

### Local Development

```bash
# Start Vercel dev server (serves frontend + API functions)
npm run dev
# Opens at http://localhost:3000
```

---

## Development Workflow

```
main        ← protected, production deployments only
  └── develop     ← integration branch, preview deployments
        └── feature/your-feature-name   ← your work
        └── fix/bug-description
        └── docs/what-you-documented
```

### Starting a New Feature

```bash
# Always branch from develop
git checkout develop
git pull upstream develop
git checkout -b feature/my-new-feature

# Work, commit often
git add -A
git commit -m "feat: add candlestick pattern detection"

# Push to your fork
git push origin feature/my-new-feature

# Open a PR against develop (NOT main)
```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

[optional body]
[optional footer]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that isn't a fix or feature |
| `test` | Adding or updating tests |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |
| `chore` | Maintenance (deps, tooling) |

**Examples:**
```
feat(analytics): add Sharpe ratio to overview stats
fix(auth): prevent timing attack on login endpoint
docs(readme): update Vercel deployment steps
test(trades): add tests for direction validation
```

---

## Project Structure

```
nexus-trading-platform/
├── api/                    ← Vercel serverless functions (Node.js CJS)
│   ├── _lib/
│   │   ├── auth.js         ← JWT verification, CORS, response helpers
│   │   └── db.js           ← Singleton pg pool
│   ├── auth/               ← register, login, logout, me
│   ├── accounts/           ← MT5 account CRUD
│   ├── trades/             ← Trade CRUD
│   ├── analytics/          ← Full analytics suite
│   ├── copy/               ← Copy trading management
│   ├── ai/                 ← Claude AI agent
│   ├── admin/              ← Admin-only endpoints
│   ├── calendar/           ← Daily P&L calendar
│   ├── notifications/      ← User notifications
│   ├── brokers/            ← MT5 broker server search
│   ├── instruments/        ← Instrument catalogue
│   ├── audit/              ← Audit log
│   └── health/             ← Health check
├── public/
│   └── index.html          ← Complete single-file frontend
├── database/
│   └── init.sql            ← Full PostgreSQL schema + seed data
├── backend/                ← Docker self-hosted alternative (optional)
├── nginx/                  ← Nginx config for Docker deployment
├── __tests__/              ← Jest test suite
├── .github/
│   ├── workflows/
│   │   └── deploy.yml      ← CI/CD pipeline
│   ├── ISSUE_TEMPLATE/     ← Bug report + feature request templates
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   └── SETUP.md            ← Detailed setup guide
├── vercel.json             ← Vercel routing + headers config
└── package.json            ← Root deps + scripts + jest config
```

---

## Coding Standards

### API Functions

All `api/` files must be **CommonJS** (not ESM):

```js
// ✅ CORRECT
const { getPool } = require('../_lib/db');
module.exports = async function handler(req, res) { ... };

// ❌ WRONG — Vercel serverless doesn't support ESM imports with require mix
import { getPool } from '../_lib/db.js';
export default async function handler(req, res) { ... }
```

Every handler must:
1. Call `cors(res)` first
2. Handle `OPTIONS` preflight immediately
3. Check method and return 405 if not supported
4. Validate auth with `verifyToken(req)` for protected routes
5. Wrap DB calls in try/catch and return `err(res, ...)` on failure

### JSDoc

All exported functions require JSDoc:

```js
/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @query {string} account_id - MT5 account UUID (required)
 */
module.exports = async function handler(req, res) { ... };
```

### Security Rules

- **Never** log full JWTs, passwords, or API keys
- **Never** return password hashes in API responses
- **Always** validate user ownership before returning data (`WHERE user_id = $1`)
- **Always** use parameterised queries — no string interpolation in SQL
- Rate limit sensitive endpoints

---

## Testing Requirements

All PRs must include tests. We use [Jest](https://jestjs.io/).

### Running Tests

```bash
npm test              # Run once with coverage
npm run test:watch    # Watch mode during development
npm run test:ci       # CI mode (used in GitHub Actions)
```

### Coverage Thresholds

The pipeline enforces minimum coverage:

| Metric | Minimum |
|---|---|
| Lines | 50% |
| Functions | 50% |
| Branches | 40% |
| Statements | 50% |

### Writing Tests

- Test files go in `__tests__/` with a `.test.js` suffix
- Mock `pg` and `jsonwebtoken` — tests should not need a live database
- Test both happy paths and error/edge cases
- At minimum: 401 (no auth), 400 (bad input), 200/201 (success), 404/409 (not found/conflict)

See `__tests__/auth.test.js` for a complete example.

---

## Submitting a Pull Request

### Before You Submit

- [ ] Tests pass: `npm test`
- [ ] No syntax errors: `node --check api/your-file.js`
- [ ] New code has JSDoc comments
- [ ] `.env.example` updated if you added new env vars
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`

### PR Checklist

When you open a PR you'll see the PR template. Fill in every section. PRs without a description, linked issue, or test evidence will be asked to add these before review.

### Review Process

1. Automated checks run (lint → test → preview deploy)
2. A maintainer reviews within 3–5 business days
3. Requested changes must be addressed in new commits (don't force-push during review)
4. Once approved, a maintainer merges to `develop`
5. Periodic releases merge `develop` → `main` triggering production deploy

---

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:

- What you expected to happen
- What actually happened
- Steps to reproduce (minimal reproduction preferred)
- Environment (OS, Node version, browser if frontend)
- Relevant logs or screenshots

---

## Requesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md). Include:

- The problem you're trying to solve
- Your proposed solution
- Alternatives you've considered
- Whether you'd be willing to implement it

---

## Security Vulnerabilities

**Do not open public issues for security vulnerabilities.**

Please read [SECURITY.md](SECURITY.md) for our responsible disclosure process.
