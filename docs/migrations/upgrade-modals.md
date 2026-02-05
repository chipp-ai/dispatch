# Feature Migration Report: Upgrade/Downgrade Modals and Subscription Flows

## Executive Summary

- **What it does**: Handles subscription tier changes (FREE to PRO to TEAM to BUSINESS) with Stripe checkout, downgrade scheduling, and cancellation management
- **Complexity**: High - involves Stripe v1 and v2 APIs, multiple dialogs, scheduled jobs, webhooks
- **Dependencies**: Stripe billing APIs, Organization model, alert dialogs, MobX stores
- **Recommended approach**: Reimplement with improvements - ChippDeno uses Svelte so UI needs full rebuild; business logic can be adapted from ChippMono

## Data Model

### Database Tables

- `Organization` - Primary subscription state holder
  - Key columns for subscription management:
    - `subscriptionTier` (SubscriptionTier enum: FREE, PRO, TEAM, BUSINESS, ENTERPRISE)
    - `subscriptionPeriod` (SubscriptionPeriod enum: MONTHLY, YEARLY)
    - `stripeSubscriptionId` - v1 `sub_*` or v2 `bilint_*` ID
    - `stripeCustomerId` - Live Stripe customer ID
    - `stripeSandboxCustomerId` - Sandbox customer ID for testing
    - `usageBasedBillingEnabled` (Boolean) - v2 billing flag
    - `useSandboxForUsageBilling` (Boolean) - Sandbox mode flag

  - Cancellation tracking:
    - `subscriptionCancelledAt` (DateTime?) - When user clicked cancel
    - `subscriptionEndsAt` (DateTime?) - When billing period ends

  - Downgrade scheduling:
    - `pendingDowngradeTier` (SubscriptionTier?) - Target tier after downgrade
    - `downgradeScheduledAt` (DateTime?) - When user initiated downgrade
    - `downgradeEffectiveAt` (DateTime?) - When billing period ends

### Schema File Locations

- `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/prisma/schema.prisma:2667-2741` - Organization model

## Implementation Details

### API Routes

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/stripe/plans/payment-url` | GET | Generate Stripe checkout URL for upgrade | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/plans/payment-url/route.ts` |
| `/api/organization/billing-portal` | POST | Create Stripe billing portal session | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/billing-portal/route.ts` |
| `/api/organization/schedule-downgrade` | POST | Schedule tier downgrade at period end | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/schedule-downgrade/route.ts` |
| `/api/organization/cancel-subscription` | POST | Schedule cancellation at period end | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/cancel-subscription/route.ts` |
| `/api/organization/undo-cancellation` | POST | Remove scheduled cancellation | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/undo-cancellation/route.ts` |
| `/api/organization/undo-downgrade` | POST | Remove scheduled downgrade | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/undo-downgrade/route.ts` |

### React Components

| Component | Purpose | File |
|-----------|---------|------|
| `BillingPage` | Main billing settings page with plan cards and dialogs | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/BillingPage.tsx` |
| `PlanCard` | Individual plan card with pricing and CTA | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/PlanCard.tsx` |
| `Plans` | Public plans page for unauthenticated users | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx` |
| `UpgradePlanDialog` | Simple dialog that redirects to billing page | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/team/components/dialogs/UpgradePlanDialog.tsx` |
| `UpgradeCTA` | Banner CTA shown when team member limit reached | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/team/UpgradeCTA.tsx` |
| `UsageBillingModal` | Informational modal about token-based billing | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/UsageBillingModal.tsx` |
| `CreditExhaustedModal` | Upsell modal when credits run out (3 variants) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/CreditExhaustedModal.tsx` |

### Business Logic

#### Tier Hierarchy (highest to lowest)
```typescript
const TIER_RANK = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  BUSINESS: 3,
  ENTERPRISE: 4,
};
```

#### Upgrade Flow
1. User clicks upgrade button on plan card
2. `handlePlanClick(tier)` called
3. Check if downgrade (lower tier) - show confirmation or schedule
4. If upgrade: Call `/api/stripe/plans/payment-url` with tier, period, returnToUrl
5. API creates Stripe checkout session (v1 or v2 based on flags)
6. User redirected to Stripe hosted checkout
7. On success: Webhook updates organization tier

#### Downgrade Flow (v2 subscriptions)
1. User clicks lower tier plan card
2. `handlePlanClick` detects downgrade via tier comparison
3. For v2 subscriptions: Show `AlertDialog` with downgrade confirmation
4. On confirm: Call `/api/organization/schedule-downgrade`
5. API sets `pendingDowngradeTier`, `downgradeEffectiveAt` from Stripe billing period
6. UI shows "Plan change scheduled" banner with undo button

#### Downgrade Flow (v1 subscriptions)
1. Redirect to Stripe billing portal
2. User manages subscription directly in Stripe

#### Cancellation Flow
1. User clicks "Cancel Subscription" button
2. Show `AlertDialog` with cancellation confirmation
3. For v2: Call `/api/organization/cancel-subscription`
4. API sets `subscriptionCancelledAt`, `subscriptionEndsAt`
5. UI shows "Subscription scheduled for cancellation" banner

## UI/UX Patterns

### Plan Card Layout
```
+---------------------------+
| Plan Name (e.g., "Team")  |
| Tagline description       |
|                           |
| $99/month                 |
| + usage over $30          |
|                           |
| [Get Started] button      |
|                           |
| Includes $30 usage, Plus: |
| * Feature 1               |
| * Feature 2               |
| * Feature 3               |
+---------------------------+
```

### Downgrade Dialog
```
+--------------------------------+
| Downgrade Plan                 |
|--------------------------------|
| Are you sure you want to       |
| downgrade from TEAM to PRO?    |
|                                |
| Your Team plan will remain     |
| active until the end of your   |
| billing period.                |
|                                |
| [Keep Current Plan] [Schedule] |
+--------------------------------+
```

### Cancellation Banner (after scheduling)
```
+--------------------------------------------+
| ! Subscription scheduled for cancellation  |
|                                            |
| Your subscription will end on Dec 15, 2024 |
| You'll retain full access until then.      |
|                                            |
| [Undo Cancellation]                        |
+--------------------------------------------+
```

### User Flows

#### Authenticated Upgrade
1. User on `/settings/billing` page
2. Clicks "Get Started" on higher tier card
3. Redirected to Stripe checkout
4. Completes payment
5. Redirected back to `/auth/stripelogin`
6. Webhook updates organization
7. User sees updated plan

#### Unauthenticated Upgrade
1. User on `/plans` page (public)
2. Clicks "Get Started" on any tier
3. Redirected to `/auth/login?next=/plans?autoCheckout=TIER`
4. After login, auto-triggers checkout flow

## Configuration & Constants

### Pricing Constants
Location: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts`

```typescript
// Legacy v1 prices (traditional subscriptions)
export const PRO_MONTHLY_PRICE = { TEST: "price_...", LIVE: "price_..." };
export const TEAM_MONTHLY_PRICE = { TEST: "price_...", LIVE: "price_..." };
export const BUSINESS_MONTHLY_PRICE = { TEST: "price_...", LIVE: "price_..." };

// v2 Usage-based pricing plans
export const USAGE_BASED_PRO_MONTHLY_PRICE = { TEST: "bpp_test_...", LIVE: "bpp_..." };
export const USAGE_BASED_TEAM_MONTHLY_PRICE = { TEST: "bpp_test_...", LIVE: "bpp_..." };
export const USAGE_BASED_BUSINESS_MONTHLY_PRICE = { TEST: "bpp_test_...", LIVE: "bpp_..." };

// Legacy shadow plans (for v1 to v2 migration)
export const LEGACY_SHADOW_PRO_MONTHLY_PRICE = "bpp_...";
```

### Plan Benefits Constants
Location: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx`

```typescript
export const PlanBenefits = {
  FREE: ["1000 Message Trial", "Best Models", "Unlimited Knowledge Sources"],
  PRO: ["Best Models", "Unlimited Knowledge Sources", "API Access", ...],
  TEAM: ["Unlimited AI HQs", "Team Management", "Voice Cloning", ...],
  BUSINESS: ["Zero Data Retention (ZDR)", "HIPAA Compliant", ...],
  ENTERPRISE: [...],
};
```

### Upsell Source Tracking
Location: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/upsellSources.ts`

```typescript
export const UpsellSource = {
  BILLING_PAGE_PRO: "billing_page:pro_card",
  BILLING_PAGE_TEAM: "billing_page:team_card",
  CREDIT_EXHAUSTED_FREE_UPGRADE: "credit_exhausted_modal:free_upgrade",
  TEAM_MEMBER_LIMIT: "team_settings:member_limit",
  // ... more sources
};

export const UPSELL_SOURCE_QUERY_PARAM = "upsellSource";
```

### Environment Variables

```bash
# Stripe API Keys
STRIPE_CHIPP_KEY=sk_live_...         # Live secret key
STRIPE_SANDBOX_KEY=sk_test_...       # Sandbox secret key
STRIPE_PUBLISHABLE_KEY=pk_live_...   # Live publishable key

# Feature Flags
USE_STRIPE_SANDBOX=true              # Use sandbox mode globally
ENABLE_USAGE_BASED_BILLING_BY_DEFAULT=true  # New users get v2 billing

# Pricing Plan IDs (v2)
STRIPE_PRICING_PLAN_PRO_MONTHLY=bpp_...
STRIPE_PRICING_PLAN_TEAM_MONTHLY=bpp_...
```

## Stripe/Billing Integration

### V1 vs V2 Detection
```typescript
// V2 subscriptions have billing intent IDs
const isV2Subscription = subscriptionId.startsWith("bilint_");

// V2 pricing plans have bpp_ prefix
const isV2Price = priceId.startsWith("bpp_");
```

### Checkout Session Creation (v2)
```typescript
checkoutSessionOptions = {
  success_url: `${returnUrl}?purchased=true&ucid={CHECKOUT_SESSION_ID}`,
  cancel_url: cancelUrl,
  metadata: { subscriptionTier, organizationId, billingType: "usage-based" },
  checkout_items: [{
    type: "pricing_plan_subscription_item",
    pricing_plan_subscription_item: {
      pricing_plan: pricingPlanId,
      component_configurations: { [licenseFeeComponentId]: { quantity: 1 } }
    }
  }]
};
```

### Getting Billing Period End
```typescript
// Used for scheduling cancellations/downgrades
const periodEndResult = await getBillingPeriodEnd(customerId, useSandbox);
// Returns { success: boolean, endDate: Date }
```

### Webhooks
- `checkout.session.completed` - Updates org tier after purchase
- `customer.subscription.updated` - Handles subscription changes
- `customer.subscription.deleted` - Handles cancellation

## Migration Recommendations

### Files to Reference
1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/BillingPage.tsx` - Main billing page with all dialog logic
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/plans/payment-url/route.ts` - Checkout URL generation (v1 and v2)
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/schedule-downgrade/route.ts` - Downgrade scheduling logic
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts` - All Stripe price IDs and helpers
5. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/upsellSources.ts` - Upsell tracking

### Key Differences to Consider
- **ChippDeno uses Hono** (not Next.js API routes) - Route handlers need adaptation
- **ChippDeno uses Svelte 5** (not React) - All UI components need rebuilding
- **ChippDeno uses Kysely** (not Prisma) - Database queries need translation
- **State management**: ChippMono uses MobX, ChippDeno uses Svelte stores

### Implementation Order
1. **Database schema** - Add subscription-related fields to Organization table
2. **Stripe constants** - Port price IDs and helper functions
3. **API routes** - Implement payment-url, schedule-downgrade, cancel-subscription endpoints
4. **Svelte stores** - Add subscription state to organization store
5. **Plan cards** - Build reusable PlanCard component
6. **Billing page** - Main page with plan grid and dialogs
7. **Alert dialogs** - Downgrade and cancellation confirmation modals
8. **Status banners** - Cancellation/downgrade scheduled notifications
9. **Upsell tracking** - Port upsellSource tracking logic
10. **CreditExhaustedModal** - Build upsell modal with 3 variants

### Svelte Component Structure (Suggested)

```
web/src/
  routes/
    settings/
      billing/
        +page.svelte           # Main billing page
  lib/
    components/
      billing/
        PlanCard.svelte        # Individual plan card
        DowngradeDialog.svelte # Confirmation dialog
        CancelDialog.svelte    # Cancellation confirmation
        StatusBanner.svelte    # Scheduled change notification
    modals/
      CreditExhaustedModal.svelte
      UsageBillingModal.svelte
  stores/
    subscription.ts            # Subscription state management
```

### API Route Structure (Suggested)

```
src/api/routes/
  organization/
    billing-portal.ts
    schedule-downgrade.ts
    cancel-subscription.ts
    undo-cancellation.ts
    undo-downgrade.ts
  stripe/
    plans/
      payment-url.ts
    webhook.ts
```

## Related Features
- **Payment Method Management** - `/api/organization/setup-payment`, `/api/organization/set-default-payment-method`
- **Auto Top-up** - `AutoTopupSection.tsx`, `/api/organization/billing-topups`
- **Invoice History** - `InvoicesSection.tsx`, Stripe billing portal
- **Credit Status** - `/api/organization/credit-status`
- **Usage Analytics** - `/settings/billing/usage-analytics`

## Key Code Snippets

### Tier Comparison Logic
```typescript
const tierOrder = { FREE: 0, PRO: 1, TEAM: 2, BUSINESS: 3, ENTERPRISE: 4 };
const currentTierLevel = tierOrder[currentTier] || 0;
const newTierLevel = tierOrder[targetTier] || 0;
const isDowngrade = newTierLevel < currentTierLevel;
```

### CSRF Protection (API routes)
```typescript
const origin = request.headers.get("origin");
const referer = request.headers.get("referer");
const requestSource = origin || (referer ? new URL(referer).origin : null);
if (!requestSource || requestSource !== expectedOrigin) {
  return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
}
```

### Owner Authorization Check
```typescript
const membership = await prisma.organizationMember.findFirst({
  where: {
    developerId: developer.id,
    organizationId: organization.id,
    role: DeveloperRole.OWNER,
  },
});
if (!membership) {
  return NextResponse.json({ error: "Only owners can perform this action" }, { status: 403 });
}
```
