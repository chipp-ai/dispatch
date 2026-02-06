# Feature Migration Report: Credit Management & Token Billing

## Executive Summary
- **What it does**: Complete credit/token lifecycle management -- organizations get monthly credit allowances per tier, all LLM calls route through Stripe Token Billing proxy (`llm.stripe.com`) which auto-counts tokens and creates meter events, credits deplete in real-time, auto-topup and manual top-up flows keep services running, credit exhaustion blocks API requests, and a notification system emails admins when balance runs low.
- **Complexity**: High -- spans Stripe v2 Billing API, webhook-driven alerts, LLM provider proxy, multiple UI pages, email notifications with conversion tracking, and real-time usage analytics.
- **Dependencies**: Stripe v2 Billing API, Stripe Token Billing proxy, SMTP email, Sentry, Redis (for subscription validator caching)
- **Recommended approach**: ChippDeno already has foundation (billing routes, webhook handlers, credits_exhausted column, consumer credit system). Build out the remaining credit UI pages, usage analytics, auto-topup, notification system, and credit warning banners.

---

## 1. Data Model

### Organization Billing Fields (ChippMono Prisma Schema)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma`

Key fields on the `Organization` model:

```
subscriptionTier                    SubscriptionTier @default(FREE)
stripeCustomerId                    String?
stripeSandboxCustomerId             String?
stripeSubscriptionId                String?
usageBasedBillingEnabled            Boolean          @default(false)
useSandboxForUsageBilling           Boolean          @default(false)
creditsExhausted                    Boolean          @default(false)
lastCreditWarningEmailAt            DateTime?
creditNotificationThresholds        Json             @default("[]")
creditNotificationsEnabled          Boolean          @default(true)
creditNotificationDefaultPercentage Int              @default(50)
featureFlags                        Json             @default("{}")
allowExpensiveModels                Boolean          @default(false)
```

### TokenUsage Model (Local Estimated Usage Tracking)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (lines ~1068-1093)

```
model TokenUsage {
  id            Int        @id @default(autoincrement())
  tokens        Int
  messageId     String?
  sessionId     String?
  model         String
  source        String?
  applicationId Int
  consumerId    Int?
  workspaceId   Int?
  developerId   Int?
  inputTokens   Int        @default(0)
  outputTokens  Int        @default(0)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@index([applicationId])
  @@index([consumerId])
  @@index([workspaceId])
  @@index([sessionId])
  @@index([developerId])
}
```

### CreditNotificationLog Model (Email Audit Trail)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (lines ~2099-2130)

```
model CreditNotificationLog {
  id                      String                 @id @default(cuid())
  organizationId          Int
  notificationType        CreditNotificationType  // LOW_BALANCE | EXHAUSTED
  severity                String
  recipientEmails         Json
  recipientCount          Int
  creditBalanceCents      Int
  triggeredThresholdCents Int?
  trackingId              String                 @unique
  sentAt                  DateTime               @default(now())
  openedAt                DateTime?
  openCount               Int                    @default(0)
  lastOpenedAt            DateTime?
  clickedAt               DateTime?
  convertedAt             DateTime?
  conversionAmountCents   Int?
  upsellSource            String
  emailSubject            String?
  ipAddress               String?
  userAgent               String?
  createdAt               DateTime               @default(now())
  updatedAt               DateTime               @updatedAt
}

enum CreditNotificationType {
  LOW_BALANCE
  EXHAUSTED
}
```

### ChippDeno Equivalent Tables

ChippDeno already has:
- `app.organizations` with `credits_exhausted` column (migration `025_add_credits_exhausted_column.sql`)
- `app.token_usage` table (via existing schema)
- Consumer credits in `app.consumers.credits` field
- `app.packages` table for consumer credit packages

ChippDeno is **missing**:
- `credit_notification_log` table
- `credit_notification_thresholds` JSON column on organizations
- `credit_notifications_enabled` column on organizations
- `credit_notification_default_percentage` column on organizations
- `last_credit_warning_email_at` column on organizations

---

## 2. Tier Allowances & Pricing

### Monthly Credit Allowances

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/lib/tierAllowance.ts`

```typescript
const TIER_ALLOWANCES_CENTS = {
  FREE: 500,       // $5 free credits (one-time for v2)
  PRO: 1000,       // $10/month
  TEAM: 3000,      // $30/month
  BUSINESS: 10000, // $100/month
  ENTERPRISE: 0,   // Custom
};
```

### Subscription Pricing (License Fee + Usage)

| Tier | Monthly Fee | Credit Allowance | Markup | Effective Cost |
|------|------------|-----------------|--------|----------------|
| FREE | $0 | $5 (one-time) | 30% | N/A |
| PRO | $29 | $10 | 30% | $21.75 effective |
| TEAM | $99 | $30 | 20% | $96.85 effective |
| BUSINESS | $299 | $100 | 15% | $100 effective |
| ENTERPRISE | Custom | Custom | Custom | N/A |

### 30% Markup on Token Pricing

All model pricing includes a 30% markup over base provider pricing. This is applied at the `STRIPE_TOKEN_BILLING_MODELS` configuration level:

```typescript
// File: /Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/llm/adapter/stripe-token-billing-models.ts
const withMarkup = (basePrice: number): number => {
  return Math.round(basePrice * 1.3 * 100) / 100; // 30% markup, rounded to 2 decimals
};
```

---

## 3. Token Billing Architecture

### How Token Billing Works

All LLM requests route through `https://llm.stripe.com` (Stripe Token Billing proxy). The proxy:
1. Forwards requests to the actual LLM provider (OpenAI, Anthropic, Google, etc.)
2. Automatically counts input/output tokens
3. Creates meter events against the customer identified by `X-Stripe-Customer-ID` header
4. Returns the LLM response transparently

### Customer ID Routing Logic

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/llm-adapter/providers/stripe-token-billing.ts` (lines 158-211)

```
If usageBasedBillingEnabled:
  Use org's stripeCustomerId (or stripeSandboxCustomerId)
Else:
  Use Chipp's internal customer ID (Chipp fronts costs)
  Source: STRIPE_CHIPP_INTERNAL_CUSTOMER_ID env var
```

The `X-Stripe-Customer-ID` header is **required** -- without it, requests fail with "Please provide a valid customer ID".

### Sandbox vs Production

- `useSandboxForUsageBilling` flag determines which Stripe environment
- Sandbox uses `STRIPE_SANDBOX_KEY`, production uses `STRIPE_CHIPP_KEY`
- v2 APIs require Stripe sandboxes (not test mode)

### Model Configuration

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/llm/adapter/stripe-token-billing-models.ts`

40+ models configured with:
- `enumValue` -- Internal model identifier
- `stripeModelId` -- Stripe format (`provider/model`, e.g., `openai/gpt-4o`)
- `pricing` -- Per-million-token pricing with 30% markup already applied
- Capability flags: `supportsVision`, `supportsFunctions`, `requiresResponsesApi`, `requiresMaxCompletionTokens`, `supportsTemperature`, etc.

Key model pricing examples (with 30% markup):

| Model | Input $/1M | Output $/1M |
|-------|-----------|-------------|
| GPT-4o | $3.25 | $13.00 |
| GPT-4o Mini | $0.195 | $0.78 |
| GPT-4.1 | $2.60 | $10.40 |
| GPT-5 | $6.50 | $26.00 |
| Claude 3.7 Sonnet | $3.90 | $19.50 |
| Claude Sonnet 4 | $3.90 | $19.50 |
| Gemini 2.5 Pro | $1.625 | $6.50 |
| Gemini 2.5 Flash | $0.0975 | $0.39 |

### Responses API vs Chat Completions

Some models require the `/responses` endpoint instead of `/chat/completions`:
- GPT-5 series (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.1 series)
- o1-pro, o3-pro

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/llm-adapter/providers/stripe-token-billing.ts` (lines 356-481)

The `callResponsesApi()` method:
- Converts messages array to a single text input
- Calls `https://llm.stripe.com/responses` via raw fetch
- Sets `store: false` to prevent ZDR errors
- Parses response output array for `output_text` content

### Parameter Transformation

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/llm/adapter/stripe-token-billing-models.ts` (lines 880-950)

`transformModelParameters()` -- centralized function that:
- Converts `max_tokens` to `max_completion_tokens` for newer models
- Converts to `max_output_tokens` for Responses API
- Removes unsupported parameters (temperature, top_p, frequency_penalty, presence_penalty) for o-series and GPT-5 models

### Credit Calculator

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/billing/stripeCreditCalculator.ts`

```typescript
export function calculateCredits(usage: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  tokens?: number | null;
  model?: string | null;
}): number {
  // If only total tokens, split 25% input / 75% output (typical ratio)
  const pricing = getModelPricing(model);
  const inputCredits = (effectiveInput / 1_000_000) * pricing.input;
  const outputCredits = (effectiveOutput / 1_000_000) * pricing.output;
  return inputCredits + outputCredits;
}
```

Credit rate: **$1 = 1 credit**

---

## 4. API Routes

### Credit & Billing API Endpoints

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/organization/credit-status` | GET | Lightweight credit balance check for warning banners | `apps/chipp-admin/app/api/organization/credit-status/route.ts` |
| `/api/organization/invoice-preview` | GET | Full invoice preview with line items, allowance, usage | `apps/chipp-admin/app/api/organization/invoice-preview/route.ts` |
| `/api/organization/billing-topups` | GET/POST | Auto-topup settings (stored in Stripe customer metadata) | `apps/chipp-admin/app/api/organization/billing-topups/route.ts` |
| `/api/organization/billing-topups/topup-now` | POST | Manual one-time credit top-up | `apps/chipp-admin/app/api/organization/billing-topups/topup-now/route.ts` |
| `/api/organization/usage-analytics` | GET | Token usage analytics by dimension (workspace/app/model/user/agentType) | `apps/chipp-admin/app/api/organization/usage-analytics/route.ts` |
| `/api/organization/{id}/notification-settings` | GET/PUT | Credit notification threshold settings | `apps/chipp-admin/app/api/organization/[organizationId]/notification-settings/route.ts` |
| `/api/email/track/{trackingId}` | GET | Email open tracking pixel | `apps/chipp-admin/app/api/email/track/[trackingId]/route.ts` |
| `/api/email/click/{trackingId}` | GET | Email click tracking redirect | `apps/chipp-admin/app/api/email/click/[trackingId]/route.ts` |

### Credit Status API (Key for Warning Banners)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/credit-status/route.ts`

Response shape:
```typescript
interface CreditStatusResponse {
  usageBasedBillingEnabled: boolean;
  creditBalanceCents: number;
  isExhausted: boolean;      // creditBalanceCents <= 0
  isLow: boolean;            // creditBalanceCents <= 100 ($1.00)
  showWarning: boolean;      // isExhausted || isLow
  warningSeverity: "none" | "low" | "exhausted";
  creditBalanceFormatted: string;  // "$X.XX"
  hasDefaultPaymentMethod: boolean;
}
```

Balance source: Stripe `credit_balance_summary` API (`/v1/billing/credit_balance_summary`).

Exclusions: Whitelabeled deployments, PG-enabled deployments, and non-usage-based-billing orgs return no-warning responses.

Test mode support on localhost: `?_test=exhausted|low|ok`

### Auto-Topup Settings

**Storage:** Stripe customer metadata (NOT database). Fields:
- `topup_enabled`: "true" | "false"
- `topup_amount_cents`: string (default: "2000" = $20)
- `topup_threshold_percent`: string (default: "20")

**Defaults:** enabled=false, amount=$20, threshold=20% of allowance

When auto-topup is enabled, a Stripe billing alert is created at the threshold amount. When triggered:
1. Charges customer's default payment method
2. Creates a credit grant via Stripe v1 API (`/v1/billing/credit_grants`)
3. Clears `creditsExhausted` flag
4. Notifies Slack

### Manual Top-up (topup-now)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/billing-topups/topup-now/route.ts`

Flow:
1. Charge payment method via Stripe PaymentIntent
2. Create credit grant via Stripe v1 billing API
3. Track conversion if from credit email (UpsellSource)
4. Notify Slack
5. If credit grant fails after payment: refund the charge

### Usage Analytics API

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/usage-analytics/route.ts`

Query params: `startDate`, `endDate`, `groupBy` (workspace | app | model | user | agentType)

Response:
```typescript
interface UsageAnalyticsResponse {
  data: UsageBreakdownItem[];
  totals: { totalTokens: number; totalCredits: number; totalRequests: number; };
}

interface UsageBreakdownItem {
  id: string;
  name: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCredits: number;
  requestCount: number;
}
```

Uses `calculateCredits()` from the stripeCreditCalculator to convert tokens to estimated dollar amounts.

---

## 5. Credit Exhaustion Flow

### How Credits Get Exhausted

1. LLM usage depletes Stripe credit balance in real-time
2. Stripe fires `billing.alert.triggered` webhook when balance hits $0
3. Webhook handler sets `creditsExhausted = true` on the Organization
4. Sends "exhausted" email to org admins

### How Exhaustion Blocks Requests

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/subscriptionValidator.ts` (lines 67-91)

```typescript
// Early creditsExhausted check - blocks ALL requests
if (organization?.creditsExhausted) {
  return {
    isValid: false,
    error: "usage_limit_reached",
    message: "Your organization's API credits have been exhausted...",
  };
}
```

This check:
- Runs BEFORE Redis cache lookup (ensures immediate blocking)
- Blocks even in builder/preview mode
- Queries organization via workspace relationship
- Returns `usage_limit_reached` error code

### How Exhaustion Gets Cleared

Two paths:
1. **Auto-topup**: Billing alert triggers top-up, clears flag
2. **Manual top-up**: `topup-now` API creates credit grant, clears flag

```typescript
// In billing-alert.ts and topup-now route.ts:
await prisma.organization.update({
  where: { id: organizationId },
  data: { creditsExhausted: false },
});
```

### Balance Error from Stripe Token Billing Provider

**File:** `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/llm-adapter/providers/stripe-token-billing.ts` (lines 324-341)

When the Stripe Token Billing proxy returns a balance error ("no available balance", "insufficient balance"), the provider:
- Logs a warning (not error -- expected behavior)
- Falls over to the next provider in the chain
- Error IS retryable with fallback provider

---

## 6. Auto-Topup System

### Configuration Flow

1. User enables auto-topup on `/settings/billing` (AutoTopupSection)
2. Settings saved to Stripe customer metadata
3. Stripe billing alert created at threshold amount

### Webhook Handler

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/billing-alert.ts`

The `handleBillingAlert()` function handles three types of alerts:

1. **$0 threshold (credit exhaustion)**:
   - Sets `creditsExhausted: true`
   - Sends "exhausted" email
   - Invalidates Redis cache

2. **Notification alerts** (title starts with `notification:`):
   - Checks whitelabel status
   - Checks `creditNotificationsEnabled`
   - Fetches current balance
   - Sends "low" email

3. **Auto-topup alerts**:
   - Charges default payment method via Stripe PaymentIntent
   - Creates credit grant via Stripe v1 API
   - Clears `creditsExhausted` flag
   - Notifies Slack
   - If credit grant fails: refunds the charge

### Billing Alert API

Alerts use **Stripe v1 API** (not v2):
- Create: `POST /v1/billing/alerts` (form-urlencoded with nested params)
- Threshold: `credit_balance_threshold[lte][monetary][value]`
- Customer filter: `credit_balance_threshold[filters][0][customer]`
- Deactivate: `POST /v1/billing/alerts/{id}/deactivate`

Key functions in `billing-alert.ts`:
- `createOrUpdateCreditBalanceAlert()` -- Creates/updates auto-topup alert
- `syncNotificationAlerts()` -- Syncs notification alerts to match configured thresholds
- `deactivateBillingAlert()` -- Removes auto-topup alert
- `deactivateNotificationAlerts()` -- Removes all notification alerts

---

## 7. Credit Notification System

### Architecture

```
User configures thresholds (UI)
  -> Settings saved to Organization + Stripe alerts synced
    -> LLM usage depletes Stripe balance
      -> Balance crosses threshold
        -> Stripe fires billing.alert.triggered webhook
          -> handleBillingAlert() sends email to org admins
```

### Notification Settings

Stored on Organization:
- `creditNotificationsEnabled`: Boolean (default: true)
- `creditNotificationDefaultPercentage`: Int (default: 50, range 0-100)
- `creditNotificationThresholds`: JSON array of custom amounts in cents
- `lastCreditWarningEmailAt`: DateTime (24-hour cooldown tracking)

### Email System

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/email/sendLowCreditsEmail.ts`

Features:
- HTML + plaintext versions
- Recipients: OWNER and EDITOR role members only
- 24-hour cooldown between emails
- Open tracking via 1x1 pixel
- Click tracking via redirect endpoint
- Conversion tracking (topup after email click)
- UpsellSource attribution (CREDIT_EMAIL_LOW, CREDIT_EMAIL_EXHAUSTED)
- Deep-linking to correct org via `?orgId=` parameter

Email severity levels:
- **low**: "Heads up: Your Chipp credits are running low"
- **exhausted**: "Action needed: Your Chipp credits are exhausted"

Email CTAs:
1. "Add Credits" -- direct link to credits page with topup dialog
2. "Enable Auto Top-up" -- shown only if auto-topup not already enabled
3. Info callout with links to usage review and billing settings

---

## 8. UI Components

### Billing Page

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/BillingPage.tsx` (772 lines)

Main sections:
- Current plan card
- Plan upgrade cards (Pro/Team/Business)
- Conditionally shows: PaymentMethodSection, AutoTopupSection, InvoicesSection

### InvoicesSection (Credits & Usage)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/InvoicesSection.tsx` (936 lines)

Hero section:
- Credit balance display (`$X.XX`)
- "Add credits" button
- Quick stats: period usage, credits applied, allowance refresh date

Usage display:
- Line items filtered to exclude license fees
- "Metered" badges on usage items
- "Covered by credits" indicators
- Estimated usage when Stripe data hasn't synced (by app, by model)

Modals:
- **Add Credits Modal**: Quick amounts ($10/$20/$50/$100), custom amount input, how-it-works steps, trust indicators
- **Credit Details Modal**: Total available, monthly allowance breakdown, usage summary, overage display

Constants:
```typescript
const QUICK_AMOUNTS = [1000, 2000, 5000, 10000]; // cents
```

### AutoTopupSection

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/AutoTopupSection.tsx` (246 lines)

- Enable/disable toggle
- Top-up amount input ($)
- Trigger threshold slider (% of allowance)
- Payment method warning when none set
- "How It Works" explainer (4 steps)

### PaymentMethodSection

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/PaymentMethodSection.tsx`

- Payment method status (configured/not configured)
- "Add/Update Payment Method" button (opens Stripe billing portal)
- Info box explaining benefits (manual top-ups, auto top-ups, overage protection)

### Credits Page (Sub-route)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/credits/page.tsx`

- Uses `useOrganizationCreditStatus` hook for warning state
- Shows `LowCreditsWarningBanner` when appropriate
- Delegates to `InvoicesSection` for main content
- Shows "Credits not available" for non-usage-based-billing orgs

### Notifications Page (Sub-route)

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/notifications/page.tsx` (533 lines)

Settings:
- Email notifications toggle (Bell/BellOff icon)
- Default alert slider (0-100% of tier allowance)
- Custom alert thresholds (add/remove dollar amounts)
- Alert summary preview
- Info card: "Notifications sent to all org admins, 1 per 24h"

### Usage Analytics Dashboard

**Files in:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/usage-analytics/`

Components:
| Component | Purpose |
|-----------|---------|
| `UsageAnalyticsContainer` | Main container orchestrating all analytics components |
| `DateRangeSelector` | Date range picker with presets (7d, 30d, 90d, custom) |
| `DimensionTabs` | workspace / app / model / user / agentType tabs |
| `UsageSummaryCards` | Total tokens, total credits, total requests summary cards |
| `UsageTimelineChart` | Daily token usage over time (line chart) |
| `UsageBreakdownChart` | Breakdown by selected dimension (bar chart) |
| `UsageTable` | Detailed table with all breakdown items |
| `ExportButton` | CSV export of usage data |

Hooks:
| Hook | Purpose |
|------|---------|
| `useUsageAnalytics` | Fetches `/api/organization/usage-analytics` |
| `useUsageTimeline` | Fetches timeline data for chart |
| `useDateRange` | Manages date range state |

### LowCreditsWarningBanner

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/LowCreditsWarningBanner.tsx`

Two variants:
- **full**: Full-width banner with title, description, CTA button, "Remind me later"
- **compact**: Inline for tight spaces (chat header)

Color system:
- Exhausted: red-50/red-600/red-800 (bg/icon/text)
- Low: yellow-50/yellow-600/yellow-800 (bg/icon/text)
- Dark mode variants included

CTA logic:
- Has payment method: navigate to credits page with `?openTopup=true`
- No payment method: open `AddPaymentMethodModal` inline

### useOrganizationCreditStatus Hook

**File:** `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/hooks/useOrganizationCreditStatus.ts`

Features:
- Fetches `/api/organization/credit-status`
- Session-based dismissal (sessionStorage)
- Test mode on localhost (`?_test=exhausted|low|ok`)
- Returns: `showWarning`, `warningSeverity`, `creditBalanceCents`, `isExhausted`, `isLow`, `hasDefaultPaymentMethod`, `dismiss()`

---

## 9. Consumer Credit System

ChippDeno already has a near-complete consumer credit system:

**File:** `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/credits.ts`

- `GET /packages` -- List available credit packages for app
- `GET /payment-url` -- Generate Stripe Checkout URL for purchasing
- `GET /manage-subscription` -- Stripe Billing Portal URL
- `GET /balance` -- Consumer's current credit balance

Consumer credits are separate from organization credits:
- **Organization credits**: Stripe Token Billing (token-based, Stripe v2 billing)
- **Consumer credits**: Database-tracked (`app.consumers.credits`), per-app packages, developer's Stripe Connect account

---

## 10. Environment Variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_CHIPP_KEY` | Production Stripe API key for Token Billing |
| `STRIPE_SANDBOX_KEY` | Sandbox Stripe API key |
| `STRIPE_CHIPP_INTERNAL_CUSTOMER_ID` | Chipp's customer ID (when Chipp fronts costs) |
| `STRIPE_WEBHOOK_SECRET_LIVE` | Webhook signature verification (production) |
| `STRIPE_WEBHOOK_SECRET_TEST` | Webhook signature verification (sandbox) |
| `SMTP_FROM_EMAIL` | From address for credit emails |
| `SMTP_FROM_NAME` | From name for credit emails |
| `NEXTAUTH_URL` | Base URL for email deep-links |

---

## 11. ChippDeno Current State

### What Already Exists

1. **Billing routes** (`src/api/routes/billing/index.ts`):
   - `GET /billing/credits` -- Credit status
   - `GET /billing/usage` -- Usage summary
   - `GET /billing/subscription` -- Subscription details
   - `POST /billing/portal` -- Stripe billing portal session

2. **Webhook handlers** (`src/api/routes/webhooks/stripe.ts`, `src/services/billing.service.ts`):
   - `customer.subscription.updated` -- Tier change detection
   - `customer.subscription.deleted` -- Churn analytics
   - `invoice.paid` -- Credit package detection
   - `invoice.payment_failed` -- Failure tracking
   - `checkout.session.completed` -- Package/payment/HQ types
   - `billing.alert.triggered` -- Auto-topup, credits exhaustion
   - `charge.dispute.created/closed`, `charge.refunded`

3. **Database column**: `credits_exhausted` on organizations (migration 025)

4. **Consumer credits**: Full Stripe Checkout flow for consumer package purchases

5. **Credit exhaustion test**: `src/__tests__/scenarios/credit_exhaustion_test.ts`

6. **Billing UI components**: CancelSubscriptionDialog, DowngradeDialog, SubscriptionStatusBanner

### What's Missing (Gaps)

| Gap | Priority | Description |
|-----|----------|-------------|
| **Invoice Preview API** | High | Full Stripe v2 invoice preview with allowance, line items, cadence info |
| **Auto-Topup Settings API** | High | GET/POST for auto-topup config (stored in Stripe customer metadata) |
| **Manual Top-up API** | High | Charge payment method + create credit grant |
| **Credit Warning Banner** | High | LowCreditsWarningBanner component (full + compact variants) |
| **Credit Status API** | Medium | Lightweight endpoint hitting Stripe credit_balance_summary |
| **InvoicesSection / Credits UI** | High | Main credits & usage display page |
| **AutoTopupSection UI** | Medium | Auto-topup configuration UI |
| **Usage Analytics API** | Medium | Token usage grouped by dimension |
| **Usage Analytics Dashboard** | Medium | Charts, tables, export for usage data |
| **Notification Settings UI** | Medium | Threshold configuration page |
| **Notification Settings API** | Medium | GET/PUT for notification thresholds |
| **Credit Notification Email** | Medium | HTML/text email with tracking |
| **CreditNotificationLog table** | Medium | Database migration for email audit trail |
| **Stripe Token Billing Models** | Low | Already partially in ChippDeno's stripe-model-mapping.ts |
| **Credit Calculator** | Low | Convert tokens to dollar amounts for display |
| **PaymentMethodSection UI** | Low | Payment method status and management |
| **Add Credits Modal** | Medium | Quick amounts, custom amount, trust indicators |

---

## 12. Migration Recommendations

### Key Files to Reference

1. **Token Billing Provider**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/llm-adapter/providers/stripe-token-billing.ts`
2. **Token Billing Models**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/llm/adapter/stripe-token-billing-models.ts`
3. **Credit Calculator**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/billing/stripeCreditCalculator.ts`
4. **Tier Allowances**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/lib/tierAllowance.ts`
5. **Billing Alert Handler**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/webhook/billing-alert.ts`
6. **Credit Status API**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/credit-status/route.ts`
7. **Invoice Preview API**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/invoice-preview/route.ts`
8. **Auto-Topup APIs**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/billing-topups/route.ts`
9. **Manual Top-up**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/billing-topups/topup-now/route.ts`
10. **Usage Analytics API**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/usage-analytics/route.ts`
11. **Notification Settings API**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/organization/[organizationId]/notification-settings/route.ts`
12. **Low Credits Email**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/email/sendLowCreditsEmail.ts`
13. **Customer Management**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/customer.ts`
14. **Subscription Validator**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/subscriptionValidator.ts`
15. **InvoicesSection UI**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/InvoicesSection.tsx`
16. **AutoTopupSection UI**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/settings/billing/AutoTopupSection.tsx`
17. **LowCreditsWarningBanner**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/LowCreditsWarningBanner.tsx`
18. **Stripe Constants**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts`

### Key Differences to Consider

- **ChippDeno uses Hono** (not Next.js API routes) -- request/response patterns differ
- **ChippDeno uses Svelte 5** (not React) -- UI components need full rewrite
- **ChippDeno uses Kysely** (not Prisma) -- query patterns differ (camelCase plugin)
- **JSON columns** in ChippDeno may return strings -- always use safe parsing
- **White-label support** -- all colors must use CSS variables, no hardcoded colors

### Whitelabel Color Mapping

| Source (React hardcoded) | Target (Svelte CSS variable) |
|--------------------------|------------------------------|
| `bg-red-50` / `bg-red-600` (exhausted warning) | `hsl(var(--destructive) / 0.1)` / `hsl(var(--destructive))` |
| `bg-yellow-50` / `bg-yellow-600` (low warning) | `hsl(var(--warning) / 0.1)` / `hsl(var(--warning))` |
| `#2563eb` (blue-600 CTA button) | `hsl(var(--primary))` |
| `bg-brand-muted` / `text-brand` | `hsl(var(--brand-muted))` / `hsl(var(--brand))` |
| `text-foreground`, `text-muted-foreground` | `hsl(var(--foreground))`, `hsl(var(--muted-foreground))` |
| `bg-muted`, `border-border` | `hsl(var(--muted))`, `hsl(var(--border))` |

### Implementation Order

1. **Phase 1: Database migrations**
   - Add notification columns to organizations table
   - Create credit_notification_log table

2. **Phase 2: Core APIs**
   - Credit status endpoint (lightweight, for banners)
   - Invoice preview endpoint (Stripe v2 billing)
   - Auto-topup settings GET/POST
   - Manual top-up POST
   - Notification settings GET/PUT

3. **Phase 3: Credit Calculator & Tier Helpers**
   - Port `stripeCreditCalculator.ts`
   - Port `tierAllowance.ts`

4. **Phase 4: UI Components**
   - LowCreditsWarningBanner (Svelte)
   - Credits/Usage section (InvoicesSection equivalent)
   - Add Credits modal
   - Auto-topup settings section
   - Payment method section

5. **Phase 5: Usage Analytics**
   - Usage analytics API
   - Timeline chart, breakdown chart, summary cards, table
   - Date range selector, dimension tabs, export

6. **Phase 6: Notifications**
   - Notification settings page
   - Credit email sending (HTML + plaintext)
   - Email tracking (open pixel, click redirect)
   - CreditNotificationLog auditing

---

## 13. Stripe v2 Billing API Reference

### Key Stripe Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/billing/credit_balance_summary` | Check remaining credit balance |
| `POST /v1/billing/credit_grants` | Create credit grant (manual/auto top-up) |
| `POST /v1/billing/alerts` | Create billing threshold alerts |
| `POST /v1/billing/alerts/{id}/deactivate` | Remove billing alert |
| `POST /v2/billing/billing_intents` | Create subscription (v2 billing) |
| `GET /v2/billing/billing_cadences` | List billing cadences |
| `GET /v2/billing/billing_cadences/{id}/invoice_preview` | Invoice preview |

### API Versions

```typescript
STRIPE_API_VERSION = "2025-09-30.clover"  // v1 API
STRIPE_V2_API_VERSION = "2025-08-27.preview"  // v2 API
```

---

## Related Features
- **Subscription Tiers** -- Defines the allowance per tier
- **Stripe Webhooks** -- Handles billing.alert.triggered for auto-topup and notifications
- **Subscription Validator** -- Checks creditsExhausted before allowing LLM requests
- **Consumer Credits** -- Separate system for end-user purchases (already in ChippDeno)
- **Email System** -- Required for sending credit notifications
