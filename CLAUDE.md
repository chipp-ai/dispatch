# Chipp Deno

Consumer app for Chipp AI chatbots. Deno + Hono API, Svelte 5 SPA, Cloudflare Worker.

**The most important rule:** "when in doubt, do the cool thing"

## Quick Start

```bash
./scripts/dev.sh    # Full stack (API :8000 + Vite :5174 + Worker :8788)
```

**Browser:** Always use `http://localhost:5174` (Vite), NOT :8788 or :8000.

## Critical Rules

- No emojis unless necessary
- Never make things up - ask if unsure
- PRs target `staging` branch, not `main`
- Use `.scratch/` for ephemeral files
- **ALWAYS use `./scripts/dev.sh`** - logs go to `.scratch/logs/`

### Fix Pre-Existing Issues (Non-Negotiable)

When you encounter a pre-existing bug, misconfiguration, or broken code during your work -- **stop and fix it**. Do not work around it, do not leave a TODO, do not say "this will work in production." Examples:

- Wrong env var names (e.g. `GCS_BUCKET_NAME` vs `GCS_FILE_BUCKET`)
- Broken imports, dead code paths, incorrect types
- Misconfigured services, missing migrations, stale references

If the fix is outside your current scope or you're unsure of the correct fix, **ask the human** before continuing. Never gloss over issues with "it's pre-existing so we'll leave it."

### Local End-to-End Testing (Non-Negotiable)

Every feature implementation **must be validated locally through the browser** using the browser DevTools MCP tools before considering it done. This means:

1. **Start the full dev stack** (`./scripts/dev.sh`) -- if it fails, fix it before proceeding
2. **Navigate the actual UI flow** in the browser (browser_navigate, browser_click, browser_take_screenshot)
3. **Verify the feature works end-to-end** -- not just the API, but the full user-facing flow
4. **Check for errors** in both server logs (`dev_logs_errors`) and browser console (`browser_get_console_logs`)

**Never skip local testing.** If you hit blockers (Docker not running, DB not migrated, missing env vars, GCS not configured), **stop and fix those issues first** or ask the human for help. Do not proceed with partial testing and assume it will work in staging/prod. The standard is: if it can be tested locally, it must be tested locally.

## Error Handling (Critical)

**Never use bare `console.error` or direct `Sentry.captureException`.** Use the unified logger.

**Server-side** (Deno): Use `log` from `@/lib/logger.ts` -- it handles console output, structured JSON, AND Sentry:
```typescript
import { log } from "@/lib/logger.ts";

// Error with exception object (sends Sentry.captureException)
log.error("Something failed", {
  source: "feature-area",
  feature: "specific-feature",
  userId, applicationId, relevantData,
}, error);

// Error without exception (sends Sentry.captureMessage)
log.error("Config not found", {
  source: "feature-area",
  feature: "config-lookup",
  applicationId,
});

// Warning (sends Sentry.captureMessage at warning level)
log.warn("Credits running low", {
  source: "billing",
  feature: "credit-check",
  orgId, balance,
});

// Info (structured log only, no Sentry)
log.info("Webhook received", {
  source: "stripe-webhook",
  feature: "event-routing",
  eventType, requestId,
});
```

Context fields: `source` (module name) and `feature` (operation) are required. Add relevant IDs (`orgId`, `appId`, `userId`, `requestId`, etc.) and domain data.

In dev: pretty-printed. In staging/prod: NDJSON with version, env, pod auto-injected. All prod logs are persisted in Loki (30-day retention) and queryable via Grafana at `https://grafana.chipp.ai`.

**Client-side** (Svelte): Use `captureException` from `$lib/sentry` -- it does both console.error AND Sentry:
```typescript
import { captureException } from "$lib/sentry";

captureException(error, {
  tags: { feature: "specific-feature" },
  extra: { relevantData },
});
```

## Common Pitfalls

### JSON Columns Return as Strings

```typescript
// WRONG - msg.toolCalls is a STRING
const toolCalls = msg.toolCalls as Array<...>;

// CORRECT - Always parse
const toolCalls = typeof msg.toolCalls === "string"
  ? JSON.parse(msg.toolCalls)
  : msg.toolCalls;
```

### Chat Sessions Reload from DB

Every API call reloads history via `body.sessionId`. Bugs in storage affect ongoing conversations immediately.

## Git Workflow

```bash
git fetch origin staging
git checkout -b feature/my-feature origin/staging
```

PRs target `staging`. Never discard uncommitted changes without stashing first.

## Workflows & Reference

For detailed workflows (subagents, migration patterns, MCP tools, worktrees, browser DevTools):

@docs/claude-code-workflows.md

## Database Migrations

Migrations run automatically in CI before deploy. **Every migration must be backward-compatible** with the currently running code (expand/contract pattern). See full rules in @db/CLAUDE.md.

## Key Documentation

| Topic | File |
|-------|------|
| DB migrations & deploy | @db/CLAUDE.md |
| Migration checkpoint | @docs/migrations/CHECKPOINT.json |
| Stripe billing | @docs/stripe-development.md |
| Voice agents | @docs/voice/README.md |
| Custom actions | @docs/custom-actions/README.md |
| RAG/embeddings | @docs/knowledge-sources-rag/ |
| Whitelabel | @docs/enterprise-whitelabel/ |
| Monitoring (Loki/Grafana) | @monitoring/README.md |
| Dispatch (issue tracker) | @dispatch/CLAUDE.md |
