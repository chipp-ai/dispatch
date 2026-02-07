# Database Layer

PostgreSQL with Kysely (NOT Prisma). Single pool via `postgres.js`.

## Schemas

| Schema | Key Tables |
|--------|------------|
| `app` | `organizations`, `users`, `applications`, `workspaces`, `consumers` |
| `chat` | `sessions`, `messages`, `user_memories` |
| `rag` | `knowledge_sources`, `text_chunks` (has `vector(1536)`) |
| `billing` | `token_usage` |

## Kysely Patterns

```typescript
import { db } from "@/db";
import { sql } from "kysely";

// Schema-qualified table names required
const user = await db.selectFrom("app.users").where("id", "=", userId).selectAll().executeTakeFirst();

// JSONB inserts - use sql.json()
await db.insertInto("app.applications").values({ brandStyles: sql.json(styles) }).execute();

// Transactions
await db.transaction().execute(async (trx) => { /* use trx instead of db */ });
```

## Critical Gotchas

**JSON columns return as strings.** Always parse:
```typescript
const styles = typeof app.brandStyles === "string" ? JSON.parse(app.brandStyles) : app.brandStyles;
```

**CamelCasePlugin:** Schema is `snake_case`, TypeScript is `camelCase`. Conversion is automatic.

## Migrations

Location: `db/migrations/NNN_description.sql` | Run: `deno task db:migrate`

### Deployment Pipeline

Migrations run automatically in CI **before** the app deploys. The pipeline is:

1. Build Docker image with latest migration files
2. **Run migrations** via a one-shot k8s Job (`charts/migration-job.yaml`)
3. If migrations fail, **deploy is blocked** and old pods keep serving
4. If migrations succeed, rolling deploy proceeds

This means a failed migration never takes down production. The old code continues running.

### Writing Migrations: Expand and Contract (Critical)

Every migration **must be backward-compatible** with the currently running code. This is because migrations run before the new code deploys, so old code will be running against the new schema during the rollout window.

**Expand** (safe - do this freely):
- `ADD COLUMN` with a default or nullable
- `CREATE TABLE`
- `CREATE INDEX`
- Add new enum values

**Contract** (dangerous - do this in a SEPARATE, LATER migration):
- `DROP COLUMN` - only after the code that stopped using it has been deployed
- `DROP TABLE` - only after no code references it
- `RENAME COLUMN` - treat as drop + add; deploy code that reads both names first
- Remove enum values

**Example - renaming a column:**
```
-- Migration N (expand): add new column, backfill
ALTER TABLE app.users ADD COLUMN display_name TEXT;
UPDATE app.users SET display_name = username;

-- Deploy N: code reads display_name, falls back to username

-- Migration N+1 (contract): drop old column (next deploy cycle)
ALTER TABLE app.users DROP COLUMN username;
```

**The rule: never remove or rename something in the same deploy that stops using it.**
