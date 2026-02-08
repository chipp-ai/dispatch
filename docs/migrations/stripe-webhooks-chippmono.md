# Stripe Webhook Handling - ChippMono Deep Dive

## Executive Summary

- **What it does**: ChippMono has two separate webhook endpoints handling consumer payments and developer/organization subscriptions. Events trigger database updates, Slack notifications, email notifications, cache invalidation, and churn analytics.
- **Complexity**: High - Two billing systems (v1 legacy + v2 usage-based), multiple purchase types, careful event routing required
- **Critical Dependencies**: Stripe SDK, Prisma (3 databases), Redis cache, Slack integration, SMTP email service, Sentry error tracking
- **Recommended approach**: Implement incrementally - start with the simpler `/api/stripe/webhook` endpoint first, then add plans webhook

---

## Webhook Endpoint Locations

### 1. Main Webhook: `/api/stripe/webhook` (Consumer + Connect)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/webhook/route.ts`

**Purpose:** Handles:
- Consumer package purchases (credit refills)
- Consumer subscription management
- Stripe Connect account onboarding
- HQ access grants
- Organization payment setup
- Payment invitations
- Billing alerts (v2 auto-topups)
- Cohort product purchases (Slack notifications)

**Webhook Secret:** Retrieved from database via `getStripeWebhookSecret(mode)` with environment variable fallback.

### 2. Plans Webhook: `/api/stripe/plans/webhook` (Developer Subscriptions)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/plans/webhook/route.ts`

**Purpose:** Handles:
- Organization subscription tier changes (PRO/TEAM/BUSINESS)
- Subscription cancellations
- Payment failures
- Both v1 (legacy) and v2 (usage-based) billing subscriptions

**Webhook Secret:**
- Sandbox: `STRIPE_SANDBOX_WEBHOOK_SECRET`
- Production: `STRIPE_CHIPP_WEBHOOK_SECRET`

---

## Event Types Handled

### Main Webhook Events (`/api/stripe/webhook`)

| Event Type | Handler | Purpose |
|------------|---------|---------|
| `account.updated` | `handleAccountUpdated()` | Stripe Connect onboarding completion |
| `checkout.session.completed` | Multiple handlers by `purchaseType` | Credit purchases, HQ access, payment setup |
| `invoice.paid` | `logSubscriptionPurchase()` + `activateSubscription()` | Consumer subscription renewal |
| `customer.subscription.deleted` | `deactivateSubscription()` | Consumer subscription cancellation |
| `customer.subscription.updated` | `activateSubscription()` | Consumer subscription changes |
| `invoice.payment_failed` | `deactivateSubscription()` | Consumer payment failure |
| `billing.alert.triggered` | `handleBillingAlert()` | v2 credit exhaustion & auto-topups |

### Checkout Session Purchase Types

The `checkout.session.completed` event is routed by `session.metadata.type`:

| Purchase Type | Handler | Purpose |
|---------------|---------|---------|
| `APPLICATION_DUPLICATE` | Direct Prisma | Create `PurchasedApplication` record |
| `PACKAGE` | `logSubscriptionPurchase()` / `addCreditsToAccount()` | Consumer credit/subscription purchase |
| `hq_access` | Direct Prisma | Developer workspace access via payment |
| `hq_consumer_access` | Direct Prisma | HQ consumer access grant (public_paid mode) |
| `org_payment_setup` | Stripe API | Set default payment method for org |
| `payment_invite` | Stripe API + Prisma | Payment invitation completion |

### Plans Webhook Events (`/api/stripe/plans/webhook`)

| Event Type | Handler | Purpose |
|------------|---------|---------|
| `checkout.session.completed` | `activateSubscriptionFromSession()` | Organization subscription activation |
| `customer.subscription.deleted` | `deactivateSubscription()` | Organization subscription cancellation |
| `customer.subscription.updated` | `handleSubscriptionUpdate()` | Organization tier change |
| `invoice.payment_failed` | `deactivateSubscription()` | Organization payment failure |

---

## Signature Verification

Both endpoints use Stripe's signature verification:

```typescript
// From /api/stripe/webhook/route.ts
const rawBody = await request.text();
const sig = request.headers.get("stripe-signature") as string;
const stripeWebhookSecret = await getStripeWebhookSecret(mode === Mode.TEST);

const stripe = new Stripe(stripeApiKey, { apiVersion: "2025-09-30.clover" });
event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
```

**Key Points:**
- Raw body must be preserved (no JSON parsing before verification)
- Webhook secrets are stored in database (SystemConfig table) with env var fallback
- Mode (TEST/LIVE) determined from query param `?testMode=true` or event `livemode` field
- Returns 400 status on verification failure

---

## v1 vs v2 Billing Detection

**Critical:** v2 subscriptions trigger `customer.subscription.*` events but must NOT be processed by v1 handlers.

### Detection Method

```typescript
// From /Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts

export function isV2BillingPriceId(priceId: string): boolean {
  if (!priceId) return false;
  // V2 billing pricing plan IDs start with these prefixes
  if (priceId.startsWith("bpp_")) return true;
  if (priceId.startsWith("bpp_test_")) return true;
  return false;
}
```

### Usage in Handlers

```typescript
// From plan.ts - handleSubscriptionUpdate()
const priceId = subscription.items.data[0]?.price?.id;
if (priceId && isV2BillingPriceId(priceId)) {
  logger.info("Skipping customer.subscription.updated for v2 billing subscription - state managed via checkout.session.completed");
  return;
}
```

**Why:** v2 checkout uses `checkout_items` which doesn't support `subscription_data.metadata`. The subscription object has empty metadata, causing v1 handlers to fail.

### ID Prefixes Reference

| Prefix | Type | Billing Version |
|--------|------|-----------------|
| `price_` | Traditional price | v1 |
| `sub_` | Subscription | v1 |
| `bpp_` | Billing pricing plan | v2 |
| `bilint_` | Billing intent | v2 |
| `rcd_` | Rate card | v2 |
| `svca_` | Service action | v2 |

---

## Handler Logic Details

### Consumer Handlers (`/apiService/stripe/webhook/consumer.ts`)

#### `addCreditsToAccount(mode, event)`

**Purpose:** Add credits when consumer purchases a one-time package

**Steps:**
1. Extract metadata: `consumerIdentifier`, `developerId`, `applicationId`, `packageId`
2. Lookup package to get `tokenQty`
3. Find consumer by composite key: `identifier + applicationId + mode`
4. Create `Transaction` record (type: `REFILL`)
5. Create `Purchase` record
6. Update `Consumer.credits` (increment)
7. Store `stripeCustomerId` on consumer

**Database Tables Modified:**
- `Transaction` - Created
- `Purchase` - Created
- `Consumer` - Updated (`credits`, `stripeCustomerId`)

#### `logSubscriptionPurchase(mode, event)`

**Purpose:** Record subscription purchase

**Steps:**
1. Extract consumer metadata from subscription
2. Find consumer by composite key
3. Create `Purchase` record

**Database Tables Modified:**
- `Purchase` - Created

#### `activateSubscription(mode, event)` (Consumer)

**Purpose:** Mark consumer subscription as active

**Conditions:** Only if `!subscription.cancel_at_period_end && !subscription.pending_update`

**Database Tables Modified:**
- `Consumer` - Updated (`subscriptionActive: true`, `stripeCustomerId`)

#### `deactivateSubscription(mode, event)` (Consumer)

**Purpose:** Mark consumer subscription as inactive

**Database Tables Modified:**
- `Consumer` - Updated (`subscriptionActive: false`)

---

### Plan Handlers (`/apiService/stripe/webhook/plan.ts`)

#### `handleSubscriptionUpdate(mode, event)`

**Purpose:** Handle organization tier changes from subscription updates

**Steps:**
1. Skip if v2 billing (check `isV2BillingPriceId`)
2. Derive tier from price ID using `getTierFromPriceId()`
3. Recover `organizationId` from metadata or customer lookup
4. Update organization tier/period
5. Invalidate organization tier cache
6. Capture churn analytics if downgrade detected
7. Backfill subscription metadata in Stripe

**Database Tables Modified:**
- `Organization` - Updated (`subscriptionTier`, `subscriptionPeriod`, `stripeSubscriptionId`, `stripeCustomerId`)

**Cache Invalidation:**
- `invalidateOrganizationTierCache(organization.id)` - Redis

#### `activateSubscriptionFromSession(mode, event)`

**Purpose:** Activate subscription from checkout session completion

**Steps:**
1. Extract tier/period from session metadata
2. Find organization by `stripeCustomerId` or `organizationId`
3. Verify subscription status (skip if `incomplete` or `incomplete_expired`)
4. Send incomplete payment email if payment failed
5. Cancel existing subscription if different
6. Update organization tier/period
7. Set feature flags for paid tiers (`USAGE_BASED_BILLING_ENABLED`, `ALLOW_EXPENSIVE_MODELS`)
8. Set default payment method
9. Invalidate tier cache

**Database Tables Modified:**
- `Organization` - Updated (multiple fields)

**Feature Flags Set:**
- `USAGE_BASED_BILLING_ENABLED: true`
- `ALLOW_EXPENSIVE_MODELS: true`

**Side Effects:**
- Email sent if payment incomplete
- Slack notification via `notifySlackOfPlanUpgrade()`

#### `activateSubscriptionFromSessionFallback(mode, event)`

**Purpose:** Handle checkout sessions created without proper metadata (e.g., Stripe Dashboard)

**Steps:**
1. Derive tier from subscription's price ID
2. Find organization by customer email as fallback
3. Verify subscription status
4. Update organization tier
5. Set feature flags
6. Backfill metadata

#### `deactivateSubscription(mode, event)` (Organization)

**Purpose:** Downgrade organization to FREE tier

**Steps:**
1. Skip v2 billing subscriptions
2. Recover organization from metadata or customer lookup
3. Skip churn notification if not current subscription
4. Capture churn analytics
5. Update organization to FREE tier
6. Invalidate cache

**Database Tables Modified:**
- `Organization` - Updated (`subscriptionTier: FREE`, `subscriptionPeriod: null`, `stripeSubscriptionId: null`)

**Side Effects:**
- Churn analytics captured
- Slack notification via `notifySlackOfChurn()`

---

### Billing Alert Handler (`/apiService/stripe/webhook/billing-alert.ts`)

#### `handleBillingAlert(event)`

**Purpose:** Handle v2 billing alerts for auto-topups and credit exhaustion

**Alert Types:**
1. **$0 Balance Alert** - Set `creditsExhausted` flag, send exhausted email
2. **Notification Alert** (title starts with "notification:") - Send low credits email
3. **Auto-topup Alert** - Charge customer, grant credits

**Auto-topup Flow:**
1. Find organization by Stripe customer ID
2. Get topup settings from customer metadata (`topup_enabled`, `topup_amount_cents`)
3. Create payment intent
4. Create credit grant via Stripe v2 API
5. Clear `creditsExhausted` flag
6. Notify Slack

**Database Tables Modified:**
- `Organization` - Updated (`creditsExhausted`)

**Side Effects:**
- Email via `sendLowCreditsEmail()`
- Slack via `notifySlackOfCreditTopup()`
- Refund if credit grant fails

---

### Account Updated Handler (`/apiService/stripe/webhook/index.ts`)

#### `handleAccountUpdated(event)`

**Purpose:** Complete Stripe Connect onboarding

**Conditions:** Account capabilities must have `transfers: active` AND `card_payments: active`

**Database Tables Modified:**
- `Developer` - Updated (`hasCompletedStripeOnboarding: true`)

---

### Churn Analytics (`/apiService/stripe/webhook/churn-analytics.ts`)

#### `captureChurnAnalytics(input)`

**Purpose:** Record comprehensive analytics when customers downgrade

**Data Captured:**
- Tenure metrics (days since account created, days as paid subscriber)
- App metrics (total apps, published apps, conversations, messages)
- Feature adoption (knowledge sources, custom actions, integrations)
- Usage metrics (tokens, conversations in last 30 days)
- Revenue metrics

**Database Tables Modified:**
- `ChurnEvent` - Created

**Side Effects:**
- Slack notification via `notifySlackOfChurn()`

---

## Database Tables Modified by Webhooks

### Main Database (`chipp-prisma`)

| Table | Events That Modify | Fields Modified |
|-------|-------------------|-----------------|
| `Organization` | Plans webhook events | `subscriptionTier`, `subscriptionPeriod`, `stripeSubscriptionId`, `stripeCustomerId`, `usageBasedBillingEnabled`, `creditsExhausted`, `featureFlags` |
| `Developer` | `account.updated` | `hasCompletedStripeOnboarding` |
| `Consumer` | Consumer subscription events | `subscriptionActive`, `stripeCustomerId`, `credits` |
| `Transaction` | `checkout.session.completed` (PACKAGE) | New records created |
| `Purchase` | `checkout.session.completed`, `invoice.paid` | New records created |
| `PurchasedApplication` | `checkout.session.completed` (APPLICATION_DUPLICATE) | New records created |
| `WorkspaceMember` | `checkout.session.completed` (hq_access) | New records created |
| `HQAccessGrant` | `checkout.session.completed` (hq_consumer_access) | New records created |
| `PaymentInvitation` | `checkout.session.completed` (payment_invite) | `usedAt` updated |
| `ChurnEvent` | Subscription cancellations/downgrades | New records created |

---

## Side Effects

### Slack Notifications

| Function | Trigger | Channel |
|----------|---------|---------|
| `notifySlackOfPlanUpgrade()` | Checkout completed with subscription | #chipp-sales |
| `notifySlackOfWorkspaceUpgrade()` | Workspace upgrade | #chipp-sales |
| `notifySlackOfChurn()` | Subscription downgrade/cancellation | #chipp-churn |
| `notifySlackOfCreditTopup()` | Auto-topup completed | #chipp-billing |
| `notifyCohortPurchase()` | Cohort product purchase | #chipp-cohorts |

### Email Notifications

| Function | Trigger | Recipients |
|----------|---------|------------|
| `sendLowCreditsEmail()` | Billing alert (low/exhausted) | Org creator + admins |
| Incomplete payment email | Subscription payment incomplete | Org creator + CC to team |

### Cache Invalidation

| Function | Trigger |
|----------|---------|
| `invalidateOrganizationTierCache()` | Any tier change |
| `invalidateOrganizationCache()` | Credits exhausted flag change |
| `clearDeveloperCache()` | Developer updates |

---

## Error Handling

### Webhook Error Response

```typescript
catch (err: any) {
  console.log(`Webhook Error: ${err.message}`);

  Sentry.captureException(err, {
    tags: {
      source: "stripe-webhook",
      feature: "billing",
      eventType: event?.type,
    },
    extra: {
      eventId: event?.id,
      errorMessage: err.message,
    },
  });

  return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
}
```

### Automatic Retries

- Stripe automatically retries failed webhooks (return 4xx/5xx)
- Returning 200 indicates success even if some processing failed internally
- Fire-and-forget operations (Slack, analytics) don't fail the webhook

### Idempotency

- `ChurnEvent.stripeEventId` is unique - prevents duplicate processing
- Organization updates use compound where clause (`id + stripeSubscriptionId`) to prevent race conditions

---

## Environment Variables

```bash
# Webhook Secrets
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...
STRIPE_CHIPP_WEBHOOK_SECRET=whsec_...
STRIPE_SANDBOX_WEBHOOK_SECRET=whsec_...

# API Keys
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_CHIPP_KEY=sk_live_... (or sandbox key)
STRIPE_SANDBOX_KEY=sk_test_...

# Mode Detection
USE_STRIPE_SANDBOX=true/false
USE_STRIPE_TEST_MODE=true/false
```

---

## Key Files Reference

### Webhook Routes
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/webhook/route.ts`
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/plans/webhook/route.ts`

### Handler Implementations
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/index.ts` - Account updated handler
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/consumer.ts` - Consumer subscription handlers
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/plan.ts` - Organization subscription handlers
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/billing-alert.ts` - v2 billing alert handler
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/churn-analytics.ts` - Churn tracking
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/v2-subscription.ts` - v2 subscription management

### Constants & Utilities
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts` - Price IDs, tier mapping, v2 detection

### Schema
- `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` - Database models

### Tests
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/__tests__/apiService/stripe/webhook/` - Test files

---

## Migration Recommendations for ChippDeno

### 1. Start Simple
Begin with the plans webhook for organization subscriptions - it's the most critical path.

### 2. API Differences
- ChippMono uses Next.js API routes; ChippDeno uses Hono
- Use `c.req.raw.text()` in Hono to get raw body for signature verification
- Return `c.json({ received: true })` on success

### 3. v1 vs v2 Detection
Must implement `isV2BillingPriceId()` early to route events correctly.

### 4. Database Layer
- ChippMono uses Prisma; ChippDeno uses Kysely
- Consumer composite key lookup needs careful translation
- Organization lookup by `stripeCustomerId` OR `stripeSandboxCustomerId`

### 5. Cache Invalidation
Implement equivalent Redis cache invalidation functions.

### 6. Feature Flags
Use ChippDeno's feature flag system instead of Prisma-based flags.

### 7. Notifications
Slack and email notifications can be implemented as separate services.

### 8. Order of Implementation
1. Signature verification middleware
2. Plans webhook (organization subscriptions)
3. Main webhook (consumer + billing alerts)
4. Churn analytics
5. Slack/email notifications

---

## Testing Considerations

### Local Testing
- Use Stripe CLI: `stripe listen --forward-to localhost:8000/api/stripe/webhook`
- Use sandbox mode for development

### Test Events
- `stripe trigger checkout.session.completed`
- `stripe trigger customer.subscription.updated`
- `stripe trigger invoice.paid`

### Verification
- Check database updates
- Verify cache invalidation
- Confirm Slack notifications
- Monitor Sentry for errors
