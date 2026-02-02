#!/bin/bash
# Restart both Deno API and Svelte dev servers
# Usage: ./scripts/restart-dev.sh

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$DIR/../.." && pwd)"
cd "$DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment variables safely (handles special chars in passwords)
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

echo -e "${BLUE}🔄 Restarting Chipp Deno dev servers...${NC}"

# Kill existing processes more aggressively
echo -e "  Stopping existing servers..."

# Kill by process name first
pkill -9 -f "deno run.*main.ts" 2>/dev/null || true
pkill -9 -f "deno.*chipp-deno" 2>/dev/null || true
pkill -9 -f "vite.*chipp-deno" 2>/dev/null || true

# Then kill by port
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5175 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5176 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5177 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5178 2>/dev/null | xargs kill -9 2>/dev/null || true

# Wait for ports to be released with retry
wait_for_port() {
  local port=$1
  local max_attempts=10
  local attempt=0
  while lsof -ti:$port >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
      echo -e "${RED}❌ Port $port still in use after $max_attempts attempts${NC}"
      return 1
    fi
    echo -e "  Waiting for port $port to be released (attempt $attempt)..."
    lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 0.5
  done
  return 0
}

wait_for_port 8000 || exit 1
wait_for_port 5173 || true  # Vite can use alternate ports

echo -e "${GREEN}✅ Ports 8000 and 5173 are free${NC}"

# Load environment variables safely (using set -a to auto-export)
set -a
load_env_file "$MONOREPO_ROOT/.env"
load_env_file "$DIR/.env"
set +a

# Verify critical env vars
if [ -z "$GCS_BUCKET_NAME" ]; then
  echo -e "${RED}⚠️  Warning: GCS_BUCKET_NAME not set - file uploads will fail${NC}"
fi

# Create log directory
mkdir -p "$MONOREPO_ROOT/.scratch/logs"
LOG_FILE="$MONOREPO_ROOT/.scratch/logs/deno-$(date +%Y%m%d-%H%M%S).log"

echo -e "  Starting Deno API on :8000..."
DENO_NO_PACKAGE_JSON=1 deno run --watch --allow-net --allow-env --allow-read --allow-write --allow-ffi main.ts >> "$LOG_FILE" 2>&1 &
API_PID=$!

sleep 2

echo -e "  Starting Svelte on :5173..."
cd "$DIR/web"
npm run dev >> "$LOG_FILE" 2>&1 &
WEB_PID=$!

echo ""
echo -e "${GREEN}✅ Servers running:${NC}"
echo -e "  API:  http://localhost:8000"
echo -e "  Web:  http://localhost:5174"
echo -e "  📝 Logs: $LOG_FILE"
echo ""
echo -e "To view logs: tail -f $LOG_FILE"
echo -e "To stop: pkill -f 'deno run' && lsof -ti:5173 | xargs kill -9"

trap "kill $API_PID $WEB_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait $API_PID $WEB_PID
