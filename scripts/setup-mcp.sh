#!/bin/bash
# Setup MCP servers with credentials from .env
# This adds the Stripe MCP to .mcp.json using credentials from .env
#
# Usage:
#   ./scripts/setup-mcp.sh          # Add Stripe MCP
#   ./scripts/setup-mcp.sh --reset  # Remove Stripe MCP (reset to committed version)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MCP_FILE="$PROJECT_ROOT/.mcp.json"

# Handle --reset flag
if [ "$1" = "--reset" ]; then
  git -C "$PROJECT_ROOT" checkout .mcp.json
  echo "Reset .mcp.json to committed version (Stripe MCP removed)"
  exit 0
fi

# Load .env file
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$' | xargs)
fi

# Check for required vars
STRIPE_KEY="${STRIPE_SECRET_KEY_TEST:-$STRIPE_SECRET_KEY}"
if [ -z "$STRIPE_KEY" ]; then
  echo "Error: STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY not found in .env"
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed"
  echo "Install with: brew install jq"
  exit 1
fi

# Add Stripe MCP to config
jq --arg key "$STRIPE_KEY" '.mcpServers.stripe = {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@anthropic-ai/claude-code-mcp-stripe@latest"],
  "env": {
    "STRIPE_SECRET_KEY": $key
  }
}' "$MCP_FILE" > "$MCP_FILE.tmp" && mv "$MCP_FILE.tmp" "$MCP_FILE"

echo "Added Stripe MCP to .mcp.json"
echo ""
echo "Restart Claude Code to use the new config."
echo ""
echo "Available Stripe MCP tools:"
echo "  - mcp__stripe__list_customers"
echo "  - mcp__stripe__list_subscriptions"
echo "  - mcp__stripe__list_invoices"
echo "  - mcp__stripe__create_customer"
echo "  - mcp__stripe__search_stripe_documentation"
echo ""
echo "To remove Stripe MCP and reset config:"
echo "  ./scripts/setup-mcp.sh --reset"
