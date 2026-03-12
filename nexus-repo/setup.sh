#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  NEXUS Trading Platform — Quick Setup Script
# ═══════════════════════════════════════════════════════════
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗"
echo "  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝"
echo "  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗"
echo "  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║"
echo "  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║"
echo "  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Institutional Trading Platform v2.1${NC}"
echo ""

# ── Check Docker ──────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker not found.${NC}"
  echo "  Install it at: https://docs.docker.com/get-docker/"
  exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

if ! docker compose version &> /dev/null 2>&1; then
  echo -e "${RED}✗ Docker Compose not found.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker Compose found${NC}"

# ── Create .env ───────────────────────────────────────────
if [ ! -f .env ]; then
  echo ""
  echo -e "${YELLOW}Creating .env from template...${NC}"
  cp .env.example .env

  # Generate random secrets
  DB_PASS=$(openssl rand -base64 24 | tr -d '+/=' | head -c 28)
  REDIS_PASS=$(openssl rand -base64 24 | tr -d '+/=' | head -c 28)
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '+/=' | head -c 48)

  sed -i "s/NexusSecure2024!/${DB_PASS}/g" .env
  sed -i "s/NexusRedis2024!/${REDIS_PASS}/g" .env
  sed -i "s/change-this-to-a-long-random-string-minimum-32-chars/${JWT_SECRET}/g" .env

  echo -e "${GREEN}✓ .env created with auto-generated secrets${NC}"
  echo ""
  echo -e "${YELLOW}⚠  Optional: Add your Anthropic API key to .env to enable the AI Agent:${NC}"
  echo "   ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
  read -p "  Press Enter to continue, or Ctrl+C to edit .env first..."
else
  echo -e "${GREEN}✓ .env already exists${NC}"
fi

# ── Build & Launch ────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}Launching NEXUS...${NC}"
docker compose up -d --build

# ── Wait for health ───────────────────────────────────────
echo ""
echo -ne "Waiting for API to be ready"
for i in $(seq 1 30); do
  if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✓ API is healthy${NC}"
    break
  fi
  echo -n "."
  sleep 2
done

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  NEXUS is running! 🚀${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Platform:  ${CYAN}http://localhost${NC}"
echo -e "  API:       ${CYAN}http://localhost/api/health${NC}"
echo ""
echo -e "  ${BOLD}Demo Credentials:${NC}"
echo -e "  Admin:  admin@nexus.com  /  Admin123!"
echo -e "  Trader: trader@nexus.com /  Trade123!"
echo ""
echo -e "  ${YELLOW}Run 'docker compose logs -f' to watch logs${NC}"
echo -e "  ${YELLOW}Run 'docker compose down' to stop${NC}"
echo ""
