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
