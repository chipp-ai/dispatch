#!/bin/bash
# One-time setup: Create a service account for Claude Code infrastructure access
# This key never expires - no more re-auth!
#
# Grants access to:
#   - Cloud SQL (database proxies)
#   - GKE Admin (full cluster management: RBAC, deployments, namespaces, pods)
#
# Prerequisites: You must have IAM admin permissions in the GCP project

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ID="chippai-398019"
SERVICE_ACCOUNT_NAME="claude-code-infra"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_PATH="$HOME/.config/gcloud/claude-code-infra.json"
# Keep old key path for backwards compatibility check
OLD_KEY_PATH="$HOME/.config/gcloud/claude-sql-proxy.json"
GKE_CLUSTER="production"
GKE_REGION="us-central1"

echo "=========================================="
echo " Service Account Setup for Claude Code"
echo "=========================================="
echo ""
echo "This creates a service account key that never expires."
echo "You only need to run this once per developer machine."
echo ""

# Ensure gcloud is authenticated with a user that has IAM permissions
echo -e "${YELLOW}[1/5] Verifying GCloud authentication...${NC}"
if ! gcloud auth print-access-token &> /dev/null 2>&1; then
    echo -e "${YELLOW}Please authenticate with GCloud first:${NC}"
    gcloud auth login
fi

gcloud config set project $PROJECT_ID

# Check if service account exists
echo -e "\n${YELLOW}[2/5] Checking service account...${NC}"
if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL &> /dev/null 2>&1; then
    echo -e "${GREEN}Service account already exists: $SERVICE_ACCOUNT_EMAIL${NC}"
else
    echo -e "${YELLOW}Creating service account...${NC}"
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --description="Claude Code infrastructure access (Cloud SQL, GKE)" \
        --display-name="Claude Code Infrastructure"
    echo -e "${GREEN}Created service account: $SERVICE_ACCOUNT_EMAIL${NC}"
fi

# Grant Cloud SQL Client role
echo -e "\n${YELLOW}[3/6] Ensuring Cloud SQL Client role...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudsql.client" \
    --condition=None \
    --quiet 2>/dev/null || true
echo -e "${GREEN}Role granted: roles/cloudsql.client${NC}"

# Grant GKE roles for kubectl access
echo -e "\n${YELLOW}[4/6] Ensuring GKE access roles...${NC}"

# container.admin allows: full cluster management including RBAC operations
# This is needed for:
#   - Managing deployments, pods, services
#   - RBAC operations (roles, rolebindings, clusterroles, clusterrolebindings)
#   - Cleaning up stuck resources with finalizers
#   - Managing namespaces
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/container.admin" \
    --condition=None \
    --quiet 2>/dev/null || true
echo -e "${GREEN}Role granted: roles/container.admin${NC}"

# Create key directory if needed
echo -e "\n${YELLOW}[5/6] Creating service account key...${NC}"
mkdir -p "$(dirname "$KEY_PATH")"

# Check if key already exists
if [[ -f "$KEY_PATH" ]]; then
    echo -e "${YELLOW}Key already exists at $KEY_PATH${NC}"
    read -p "Overwrite with new key? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Keeping existing key.${NC}"
    else
        rm "$KEY_PATH"
        gcloud iam service-accounts keys create "$KEY_PATH" \
            --iam-account="$SERVICE_ACCOUNT_EMAIL"
        echo -e "${GREEN}New key created at $KEY_PATH${NC}"
    fi
else
    gcloud iam service-accounts keys create "$KEY_PATH" \
        --iam-account="$SERVICE_ACCOUNT_EMAIL"
    echo -e "${GREEN}Key created at $KEY_PATH${NC}"
fi

# Set permissions on key file
chmod 600 "$KEY_PATH"

# Migrate from old key if exists (backwards compatibility)
if [[ -f "$OLD_KEY_PATH" ]] && [[ "$OLD_KEY_PATH" != "$KEY_PATH" ]]; then
    echo -e "${YELLOW}Removing old service account key at $OLD_KEY_PATH${NC}"
    rm -f "$OLD_KEY_PATH"
fi

# Verify setup
echo -e "\n${YELLOW}[6/6] Verifying setup...${NC}"
if [[ -f "$KEY_PATH" ]]; then
    echo -e "${GREEN}Setup complete!${NC}"
    echo ""
    echo "Key location: $KEY_PATH"
    echo ""
    echo "Permissions granted:"
    echo "  - Cloud SQL Client (database proxy)"
    echo "  - GKE Admin (full cluster management: pods, RBAC, namespaces, deployments)"
    echo ""
    echo "The startup script will now use this key automatically:"
    echo "  ./scripts/claude-start.sh"
    echo ""
    echo -e "${YELLOW}Security notes:${NC}"
    echo "  - This key never expires"
    echo "  - Keep it secure (chmod 600 applied)"
    echo "  - Do not commit to git (path is outside repo)"
    echo "  - Rotate annually: run this script again with 'y' to overwrite"
else
    echo -e "${RED}Setup failed - key not created${NC}"
    exit 1
fi
