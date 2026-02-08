# Migration Checkpoint System

This folder tracks the state of feature migrations from ChippMono to ChippDeno. Files here are version-controlled so migration progress persists across sessions and machines.

## Quick Resume

When resuming after context clear:
```
1. Read CHECKPOINT.json to see current phase and component status
2. Check git status for modified files
3. Read in-progress files to understand implementation state
4. Continue from where we left off
```

## Checkpoint Structure

```json
{
  "migration": "name-of-migration",
  "currentPhase": "explore|implement|integrate|verify|qa",
  "phases": {
    "explore": { "components": { ... } },
    "implement": { "components": { ... } },
    "integrate": { "notes": "..." },
    "verify": { "components": { ... } },
    "qa": { "components": { ... } }
  },
  "verification": { "lastRun": "timestamp", "results": {} },
  "blockers": [],
  "resumeInstructions": "..."
}
```

## Component Status Values

- `pending` - Not started
- `in-progress` - Work underway
- `complete` - Done and verified
- `blocked` - Waiting on dependency

## Phases

1. **explore** - Research and document the feature from ChippMono
2. **implement** - Build the feature in ChippDeno
3. **integrate** - Wire components together
4. **verify** - Type check, schema check, basic testing
5. **qa** - End-to-end flow testing

## Current Migration: Subscription Tiers & Billing

### Status: VERIFY phase

**Completed:**
- All exploration reports (4 components)
- All implementation (6 components)
- Integration complete
- Type check passes
- Database schema migrated

**Remaining:**
- E2E flow testing

### Files

| File | Purpose |
|------|---------|
| CHECKPOINT.json | Machine-readable state |
| subscription-tiers.md | Tier definitions report |
| plans-page.md | Plans/pricing page report |
| billing-settings.md | Billing settings page report |
| upgrade-modals.md | Upgrade modal flows report |

### Key Implementation Files

| Component | Files |
|-----------|-------|
| Organization store | `web/src/stores/organization.ts` |
| Billing service | `src/services/billing.service.ts` |
| Organization API | `src/api/routes/organization/index.ts` |
| Plans page | `web/src/routes/Plans.svelte` |
| Billing settings | `web/src/routes/settings/content/BillingPlanContent.svelte` |
| Billing components | `web/src/lib/design-system/components/billing/` |
| Database migration | `db/migrations/024_add_subscription_management_columns.sql` |
