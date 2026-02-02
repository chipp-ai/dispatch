#!/bin/bash
#
# Start ngrok tunnel for chipp-deno API
#
# This script creates a public URL for your local Deno API server,
# allowing Slack webhooks to reach your development environment.
#
# Usage:
#   ./scripts/start-ngrok.sh              # Use default subdomain
#   ./scripts/start-ngrok.sh my-subdomain # Use custom subdomain
#
# Prerequisites:
#   - ngrok CLI installed (brew install ngrok)
#   - ngrok account with reserved domain (for stable URLs)
#
# After starting:
#   1. Copy the ngrok URL
#   2. In your Slack app settings:
#      - Set Event Subscriptions Request URL to: {ngrok-url}/api/webhooks/slack
#      - Set OAuth Redirect URL to: {ngrok-url}/api/integrations/slack/oauth/callback
#

set -e

PORT="${PORT:-8000}"
SUBDOMAIN="${1:-${NGROK_SUBDOMAIN:-chipp-deno-dev}}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting ngrok tunnel for chipp-deno...${NC}"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}Error: ngrok is not installed${NC}"
    echo "Install with: brew install ngrok"
    echo "Then authenticate: ngrok config add-authtoken <your-token>"
    exit 1
fi

# Check if the API server is running
if ! lsof -i:${PORT} -sTCP:LISTEN &> /dev/null; then
    echo -e "${YELLOW}Warning: No server detected on port ${PORT}${NC}"
    echo "Start the dev server first: ./scripts/dev.sh"
    echo ""
fi

# Build the ngrok URL
NGROK_URL="https://${SUBDOMAIN}.ngrok-free.app"

echo -e "${GREEN}Webhook URLs for Slack:${NC}"
echo ""
echo -e "  ${BLUE}Event Subscriptions Request URL:${NC}"
echo "    ${NGROK_URL}/api/webhooks/slack"
echo ""
echo -e "  ${BLUE}OAuth Redirect URL:${NC}"
echo "    ${NGROK_URL}/api/integrations/slack/oauth/callback"
echo ""
echo -e "${YELLOW}Note: Add these URLs to your Slack app configuration at:${NC}"
echo "  https://api.slack.com/apps"
echo ""
echo -e "${GREEN}Starting ngrok...${NC}"
echo ""

# Start ngrok with the reserved domain
# The --domain flag requires a paid ngrok account with a reserved domain
ngrok http ${PORT} --domain=${SUBDOMAIN}.ngrok-free.app
