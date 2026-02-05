---
name: chipp-database
description: Query Chipp Deno databases accurately. Use this skill when querying production, staging, or local databases. Provides schema knowledge to prevent column hallucination.
---

# Chipp Deno Database Query Skill

**CRITICAL**: Always reference this skill before writing database queries. Never guess column names.

## MCP Server: chipp-database

All database access goes through the `mcp__chipp-database__*` tools:

```
# Connect to database
mcp__chipp-database__db_connect()

# Query the database
mcp__chipp-database__db_query(sql='SELECT * FROM app.users WHERE id = ...')

# Schema discovery
mcp__chipp-database__db_list_tables(schema='app')
mcp__chipp-database__db_describe_table(table='app.users')
mcp__chipp-database__db_find_table(pattern='user')
mcp__chipp-database__db_find_column(pattern='email')
mcp__chipp-database__db_sample_rows(table='app.users', limit=5)
mcp__chipp-database__db_help(topic='schemas')
```

## Single PostgreSQL Database with Schemas

chipp-deno uses a **single PostgreSQL database** with multiple schemas:

| Schema    | Purpose                                      | Key Tables                                    |
| --------- | -------------------------------------------- | --------------------------------------------- |
| **app**   | Core application data (users, orgs, apps)    | users, organizations, workspaces, applications |
| **chat**  | Chat sessions and messages                   | sessions, messages, user_memories, tags       |
| **rag**   | RAG/embeddings for knowledge sources         | knowledge_sources, text_chunks                |
| **billing** | Usage tracking                             | token_usage                                   |

**Note**: Tables are prefixed with schema in queries: `app.users`, `chat.messages`, etc.

---

## Key Tables

### app schema

#### app.users
Developer accounts.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| email            | varchar      | Developer email (unique)     |
| name             | varchar      | Display name                 |
| organization_id  | uuid         | FK to organizations          |
| created_at       | timestamp    | Signup date                  |

#### app.organizations
Billing/subscription entities.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| name             | varchar      | Organization name            |
| subscription_tier| varchar      | FREE, PRO, TEAM, ENTERPRISE  |
| credits_remaining| bigint       | Available credits            |
| created_at       | timestamp    | Creation date                |

#### app.workspaces
Team workspaces.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| name             | varchar      | Workspace name               |
| slug             | varchar      | URL slug                     |
| organization_id  | uuid         | FK to organizations          |
| visibility       | varchar      | PRIVATE, PUBLIC              |

#### app.applications
AI chatbot configurations.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| name             | varchar      | App name                     |
| app_name_id      | varchar      | URL slug (unique)            |
| developer_id     | uuid         | FK to users                  |
| workspace_id     | uuid         | FK to workspaces (nullable)  |
| organization_id  | uuid         | FK to organizations          |
| system_prompt    | text         | AI system prompt             |
| welcome_message  | text         | Initial message              |
| is_deleted       | boolean      | Soft delete flag             |
| created_at       | timestamp    | Creation date                |

### chat schema

#### chat.sessions
Chat conversations.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| application_id   | uuid         | FK to applications           |
| consumer_id      | uuid         | FK to consumers (nullable)   |
| title            | varchar      | Chat title                   |
| source           | varchar      | APP, API, WHATSAPP, SLACK    |
| started_at       | timestamp    | Session start                |
| ended_at         | timestamp    | Session end (nullable)       |

#### chat.messages
Individual messages.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| session_id       | uuid         | FK to sessions               |
| role             | varchar      | user, assistant, system      |
| content          | text         | Message content              |
| model_used       | varchar      | LLM model (for assistant)    |
| tool_calls       | jsonb        | Tool call data (nullable)    |
| tool_results     | jsonb        | Tool results (nullable)      |
| created_at       | timestamp    | Message timestamp            |

#### chat.user_memories
Extracted user memories.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| application_id   | uuid         | FK to applications           |
| consumer_id      | uuid         | FK to consumers              |
| content          | text         | Memory content               |
| created_at       | timestamp    | Extraction time              |

### rag schema

#### rag.knowledge_sources
Uploaded docs/URLs for RAG.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| application_id   | uuid         | FK to applications           |
| name             | varchar      | Source name                  |
| type             | varchar      | FILE, URL, TEXT              |
| url              | varchar      | Source URL (nullable)        |
| status           | varchar      | PENDING, PROCESSING, READY   |
| created_at       | timestamp    | Upload time                  |

#### rag.text_chunks
Embedded text chunks with vectors.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| knowledge_source_id | uuid      | FK to knowledge_sources      |
| content          | text         | Chunk text                   |
| embedding        | vector(1536) | OpenAI embedding             |
| chunk_index      | int          | Position in document         |
| created_at       | timestamp    | Creation time                |

### billing schema

#### billing.token_usage
LLM token tracking.

| Column           | Type         | Description                  |
| ---------------- | ------------ | ---------------------------- |
| id               | uuid         | Primary key                  |
| application_id   | uuid         | FK to applications           |
| organization_id  | uuid         | FK to organizations          |
| session_id       | uuid         | FK to sessions (nullable)    |
| model            | varchar      | LLM model used               |
| input_tokens     | int          | Input token count            |
| output_tokens    | int          | Output token count           |
| created_at       | timestamp    | Usage timestamp              |

---

## Common Query Patterns

### Find user by email
```sql
SELECT * FROM app.users WHERE email = 'user@example.com';
```

### Get app with owner info
```sql
SELECT a.*, u.email as owner_email
FROM app.applications a
JOIN app.users u ON a.developer_id = u.id
WHERE a.app_name_id = 'my-app-slug';
```

### Recent chat sessions for an app
```sql
SELECT * FROM chat.sessions
WHERE application_id = 'app-uuid'
ORDER BY started_at DESC
LIMIT 10;
```

### Message count by app (last 30 days)
```sql
SELECT a.name, COUNT(m.id) as message_count
FROM app.applications a
JOIN chat.sessions s ON s.application_id = a.id
JOIN chat.messages m ON m.session_id = s.id
WHERE s.started_at > NOW() - INTERVAL '30 days'
GROUP BY a.id, a.name
ORDER BY message_count DESC;
```

### Token usage by model
```sql
SELECT model, SUM(input_tokens + output_tokens) as total_tokens
FROM billing.token_usage
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY model
ORDER BY total_tokens DESC;
```

### Apps with knowledge sources
```sql
SELECT a.name, COUNT(ks.id) as source_count
FROM app.applications a
JOIN rag.knowledge_sources ks ON ks.application_id = a.id
WHERE ks.status = 'READY'
GROUP BY a.id, a.name
ORDER BY source_count DESC;
```

---

## Kysely Patterns (in code)

When writing Kysely queries in code:

```typescript
// Select with joins
const apps = await db
  .selectFrom("app.applications")
  .innerJoin("app.users", "app.users.id", "app.applications.developer_id")
  .select(["app.applications.id", "app.applications.name", "app.users.email as owner_email"])
  .where("app.applications.is_deleted", "=", false)
  .orderBy("app.applications.created_at", "desc")
  .execute();

// Insert with returning
const [user] = await db
  .insertInto("app.users")
  .values({ email, name, organization_id: orgId })
  .returning(["id", "email", "name", "created_at"])
  .execute();

// Update
await db
  .updateTable("app.applications")
  .set({ name: newName, updated_at: new Date() })
  .where("id", "=", appId)
  .execute();
```

---

## Anti-Patterns (Don't Do This)

1. **Don't guess columns** - Always check schema first with `db_describe_table`
2. **Don't forget schema prefix** - Always use `schema.table` format
3. **Don't assume JSON is parsed** - Kysely returns JSON columns as strings
4. **Don't forget is_deleted** - Filter `WHERE is_deleted = false` for active records
5. **Don't use raw SQL injection** - Use Kysely's parameterized queries

---

## MCP Tool Reference

### Connection
```
mcp__chipp-database__db_connect(connectionUrl?)  # Connect to database
mcp__chipp-database__db_disconnect()              # Disconnect
```

### Querying
```
mcp__chipp-database__db_query(sql, limit?)        # SELECT queries only
```

### Schema Discovery
```
mcp__chipp-database__db_list_tables(schema?, includeRowCount?)
mcp__chipp-database__db_describe_table(table)
mcp__chipp-database__db_find_table(pattern)
mcp__chipp-database__db_find_column(pattern)
mcp__chipp-database__db_sample_rows(table, limit?)
mcp__chipp-database__db_help(topic?)
```
