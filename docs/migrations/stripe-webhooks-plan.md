# Stripe Webhooks Migration Plan

## Overview

Complete the Stripe webhook implementation in ChippDeno to match ChippMono's functionality.

## Phase 1: Foundation (Consolidation & Cleanup)

### 1.1 Consolidate Webhook Endpoints
- Remove legacy `/webhooks/stripe` endpoint
- Keep only `/api/webhooks/stripe`
- Update any references

### 1.2 Environment Variables
- Add `STRIPE_WEBHOOK_SECRET_LIVE` and `STRIPE_WEBHOOK_SECRET_TEST` to `.env.example`
- Document webhook secret configuration

## Phase 2: Core Handlers

### 2.1 Organization Subscription Handlers (Priority: High)
**Files:** `src/services/billing.service.ts`, `src/api/routes/webhooks/stripe.ts`

- [ ] `handleSubscriptionCreated` - Complete (already works)
- [ ] `handleSubscriptionUpdated` - Add tier change detection, cache invalidation
- [ ] `handleSubscriptionDeleted` - Add churn analytics

### 2.2 Consumer Subscription Handlers (Priority: Critical)
**New file:** `src/services/consumer-billing.service.ts`

- [ ] `handleConsumerSubscriptionCreated` - Create ConsumerPurchase record
- [ ] `handleConsumerSubscriptionUpdated` - Update subscription status
- [ ] `handleConsumerSubscriptionDeleted` - Deactivate consumer access
- [ ] `addCreditsToConsumer` - Handle credit package purchases

### 2.3 Invoice Handlers (Priority: High)
- [ ] `handleInvoicePaid` - Add credits for one-time purchases
- [ ] `handleInvoicePaymentFailed` - Send notification, track failure count

### 2.4 Checkout Session Handlers (Priority: High)
Handle `metadata.type`:
- [ ] `PACKAGE` - Consumer credit purchase
- [ ] `org_payment_setup` - Set default payment method
- [ ] `hq_access` - Workspace access grant

## Phase 3: Billing Alerts (v2)

### 3.1 Auto-Topup Implementation
**File:** `src/services/billing.service.ts`

- [ ] Handle `billing.alert.triggered` event
- [ ] Check topup settings from customer metadata
- [ ] Create payment intent for topup amount
- [ ] Create credit grant via Stripe v2 API
- [ ] Clear `creditsExhausted` flag

### 3.2 Credit Exhaustion Alerts
- [ ] Set `creditsExhausted` flag on $0 balance alert
- [ ] Send low credits notification email

## Phase 4: Notifications

### 4.1 Email Notifications
**New file:** `src/services/email.service.ts`

- [ ] `sendPaymentFailedEmail` - Payment failure notification
- [ ] `sendLowCreditsEmail` - Credit balance warning
- [ ] `sendSubscriptionCanceledEmail` - Cancellation confirmation

### 4.2 Slack Notifications (Optional)
**New file:** `src/services/slack.service.ts`

- [ ] `notifyPlanUpgrade` - #chipp-sales
- [ ] `notifyChurn` - #chipp-churn
- [ ] `notifyCreditTopup` - #chipp-billing

## Phase 5: Analytics & Compliance

### 5.1 Churn Analytics
**New file:** `src/services/churn-analytics.service.ts`

- [ ] `captureChurnEvent` - Record downgrade/cancellation metrics
- [ ] Track tenure, usage, feature adoption

### 5.2 Dispute Handling (Compliance Critical)
- [ ] Handle `charge.dispute.created`
- [ ] Handle `charge.dispute.closed`
- [ ] Alert team immediately on disputes

### 5.3 Refund Handling
- [ ] Handle `charge.refunded`
- [ ] Update transaction records

## Phase 6: Testing & Verification

### 6.1 Unit Tests
- [ ] Test each handler in isolation
- [ ] Mock Stripe events
- [ ] Verify database updates

### 6.2 Integration Tests
- [ ] Use Stripe CLI to trigger real events
- [ ] Verify end-to-end flow
- [ ] Test signature verification

### 6.3 E2E Flow Tests
- [ ] Subscription upgrade flow → webhook → tier update
- [ ] Payment failure → notification
- [ ] Credit exhaustion → auto-topup

## Implementation Order

1. **Phase 2.1** - Organization handlers (builds on existing)
2. **Phase 2.3** - Invoice handlers (revenue critical)
3. **Phase 3** - Billing alerts (auto-topup)
4. **Phase 2.2** - Consumer handlers (requires more setup)
5. **Phase 4** - Notifications
6. **Phase 5** - Analytics & compliance
7. **Phase 6** - Testing

## Success Criteria

- All webhook events handled without 500 errors
- Database updates match expected state
- Notifications sent on failures
- Auto-topup working for v2 billing
- Churn analytics captured
- No duplicate event processing (idempotency)
