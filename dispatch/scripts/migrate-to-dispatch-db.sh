#!/bin/bash
# Migrate Dispatch data from the shared 'postgres' database to a dedicated 'dispatch' database
# on the same Cloud SQL instance.
#
# This script:
# 1. Dumps chipp_* tables (schema + data) from the source database
# 2. Creates the 'dispatch' database if it doesn't exist
# 3. Restores into 'dispatch'
# 4. Enables pgvector extension
#
# Prerequisites:
#   - kubectl access to the chipp-issues pod
#   - The pod must have psql or pg_dump available, OR we do it via node
#
# Usage:
#   ./scripts/migrate-to-dispatch-db.sh [--dry-run]

set -euo pipefail

NAMESPACE="${K8S_NAMESPACE:-default}"
POD=$(kubectl get pods -n "$NAMESPACE" -l app=chipp-issues -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD" ]; then
  echo "ERROR: No chipp-issues pod found in namespace $NAMESPACE"
  exit 1
fi

echo "Using pod: $POD in namespace: $NAMESPACE"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo "DRY RUN - no changes will be made"
fi

# Step 1: Get the current connection info
echo ""
echo "=== Step 1: Reading current database config ==="
CURRENT_URL=$(kubectl exec -n "$NAMESPACE" "$POD" -- printenv PG_DATABASE_URL)
echo "Current PG_DATABASE_URL points to: $(echo "$CURRENT_URL" | sed 's/postgres:.*@/postgres:***@/')"

# Extract host, port, user, password from the URL
DB_HOST=$(echo "$CURRENT_URL" | sed -n 's|.*@\(.*\):[0-9]*/.*|\1|p')
DB_PORT=$(echo "$CURRENT_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_USER=$(echo "$CURRENT_URL" | sed -n 's|.*://\(.*\):.*@.*|\1|p')

echo "Host: $DB_HOST, Port: $DB_PORT, User: $DB_USER"

# Step 2: Check if dispatch database already exists
echo ""
echo "=== Step 2: Checking for existing 'dispatch' database ==="
DB_EXISTS=$(kubectl exec -n "$NAMESPACE" "$POD" -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PG_DATABASE_URL });
pool.query(\"SELECT 1 FROM pg_database WHERE datname = 'dispatch'\")
  .then(r => { console.log(r.rows.length > 0 ? 'EXISTS' : 'NOT_EXISTS'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
")

if [ "$DB_EXISTS" = "EXISTS" ]; then
  echo "Database 'dispatch' already exists!"
  echo "If you want to re-run, drop it first: DROP DATABASE dispatch;"
  exit 1
fi
echo "Database 'dispatch' does not exist yet. Will create it."

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "DRY RUN complete. Would create 'dispatch' database and migrate all chipp_* tables."
  exit 0
fi

# Step 3: Create the dispatch database
echo ""
echo "=== Step 3: Creating 'dispatch' database ==="
kubectl exec -n "$NAMESPACE" "$POD" -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PG_DATABASE_URL });
pool.query('CREATE DATABASE dispatch')
  .then(() => { console.log('Created database: dispatch'); pool.end(); })
  .catch(e => { console.error('Failed to create database:', e.message); pool.end(); process.exit(1); });
"

# Step 4: Enable pgvector in dispatch database
echo ""
echo "=== Step 4: Enabling pgvector extension ==="
# Connect to the new dispatch database
DISPATCH_URL=$(echo "$CURRENT_URL" | sed 's|/postgres$|/dispatch|')
kubectl exec -n "$NAMESPACE" "$POD" -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DISPATCH_URL' });
pool.query('CREATE EXTENSION IF NOT EXISTS vector')
  .then(() => { console.log('Enabled pgvector extension'); pool.end(); })
  .catch(e => { console.error('Failed to enable pgvector:', e.message); pool.end(); process.exit(1); });
"

# Step 5: Dump and restore chipp_* tables
echo ""
echo "=== Step 5: Migrating chipp_* tables ==="

# Get list of all chipp_* tables
TABLES=$(kubectl exec -n "$NAMESPACE" "$POD" -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PG_DATABASE_URL });
pool.query(\"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'chipp%' ORDER BY tablename\")
  .then(r => { r.rows.forEach(row => console.log(row.tablename)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
")

echo "Tables to migrate:"
echo "$TABLES" | sed 's/^/  - /'

# Get enums used by dispatch
echo ""
echo "Getting custom enum types..."
ENUMS=$(kubectl exec -n "$NAMESPACE" "$POD" -- node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PG_DATABASE_URL });
pool.query(\"SELECT typname, string_agg(enumlabel, ',' ORDER BY enumsortorder) as labels FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid GROUP BY typname\")
  .then(r => { console.log(JSON.stringify(r.rows)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
")
echo "Enums: $ENUMS"

# Now use a comprehensive node script to dump schema + data from source and restore to target
kubectl exec -n "$NAMESPACE" "$POD" -- node -e "
const { Pool } = require('pg');

const sourceUrl = process.env.PG_DATABASE_URL;
const targetUrl = sourceUrl.replace(/\\/postgres\$/, '/dispatch');

async function migrate() {
  const source = new Pool({ connectionString: sourceUrl });
  const target = new Pool({ connectionString: targetUrl });

  try {
    // 1. Get all enum types used in chipp_* tables
    console.log('Copying enum types...');
    const enums = await source.query(\`
      SELECT typname, string_agg(enumlabel, ',' ORDER BY enumsortorder) as labels
      FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      GROUP BY typname
    \`);

    for (const en of enums.rows) {
      const labels = en.labels.split(',').map(l => \"'\" + l + \"'\").join(', ');
      await target.query(\`DO \\\$\\\$ BEGIN CREATE TYPE \${en.typname} AS ENUM (\${labels}); EXCEPTION WHEN duplicate_object THEN null; END \\\$\\\$;\`);
      console.log('  Created enum: ' + en.typname);
    }

    // 2. Get full DDL for each table via information_schema
    console.log('\\nCopying table schemas...');
    const tables = await source.query(
      \"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'chipp%' ORDER BY tablename\"
    );

    // Get all table DDL using pg_dump-style approach
    for (const table of tables.rows) {
      const t = table.tablename;

      // Get columns
      const cols = await source.query(\`
        SELECT column_name, data_type, udt_name, column_default, is_nullable,
               character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '\${t}'
        ORDER BY ordinal_position
      \`);

      let colDefs = cols.rows.map(c => {
        let type = c.udt_name;
        if (type === 'int4') type = 'INTEGER';
        else if (type === 'int8') type = 'BIGINT';
        else if (type === 'int2') type = 'SMALLINT';
        else if (type === 'float4') type = 'REAL';
        else if (type === 'float8') type = 'DOUBLE PRECISION';
        else if (type === 'bool') type = 'BOOLEAN';
        else if (type === 'varchar') type = c.character_maximum_length ? 'VARCHAR(' + c.character_maximum_length + ')' : 'VARCHAR';
        else if (type === 'text') type = 'TEXT';
        else if (type === 'timestamptz') type = 'TIMESTAMPTZ';
        else if (type === 'timestamp') type = 'TIMESTAMP';
        else if (type === 'uuid') type = 'UUID';
        else if (type === 'jsonb') type = 'JSONB';
        else if (type === 'json') type = 'JSON';
        else if (type === 'vector') type = 'vector(1536)';
        // enums and other types pass through as-is

        let def = '\"' + c.column_name + '\" ' + type;
        if (c.column_default) def += ' DEFAULT ' + c.column_default;
        if (c.is_nullable === 'NO') def += ' NOT NULL';
        return def;
      });

      // Get primary key
      const pk = await source.query(\`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = '\${t}'::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
      \`);

      let pkClause = '';
      if (pk.rows.length > 0) {
        pkClause = ', PRIMARY KEY (\"' + pk.rows.map(r => r.attname).join('\", \"') + '\")';
      }

      const createSQL = 'CREATE TABLE IF NOT EXISTS \"' + t + '\" (' + colDefs.join(', ') + pkClause + ')';
      await target.query(createSQL);
      console.log('  Created table: ' + t);
    }

    // 3. Copy data table by table (respecting FK order)
    console.log('\\nCopying data...');

    // Order matters for foreign keys: workspace first, then tables that reference it
    const orderedTables = [
      'chipp_workspace',
      'chipp_status',
      'chipp_label',
      'chipp_customer',
      'chipp_customer_user',
      'chipp_agent',
      'chipp_webhook',
      'chipp_external_issue',
      'chipp_issue',
      'chipp_issue_label',
      'chipp_issue_watcher',
      'chipp_comment',
      'chipp_agent_activity',
      'chipp_sentry_event_log',
      'chipp_spawn_budget',
      'chipp_webhook_delivery',
      'chipp_fix_attempt',
      'chipp_issue_history',
      'chipp_issue_pr',
      'chipp_reconciliation',
    ].filter(t => tables.rows.some(r => r.tablename === t));

    // Add any tables not in our ordered list
    for (const table of tables.rows) {
      if (!orderedTables.includes(table.tablename)) {
        orderedTables.push(table.tablename);
      }
    }

    for (const t of orderedTables) {
      const count = await source.query('SELECT COUNT(*) as cnt FROM \"' + t + '\"');
      const cnt = parseInt(count.rows[0].cnt);
      if (cnt === 0) {
        console.log('  ' + t + ': 0 rows (skipped)');
        continue;
      }

      // Batch copy in chunks of 500
      const batchSize = 500;
      let offset = 0;
      let copied = 0;

      while (offset < cnt) {
        const rows = await source.query('SELECT * FROM \"' + t + '\" LIMIT ' + batchSize + ' OFFSET ' + offset);
        if (rows.rows.length === 0) break;

        const columns = Object.keys(rows.rows[0]);
        const colNames = columns.map(c => '\"' + c + '\"').join(', ');

        for (const row of rows.rows) {
          const values = columns.map((_, i) => '\$' + (i + 1));
          const params = columns.map(c => row[c]);
          await target.query(
            'INSERT INTO \"' + t + '\" (' + colNames + ') VALUES (' + values.join(', ') + ') ON CONFLICT DO NOTHING',
            params
          );
        }

        copied += rows.rows.length;
        offset += batchSize;
      }
      console.log('  ' + t + ': ' + copied + ' rows');
    }

    // 4. Copy indexes
    console.log('\\nCopying indexes...');
    const indexes = await source.query(\`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'chipp%'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY indexname
    \`);

    for (const idx of indexes.rows) {
      try {
        const createIdx = idx.indexdef.replace(/^CREATE INDEX/, 'CREATE INDEX IF NOT EXISTS');
        await target.query(createIdx);
        console.log('  Created index: ' + idx.indexname);
      } catch (e) {
        console.log('  Skipped index: ' + idx.indexname + ' (' + e.message + ')');
      }
    }

    // 5. Copy unique constraints (that aren't primary keys)
    console.log('\\nCopying unique constraints...');
    const uniques = await source.query(\`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'chipp%'
        AND indexdef LIKE '%UNIQUE%'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY indexname
    \`);

    for (const uq of uniques.rows) {
      try {
        const createUq = uq.indexdef.replace(/^CREATE UNIQUE INDEX/, 'CREATE UNIQUE INDEX IF NOT EXISTS');
        await target.query(createUq);
        console.log('  Created unique constraint: ' + uq.indexname);
      } catch (e) {
        console.log('  Skipped: ' + uq.indexname + ' (already exists)');
      }
    }

    // 6. Verify
    console.log('\\nVerifying migration...');
    const targetTables = await target.query(
      \"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'chipp%' ORDER BY tablename\"
    );
    console.log('Source tables: ' + tables.rows.length);
    console.log('Target tables: ' + targetTables.rows.length);

    for (const t of orderedTables) {
      const sc = await source.query('SELECT COUNT(*) as cnt FROM \"' + t + '\"');
      const tc = await target.query('SELECT COUNT(*) as cnt FROM \"' + t + '\"');
      const match = sc.rows[0].cnt === tc.rows[0].cnt ? 'OK' : 'MISMATCH';
      if (match !== 'OK') {
        console.log('  ' + t + ': source=' + sc.rows[0].cnt + ' target=' + tc.rows[0].cnt + ' ' + match);
      }
    }
    console.log('Verification complete!');

    console.log('\\n=== Migration successful! ===');
    console.log('New database URL: ' + targetUrl.replace(/postgres:.*@/, 'postgres:***@'));

  } finally {
    await source.end();
    await target.end();
  }
}

migrate().catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); });
"

echo ""
echo "=== Migration complete! ==="
echo ""
echo "Next steps:"
echo "  1. Update 1Password item 'chipp-issues-production' field PG_DATABASE_URL:"
echo "     Change '/postgres' to '/dispatch' at the end of the URL"
echo "  2. Redeploy to pick up the new secret"
echo "  3. Verify the app works against the new database"
echo "  4. Once confirmed, you can drop the chipp_* tables from the 'postgres' database"
