#!/bin/bash
# Setup GitHub Secrets for BenchmarkAI/chipp-deno
# Run this script after authenticating to 1Password: eval $(op signin)

set -e

REPO="BenchmarkAI/chipp-deno"

echo "Setting up GitHub secrets for $REPO..."

# 1Password Service Account Token
echo "Fetching OP_SERVICE_ACCOUNT_TOKEN from 1Password..."
OP_TOKEN=$(op item get "chipp-ci-v3 Service Account Token" --fields credential --format=json | jq -r '.value')
gh secret set OP_SERVICE_ACCOUNT_TOKEN --repo "$REPO" --body "$OP_TOKEN"
echo "✓ OP_SERVICE_ACCOUNT_TOKEN set"

# Cloudflare API Token
echo "Fetching CLOUDFLARE_API_TOKEN from 1Password..."
CF_TOKEN=$(op item get "Cloudflare Workers API Token" --fields CLOUDFLARE_API_TOKEN --format=json | jq -r '.value')
gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO" --body "$CF_TOKEN"
echo "✓ CLOUDFLARE_API_TOKEN set"

# WIF secrets - these need to be provided or looked up from GCP Console
# GCP Console > IAM & Admin > Workload Identity Federation > Pools > Provider
if [ -n "$WIF_PROVIDER" ]; then
  gh secret set WIF_PROVIDER --repo "$REPO" --body "$WIF_PROVIDER"
  echo "✓ WIF_PROVIDER set"
else
  echo "⚠ WIF_PROVIDER not set - provide via environment variable or set manually"
  echo "  Format: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_NAME/providers/PROVIDER_NAME"
fi

if [ -n "$WIF_SERVICE_ACCOUNT" ]; then
  gh secret set WIF_SERVICE_ACCOUNT --repo "$REPO" --body "$WIF_SERVICE_ACCOUNT"
  echo "✓ WIF_SERVICE_ACCOUNT set"
else
  echo "⚠ WIF_SERVICE_ACCOUNT not set - provide via environment variable or set manually"
  echo "  Format: service-account@project.iam.gserviceaccount.com"
fi

echo ""
echo "Done! Verify with: gh secret list --repo $REPO"
