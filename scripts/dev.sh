#!/bin/bash
# =============================================================================
# Chipp Deno Development Server
# =============================================================================
#
# This script starts all services needed for local development of the Chipp
# consumer application (chipp-deno).
#
# ARCHITECTURE OVERVIEW:
# ----------------------
# The consumer app consists of three main components that work together:
#
#   1. DENO API SERVER (port 8000)
#      - Backend API handling auth, chat, applications, etc.
#      - Runs with --watch for auto-reload on file changes
#      - Loads .env for database, Redis, R2, and other configs
#
#   2. SVELTE SPA (port 5173 via Vite)
#      - Frontend single-page application
#      - Hot module replacement (HMR) for instant updates
#      - Hash-based routing (e.g., /#/w/chat/my-app)
#
#   3. CLOUDFLARE WORKER (port 8788)
#      - Edge proxy that serves the SPA from R2 bucket
#      - Injects app-specific branding (logo, colors) into HTML
#      - Proxies API calls to the Deno server
#      - Required for testing PWA install prompts and brand injection
#
# LOCAL VS PRODUCTION:
# --------------------
# In production, the Cloudflare Worker runs at the edge and:
#   - Serves static assets from R2 bucket (chipp-deno-spa)
#   - Reads brand config from R2 (brands/{slug}/config.json)
#   - Injects window.__APP_BRAND__ for instant branded splash screens
#   - Proxies /api/*, /auth/*, /consumer/* to the Deno API
#
# For local development with full brand injection:
#   - Access the app via http://localhost:8788 (through Worker)
#   - NOT http://localhost:5173 (direct Vite - no brand injection)
#
# For rapid frontend iteration without brand features:
#   - Access http://localhost:5173 directly (faster HMR)
#   - Brand injection won't work, but chat/auth will via API proxy
#
# R2 BUCKET SETUP:
# ----------------
# The Worker uses the dev R2 bucket (chipp-deno-spa-dev) which mirrors
# production structure:
#   - /index.html, /assets/* - Built SPA files
#   - /brands/{slug}/config.json - App branding (logo, colors)
#
# To upload SPA assets to dev R2 (required for Worker to serve):
#   cd cloudflare-worker && ./scripts/upload-assets.sh
#
# Brand configs are synced automatically when apps are created/updated
# via the brand-sync.service.ts (requires R2_* env vars).
#
# USAGE:
# ------
#   ./scripts/dev.sh              # Start all services
#   ./scripts/dev.sh --no-worker  # Start without Cloudflare Worker
#   ./scripts/dev.sh --api-only   # Start only the Deno API server
#
# =============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# -----------------------------------------------------------------------------
# Setup logging to file
# -----------------------------------------------------------------------------
LOG_DIR="$DIR/.scratch/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/chipp-deno-$(date +%Y%m%d-%H%M%S).log"

# Create a symlink to latest log for easy access
LATEST_LOG="$LOG_DIR/chipp-deno-latest.log"
rm -f "$LATEST_LOG"
ln -sf "$LOG_FILE" "$LATEST_LOG"

echo "Logging to: $LOG_FILE"
echo "Latest log: $LATEST_LOG"

# Write log header
{
  echo "========================================"
  echo "Chipp Deno Development Server"
  echo "Started: $(date)"
  echo "Log file: $LOG_FILE"
  echo "========================================"
  echo ""
} > "$LOG_FILE"

# -----------------------------------------------------------------------------
# Parse command line arguments
# -----------------------------------------------------------------------------
START_WORKER=true
START_WEB=true
START_API=true

for arg in "$@"; do
  case $arg in
    --no-worker)
      START_WORKER=false
      ;;
    --api-only)
      START_WEB=false
      START_WORKER=false
      ;;
    --help|-h)
      echo "Usage: ./scripts/dev.sh [options]"
      echo ""
      echo "Options:"
      echo "  --no-worker   Don't start Cloudflare Worker (no brand injection)"
      echo "  --api-only    Only start the Deno API server"
      echo "  --help        Show this help message"
      echo ""
      echo "Ports:"
      echo "  8000  Deno API server"
      echo "  5173  Vite dev server (Svelte SPA)"
      echo "  8788  Cloudflare Worker (brand injection + R2 serving)"
      exit 0
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Load environment variables
# -----------------------------------------------------------------------------
# Load .env files safely, handling special characters in passwords.
# Order: monorepo root first, then local overrides.
load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      # Skip comments and empty lines
      [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
      # Extract var name and value
      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        local name="${BASH_REMATCH[1]}"
        local value="${BASH_REMATCH[2]}"
        # Remove surrounding quotes if present
        value="${value#[\"\']}"
        value="${value%[\"\']}"
        export "$name=$value"
      fi
    done < "$file"
  fi
}

load_env_file "$DIR/.env"

# -----------------------------------------------------------------------------
# Terminal colors for output
# -----------------------------------------------------------------------------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Chipp Deno Development Environment${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# Port management utilities
# -----------------------------------------------------------------------------
kill_port() {
  local port=$1
  local pids=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}Killing existing process on port $port${NC}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

# Track PIDs for cleanup
API_PID=""
WEB_PID=""
WORKER_PID=""

cleanup() {
  echo -e "\n${BLUE}Shutting down all services...${NC}"
  
  # Kill by PID first (more reliable)
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null
  [ -n "$WEB_PID" ] && kill $WEB_PID 2>/dev/null
  [ -n "$WORKER_PID" ] && kill $WORKER_PID 2>/dev/null
  
  # Then clean up any stragglers on the ports
  kill_port 8000
  kill_port 5173
  kill_port 8788
  
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# -----------------------------------------------------------------------------
# Clean up any existing processes on our ports
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
kill_port 8000
kill_port 5173
kill_port 8788

# -----------------------------------------------------------------------------
# 1. START DENO API SERVER
# -----------------------------------------------------------------------------
# The API server handles all backend functionality:
#   - Authentication (Google, Microsoft OAuth)
#   - Application CRUD operations
#   - Chat/messaging endpoints
#   - Consumer routes (manifest, PWA icons, brand assets)
#   - WebSocket connections for real-time updates
#
# The --env flag loads .env automatically (Deno 1.38+)
# The --watch flag enables auto-reload on file changes
# -----------------------------------------------------------------------------
if [ "$START_API" = true ]; then
  echo -e "${GREEN}Starting Deno API server on :8000${NC}"
  echo -e "${YELLOW}Logs: $LOG_FILE${NC}"
  DENO_NO_PACKAGE_JSON=1 deno run \
    --env \
    --watch \
    --allow-net \
    --allow-env \
    --allow-read \
    --allow-write \
    --allow-ffi \
    main.ts 2>&1 | tee -a "$LOG_FILE" &
  API_PID=$!
  
  # Wait for API to be ready before starting dependent services
  echo -e "${YELLOW}Waiting for API server to start...${NC}"
  for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
      echo -e "${GREEN}API server ready!${NC}"
      break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
      echo -e "${RED}Warning: API server may not be ready yet${NC}"
    fi
  done
fi

# -----------------------------------------------------------------------------
# 2. START SVELTE SPA (Vite Dev Server)
# -----------------------------------------------------------------------------
# The frontend SPA provides the user interface:
#   - Dashboard, app builder, settings
#   - Consumer chat experience
#   - Hash-based routing for SPA navigation
#
# Vite provides:
#   - Hot Module Replacement (HMR) for instant updates
#   - Fast cold starts with native ESM
#   - Proxies API calls to localhost:8000
#
# Note: Accessing localhost:5173 directly works but won't have brand injection.
# For full brand injection testing, use localhost:8788 (through Worker).
# -----------------------------------------------------------------------------
WEB_DIR="$DIR/web"
if [ "$START_WEB" = true ] && [ -d "$WEB_DIR" ]; then
  # Install dependencies if needed
  if [ ! -d "$WEB_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing web dependencies...${NC}"
    (cd "$WEB_DIR" && npm install)
  fi

  if [ -d "$WEB_DIR/node_modules" ]; then
    echo -e "${GREEN}Starting Svelte SPA on :5173${NC}"
    (cd "$WEB_DIR" && npm run dev 2>&1 | tee -a "$LOG_FILE") &
    WEB_PID=$!
  fi
fi

# -----------------------------------------------------------------------------
# 3. START CLOUDFLARE WORKER (Brand Injection + R2 Serving)
# -----------------------------------------------------------------------------
# The Cloudflare Worker is essential for testing:
#   - PWA manifest and icon serving
#   - Brand injection (window.__APP_BRAND__)
#   - Splash screen with app-specific logo/colors
#   - Production-like R2 asset serving
#
# The Worker connects to the REAL R2 bucket (chipp-deno-spa-dev) via --remote.
# This means you need:
#   1. SPA assets uploaded to R2 (run: cd cloudflare-worker && ./scripts/upload-assets.sh)
#   2. Brand configs in R2 (auto-synced when apps are created/updated)
#
# If --remote fails (API rate limits), falls back to local mode.
# In local mode, R2 is simulated and empty - brand injection won't work.
#
# If you just want to iterate on frontend without brand features,
# use --no-worker flag and access localhost:5173 directly.
# -----------------------------------------------------------------------------
WORKER_DIR="$DIR/cloudflare-worker"
if [ "$START_WORKER" = true ] && [ -d "$WORKER_DIR" ]; then
  # Install worker dependencies if needed
  if [ ! -d "$WORKER_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing Cloudflare Worker dependencies...${NC}"
    (cd "$WORKER_DIR" && npm install)
  fi

  echo -e "${GREEN}Starting Cloudflare Worker on :8788${NC}"
  echo -e "${YELLOW}  Attempting --remote mode (real R2 bucket)...${NC}"
  
  # Try to start with --remote first (connects to real R2)
  # If it fails, fall back to local mode (simulated R2)
  cd "$WORKER_DIR"
  
  # Start wrangler with --remote in background and capture PID
  npx wrangler dev \
    --remote \
    --port 8788 \
    --var API_ORIGIN:http://localhost:8000 2>&1 | tee -a "$LOG_FILE" &
  WORKER_PID=$!
  
  # Wait briefly to see if it starts successfully
  sleep 5
  
  # Check if Worker is actually listening
  if ! lsof -i:8788 > /dev/null 2>&1; then
    echo -e "${YELLOW}  --remote mode failed, falling back to local mode...${NC}"
    echo -e "${YELLOW}  Note: Local mode uses simulated R2 (brand injection won't work)${NC}"
    
    # Kill failed process
    kill $WORKER_PID 2>/dev/null || true
    
    # Start in local mode
    npx wrangler dev \
      --port 8788 \
      --var API_ORIGIN:http://localhost:8000 2>&1 | tee -a "$LOG_FILE" &
    WORKER_PID=$!
    
    sleep 3
  else
    echo -e "${GREEN}  Worker connected to real R2 bucket${NC}"
  fi
  
  cd "$DIR"
fi

# -----------------------------------------------------------------------------
# Print service information
# -----------------------------------------------------------------------------
# Wait a moment for all services to fully start
sleep 2

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "  ${BLUE}Deno API:${NC}         http://localhost:8000"
echo -e "  ${BLUE}Vite (Svelte):${NC}    http://localhost:5173 or :5174"
if [ "$START_WORKER" = true ]; then
  echo -e "  ${BLUE}Cloudflare Worker:${NC} http://localhost:8788"
  echo ""
  echo -e "  ${YELLOW}For brand injection testing:${NC}"
  echo -e "    http://localhost:8788/#/w/chat/{app-slug}"
  echo ""
  echo -e "  ${YELLOW}For fast frontend iteration (no brand injection):${NC}"
  echo -e "    http://localhost:5173/#/w/chat/{app-slug}"
fi
echo ""
echo -e "  ${YELLOW}Log file:${NC}"
echo -e "    $LOG_FILE"
echo -e "    tail -f $LOG_FILE"
echo ""
echo -e "Press ${RED}Ctrl+C${NC} to stop all services"
echo ""

# -----------------------------------------------------------------------------
# Wait for all background processes
# -----------------------------------------------------------------------------
# We wait on all PIDs so the script stays alive and Ctrl+C triggers cleanup
wait $API_PID $WEB_PID $WORKER_PID 2>/dev/null
