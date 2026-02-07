# Services Layer

Business logic layer between API routes and database. Services handle validation, authorization, and external API integrations.

## Key Patterns

1. **Service exports**: Export a `const xyzService = { ... }` object with methods, not a class
2. **Access control**: Services check ownership via `userId` parameter before mutations
3. **Error handling**: Throw `NotFoundError`, `ForbiddenError`, `BadRequestError` from `src/utils/errors.ts`. In catch blocks, use `log.error(msg, { source, feature, ...context }, error)` from `@/lib/logger.ts` -- never bare `console.error` or direct `Sentry.captureException`
4. **DB access**: Use Kysely `db` for typed queries, raw `sql` template for complex queries
5. **Fire-and-forget billing**: Billing meter calls never throw - `log.error()` and continue (logger handles Sentry)

## Critical Gotchas

- **JSON columns return as strings**: Always parse JSON columns from raw SQL queries
  ```typescript
  const toolCalls = typeof msg.toolCalls === "string" ? JSON.parse(msg.toolCalls) : msg.toolCalls;
  ```
- **Stripe has TWO accounts**: Chipp production (`1NmfTh`) and Sandbox (`1S05Ov`). v2 pricing plans (`bpp_*`) only exist in Sandbox. Use `getStripeApiKey(useSandbox)` to get the right key
- **v2 billing requires Stripe Sandboxes**: `bpp_test_*` plans do NOT work with regular test mode (`sk_test_*`)
- **Tier validation**: Use `isValidTier()` from `billing/subscription-tiers.ts`, never trust raw strings

## Important Services

| Service | Purpose |
|---------|---------|
| `billing.service.ts` | Stripe v2 billing, credit grants, subscriptions, webhooks |
| `billing/subscription-tiers.ts` | Tier limits, pricing, feature flags (source of truth) |
| `chat.service.ts` | Sessions, messages, history management |
| `rag.service.ts` | Vector similarity search for knowledge retrieval |
| `custom-action.service.ts` | User-defined tools (HTTP actions) |
| `organization.service.ts` | Org CRUD, member management |
| `application.service.ts` | App CRUD, model/prompt config |
| `stripe.client.ts` | Stripe SDK init, key selection helpers |
| `stripe.constants.ts` | Price IDs (v1 and v2), tier-to-price mapping |

## Billing Service Specifics

- Credit checks fail open (return `hasCredits: true` on error) to avoid blocking users
- Use `getOrganizationBillingContext()` to get all billing info for a user
- `getEffectiveCustomerId()` picks sandbox vs production customer based on env
- Webhook handlers distinguish consumer vs organization subscriptions via metadata
