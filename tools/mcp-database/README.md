# MCP Database Server

MCP server for querying the chipp-deno PostgreSQL database.

## Tools

| Tool | Description |
|------|-------------|
| `db_connect` | Connect to database (uses DATABASE_URL env var) |
| `db_disconnect` | Disconnect from database |
| `db_list_tables` | List tables by schema (app, chat, rag, billing) |
| `db_describe_table` | Show column info for a table |
| `db_query` | Execute read-only SQL queries |
| `db_find_table` | Find tables matching a pattern |
| `db_find_column` | Find columns matching a pattern |
| `db_sample_rows` | Get sample rows from a table |
| `db_help` | Get help on schemas, tables, queries |

## Setup

### Environment Variables

Set `DATABASE_URL` to your PostgreSQL connection string:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/chipp"
```

Or set individual variables:
- `PG_HOST` (default: localhost)
- `PG_PORT` (default: 5432)
- `PG_USER` (default: postgres)
- `PG_PASSWORD`
- `PG_DATABASE` (default: chipp)

### Configure Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "chipp-database": {
      "command": "deno",
      "args": ["run", "--allow-net", "--allow-env", "--allow-read", "tools/mcp-database/index.ts"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Database Schemas

| Schema | Purpose |
|--------|---------|
| app | Core application data (users, orgs, applications, workspaces) |
| chat | Chat data (sessions, messages, memories, tags) |
| rag | RAG/embeddings (knowledge_sources, text_chunks) |
| billing | Usage tracking (token_usage) |

## Usage Examples

```
# Connect to database
db_connect

# List all tables
db_list_tables

# List tables in chat schema
db_list_tables(schema: "chat")

# Describe a table
db_describe_table(table: "app.users")

# Query data
db_query(sql: "SELECT * FROM app.applications LIMIT 5")

# Find tables by name
db_find_table(pattern: "session")

# Find columns by name
db_find_column(pattern: "email")

# Get help
db_help(topic: "queries")
```

## Security

- Only SELECT queries are allowed (read-only)
- Results are limited to 1000 rows max
- No DDL or DML statements permitted
