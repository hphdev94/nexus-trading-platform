# NEXUS Trading Platform

**Institutional-Grade Trading Intelligence** — Real-time candlestick charts, AI signals, MT5 integration (credentials only, no EA), unlimited copy trading, advanced analytics that beat myfxbook, and a conversational AI trading agent.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://docker.com)

---

## ✨ Features

| Feature | Description |
|---|---|
| 📊 **Live Candlestick Charts** | Real-time OHLC charts, MA20 overlay, all timeframes M1→MN |
| 🧠 **AI Trading Agent** | Conversational Claude-powered agent for trade analysis & strategy |
| 🔄 **Unlimited Copy Trading** | Mirror to unlimited MT5 accounts — MT5 credentials only, no EA needed |
| 📈 **Pro Analytics** | Better than myfxbook — drawdown, entry/exit accuracy, best/worst trades, duration stats, calendar P&L |
| 🧘 **Emotion Shield** | Cognitive bias protection — FOMO, revenge trading, overtrading prevention |
| 🌍 **50+ Instruments** | Forex, metals, indices, crypto, energies |
| 📅 **Trade Calendar** | Monthly P&L calendar with daily drill-down |
| 🤖 **Claude Code Bot** | Built-in AI vulnerability scanner and code fixer |
| 🔒 **Bank-Grade Security** | AES-256, JWT, rate limiting, GDPR, full audit trails |
| 📱 **Mobile-First** | Fully responsive — works on any device |

---

## 🚀 Quick Start (Docker — recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- An [Anthropic API key](https://console.anthropic.com) (for AI Agent — optional)

### 1. Clone the repo
```bash
git clone https://github.com/hphdev94/nexus-trading-platform.git
cd nexus-trading-platform
```

### 2. Configure environment
```bash
cp .env.example .env
# Open .env and set your values — especially JWT_SECRET and ANTHROPIC_API_KEY
```

### 3. Launch
```bash
docker compose up -d
```

### 4. Open
```
http://localhost
```

**Demo credentials:**
| Role | Email | Password |
|---|---|---|
| Admin | admin@nexus.com | Admin123! |
| Trader | trader@nexus.com | Trade123! |

---

## 🛠 Manual / Local Development

### Backend
```bash
cd backend
npm install
# Make sure PostgreSQL and Redis are running locally, then:
cp ../.env.example .env   # edit DATABASE_URL and REDIS_URL
npm run dev               # starts on :3001 with nodemon
```

### Frontend
The frontend is a single HTML file — no build step needed.
```bash
# Open directly in browser:
open frontend/index.html

# Or serve via any static server:
npx serve frontend
```

### Database
```bash
# With Docker:
docker compose up postgres -d

# Then initialise schema:
psql postgresql://nexus_user:NexusSecure2024!@localhost:5432/nexus_trading -f database/init.sql
```

---

## 📁 Project Structure

```
nexus-trading-platform/
├── frontend/
│   └── index.html          # Complete single-file frontend (no build step)
├── backend/
│   ├── server.js           # Express API + WebSocket price feed
│   ├── package.json
│   └── Dockerfile
├── database/
│   └── init.sql            # Full PostgreSQL schema + seed data
│                           # (50+ broker servers, all instruments)
├── nginx/
│   └── nginx.conf          # Reverse proxy config
├── .github/
│   └── workflows/
│       └── deploy.yml      # CI/CD pipeline (GitHub Actions)
├── docker-compose.yml      # Full stack: Postgres + Redis + API + Nginx
├── .env.example            # Environment variable template
└── README.md
```

---

## 🗄 Database Schema

| Table | Description |
|---|---|
| `users` | Auth, roles, GDPR consent, lockout |
| `sessions` | JWT session tracking |
| `mt5_accounts` | Connected MT5 accounts |
| `mt5_broker_servers` | 50+ broker servers (IC Markets, Pepperstone, Exness, XM…) |
| `instruments` | 50+ instruments with pip sizes and contract specs |
| `trades` | Full trade history with duration, accuracy metrics |
| `daily_snapshots` | Per-account daily equity snapshots |
| `copy_accounts` | Copy trading configuration |
| `audit_log` | Immutable event log |
| `ai_conversations` | AI agent conversation history |
| `price_ticks` | Partitioned tick data |
| `notifications` | User notifications |

---

## 🌐 API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/brokers?q=search       # MT5 broker server search
GET    /api/accounts               # User's MT5 accounts
POST   /api/accounts
DELETE /api/accounts/:id

GET    /api/trades?account_id=&status=&symbol=
POST   /api/trades
DELETE /api/trades/:id

GET    /api/analytics/:account_id  # Full analytics suite
GET    /api/calendar/:account_id   # Monthly P&L calendar

GET    /api/copy
POST   /api/copy
PATCH  /api/copy/:id
DELETE /api/copy/:id

POST   /api/ai/chat                # Claude AI agent
GET    /api/ai/conversations

GET    /api/instruments?category=
GET    /api/audit

WS     /ws                         # Real-time price feed
```

---

## 🔧 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | ✅ | PostgreSQL password |
| `REDIS_PASSWORD` | ✅ | Redis password |
| `JWT_SECRET` | ✅ | JWT signing secret (32+ chars) |
| `ANTHROPIC_API_KEY` | ⚡ | Enables AI Agent (get at console.anthropic.com) |
| `CORS_ORIGIN` | ✅ | Allowed frontend origin |
| `NODE_ENV` | ✅ | `production` or `development` |

---

## 🚢 Production Deployment

### VPS (Ubuntu/Debian)
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone and configure
git clone https://github.com/hphdev94/nexus-trading-platform.git
cd nexus-trading-platform
cp .env.example .env
nano .env  # Set strong passwords and JWT_SECRET

# Deploy
docker compose up -d --build

# Check logs
docker compose logs -f
```

### With SSL (Let's Encrypt)
Update `nginx/nginx.conf` to point to your domain and add Certbot:
```bash
docker compose exec frontend certbot --nginx -d yourdomain.com
```

---

## 🤖 MT5 Connection

No EA (Expert Advisor) required. Simply enter:
1. **Server name** — search from 50+ pre-loaded broker servers or type your own
2. **Login** — your MT5 account number
3. **Password** — your MT5 investor or master password

The platform handles connection via the NEXUS bridge API.

---

## 📊 Analytics — Better Than Myfxbook

NEXUS analytics include everything myfxbook offers, plus:
- ✅ Entry & exit accuracy percentage
- ✅ Longest/shortest winning trade duration
- ✅ Longest/shortest losing trade duration  
- ✅ Daily drawdown tracking
- ✅ Trade calendar with daily P&L
- ✅ Consecutive win/loss streaks
- ✅ Per-instrument breakdown
- ✅ Equity curve with drawdown overlay
- ✅ AI-powered performance commentary

---

## 🛡 Security

- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with Redis session validation
- Rate limiting: 20 auth requests / 15 min
- Account lockout after 5 failed attempts
- GDPR consent captured at registration
- Full audit log of all actions
- Input sanitisation (XSS prevention)
- Helmet.js security headers
- Environment variables for all secrets

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 🙋 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

*Built with ❤️ for professional traders. Not financial advice. Trading carries substantial risk.*
