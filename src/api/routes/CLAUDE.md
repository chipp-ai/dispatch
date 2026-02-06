# API Routes Layer

Hono routes organized by resource, mounted in `app.ts`.

## Auth Patterns

**Protected routes** use `AuthContext` - access user via `c.get("user")`:
```typescript
const user = c.get("user"); // { id, email, organizationId, role }
```

**Unauthenticated routes** handle their own auth:
- `dev/` - No auth, blocked in production via `ENVIRONMENT` check
- `webhooks/` - Signature verification (Stripe, Twilio)
- `auth/` - Uses `X-Internal-Auth` header for server-to-server
- `consumer/` - Separate `consumerAuthMiddleware` for end-users

## Response Format

```typescript
return c.json({ data: result });       // Success (always wrap in data)
return c.json({ error: "msg" }, 400);  // Error
```

## Route Groups

| Path | Auth | Purpose |
|------|------|---------|
| `application/` | JWT/session | Apps, versions, voice campaigns |
| `billing/` | JWT/session | Stripe checkout, portal |
| `consumer/` | Consumer auth | End-user chat, PWA manifests |
| `dev/` | None (prod blocked) | MCP testing endpoints |
| `webhooks/` | Signature | External callbacks |

## Error Handling

In catch blocks, always add Sentry alongside console.error:
```typescript
import * as Sentry from "@sentry/deno";

console.error("[Route] Failed:", error);
Sentry.captureException(error, {
  tags: { source: "route-group", feature: "endpoint-name" },
  extra: { userId: user?.id, applicationId },
});
```

## Non-Obvious Behaviors

1. **Two separate auth systems**: `session_id` cookie for developers, `consumer_session_id` for end-users.
2. **Dev routes auto-select first org/user** when IDs not provided.
3. **Validators as middleware**: `zValidator("json", schema)` goes before handler, access via `c.req.valid("json")`.
