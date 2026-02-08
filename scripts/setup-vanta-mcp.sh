#!/bin/bash
# Configure Vanta MCP server credentials from 1Password
# Usage: ./scripts/setup-vanta-mcp.sh
#
# This script fetches Vanta OAuth credentials from 1Password and creates
# the credentials file needed by the Vanta MCP server.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VANTA_CONFIG_DIR="$HOME/.config/vanta"
VANTA_CREDENTIALS_FILE="$VANTA_CONFIG_DIR/credentials.json"
OP_ITEM_NAME="Vanta MCP Server"
OP_VAULT="Shared"

# Check for 1Password CLI
if ! command -v op &> /dev/null; then
    echo -e "${RED}ERROR: 1Password CLI is required. Install with: brew install 1password-cli${NC}"
    exit 1
fi

# Check if 1Password is authenticated
if ! op vault list &> /dev/null 2>&1; then
    echo -e "${YELLOW}1Password session expired. Please authenticate:${NC}"
    eval $(op signin)
fi

# Create config directory
mkdir -p "$VANTA_CONFIG_DIR"

# Fetch credentials from 1Password
echo -e "${YELLOW}Fetching Vanta credentials from 1Password...${NC}"

CLIENT_ID=$(op item get "$OP_ITEM_NAME" --vault "$OP_VAULT" --fields client_id --reveal 2>/dev/null)
CLIENT_SECRET=$(op item get "$OP_ITEM_NAME" --vault "$OP_VAULT" --fields client_secret --reveal 2>/dev/null)

if [[ -z "$CLIENT_ID" ]] || [[ -z "$CLIENT_SECRET" ]]; then
    echo -e "${RED}ERROR: Could not fetch Vanta credentials from 1Password${NC}"
    echo -e "${YELLOW}Make sure the item '$OP_ITEM_NAME' exists in the '$OP_VAULT' vault${NC}"
    echo -e "${YELLOW}with fields: client_id, client_secret${NC}"
    exit 1
fi

# Write credentials file
cat > "$VANTA_CREDENTIALS_FILE" << EOF
{
  "client_id": "$CLIENT_ID",
  "client_secret": "$CLIENT_SECRET"
}
EOF

# Secure the file
chmod 600 "$VANTA_CREDENTIALS_FILE"

echo -e "${GREEN}Vanta credentials configured at $VANTA_CREDENTIALS_FILE${NC}"
