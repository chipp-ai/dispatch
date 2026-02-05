# Stripe Webhook Handling in ChippDeno - Current State Analysis

## Executive Summary

ChippDeno has a **fully-implemented Stripe webhook system** with proper signature verification, event routing, and business logic handlers. The implementation supports both v1 (traditional subscriptions) and v2 (usage-based billing) Stripe APIs, with handlers for the most critical billing events. There are some gaps in implementation (noted as TODOs) but the foundation is solid.

**Key Findings:**
- Two webhook routing systems exist (legacy `/webhooks/stripe` and current `/api/webhooks/stripe`)
- Signature verification is properly implemented with HMAC-SHA256 and timing-safe comparison
- Support for both live and test mode webhooks via query parameter
- 7 event types are handled with business logic
- Several handlers have TODO placeholders for notifications and additional logic

---

## 1. Webhook Endpoint Architecture

### Primary Endpoint: `/api/webhooks/stripe`

**Location:** `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/stripe.ts`

This is the **active, production-ready** webhook handler mounted at `/api/webhooks/stripe`.

**Mounting chain:**
```
app.ts
  -> src/api/routes/webhooks/index.ts (webhookRoutes)
       -> src/api/routes/webhooks/stripe.ts (stripeWebhookRoutes)
```

Note: The test files reference `/api/webhooks/stripe` but `app.ts` currently mounts webhooks at `/webhooks` (not `/api/webhooks`). There may be a discrepancy or the API webhooks are mounted elsewhere.

### Legacy Endpoint: `/webhooks/stripe`

**Location:** `/Users/hunterhodnett/code/chipp-deno/routes/webhooks.ts`

This is a **simpler, legacy implementation** mounted at `/webhooks/stripe` via `app.ts`:
```typescript
app.route("/webhooks", webhooks);  // Line 151 in app.ts
```

The legacy handler has:
- Basic signature verification
- Fewer event handlers (only 4 events)
- Simpler error handling
- No business logic integration with billing service

---

## 2. Event Types Currently Handled

### Primary Handler (`src/api/routes/webhooks/stripe.ts`)

| Event Type | Handler | Status | Database Updates |
|------------|---------|--------|------------------|
| `customer.subscription.created` | `billingService.handleSubscriptionCreated()` | Implemented | Updates `app.organizations.stripe_subscription_id`, `subscription_tier` |
| `customer.subscription.updated` | `billingService.handleSubscriptionUpdated()` | Partial | Logs status transitions; TODOs for notifications |
| `customer.subscription.deleted` | `billingService.handleSubscriptionDeleted()` | Implemented | Sets tier to FREE, clears `stripe_subscription_id` |
| `invoice.paid` | `billingService.handleInvoicePaid()` | Partial | Logs only; TODO for credit purchase handling |
| `invoice.payment_failed` | `billingService.handleInvoicePaymentFailed()` | Partial | Logs only; TODO for notifications |
| `checkout.session.completed` | `billingService.handleCheckoutCompleted()` | Partial | Logs by type; TODOs for full handling |
| `billing.alert.triggered` | Console log only | Stub | TODO: Implement notifications |
| `account.updated` | Console log only | Stub | TODO: Handle Connect account updates |

### Legacy Handler (`routes/webhooks.ts`)

| Event Type | Handler | Status |
|------------|---------|--------|
| `checkout.session.completed` | Console log | Stub |
| `customer.subscription.updated` | Console log | Stub |
| `customer.subscription.deleted` | Console log | Stub |
| `invoice.payment_failed` | Console log | Stub |

---

## 3. Handler Logic Details

### 3.1 Subscription Created

**File:** `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` (lines 384-477)

```typescript
async handleSubscriptionCreated(params: SubscriptionCreatedParams): Promise<void> {
  // Distinguishes between consumer and organization subscriptions via metadata
  const isConsumer = !!(
    metadata.consumerIdentifier &&
    metadata.developerId &&
    metadata.applicationId &&
    metadata.packageId
  );

  if (isConsumer) {
    await this.handleConsumerSubscriptionCreated(params);
  } else {
    await this.handleOrganizationSubscriptionCreated(params);
  }
}
```

**Organization subscription flow:**
1. Finds organization by `stripe_customer_id`
2. Updates `stripe_subscription_id` and `subscription_tier` in `app.organizations`
3. Tier is extracted from `metadata.subscriptionTier` (defaults to "PRO")

**Consumer subscription flow:**
- Currently a TODO placeholder
- Expected to create/update `ConsumerPurchase` record

### 3.2 Subscription Updated

**File:** `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` (lines 484-523)

Handles status transitions:
- `active` (from non-active): Logs activation
- `past_due`: Logs, TODO for payment failed notification
- `canceled` or `unpaid`: Logs subscription end, TODO for access deactivation
- `cancelAtPeriodEnd`: Logs pending cancellation, TODO for org update

**Gaps:** Does not update database or send notifications.

### 3.3 Subscription Deleted

**File:** `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` (lines 530-575)

For organization subscriptions:
```sql
UPDATE app.organizations
SET
  subscription_tier = 'FREE',
  stripe_subscription_id = NULL,
  updated_at = NOW()
WHERE id = ${orgs[0].id}
```

For consumer subscriptions: TODO placeholder.

### 3.4 Invoice Paid

**File:** `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` (lines 583-607)

- For subscription invoices: Logs only (access managed by subscription events)
- For one-time payments: TODO for credit purchase handling

### 3.5 Invoice Payment Failed

**File:** `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` (lines 615-628)

- Logs the failure
- TODOs: Send payment failed notification, consider access suspension for repeated failures

### 3.6 Checkout Completed

**File:** `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` (lines 636-678)

Handles different `metadata.type` values:
- `package`: Credit package purchase (logs only)
- `org_payment_setup`: Organization added payment method (logs only)
- `hq_access`: HQ/Workspace access purchase (logs only)

---

## 4. Signature Verification

### Implementation Location

**File:** `/Users/hunterhodnett/code/chipp-deno/src/api/middleware/webhookAuth.ts` (lines 31-175)

### Algorithm

Stripe signature verification using HMAC-SHA256:

```typescript
async function computeStripeSignature(
  payload: string,
  timestamp: string,
  secret: string
): Promise<string> {
  const signedPayload = `${timestamp}.${payload}`;
  // Uses Web Crypto API (crypto.subtle)
  // Returns hex-encoded signature
}
```

### Security Features

1. **Signature parsing:** Handles multiple `v1=` signatures in header
2. **Timestamp tolerance:** 5-minute window to prevent replay attacks
3. **Timing-safe comparison:** Uses `timingSafeEqual` from `node:crypto`
4. **Mode switching:** Supports `?testMode=true` query parameter for test webhooks

### Middleware Flow

```typescript
export const stripeWebhookMiddleware = createMiddleware<WebhookContext>(
  async (c, next) => {
    // 1. Check for stripe-signature header
    // 2. Read raw body for signature verification
    // 3. Determine test vs live mode
    // 4. Parse signature header (t=timestamp,v1=signature)
    // 5. Check timestamp tolerance (5 minutes)
    // 6. Compute expected signature
    // 7. Compare signatures (timing-safe)
    // 8. Reject if invalid
    await next();
  }
);
```

---

## 5. Error Handling

### Webhook Handler Error Strategy

**File:** `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/stripe.ts` (lines 243-253)

```typescript
} catch (error) {
  console.error(`[${requestId}] Error processing Stripe webhook:`, error);

  // Return 200 to acknowledge receipt even on error
  // This prevents Stripe from retrying and potentially causing duplicate processing
  // Errors should be logged and monitored via Sentry/logs
  return c.json({
    received: true,
    error: error instanceof Error ? error.message : "Unknown error",
  });
}
```

**Design Decision:** Returns 200 even on error to prevent Stripe retries that could cause duplicate processing. This requires robust monitoring/logging to catch failures.

### Signature Verification Errors

| Error Condition | HTTP Status | Message |
|-----------------|-------------|---------|
| Missing signature header | 401 | "Missing stripe-signature header" |
| Secret not configured | 500 | "Webhook secret not configured" |
| Invalid header format | 401 | "Invalid stripe-signature header format" |
| Timestamp outside tolerance | 401 | "Webhook timestamp outside tolerance window" |
| Invalid signature | 401 | "Invalid webhook signature" |

---

## 6. Database Updates

### Tables Modified by Webhooks

| Table | Column | Updated By Event |
|-------|--------|------------------|
| `app.organizations` | `stripe_subscription_id` | subscription.created, subscription.deleted |
| `app.organizations` | `subscription_tier` | subscription.created, subscription.deleted |
| `app.organizations` | `updated_at` | subscription.created, subscription.deleted |

### Organization Lookup Strategy

Webhooks look up organizations by Stripe customer ID:
```sql
SELECT id, name FROM app.organizations
WHERE stripe_customer_id = ${customerId}
LIMIT 1
```

**Note:** There's also `stripe_sandbox_customer_id` for sandbox mode, but webhook handlers currently only use `stripe_customer_id`.

---

## 7. Environment Variables

### Webhook Secrets

**File:** `/Users/hunterhodnett/code/chipp-deno/src/api/middleware/webhookAuth.ts`

```typescript
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE");
const STRIPE_WEBHOOK_SECRET_TEST = Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST");
```

**File:** `/Users/hunterhodnett/code/chipp-deno/.env.example`

```
STRIPE_WEBHOOK_SECRET=     # Used by legacy handler
```

### Related Stripe Variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Primary Stripe secret key |
| `STRIPE_SECRET_KEY_TEST` | Test mode secret key |
| `STRIPE_SANDBOX_KEY` | Sandbox environment key (v2 billing) |
| `STRIPE_CHIPP_KEY` | Production Stripe key |
| `STRIPE_WEBHOOK_SECRET` | Legacy webhook secret |
| `STRIPE_WEBHOOK_SECRET_LIVE` | Live mode webhook secret |
| `STRIPE_WEBHOOK_SECRET_TEST` | Test mode webhook secret |

**Discrepancy:** `.env.example` only documents `STRIPE_WEBHOOK_SECRET`, but the code uses `STRIPE_WEBHOOK_SECRET_LIVE` and `STRIPE_WEBHOOK_SECRET_TEST`.

---

## 8. Missing Handlers (Gaps)

### Not Implemented

| Event Type | Importance | Description |
|------------|------------|-------------|
| `payment_intent.succeeded` | Medium | One-time payment success |
| `payment_intent.payment_failed` | Medium | One-time payment failure |
| `customer.created` | Low | New customer created |
| `customer.updated` | Low | Customer details updated |
| `customer.deleted` | Low | Customer deleted |
| `charge.succeeded` | Medium | Successful charge (redundant with invoice.paid) |
| `charge.failed` | Medium | Failed charge |
| `charge.refunded` | High | Refund processed |
| `charge.dispute.created` | High | Dispute opened |
| `payment_method.attached` | Low | Payment method added |
| `payment_method.detached` | Low | Payment method removed |
| `setup_intent.succeeded` | Low | Setup for future payments |
| `billing.portal.session.created` | Low | Customer portal accessed |

### Partially Implemented (TODOs)

1. **`billing.alert.triggered`** - Only logs, no notification system
2. **`account.updated`** - Only logs, no Connect account handling
3. **Consumer subscriptions** - All consumer handlers are TODO placeholders
4. **Credit purchases** - Invoice paid for one-time doesn't add credits
5. **Payment failure notifications** - Not implemented
6. **Access deactivation** - Not implemented for canceled/unpaid status

---

## 9. Test Coverage

### Test File Location

**File:** `/Users/hunterhodnett/code/chipp-deno/src/__tests__/routes/webhooks_test.ts`

### Test Scenarios Covered

1. **Stripe Events:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

2. **Signature Verification:**
   - Missing signature rejection
   - Invalid signature rejection
   - Valid signature acceptance
   - Replay attack prevention (timestamp check)

3. **Security:**
   - Unsigned webhook rejection
   - Unknown event type handling
   - Error message sanitization
   - Tampered payload rejection
   - Empty body handling
   - Rate limiting

### Test Fixtures

**File:** `/Users/hunterhodnett/code/chipp-deno/src/__tests__/fixtures/webhooks.ts`

Provides factory functions:
- `createStripePaymentSucceededEvent()`
- `createStripePaymentFailedEvent()`
- `createStripeSubscriptionCreatedEvent()`
- `createStripeSubscriptionUpdatedEvent()`
- `createStripeSubscriptionDeletedEvent()`
- `createStripeInvoicePaidEvent()`
- `createStripeInvoicePaymentFailedEvent()`
- `createStripeMeterEventReportedEvent()` (v2 billing)
- `createStripeSignature()` - async signature generation

---

## 10. TODO Comments Found

### In Webhook Handler

```typescript
// TODO: Implement billing alert handling
// This would typically send notifications to customers

// TODO: Handle Connect account updates
// Check if account is ready to receive payments
```

### In Billing Service

```typescript
// TODO: Create or update ConsumerPurchase record
// This would activate the consumer's access to the application

// TODO: Send payment failed notification

// TODO: Deactivate access (for canceled subscriptions)

// TODO: Update organization to reflect pending cancellation

// TODO: Update ConsumerPurchase to mark as inactive

// TODO: Add credits if this is a credit purchase

// TODO: For repeated failures, consider suspending access
```

---

## 11. Architecture Diagram

```
Stripe Server
     |
     | POST /api/webhooks/stripe
     | Headers: stripe-signature
     v
+--------------------+
| stripeWebhookMiddleware |
| (webhookAuth.ts)   |
|                    |
| 1. Verify signature|
| 2. Check timestamp |
| 3. Store raw body  |
+--------------------+
     |
     v
+--------------------+
| stripeWebhookRoutes|
| (stripe.ts)        |
|                    |
| switch(event.type) |
|   -> subscription  |
|   -> invoice       |
|   -> checkout      |
|   -> billing alert |
|   -> account       |
+--------------------+
     |
     v
+--------------------+
| billingService     |
| (billing.service.ts)|
|                    |
| - handleSubscriptionCreated |
| - handleSubscriptionUpdated |
| - handleSubscriptionDeleted |
| - handleInvoicePaid        |
| - handleInvoicePaymentFailed|
| - handleCheckoutCompleted   |
+--------------------+
     |
     v
+--------------------+
| Database           |
| app.organizations  |
| - stripe_subscription_id |
| - subscription_tier      |
+--------------------+
```

---

## 12. Recommendations

### High Priority

1. **Document environment variables** - Update `.env.example` with `STRIPE_WEBHOOK_SECRET_LIVE` and `STRIPE_WEBHOOK_SECRET_TEST`

2. **Implement payment failure notifications** - Critical for user experience and revenue recovery

3. **Add dispute handling** - `charge.dispute.created` is critical for compliance

4. **Implement refund handling** - `charge.refunded` for accurate billing state

### Medium Priority

5. **Complete consumer subscription handling** - Currently all TODO placeholders

6. **Implement credit purchase flow** - One-time payments don't add credits

7. **Add Sentry error tracking** - Webhook errors return 200 and only log to console

8. **Consolidate webhook endpoints** - Two implementations (`/webhooks` and `/api/webhooks`) is confusing

### Low Priority

9. **Add webhook event logging to database** - For audit trail and debugging

10. **Implement idempotency** - Store processed event IDs to prevent duplicate handling

---

## 13. File Reference Summary

| Purpose | File Path |
|---------|-----------|
| Primary webhook handler | `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/stripe.ts` |
| Webhook routes index | `/Users/hunterhodnett/code/chipp-deno/src/api/routes/webhooks/index.ts` |
| Signature verification | `/Users/hunterhodnett/code/chipp-deno/src/api/middleware/webhookAuth.ts` |
| Business logic handlers | `/Users/hunterhodnett/code/chipp-deno/src/services/billing.service.ts` |
| Legacy webhook handler | `/Users/hunterhodnett/code/chipp-deno/routes/webhooks.ts` |
| App mounting | `/Users/hunterhodnett/code/chipp-deno/app.ts` |
| Stripe client config | `/Users/hunterhodnett/code/chipp-deno/src/services/stripe.client.ts` |
| Stripe constants | `/Users/hunterhodnett/code/chipp-deno/src/services/stripe.constants.ts` |
| Test file | `/Users/hunterhodnett/code/chipp-deno/src/__tests__/routes/webhooks_test.ts` |
| Test fixtures | `/Users/hunterhodnett/code/chipp-deno/src/__tests__/fixtures/webhooks.ts` |
| Environment example | `/Users/hunterhodnett/code/chipp-deno/.env.example` |
| Database schema | `/Users/hunterhodnett/code/chipp-deno/src/db/schema.ts` |

---

*Report generated: 2026-02-04*
