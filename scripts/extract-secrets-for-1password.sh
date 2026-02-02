#!/bin/bash
# Extract secrets from chipp-admin K8s secret for 1Password setup
# Run this to get the values needed for the chipp-deno-staging vault

set -e

echo "Extracting secrets from chipp-admin..."
echo ""

# Get the PostgreSQL password for DENO_DATABASE_URL
PG_PASSWORD=$(kubectl get secret chipp-admin -o jsonpath='{.data.PG_PASSWORD}' | base64 -d)
echo "DENO_DATABASE_URL=postgresql://postgres:${PG_PASSWORD}@10.245.192.30:5432/chipp_deno"
echo ""

# Required secrets to copy
REQUIRED_SECRETS=(
  "REDIS_URL"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "GOOGLE_GENERATIVE_AI_API_KEY"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "GOOGLE_CLOUD_PROJECT"
  "GOOGLE_SERVICE_KEY_BASE_64"
  "GCS_BUCKET_NAME"
  "NEXTAUTH_SECRET"
  "SERPER_API_KEY"
  "LLAMA_CLOUD_API_KEY"
  "STRIPE_SANDBOX_KEY"
  "TWILIO_ACCOUNT_SID"
  "TWILIO_AUTH_TOKEN"
  "SENDGRID_API_KEY"
  "CLOUDFLARE_API_TOKEN"
  "CLOUDFLARE_ACCOUNT_ID"
  "CLOUDFLARE_ZONE_ID"
  "CLOUDFLARE_KV_NAMESPACE_ID"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
  value=$(kubectl get secret chipp-admin -o jsonpath="{.data.${secret}}" 2>/dev/null | base64 -d 2>/dev/null || echo "NOT_FOUND")
  if [ "$value" != "NOT_FOUND" ] && [ -n "$value" ]; then
    echo "${secret}=${value}"
  else
    echo "# ${secret}=<not found in chipp-admin>"
  fi
done

echo ""
echo "# Note: STRIPE_SECRET_KEY should use STRIPE_SANDBOX_KEY for staging"
echo "# Create these in 1Password vault 'chipp-deno-staging' as item 'chipp-deno'"
echo "# All fields must be type: CONCEALED"
