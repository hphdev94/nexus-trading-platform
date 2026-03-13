# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 2.x (current) | ✅ |
| 1.x | ❌ |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues.**

If you discover a security vulnerability in NEXUS, please report it responsibly:

1. **Email:** Open a [GitHub Security Advisory](https://github.com/hphdev94/nexus-trading-platform/security/advisories/new) (private disclosure)
2. **Include:** Description, reproduction steps, potential impact, and suggested fix if known
3. **Response time:** We aim to acknowledge within 48 hours and provide a fix within 14 days for critical issues

We will credit you in the release notes unless you prefer to remain anonymous.

---

## Security Measures in NEXUS

### Authentication
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with configurable expiry (default 24h)
- Session validation on every request (DB-backed, not just JWT)
- Account lockout after 5 consecutive failed logins (15-minute cooldown)
- Constant-time comparison to prevent timing attacks

### API Security
- Rate limiting on all endpoints (auth endpoints: 20 req/15 min)
- Input validation on all POST/PATCH bodies
- Parameterised SQL queries — no string interpolation
- User ownership checked on all data queries (`WHERE user_id = $1`)
- ADMIN role checked server-side for admin endpoints

### Data Protection
- Passwords never returned in API responses
- MT5 passwords stored encrypted (credential storage)
- GDPR consent captured and timestamped at registration
- Full audit log of all significant actions
- Sessions invalidated on logout

### Infrastructure
- Security headers via Vercel config (X-Frame-Options, X-Content-Type-Options, etc.)
- CORS configured for known origins
- Environment variables for all secrets — none hardcoded
- SSL required for all database connections

---

## Known Limitations

- The WebSocket price feed in the Docker version is simulated — not connected to live broker data
- The MT5 bridge in the current version stores credentials only; live account sync requires additional setup
- The AI Agent requires an Anthropic API key — disable by omitting `ANTHROPIC_API_KEY`
