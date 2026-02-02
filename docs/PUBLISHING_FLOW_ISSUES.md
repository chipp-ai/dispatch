# Publishing Flow Issues and Recommendations

## Status: FIXED

**Issue resolved on 2024-12-28** using Option 3 (Denormalized Published Snapshot).

### Implementation Summary

1. Added `publishedConfig` JSONB column to `ApplicationTable` (schema.ts)
2. `launchVersion()` now populates `publishedConfig` with the snapshot data
3. `rollbackToVersion()` also updates `publishedConfig` when rolling back
4. `resolveApp()` reads from `publishedConfig` when available, falls back to draft for unpublished apps
5. Created database migration: `016_add_published_config.sql`

**Benefits of this approach:**

- Single query, no JOIN required
- Same performance as before (just one extra column read)
- Consumers now see published version, not draft

---

## Overview (Historical Context)

This document describes critical issues with the original application publishing flow and the recommendations that led to the fix.

## Current Architecture

### Components

1. **ApplicationTable** (`app.applications`): Stores the current application state (draft)
2. **ApplicationVersionHistoryTable** (`app.application_version_history`): Stores versioned snapshots
3. **`launchedVersionId`**: Column on ApplicationTable pointing to the currently published version
4. **`launchVersion()`**: Creates a snapshot and marks it as the published version
5. **`resolveApp()`**: Consumer middleware that loads app data for end-users

### How Publishing Works

```
Builder updates app → ApplicationTable updated (draft)
Builder clicks "Publish" → launchVersion() called:
  1. Creates snapshot in ApplicationVersionHistoryTable
  2. Marks snapshot as isLaunched=true
  3. Sets app.launchedVersionId = snapshot.id
```

## Critical Bug: Consumers See Draft Changes

### The Problem

The `resolveApp()` function in `consumerAuth.ts` loads app data directly from the `ApplicationTable`:

```typescript
// Current implementation (consumerAuth.ts:74-141)
export async function resolveApp(
  appIdentifier: string
): Promise<AppContext["app"] | null> {
  let result = await db
    .selectFrom("app.applications")
    .select([
      "id",
      "name",
      "appNameId",
      "brandStyles",
      "capabilities",
      "settings",
      "isActive",
      "organizationId",
    ])
    .where("isDeleted", "=", false)
    // ...
    .executeTakeFirst();

  return result ?? null;
}
```

This means **consumers see draft changes immediately**, not the published version.

### Expected vs Actual Behavior

| Scenario                      | Expected                         | Actual (Bug)                       |
| ----------------------------- | -------------------------------- | ---------------------------------- |
| Builder updates name (draft)  | Consumer sees old published name | Consumer sees new name immediately |
| Builder changes brand colors  | Consumer sees published colors   | Consumer sees draft colors         |
| Builder updates system prompt | Consumer uses published prompt   | Consumer uses draft prompt         |

### Impact

- **No staging/preview**: Builders can't test changes before publishing
- **Unexpected behavior**: End-users see half-finished changes
- **No rollback safety**: Rolling back doesn't actually affect what consumers see

## Recommended Fix

### Option 1: Join with Version History (Recommended)

Modify `resolveApp()` to load configuration fields from the launched version when available:

```typescript
export async function resolveApp(
  appIdentifier: string
): Promise<AppContext["app"] | null> {
  // First, get the application with its launchedVersionId
  const app = await db
    .selectFrom("app.applications")
    .select([
      "id",
      "appNameId",
      "isActive",
      "organizationId",
      "launchedVersionId",
    ])
    .where("isDeleted", "=", false)
    .where("appNameId", "=", appIdentifier)
    .executeTakeFirst();

  if (!app) return null;

  // If no launched version, fall back to draft (first publish scenario)
  if (!app.launchedVersionId) {
    return db
      .selectFrom("app.applications")
      .select([
        "id",
        "name",
        "appNameId",
        "brandStyles",
        "capabilities",
        "settings",
        "isActive",
        "organizationId",
      ])
      .where("id", "=", app.id)
      .executeTakeFirst();
  }

  // Get configuration from launched version
  const launchedVersion = await db
    .selectFrom("app.application_version_history")
    .select(["data"])
    .where("id", "=", app.launchedVersionId)
    .executeTakeFirst();

  if (!launchedVersion) {
    // Fallback if version not found
    return db
      .selectFrom("app.applications")
      .select([
        "id",
        "name",
        "appNameId",
        "brandStyles",
        "capabilities",
        "settings",
        "isActive",
        "organizationId",
      ])
      .where("id", "=", app.id)
      .executeTakeFirst();
  }

  const launchedData = launchedVersion.data as Record<string, unknown>;

  // Merge: static fields from app + config fields from launched version
  return {
    id: app.id,
    appNameId: app.appNameId,
    isActive: app.isActive,
    organizationId: app.organizationId,
    // Config fields from launched version:
    name: launchedData.name as string,
    brandStyles: launchedData.brandStyles,
    capabilities: launchedData.capabilities,
    settings: launchedData.settings,
  };
}
```

### Option 2: Separate Published Fields

Add published versions of configuration columns directly to ApplicationTable:

```sql
ALTER TABLE applications ADD COLUMN published_name VARCHAR(255);
ALTER TABLE applications ADD COLUMN published_brand_styles JSONB;
ALTER TABLE applications ADD COLUMN published_settings JSONB;
-- etc.
```

Then `launchVersion()` copies draft to published columns.

**Pros**: Single query, no join
**Cons**: Data duplication, more columns to maintain

### Option 3: Denormalized Published Snapshot

Store the full published JSON blob in ApplicationTable:

```sql
ALTER TABLE applications ADD COLUMN published_config JSONB;
```

**Pros**: Single column, single query
**Cons**: Large JSON blob, harder to query individual fields

## Recommendation

**Option 1 (Join with Version History)** is recommended because:

1. Uses existing infrastructure (version history already stores snapshots)
2. No schema changes needed (already have `launchedVersionId`)
3. Maintains single source of truth
4. Version history provides audit trail

## Implementation Steps

1. **Update `resolveApp()`** in `consumerAuth.ts` to join with version history
2. **Add tests** for consumer seeing published vs draft state
3. **Update consumer routes** that might be using app data directly
4. **Test rollback** to ensure consumers see the rolled-back version
5. **Consider caching** launched version data in Redis for performance

## Files to Modify

- `apps/chipp-deno/src/api/middleware/consumerAuth.ts` - Fix `resolveApp()`
- `apps/chipp-deno/src/api/routes/consumer/index.ts` - Verify uses resolved app
- `apps/chipp-deno/src/services/application.service.ts` - Already correct

## Testing Checklist

- [x] Consumer sees published name after builder changes draft name
- [x] Consumer sees published brand colors after builder changes draft
- [x] Consumer uses published system prompt after builder changes draft
- [x] Rolling back actually changes what consumers see
- [x] New apps (no launched version) show draft as expected
- [x] Alias resolution still works with published version data

All tests verified in:

- `src/services/publishing_test.ts` - Publishing flow tests
- `src/api/middleware/consumerAuth_test.ts` - Consumer auth and app resolution tests
