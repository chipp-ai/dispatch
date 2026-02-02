#!/bin/bash
# Run the migration script with proper env loading
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$DIR/../.." && pwd)"

# Read passwords directly from .env file, handling special chars
read_env_value() {
  local key="$1"
  local file="$2"
  grep "^${key}=" "$file" | head -1 | cut -d= -f2-
}

export MCP_MYSQL_PASSWORD="$(read_env_value MCP_MYSQL_PASSWORD "$MONOREPO_ROOT/.env")"
export MCP_MYSQL_CHAT_PASSWORD="$(read_env_value MCP_MYSQL_CHAT_PASSWORD "$MONOREPO_ROOT/.env")"
export PG_DATABASE_URL="postgresql://chipp_dev:supersecret@localhost:5433/chipp"

cd "$DIR"
DENO_NO_PACKAGE_JSON=1 deno run --allow-net --allow-env --allow-read --allow-ffi scripts/migrate-user-data.ts
