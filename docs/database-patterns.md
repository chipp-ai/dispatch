# Database Patterns (Kysely)

## Connection

```typescript
// src/db/client.ts
import { Kysely } from "kysely";
import { PostgresDialect } from "kysely";
import postgres from "postgres";

const dialect = new PostgresDialect({
  pool: postgres(Deno.env.get("DATABASE_URL")!),
});

export const db = new Kysely<Database>({ dialect });
```

## Migrations

SQL migrations in `db/migrations/`:

```bash
deno task db:migrate       # Run pending migrations
```

Migration files are numbered: `001_create_users.sql`, `002_create_applications.sql`

## Query Patterns

```typescript
// Select with joins
const apps = await db
  .selectFrom("applications")
  .innerJoin(
    "organizations",
    "organizations.id",
    "applications.organization_id"
  )
  .select([
    "applications.id",
    "applications.name",
    "organizations.name as org_name",
  ])
  .where("applications.creator_id", "=", userId)
  .orderBy("applications.created_at", "desc")
  .execute();

// Insert returning
const [user] = await db
  .insertInto("users")
  .values({ email, name })
  .returning(["id", "email", "name", "created_at"])
  .execute();

// Update
await db
  .updateTable("applications")
  .set({ name: newName, updated_at: new Date() })
  .where("id", "=", appId)
  .execute();

// Transaction
await db.transaction().execute(async (trx) => {
  const [org] = await trx
    .insertInto("organizations")
    .values({ name })
    .returning("id")
    .execute();

  await trx
    .insertInto("organization_members")
    .values({ organization_id: org.id, user_id: userId, role: "owner" })
    .execute();
});
```

## JSON Column Gotcha

**CRITICAL**: When you store JSON in the database with `JSON.stringify()`, Kysely returns it as a **string**, not a parsed object. TypeScript type casting (`as Array<...>`) does NOT transform data - it's compile-time only.

```typescript
// ❌ WRONG - msg.toolCalls is a STRING like "[{...}]"
const toolCalls = msg.toolCalls as Array<{ id: string; name: string }>;
// Iterating over a string iterates over CHARACTERS, not array elements!

// ✅ CORRECT - Always parse JSON columns when reading
const toolCalls = msg.toolCalls
  ? typeof msg.toolCalls === "string"
    ? JSON.parse(msg.toolCalls)
    : msg.toolCalls
  : null;
```
