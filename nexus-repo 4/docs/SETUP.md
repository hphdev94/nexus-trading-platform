# NEXUS — Detailed Setup Guide

## Table of Contents
1. [Requirements](#requirements)
2. [Docker Setup (Recommended)](#docker-setup)
3. [Manual Setup](#manual-setup)
4. [Production Deployment](#production-deployment)
5. [GitHub Actions CI/CD](#github-actions)
6. [Environment Variables Reference](#environment-variables)
7. [Troubleshooting](#troubleshooting)

---

## Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| RAM | 2 GB | 4 GB |
| CPU | 1 core | 2 cores |
| Disk | 5 GB | 20 GB |
| OS | Any with Docker | Ubuntu 22.04 LTS |
| Node.js | 18 | 20 LTS |
| PostgreSQL | 14 | 16 |
| Redis | 6 | 7 |

---

## Docker Setup

The fastest way to run the full stack.

### Step 1 — Clone
```bash
git clone https://github.com/YOUR_USERNAME/nexus-trading-platform.git
cd nexus-trading-platform
```

### Step 2 — Configure
```bash
cp .env.example .env
```

Edit `.env`:
```env
DB_PASSWORD=your-strong-db-password
REDIS_PASSWORD=your-strong-redis-password
JWT_SECRET=your-random-32-char-secret-string
ANTHROPIC_API_KEY=sk-ant-api03-...   # optional, enables AI Agent
CORS_ORIGIN=http://localhost          # change to your domain in production
```

### Step 3 — Launch
```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port 5432 (with schema auto-applied)
- **Redis** on port 6379
- **API server** on port 3001
- **Nginx** on port 80 (proxies frontend + API)

### Step 4 — Verify
```bash
# Check all containers are running
docker compose ps

# Check API health
curl http://localhost/api/health

# View logs
docker compose logs -f backend
```

Open **http://localhost** in your browser.

### Stopping
```bash
docker compose down          # Stop containers
docker compose down -v       # Stop + delete data volumes
```

---

## Manual Setup

### PostgreSQL
```bash
# Install (Ubuntu)
sudo apt install postgresql-16

# Create database and user
sudo -u postgres psql << EOF
CREATE USER nexus_user WITH PASSWORD 'your-password';
CREATE DATABASE nexus_trading OWNER nexus_user;
GRANT ALL PRIVILEGES ON DATABASE nexus_trading TO nexus_user;
EOF

# Apply schema
psql postgresql://nexus_user:your-password@localhost:5432/nexus_trading -f database/init.sql
```

### Redis
```bash
sudo apt install redis-server
sudo systemctl enable redis-server
```

### Backend API
```bash
cd backend
npm install

# Create .env
cat > .env << EOF
DATABASE_URL=postgresql://nexus_user:your-password@localhost:5432/nexus_trading
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-32-char-secret
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost
EOF

# Start
node server.js
# Or with PM2:
npm install -g pm2
pm2 start server.js --name nexus-api
pm2 save
```

### Frontend
```bash
# Serve with nginx (see nginx/nginx.conf)
sudo cp nginx/nginx.conf /etc/nginx/sites-available/nexus
sudo ln -s /etc/nginx/sites-available/nexus /etc/nginx/sites-enabled/
sudo cp frontend/index.html /var/www/nexus/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Production Deployment

### VPS Setup (fresh Ubuntu 22.04)
```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 3. Install Git
sudo apt install -y git

# 4. Clone repo
git clone https://github.com/YOUR_USERNAME/nexus-trading-platform.git /opt/nexus
cd /opt/nexus

# 5. Configure
cp .env.example .env
nano .env  # Set strong values for all variables

# 6. Launch
docker compose up -d --build

# 7. Enable auto-start on reboot
sudo systemctl enable docker
```

### SSL with Let's Encrypt
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
```

---

## GitHub Actions CI/CD

### Required Secrets
Set these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `DEPLOY_HOST` | Your server IP or domain |
| `DEPLOY_USER` | SSH username (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private SSH key for deployment |

### How it works
1. **On every push** → runs tests + syntax check + health check
2. **On push to `main`** → builds Docker image → pushes to GitHub Container Registry
3. **Deploy job** → SSHs into your server → `git pull` + `docker compose up`

### Setting up SSH key for deployment
```bash
# On your server, generate a deploy key
ssh-keygen -t ed25519 -C "nexus-deploy" -f ~/.ssh/nexus_deploy -N ""

# Add public key to authorized_keys
cat ~/.ssh/nexus_deploy.pub >> ~/.ssh/authorized_keys

# Copy private key content and add to GitHub Secrets as DEPLOY_SSH_KEY
cat ~/.ssh/nexus_deploy
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_PASSWORD` | ✅ | — | PostgreSQL password |
| `REDIS_PASSWORD` | ✅ | — | Redis password |
| `JWT_SECRET` | ✅ | — | JWT signing key (min 32 chars) |
| `ANTHROPIC_API_KEY` | ⚡ | — | Claude API key for AI Agent |
| `CORS_ORIGIN` | ✅ | `*` | Allowed CORS origin |
| `NODE_ENV` | ✅ | `production` | `production` / `development` |
| `PORT` | ❌ | `3001` | API server port |

---

## Troubleshooting

### Containers won't start
```bash
docker compose logs postgres
docker compose logs backend
# Usually a wrong DB_PASSWORD or port conflict
```

### Database connection errors
```bash
# Check postgres is healthy
docker compose exec postgres pg_isready -U nexus_user

# Re-run migrations
docker compose exec postgres psql -U nexus_user -d nexus_trading -f /docker-entrypoint-initdb.d/init.sql
```

### Port 80 already in use
```bash
# Find what's using port 80
sudo lsof -i :80
# Stop it, or change the port in docker-compose.yml
```

### Frontend shows blank page
```bash
# Check nginx logs
docker compose logs frontend
# Check API is reachable
curl http://localhost/api/health
```

### AI Agent not responding
- Check `ANTHROPIC_API_KEY` is set correctly in `.env`
- Verify the API key is valid at https://console.anthropic.com
- Check backend logs: `docker compose logs backend`

---

## GitHub Actions Secrets (required for CI/CD)

Go to your GitHub repo → **Settings → Secrets and variables → Actions** and add:

| Secret | Where to find it |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel project settings → General → Project ID area |
| `VERCEL_PROJECT_ID` | Vercel project settings → General |

To get `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` without the CLI:
1. Push to GitHub first
2. Import the repo on [vercel.com/new](https://vercel.com/new)
3. After import, go to project settings — both IDs are shown there

---

## Environment Variables on Vercel

In Vercel project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string (includes `?sslmode=require`) |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) — enables AI Agent |
| `NODE_ENV` | `production` |

---

## Demo Mode vs API Mode

The frontend auto-detects whether the backend is available:
- **API mode**: Backend responds to `/api/health` within 2.5s → all data goes to/from Postgres
- **Demo mode**: Backend unreachable → fully self-contained in-memory simulation

This means the frontend works as a standalone demo with no backend at all, and automatically upgrades to real persistence when deployed with a database.

Indicator visible in browser console:
```
[NEXUS] Backend connected     ← API mode (cyan)
[NEXUS] Demo mode (in-memory) ← Demo mode (orange)
```
