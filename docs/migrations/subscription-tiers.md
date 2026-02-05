# Feature Migration Report: Subscription Tiers

## Executive Summary
- **What it does**: Defines 5 subscription tiers (FREE, PRO, TEAM, BUSINESS, ENTERPRISE) with associated pricing, usage allowances, and feature benefits. Stripe v2 billing handles credit allowances and overage charges.
- **Complexity**: Medium - the tier enum is simple, but pricing/billing integration with Stripe v2 is more involved
- **Dependencies**: Stripe v2 billing API, Organization model, feature flags system
- **Recommended approach**: Direct port of tier enum and constants; use ChippDeno's existing Stripe setup

## Important Migration Notes

### Usage-Based Billing is Always Enabled (No Flags)
In ChippDeno, **usage-based billing is the default for everyone**. There are no per-organization flags to enable/disable it:
- **Remove**: `usageBasedBillingEnabled`, `use_sandbox_for_usage_billing` columns/flags
- **Remove**: `USE_STRIPE_SANDBOX_BY_DEFAULT` environment variable checks
- **Simplify**: Mode is determined by environment only:
  - Production (`ENVIRONMENT=production`): Use LIVE Stripe keys and `bpp_*` pricing plans
  - Development/Staging: Use TEST Stripe keys and `bpp_test_*` pricing plans

When migrating code from ChippMono that checks these flags, replace with simple environment checks.

## Data Model

### Database Tables
- `Organization` - Primary owner of subscription tier
  - Key columns: `subscriptionTier` (enum), `subscriptionPeriod` (enum), `stripeSubscriptionId`, `stripeCustomerId`
  - Also tracks: `pendingDowngradeTier`, `downgradeScheduledAt`, `downgradeEffectiveAt` for scheduled tier changes
  - **Removed in ChippDeno**: `usageBasedBillingEnabled`, `use_sandbox_for_usage_billing` (usage billing is always on)

### Enums (Prisma)
```prisma
enum SubscriptionTier {
  FREE
  PRO
  TEAM
  BUSINESS
  ENTERPRISE
}

enum SubscriptionPeriod {
  MONTHLY
  YEARLY
}
```

### Schema File Locations
- `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:45-56` - Tier and period enums
- `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:2683-2710` - Organization subscription fields

## Tier Definitions and Limits

### Pricing (from Plans.tsx and stripe-development.md)

| Tier | Monthly | Yearly | Usage Included | Markup |
|------|---------|--------|----------------|--------|
| FREE | $0 | - | 1000 message trial, 100k tokens | - |
| PRO | $29 | $219 | $10/month | 30% |
| TEAM | $99 | $890 | $30/month | 20% |
| BUSINESS | $299 | $2999 | $100/month | 15% |
| ENTERPRISE | Custom | Custom | Custom | Custom |

### Feature Benefits (from constants.tsx)

| Tier | Key Features |
|------|--------------|
| FREE | 1000 message trial, best models, unlimited knowledge sources |
| PRO | +API access, voice agents, deploy to WhatsApp/Slack, sell individual agents |
| TEAM | +Unlimited AI HQs, team management, voice cloning, sell agent bundles |
| BUSINESS | +ZDR, HIPAA compliant, white glove onboarding, private Slack support |
| ENTERPRISE | +Private cloud (VPC), data sovereignty, custom subdomain, white-label platform |

### Legacy Token Limits (usagelimits.ts)
```typescript
TOKEN_LIMITS: {
  FREE: 100_000,    // 100k tokens
  PRO: -1,          // Unlimited (usage-based)
  TEAM: -1,         // Unlimited (usage-based)
  BUSINESS: -1,     // Unlimited (usage-based)
  ENTERPRISE: -1,   // Unlimited (usage-based)
}
MAX_TOTAL_SPEND_FREE_TIER_USD_CENTS: 2000  // $20 lifetime free cap
```

## Implementation Details

### Key Files

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts` | Stripe price IDs, tier mapping, v2 billing plan IDs |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx` | Public pricing page with tier cards |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx` | Feature benefits per tier |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/usagelimits.ts` | Token limits by tier |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/subscriptionValidator.ts` | Runtime validation of tier access |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/subscriptionTiers/getComputedSubscriptionTier.ts` | Computes effective tier (handles FREE users in shared workspaces) |

### Stripe Price IDs (constants.ts:11-103)

**v1 Legacy Prices (traditional billing)**:
```typescript
PRO_MONTHLY_PRICE[Mode.LIVE] = "price_1OYuakDDECPSIOsvkN4IaAXC"
TEAM_MONTHLY_PRICE[Mode.LIVE] = "price_1QJpnsDDECPSIOsvSt5WlYHY"
BUSINESS_MONTHLY_PRICE[Mode.LIVE] = "price_1SDYRCDDECPSIOsv5wKLFsMV"
```

**v2 Usage-Based Pricing Plans**:
```typescript
USAGE_BASED_PRO_MONTHLY_PRICE[Mode.LIVE] = "bpp_61TqjPr9aBFLlL1sS16PAYkwRuSQV6uTJRipwOFHUF96"
USAGE_BASED_TEAM_MONTHLY_PRICE[Mode.LIVE] = "bpp_61TqjNcQzOlILWykg16PAYkwRuSQV6uTJRipwOFHUI5g"
USAGE_BASED_BUSINESS_MONTHLY_PRICE[Mode.LIVE] = "bpp_61TqjQUV9CZIlomEz16PAYkwRuSQV6uTJRipwOFHULUu"
```

### Helper Functions

**`getTierFromPriceId(priceId)`** - Maps Stripe price ID to tier/period
**`isV2BillingPriceId(priceId)`** - Detects v2 billing (prefix `bpp_`)
**`getComputedSubscriptionTier()`** - Promotes FREE users in shared workspaces to PRO

## UI Components

### Billing Settings Page
- Location: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/`
- Main component: `BillingPage.tsx`
- Sub-components: `PlanCard.tsx`, `PaymentMethodSection.tsx`, `InvoicesSection.tsx`, `AutoTopupSection.tsx`

### Public Pricing Page
- Location: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx`
- Shows tier comparison matrix, FAQ, add-ons

## Configuration & Constants

### Environment Variables
```bash
STRIPE_CHIPP_KEY                    # Live Stripe key
STRIPE_SANDBOX_KEY                  # Sandbox Stripe key
USE_STRIPE_SANDBOX                  # Enable sandbox mode
STRIPE_PRICING_PLAN_PRO_MONTHLY     # v2 pricing plan ID
STRIPE_PRICING_PLAN_TEAM_MONTHLY    # v2 pricing plan ID
STRIPE_PRICING_PLAN_BUSINESS_MONTHLY # v2 pricing plan ID
```

### Feature Flags
- `UNLOCK_TIERS` - Global flag to bypass tier restrictions
- `USAGE_BASED_BILLING_ENABLED` - Per-org flag for v2 billing

## Migration Recommendations

### Files to Reference
1. `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:45-56` - Copy enum definitions
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts` - Stripe price mappings
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx` - Feature benefits
4. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/usagelimits.ts` - Token/spend limits

### Key Differences to Consider
- ChippDeno uses Kysely (not Prisma) - enums become TypeScript string unions
- ChippDeno uses Svelte 5 (not React) - billing UI needs translation
- ChippDeno may not need v1 legacy prices if starting fresh with v2 billing

### Implementation Order
1. Add subscription tier enum to database schema (migration)
2. Create constants file with tier definitions and Stripe price IDs
3. Implement subscription validation service
4. Build billing settings UI components
5. Set up Stripe webhook handlers for tier changes

## Related Features
- **Usage-based billing** - uses tier to determine markup percentage
- **Organization feature flags** - some features gated by tier
- **Team management** - TEAM+ required for multiple members
- **Workspace logic** - FREE users in shared workspaces computed as PRO
