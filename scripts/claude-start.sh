#!/bin/bash
# Claude Code startup script for chipp-deno - handles auth and proxies
# Usage: ./scripts/claude-start.sh [--yolo] [--continue|-c] [--check]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
YOLO_MODE=false
CONTINUE_MODE=false

CHECK_MODE=false

for arg in "$@"; do
    case $arg in
        --yolo)
            YOLO_MODE=true
            ;;
        --continue|-c)
            CONTINUE_MODE=true
            ;;
        --check)
            CHECK_MODE=true
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
DB_PORT=5436
DB_USER=postgres
DB_PASS=postgres
DB_NAME=chipp_deno
DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}"
DB_BRANCH_FILE="$REPO_DIR/.scratch/.db-branch"

echo "=========================================="
echo " Claude Code Startup (chipp-deno)"
echo "=========================================="

# ============================================
# 1. Local Database (Docker + Migrations)
# ============================================
echo -e "\n${YELLOW}[1/8] Checking local database...${NC}"

# Ensure .scratch directory exists
mkdir -p "$REPO_DIR/.scratch"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker not installed. Database requires Docker.${NC}"
    echo -e "${RED}Install Docker Desktop: https://www.docker.com/products/docker-desktop${NC}"
    # Non-fatal - continue without database
else
    # Check if postgres container is reachable
    DB_REACHABLE=false
    if pg_isready -h localhost -p $DB_PORT -U $DB_USER -q 2>/dev/null; then
        DB_REACHABLE=true
    fi

    if ! $DB_REACHABLE; then
        echo -e "${YELLOW}Database not reachable on port ${DB_PORT}. Starting Docker...${NC}"

        # Check if Docker daemon is running
        if ! docker info &> /dev/null 2>&1; then
            echo -e "${RED}Docker daemon not running. Please start Docker Desktop.${NC}"
        else
            # Start the dev database containers
            (cd "$REPO_DIR" && docker compose -f docker-compose.dev.yml up -d 2>&1 | tail -3)

            # Wait for postgres to be healthy (up to 30s)
            echo -n "  Waiting for PostgreSQL..."
            for i in $(seq 1 30); do
                if pg_isready -h localhost -p $DB_PORT -U $DB_USER -q 2>/dev/null; then
                    DB_REACHABLE=true
                    break
                fi
                echo -n "."
                sleep 1
            done
            echo ""

            if $DB_REACHABLE; then
                echo -e "${GREEN}PostgreSQL ready on port ${DB_PORT}${NC}"
            else
                echo -e "${RED}PostgreSQL failed to start within 30s${NC}"
            fi
        fi
    else
        echo -e "${GREEN}PostgreSQL already running on port ${DB_PORT}${NC}"
    fi

    # Run migrations if database is reachable
    if $DB_REACHABLE; then
        CURRENT_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
        LAST_MIGRATED_BRANCH=""
        if [[ -f "$DB_BRANCH_FILE" ]]; then
            LAST_MIGRATED_BRANCH=$(cat "$DB_BRANCH_FILE")
        fi

        # Detect branch switch
        BRANCH_SWITCHED=false
        if [[ -n "$LAST_MIGRATED_BRANCH" ]] && [[ "$LAST_MIGRATED_BRANCH" != "$CURRENT_BRANCH" ]]; then
            BRANCH_SWITCHED=true
            echo -e "${YELLOW}Branch changed: ${LAST_MIGRATED_BRANCH} -> ${CURRENT_BRANCH}${NC}"
        fi

        # Ensure DATABASE_URL is in .env for deno task db:migrate (which uses --env)
        if [[ -f "$REPO_DIR/.env" ]]; then
            if ! grep -q "^DATABASE_URL=.*localhost:${DB_PORT}" "$REPO_DIR/.env" 2>/dev/null; then
                # Update DATABASE_URL to point to local dev database
                if grep -q "^DATABASE_URL=" "$REPO_DIR/.env"; then
                    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" "$REPO_DIR/.env"
                else
                    echo "DATABASE_URL=${DB_URL}" >> "$REPO_DIR/.env"
                fi
                echo -e "${YELLOW}Updated .env DATABASE_URL to local dev database${NC}"
            fi
        fi

        # Run migrations
        echo -e "  Applying pending migrations..."
        MIGRATE_OUTPUT=$(cd "$REPO_DIR" && DENO_NO_PACKAGE_JSON=1 DATABASE_URL="$DB_URL" deno task db:migrate 2>&1)
        MIGRATE_EXIT=$?

        if [[ $MIGRATE_EXIT -eq 0 ]]; then
            if echo "$MIGRATE_OUTPUT" | grep -q "No pending migrations"; then
                echo -e "${GREEN}Database up to date (no pending migrations)${NC}"
            else
                APPLIED_COUNT=$(echo "$MIGRATE_OUTPUT" | grep -c "✓ Applied:" || true)
                echo -e "${GREEN}Applied ${APPLIED_COUNT} migration(s)${NC}"
            fi
            # Record successful migration branch
            echo "$CURRENT_BRANCH" > "$DB_BRANCH_FILE"
        else
            echo -e "${RED}Migration failed!${NC}"
            if $BRANCH_SWITCHED; then
                echo -e "${YELLOW}This likely happened because branch '${LAST_MIGRATED_BRANCH}' had different migrations.${NC}"
                echo -e "${YELLOW}Resetting local database (no real data to lose)...${NC}"

                # Reset: drop and recreate database, then re-migrate
                PGPASSWORD=$DB_PASS psql -h localhost -p $DB_PORT -U $DB_USER -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null
                PGPASSWORD=$DB_PASS psql -h localhost -p $DB_PORT -U $DB_USER -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null

                RETRY_OUTPUT=$(cd "$REPO_DIR" && DENO_NO_PACKAGE_JSON=1 DATABASE_URL="$DB_URL" deno task db:migrate 2>&1)
                RETRY_EXIT=$?

                if [[ $RETRY_EXIT -eq 0 ]]; then
                    echo -e "${GREEN}Database reset and migrations applied successfully${NC}"
                    echo "$CURRENT_BRANCH" > "$DB_BRANCH_FILE"
                else
                    echo -e "${RED}Migration failed even after reset. Check migration files:${NC}"
                    echo "$RETRY_OUTPUT" | tail -5
                fi
            else
                echo -e "${RED}Migration error (same branch). Check migration files:${NC}"
                echo "$MIGRATE_OUTPUT" | tail -5
            fi
        fi
    fi
fi

# ============================================
# 2. Check GCloud Auth (Service Account preferred)
# ============================================
echo -e "\n${YELLOW}[2/8] Checking GCloud authentication...${NC}"

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
# 3. Check 1Password Auth (optional)
# ============================================
echo -e "\n${YELLOW}[3/8] Checking 1Password authentication...${NC}"

if command -v op &> /dev/null; then
    # Try to list vaults - if it fails, we need to sign in
    if ! op vault list &> /dev/null 2>&1; then
        if [[ -n "$OP_PASSWORD" ]]; then
            echo -e "${YELLOW}Signing in to 1Password using OP_PASSWORD...${NC}"
            eval $(echo "$OP_PASSWORD" | op signin 2>/dev/null) || eval $(op signin)
        else
            echo -e "${YELLOW}1Password session expired. Please authenticate:${NC}"
            echo -e "${YELLOW}TIP: Set OP_PASSWORD in your shell to skip this prompt${NC}"
            eval $(op signin)
        fi
    else
        echo -e "${GREEN}1Password auth valid${NC}"
    fi
else
    echo -e "${YELLOW}1Password CLI not installed (optional). Skipping.${NC}"
fi

# ============================================
# 4. Configure kubectl (GKE access)
# ============================================
echo -e "\n${YELLOW}[4/8] Configuring kubectl for GKE...${NC}"

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
# 5. Set up GitHub Token for MCP
# ============================================
echo -e "\n${YELLOW}[5/8] Setting up GitHub token for MCP...${NC}"

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
# 6. Install MCP Tool Dependencies
# ============================================
echo -e "\n${YELLOW}[6/8] Checking MCP tool dependencies...${NC}"

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
# 7. Start Chrome with DevTools (for browser MCP tools)
# ============================================
echo -e "\n${YELLOW}[7/8] Starting Chrome with DevTools...${NC}"

CHROME_SCRIPT="$REPO_DIR/tools/mcp-browser-devtools/start-chrome.sh"
if [[ -x "$CHROME_SCRIPT" ]]; then
    # Run start-chrome.sh but capture output to avoid cluttering the startup
    CHROME_OUTPUT=$("$CHROME_SCRIPT" 2>&1) || true
    if echo "$CHROME_OUTPUT" | grep -q "already running\|DevTools ready"; then
        echo -e "${GREEN}Chrome DevTools ready on port 9222${NC}"
    else
        echo -e "${YELLOW}Chrome DevTools: $CHROME_OUTPUT${NC}"
    fi
else
    echo -e "${YELLOW}Chrome DevTools script not found (browser tools may not work)${NC}"
fi

# ============================================
# 8. Configure Vanta MCP Server (optional)
# ============================================
echo -e "\n${YELLOW}[8/8] Checking Vanta MCP server...${NC}"

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
if $CHECK_MODE; then
    echo -e "\n${GREEN}All checks passed. (--check mode, not launching Claude)${NC}"
    exit 0
fi

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
