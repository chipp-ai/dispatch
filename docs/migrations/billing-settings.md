# Feature Migration Report: Billing Settings Page

## Executive Summary
- **What it does**: Settings page for managing subscription plans, payment methods, credits, auto-topup, and usage analytics with role-based access control
- **Complexity**: High (complex Stripe v2 API integration, multiple sub-pages, feature flags, scheduled cancellations/downgrades)
- **Dependencies**: Stripe billing portal, Stripe v2 API (billing cadences, credit grants), Organization feature flags, MobX stores
- **Recommended approach**: Reimplementation with the same user flows but adapted for Svelte 5 + Hono architecture

## Page Structure & Routing

### Route Hierarchy
```
/settings/billing          -> Redirects to /settings/billing/plan
/settings/billing/plan     -> Current plan + upgrade cards
/settings/billing/credits  -> Credits balance + usage display + manual topup
/settings/billing/payment  -> Payment method management
/settings/billing/auto-topup -> Auto-topup settings
/settings/billing/notifications -> Credit notification thresholds
/settings/billing/usage-analytics -> Detailed usage breakdown by app/model/workspace
```

### File Locations
| Route | File |
|-------|------|
| `/settings/billing` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/page.tsx` |
| `/settings/billing/plan` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/plan/page.tsx` |
| `/settings/billing/credits` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/credits/page.tsx` |
| `/settings/billing/payment` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/payment/page.tsx` |
| `/settings/billing/auto-topup` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/auto-topup/page.tsx` |
| `/settings/billing/notifications` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/notifications/page.tsx` |
| `/settings/billing/usage-analytics` | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/usage-analytics/page.tsx` |

### Layout Structure
```
SettingsLayout (apps/chipp-admin/app/(authenticated)/settings/layout.tsx)
  -> GlobalNavBar
  -> SettingsSidebar (left navigation)
  -> Main content area (children)
```

## Data Model

### Database Tables (Organization)
Key billing-related fields on `Organization` model:

| Column | Type | Description |
|--------|------|-------------|
| `subscriptionTier` | `SubscriptionTier` | FREE, PRO, TEAM, BUSINESS, ENTERPRISE |
| `subscriptionPeriod` | `SubscriptionPeriod?` | MONTHLY, YEARLY |
| `stripeSubscriptionId` | `String?` | Stripe subscription ID (v1: `sub_*`, v2: `bilint_*`) |
| `stripeCustomerId` | `String?` | Live mode Stripe customer |
| `stripeSandboxCustomerId` | `String?` | Sandbox mode Stripe customer |
| `usageBasedBillingEnabled` | `Boolean` | Feature flag for credits/usage billing |
| `useSandboxForUsageBilling` | `Boolean` | Use sandbox for testing |
| `subscriptionCancelledAt` | `DateTime?` | When user requested cancellation |
| `subscriptionEndsAt` | `DateTime?` | When subscription actually ends |
| `pendingDowngradeTier` | `SubscriptionTier?` | Scheduled tier change |
| `downgradeScheduledAt` | `DateTime?` | When downgrade was requested |
| `downgradeEffectiveAt` | `DateTime?` | When downgrade takes effect |
| `creditsExhausted` | `Boolean` | Set when credits reach $0 |
| `creditNotificationsEnabled` | `Boolean` | Email alerts enabled |
| `creditNotificationDefaultPercentage` | `Int` | Alert at X% of allowance |
| `creditNotificationThresholds` | `Json` | Custom threshold amounts in cents |

### Schema File Location
`/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (lines 2667-2741)

## Component Structure

### Plan Page (`/settings/billing/plan`)
**Main Components:**
- `PlanPage` - Observer wrapper with session/org context
- `PlanCard` - Individual pricing tier card
- `UsageBillingModal` - One-time modal explaining usage billing
- `LowCreditsWarningBanner` - Alert when credits are low

**Key Features:**
- Current plan display with benefits list
- Three upgrade cards: Pro ($29), Team ($99), Business ($299)
- "Manage subscription" button opens Stripe billing portal
- Handles v1 vs v2 subscription detection (`bilint_` prefix)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/plan/page.tsx`

### Credits Page (`/settings/billing/credits`)
**Main Component:** `InvoicesSection`

**Key Features:**
- Credit balance hero card with gradient background
- Quick stats: period usage, credits applied, next refresh date
- Manual topup modal with preset amounts ($10, $20, $50, $100)
- Usage line items from Stripe invoice preview
- Estimated usage from local TokenUsage table (when Stripe data lags)
- Link to detailed usage analytics

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/InvoicesSection.tsx`

### Payment Method Page (`/settings/billing/payment`)
**Main Component:** `PaymentMethodSection`

**Key Features:**
- Shows default payment method status (configured/not configured)
- Badge indicator for payment method state
- Opens Stripe billing portal to update payment method
- Inline AddPaymentMethodModal for adding cards without leaving app

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/PaymentMethodSection.tsx`

### Auto-Topup Page (`/settings/billing/auto-topup`)
**Main Component:** `AutoTopupSection`

**Key Features:**
- Toggle to enable/disable auto-topup
- Amount input (default $20)
- Threshold percentage (default 20% of allowance)
- Requires payment method before enabling
- Settings persisted via `/api/organization/billing-topups`

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/AutoTopupSection.tsx`

### Notifications Page (`/settings/billing/notifications`)
**Key Features:**
- Toggle for email notifications enabled
- Slider for default percentage threshold (0-100%)
- Custom dollar amount thresholds
- Preview of all active thresholds

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/notifications/page.tsx`

## API Routes

### Billing-Related Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/organization/billing-portal` | POST | Generate Stripe billing portal session URL |
| `/api/organization/cancel-subscription` | POST | Schedule subscription cancellation (v2) |
| `/api/organization/undo-cancellation` | POST | Undo scheduled cancellation |
| `/api/organization/schedule-downgrade` | POST | Schedule tier downgrade |
| `/api/organization/undo-downgrade` | POST | Cancel scheduled downgrade |
| `/api/organization/invoice-preview` | GET | Get Stripe invoice preview with usage |
| `/api/organization/billing-topups` | GET/POST | Get/save auto-topup settings |
| `/api/organization/billing-topups/topup-now` | POST | Execute manual credit purchase |
| `/api/organization/payment-method-status` | GET | Check if payment method is configured |
| `/api/organization/credit-status` | GET | Get credit balance and status |
| `/api/organization/{id}/notification-settings` | GET/PUT | Manage notification thresholds |
| `/api/organization/create-setup-intent` | POST | Create Stripe SetupIntent for cards |
| `/api/organization/set-default-payment-method` | POST | Set payment method as default |
| `/api/stripe/plans/payment-url` | GET | Generate checkout URL for plan upgrade |

### Key API Route Files
| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/cancel-subscription/route.ts` | v2 cancellation with billing period detection |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/invoice-preview/route.ts` | Complex Stripe v2 API integration |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/billing-portal/route.ts` | Stripe customer portal redirect |

## Subscription Status Display

### Current Plan Card
Shows:
- Organization name
- Current tier with large heading
- Plan benefits (from `PlanBenefits` constant)
- "Manage subscription" button (opens Stripe portal)

### Cancellation Scheduled Banner
```tsx
// Shown when subscriptionCancelledAt is set
<div className="bg-amber-50 border border-amber-200 rounded-lg">
  "Subscription scheduled for cancellation"
  "Will end on {subscriptionEndsAt}"
  [Undo Cancellation] button
</div>
```

### Downgrade Scheduled Banner
```tsx
// Shown when pendingDowngradeTier is set
<div className="bg-blue-50 border border-blue-200 rounded-lg">
  "Plan change scheduled"
  "Will change from {currentTier} to {pendingDowngradeTier} on {downgradeEffectiveAt}"
  [Undo Plan Change] button
</div>
```

## Cancel/Downgrade Flows

### Cancel Subscription Flow (v2)
1. User clicks "Cancel Subscription" button
2. AlertDialog confirmation opens
3. On confirm, POST to `/api/organization/cancel-subscription`
4. Backend fetches billing period end from Stripe
5. Sets `subscriptionCancelledAt` and `subscriptionEndsAt`
6. UI shows amber cancellation banner
7. Job runs at period end to downgrade to FREE

### Downgrade Flow (v2)
1. User clicks lower tier plan card
2. Checks `subscriptionId.startsWith("bilint_")` for v2
3. AlertDialog confirmation with tier names
4. POST to `/api/organization/schedule-downgrade`
5. Sets `pendingDowngradeTier`, `downgradeScheduledAt`, `downgradeEffectiveAt`
6. UI shows blue downgrade banner
7. Job runs at period end to change tier

### v1 Subscription Handling
For legacy subscriptions (not `bilint_*`):
- Redirects to Stripe billing portal
- All changes happen through Stripe directly

## Credit Balance & Usage Display

### Credit Balance Hero
```tsx
<Card>
  <div className="bg-gradient-to-br from-brand-muted">
    <Wallet icon />
    <p>Available credits</p>
    <p className="text-4xl">${availableCredits}</p>
    [View breakdown] button
    [Add credits] button
  </div>
  <div className="grid grid-cols-3">
    <stat>This period's usage: $X.XX</stat>
    <stat>Credits applied: -$X.XX</stat>
    <stat>Allowance refreshes: Jan 15</stat>
  </div>
</Card>
```

### Invoice Preview Response Structure
```typescript
{
  currency: string,
  amount_due: number,
  lines: Array<{
    id: string,
    description: string,
    amount: number,
    quantity: number,
    credits_applied_cents: number,
    parent_type: "rate_card_subscription_details" | "license_fee_subscription_details"
  }>,
  cadence: {
    id: string,
    billing_cycle: {...},
    next_billing_date: string
  },
  allowance: {
    amount_cents: number,
    used_cents: number,
    remaining_cents: number
  },
  metrics: {
    metered_subtotal_cents: number,
    credits_applied_cents: number,
    overage_cents: number
  },
  credit_balance_cents: number,
  estimatedUsage?: {...}
}
```

## Sidebar Navigation

### Billing Section Structure
```typescript
const billing = {
  title: "BILLING",
  items: [
    { name: "Plan", href: "/settings/billing/plan", icon: Crown },
    // Only shown if usageBasedBillingEnabled:
    { name: "Credits", href: "/settings/billing/credits", icon: Wallet },
    { name: "Payment", href: "/settings/billing/payment", icon: CreditCard },
    { name: "Auto top-up", href: "/settings/billing/auto-topup", icon: RefreshCw },
  ],
};
```

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/components/SettingsSidebar.tsx`

### Role-Based Access
- **VIEWER** role: Billing section hidden entirely
- **OWNER** role: Can cancel subscriptions
- **EDITOR** role: Can view billing but cannot cancel

## Feature Flags

### Key Organization Feature Flags
```typescript
ORG_FEATURE_FLAGS.USAGE_BASED_BILLING_ENABLED  // Shows credits, payment, auto-topup pages
ORG_FEATURE_FLAGS.USE_SANDBOX_FOR_USAGE_BILLING // Uses sandbox customer ID
```

### Usage in Components
```typescript
const usageBasedBillingEnabled = getOrgFeatureFlag(
  organization,
  ORG_FEATURE_FLAGS.USAGE_BASED_BILLING_ENABLED,
  false
);

// Pages show "not available" card if flag is false
if (!usageBasedBillingEnabled) {
  return <Card>Credits not available. Upgrade to Pro or higher.</Card>
}
```

## Constants & Plan Configuration

### Plan Benefits
```typescript
// File: /Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx
export const PlanBenefits = {
  FREE: ["1000 Message Trial", "Best Models", "Unlimited Knowledge Sources"],
  PRO: ["Best Models", "Unlimited Knowledge Sources", "API Access", ...],
  TEAM: ["Unlimited AI HQs", "Team Management", "Voice Cloning", ...],
  BUSINESS: ["Zero Data Retention (ZDR)", "HIPAA Compliant", ...],
  ENTERPRISE: ["Zero Data Retention (ZDR)", "HIPAA Compliant", "Private Cloud (VPC)", ...],
};
```

### Plan Pricing (in PlanPage)
```typescript
const plans = [
  { plan: "Pro", cost: "29", costCaption: "/month + usage over $10", ... },
  { plan: "Team", cost: "99", costCaption: "/month + usage over $30", ... },
  { plan: "Business", cost: "299", costCaption: "/month + usage over $100", ... },
];
```

## Loading States (Skeletons)

### Skeleton Components
```typescript
// File: /Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/BillingSkeletons.tsx
export function InvoicesSkeleton() {...}
export function PaymentMethodSkeleton() {...}
export function AutoTopupSkeleton() {...}
export function PlanPageSkeleton() {...}
export function BillingNotAvailableSkeleton({icon}) {...}
```

## UI/UX Patterns

### Design Elements
- Gradient hero cards with `from-brand-muted to-brand-muted/50`
- Icons from `lucide-react` (Wallet, CreditCard, Crown, etc.)
- Font: "Chubbo" for headings, "Mulish" for body
- Brand yellow for CTA buttons: `rgb(249, 210, 0)`
- Muted backgrounds for info boxes: `bg-muted/50`

### Modal Patterns
- `AlertDialog` for destructive actions (cancel, downgrade)
- `Dialog` for informational modals (topup, credit details)
- Success states show checkmark animation briefly before closing

### Responsive Design
- Mobile: Back arrow link visible, stacked layouts
- Desktop: Sidebar visible, grid layouts for stats

## Migration Recommendations

### Files to Reference
1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/plan/page.tsx` - Main plan UI
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/InvoicesSection.tsx` - Credits/usage display
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx` - Plan definitions
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/invoice-preview/route.ts` - Stripe v2 API patterns
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/cancel-subscription/route.ts` - Cancellation flow

### Key Differences for ChippDeno
| ChippMono | ChippDeno |
|-----------|-----------|
| Next.js App Router | Hono API routes |
| React components | Svelte 5 components |
| MobX stores | Svelte stores |
| Prisma ORM | Kysely query builder |
| `useEffect` | `$effect` rune |
| `useState` | `$state` rune |
| `observer()` HOC | Svelte reactivity |

### Implementation Order
1. **Database schema** - Add cancellation/downgrade fields if not present
2. **API routes** - Port billing endpoints to Hono
3. **Stores** - Create organizationStore with billing state
4. **Plan page** - Current plan display + upgrade cards
5. **Credits page** - Balance display + topup modal
6. **Payment page** - Payment method management
7. **Auto-topup page** - Settings form
8. **Notifications page** - Threshold configuration
9. **Sidebar integration** - Add billing section to settings nav

### Stripe Integration Notes
- Uses Stripe v2 API (`2025-08-27.preview` version)
- Billing cadences endpoint: `GET /v2/billing/cadences`
- Credit balance: `GET /v1/billing/credit_balance_summary`
- Invoice preview: `POST /v1/invoices/create_preview`
- Customer portal: Standard v1 API

## Related Features
- **Stripe webhooks** - Update subscription state from Stripe events
- **Scheduled jobs** - Process cancellations/downgrades at period end
- **Credit notifications** - Email alerts when credits run low
- **Upsell modals** - Context-aware upgrade prompts throughout app
