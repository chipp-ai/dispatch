#!/bin/bash
# Claude Code startup script for chipp-deno - handles auth and proxies
# Usage: ./scripts/claude-start.sh [--yolo] [--continue|-c]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
YOLO_MODE=false
CONTINUE_MODE=false

for arg in "$@"; do
    case $arg in
        --yolo)
            YOLO_MODE=true
            ;;
        --continue|-c)
            CONTINUE_MODE=true
            ;;
    esac
done

# Service account key location (never expires!)
SERVICE_ACCOUNT_KEY="$HOME/.config/gcloud/claude-code-infra.json"
# Fallback to old key path for backwards compatibility
OLD_SERVICE_ACCOUNT_KEY="$HOME/.config/gcloud/claude-sql-proxy.json"
GKE_CLUSTER="production"
GKE_REGION="us-central1"
PROJECT_ID="chippai-398019"

echo "=========================================="
echo " Claude Code Startup (chipp-deno)"
echo "=========================================="

# ============================================
# 1. Check GCloud Auth (Service Account preferred)
# ============================================
echo -e "\n${YELLOW}[1/7] Checking GCloud authentication...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}ERROR: gcloud CLI not installed. Run: brew install google-cloud-sdk${NC}"
    exit 1
fi

# Prefer service account key (never expires)
# Check new path first, then fall back to old path
if [[ -f "$SERVICE_ACCOUNT_KEY" ]]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$SERVICE_ACCOUNT_KEY"
    echo -e "${GREEN}Using service account key (no expiration)${NC}"
elif [[ -f "$OLD_SERVICE_ACCOUNT_KEY" ]]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$OLD_SERVICE_ACCOUNT_KEY"
    echo -e "${GREEN}Using legacy service account key (no expiration)${NC}"
    echo -e "${YELLOW}TIP: Run ./scripts/setup-service-account.sh to upgrade to new service account with GKE access${NC}"
else
    echo -e "${YELLOW}No service account key found at $SERVICE_ACCOUNT_KEY${NC}"
    echo -e "${YELLOW}Falling back to user credentials (may expire)...${NC}"

    # Check if authenticated (this checks for valid credentials)
    if ! gcloud auth print-access-token &> /dev/null 2>&1; then
        echo -e "${YELLOW}GCloud auth expired. Re-authenticating...${NC}"
        gcloud auth login --brief
        gcloud auth application-default login --quiet
    else
        # Check if ADC (Application Default Credentials) are valid
        if ! gcloud auth application-default print-access-token &> /dev/null 2>&1; then
            echo -e "${YELLOW}Application Default Credentials expired. Refreshing...${NC}"
            gcloud auth application-default login --quiet
        else
            echo -e "${GREEN}GCloud auth valid${NC}"
        fi
    fi

    echo -e "${YELLOW}TIP: Run ./scripts/setup-service-account.sh to create a non-expiring key${NC}"
fi

# Verify project is set
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [[ "$CURRENT_PROJECT" != "chippai-398019" ]]; then
    echo -e "${YELLOW}Setting GCloud project to chippai-398019...${NC}"
    gcloud config set project chippai-398019
fi

# ============================================
# 2. Check 1Password Auth (optional)
# ============================================
echo -e "\n${YELLOW}[2/7] Checking 1Password authentication...${NC}"

if command -v op &> /dev/null; then
    # Try to list vaults - if it fails, we need to sign in
    if ! op vault list &> /dev/null 2>&1; then
        echo -e "${YELLOW}1Password session expired. Please authenticate:${NC}"
        eval $(op signin)
    else
        echo -e "${GREEN}1Password auth valid${NC}"
    fi
else
    echo -e "${YELLOW}1Password CLI not installed (optional). Skipping.${NC}"
fi

# ============================================
# 3. Configure kubectl (GKE access)
# ============================================
echo -e "\n${YELLOW}[3/7] Configuring kubectl for GKE...${NC}"

if command -v kubectl &> /dev/null; then
    # Check if we have the new service account with GKE permissions
    if [[ -f "$SERVICE_ACCOUNT_KEY" ]]; then
        # Configure gcloud to use service account for GKE
        gcloud auth activate-service-account --key-file="$SERVICE_ACCOUNT_KEY" --quiet 2>/dev/null || true

        # Get GKE credentials using the service account
        if gcloud container clusters get-credentials "$GKE_CLUSTER" --region "$GKE_REGION" --project "$PROJECT_ID" 2>/dev/null; then
            echo -e "${GREEN}kubectl configured for $GKE_CLUSTER${NC}"
        else
            echo -e "${YELLOW}Could not configure kubectl (GKE access may be limited)${NC}"
            echo -e "${YELLOW}Run ./scripts/setup-service-account.sh to add GKE permissions${NC}"
        fi
    else
        echo -e "${YELLOW}Service account key not found - kubectl may require manual auth${NC}"
        echo -e "${YELLOW}Run ./scripts/setup-service-account.sh to create key with GKE access${NC}"
    fi
else
    echo -e "${YELLOW}kubectl not installed. Skipping GKE configuration.${NC}"
fi

# ============================================
# 4. Set up GitHub Token for MCP
# ============================================
echo -e "\n${YELLOW}[4/7] Setting up GitHub token for MCP...${NC}"

if command -v gh &> /dev/null; then
    if gh auth status &> /dev/null 2>&1; then
        export GITHUB_TOKEN=$(gh auth token 2>/dev/null)
        if [[ -n "$GITHUB_TOKEN" ]]; then
            echo -e "${GREEN}GitHub token set from gh CLI${NC}"
        else
            echo -e "${YELLOW}Could not get GitHub token from gh CLI${NC}"
        fi
    else
        echo -e "${YELLOW}GitHub CLI not authenticated. Run: gh auth login${NC}"
    fi
else
    echo -e "${YELLOW}GitHub CLI not installed (optional). Skipping.${NC}"
fi

# ============================================
# 5. Install MCP Tool Dependencies
# ============================================
echo -e "\n${YELLOW}[5/7] Checking MCP tool dependencies...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Install dependencies for local MCP tools (if not already installed)
MCP_TOOLS=("tools/mcp-browser-devtools" "tools/mcp-dev-server")
for tool_dir in "${MCP_TOOLS[@]}"; do
    TOOL_PATH="$REPO_DIR/$tool_dir"
    if [[ -d "$TOOL_PATH" ]] && [[ -f "$TOOL_PATH/package.json" ]]; then
        if [[ ! -d "$TOOL_PATH/node_modules" ]]; then
            echo -e "  Installing $tool_dir dependencies..."
            (cd "$TOOL_PATH" && npm install --silent 2>/dev/null) || true
        fi
    fi
done
echo -e "${GREEN}MCP tools ready${NC}"

# ============================================
# 6. Start Chrome with DevTools (for browser MCP tools)
# ============================================
echo -e "\n${YELLOW}[6/7] Starting Chrome with DevTools...${NC}"

CHROME_SCRIPT="$REPO_DIR/tools/mcp-browser-devtools/start-chrome.sh"
if [[ -x "$CHROME_SCRIPT" ]]; then
    # Run start-chrome.sh but capture output to avoid cluttering the startup
    CHROME_OUTPUT=$("$CHROME_SCRIPT" 2>&1)
    if echo "$CHROME_OUTPUT" | grep -q "already running\|DevTools ready"; then
        echo -e "${GREEN}Chrome DevTools ready on port 9222${NC}"
    else
        echo -e "${YELLOW}Chrome DevTools: $CHROME_OUTPUT${NC}"
    fi
else
    echo -e "${YELLOW}Chrome DevTools script not found (browser tools may not work)${NC}"
fi

# ============================================
# 7. Configure Vanta MCP Server (optional)
# ============================================
echo -e "\n${YELLOW}[7/7] Checking Vanta MCP server...${NC}"

VANTA_SETUP_SCRIPT="$REPO_DIR/scripts/setup-vanta-mcp.sh"
VANTA_CREDENTIALS="$HOME/.config/vanta/credentials.json"

if [[ -f "$VANTA_CREDENTIALS" ]]; then
    echo -e "${GREEN}Vanta credentials already configured${NC}"
elif [[ -f "$VANTA_SETUP_SCRIPT" ]]; then
    VANTA_OUTPUT=$("$VANTA_SETUP_SCRIPT" 2>&1)
    VANTA_EXIT=$?

    if [[ $VANTA_EXIT -eq 0 ]]; then
        echo -e "${GREEN}Vanta MCP server configured (credentials from 1Password)${NC}"
    else
        echo -e "${YELLOW}Vanta setup had issues (non-critical):${NC}"
        echo "$VANTA_OUTPUT" | tail -5
    fi
else
    echo -e "${YELLOW}Vanta setup script not found (skipping)${NC}"
fi

# ============================================
# Launch Claude Code
# ============================================
echo -e "\n${GREEN}Launching Claude Code...${NC}"
echo ""

# Build claude command with flags
CLAUDE_CMD="claude"
CLAUDE_FLAGS=""

if $YOLO_MODE; then
    CLAUDE_FLAGS="$CLAUDE_FLAGS --dangerously-skip-permissions"
    echo -e "${YELLOW}Mode: YOLO (no permission prompts)${NC}"
fi

if $CONTINUE_MODE; then
    CLAUDE_FLAGS="$CLAUDE_FLAGS --continue"
    echo -e "${YELLOW}Mode: Continuing previous session${NC}"
fi

echo ""
exec $CLAUDE_CMD $CLAUDE_FLAGS
