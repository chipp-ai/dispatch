#!/bin/bash
# Start an ngrok tunnel to expose the local Dispatch server to GitHub Actions.
# This lets spawned workflows stream terminal output back to your local instance.
#
# Usage:
#   ./scripts/dev-tunnel.sh          # Start tunnel, auto-write .env callback URL
#   ./scripts/dev-tunnel.sh --stop   # Stop the tunnel

set -euo pipefail

PORT="${DISPATCH_PORT:-3002}"
ENV_FILE="$(dirname "$0")/../.env"
PID_FILE="$(dirname "$0")/../.scratch/tunnel.pid"

mkdir -p "$(dirname "$PID_FILE")"

if [ "${1:-}" = "--stop" ]; then
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null && echo "Tunnel stopped." || echo "Tunnel already stopped."
    rm -f "$PID_FILE"
  else
    echo "No tunnel running."
  fi
  # Remove callback URL from .env
  if grep -q "CHIPP_ISSUES_CALLBACK_URL" "$ENV_FILE" 2>/dev/null; then
    grep -v "CHIPP_ISSUES_CALLBACK_URL" "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    echo "Removed CHIPP_ISSUES_CALLBACK_URL from .env"
  fi
  exit 0
fi

# Check for ngrok
if ! command -v ngrok &>/dev/null; then
  echo "Error: ngrok is not installed. Install with: brew install ngrok"
  exit 1
fi

# Kill any existing tunnel
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

echo "Starting ngrok tunnel to localhost:${PORT}..."
ngrok http "$PORT" --log=stdout --log-level=warn > /dev/null 2>&1 &
NGROK_PID=$!
echo "$NGROK_PID" > "$PID_FILE"

# Wait for ngrok to start and get the public URL
sleep 3
TUNNEL_URL=$(curl -sf http://localhost:4040/api/tunnels | python3 -c "
import sys, json
tunnels = json.load(sys.stdin).get('tunnels', [])
for t in tunnels:
    if t.get('proto') == 'https':
        print(t['public_url'])
        break
" 2>/dev/null)

if [ -z "$TUNNEL_URL" ]; then
  echo "Error: Could not get tunnel URL. Is ngrok running?"
  kill "$NGROK_PID" 2>/dev/null
  rm -f "$PID_FILE"
  exit 1
fi

# Write callback URL to .env
if grep -q "CHIPP_ISSUES_CALLBACK_URL" "$ENV_FILE" 2>/dev/null; then
  # Update existing line
  sed -i '' "s|CHIPP_ISSUES_CALLBACK_URL=.*|CHIPP_ISSUES_CALLBACK_URL=${TUNNEL_URL}|" "$ENV_FILE"
else
  # Append
  echo "" >> "$ENV_FILE"
  echo "# Dev tunnel for GH Actions terminal streaming (auto-generated)" >> "$ENV_FILE"
  echo "CHIPP_ISSUES_CALLBACK_URL=${TUNNEL_URL}" >> "$ENV_FILE"
fi

echo ""
echo "Tunnel active:"
echo "  Local:  http://localhost:${PORT}"
echo "  Public: ${TUNNEL_URL}"
echo ""
echo "CHIPP_ISSUES_CALLBACK_URL written to .env"
echo "Restart the dev server to pick it up, then spawned agents will stream terminal output here."
echo ""
echo "Stop with: ./scripts/dev-tunnel.sh --stop"
