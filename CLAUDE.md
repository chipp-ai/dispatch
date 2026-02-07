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

In dev: pretty-printed. In staging/prod: NDJSON with version, env, pod auto-injected.

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
