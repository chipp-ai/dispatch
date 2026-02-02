#!/bin/bash
# Setup chipp_deno database on existing Cloud SQL PostgreSQL instance
#
# Usage: ./scripts/setup-database.sh
#
# Prerequisites:
#   - Cloud SQL Proxy running (via cc/ccyolo or manually)
#   - psql installed
#   - PG_PASSWORD environment variable set

set -e

# Configuration
DB_NAME="chipp_deno"
DB_HOST="${PG_HOST:-127.0.0.1}"
DB_PORT="${PG_PORT:-5432}"
DB_USER="${PG_USER:-postgres}"
DB_PASSWORD="${PG_PASSWORD}"

if [ -z "$DB_PASSWORD" ]; then
  echo "Error: PG_PASSWORD environment variable not set"
  echo "Get it from: kubectl get secret chipp-admin -o jsonpath='{.data.PG_PASSWORD}' | base64 -d"
  exit 1
fi

echo "=== Chipp Deno Database Setup ==="
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo ""

# Export password for psql
export PGPASSWORD="$DB_PASSWORD"

# Check if database exists
DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" = "1" ]; then
  echo "Database '$DB_NAME' already exists"
else
  echo "Creating database '$DB_NAME'..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
  echo "Database created"
fi

echo ""
echo "Setting up schemas..."

# Create schemas and extensions
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- For embeddings if needed

-- Create schemas (matching chipp-deno's search_path)
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS rag;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS jobs;
CREATE SCHEMA IF NOT EXISTS embeddings;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA app, chat, rag, billing, jobs, embeddings, public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app, chat, rag, billing, jobs, embeddings, public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app, chat, rag, billing, jobs, embeddings, public TO postgres;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL PRIVILEGES ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA chat GRANT ALL PRIVILEGES ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA rag GRANT ALL PRIVILEGES ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT ALL PRIVILEGES ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA jobs GRANT ALL PRIVILEGES ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA embeddings GRANT ALL PRIVILEGES ON TABLES TO postgres;

\echo 'Schemas created successfully'
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Connection string for Cloud Run (staging):"
echo "  DENO_DATABASE_URL=postgresql://postgres:\$PG_PASSWORD@10.245.192.30:5432/$DB_NAME"
echo ""
echo "Connection string for local development (via proxy):"
echo "  DENO_DATABASE_URL=postgresql://postgres:\$PG_PASSWORD@127.0.0.1:5432/$DB_NAME"
echo ""
echo "Next steps:"
echo "  1. Run migrations: cd apps/chipp-deno && deno task migrate"
echo "  2. Add DENO_DATABASE_URL to 1Password"
echo "  3. Create K8s secret for Cloud Run"
