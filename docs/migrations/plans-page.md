# Feature Migration Report: Plans/Pricing Page

## Executive Summary

- **What it does**: Public-facing pricing page displaying subscription tiers (Pro, Team, Business), feature comparison matrix, FAQ accordion, and Stripe checkout integration
- **Complexity**: Medium - involves Stripe integration, animations, responsive design, and state management
- **Dependencies**: Stripe API (v2 billing), Framer Motion, Next.js auth, Prisma ORM
- **Recommended approach**: Pixel-perfect copy with Svelte equivalents for React patterns

## Important Migration Note: Usage-Based Billing

**Usage-based billing is the default in ChippDeno** - there are no flags to enable/disable it:
- Remove any `usageBasedBillingEnabled` or `use_sandbox_for_usage_billing` checks
- Stripe mode (TEST vs LIVE) is determined solely by environment:
  - `ENVIRONMENT=production` → LIVE mode, `bpp_*` pricing plans
  - Otherwise → TEST mode, `bpp_test_*` pricing plans

## Page Location and Routing

### Route Configuration
- **URL**: `/plans`
- **Page file**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/page.tsx`
- **Main component**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx`

### Authentication Behavior
- Page is accessible to both authenticated and unauthenticated users
- Auth state determines CTA behavior:
  - **Authenticated**: Directly triggers Stripe checkout
  - **Unauthenticated**: Redirects to login with `?next=/plans?autoCheckout={tier}` to resume after auth

## React Component Structure

### Component Hierarchy

```
page.tsx (Server Component)
  └─ Plans.tsx (Client Component)
       ├─ PlansNavigation.tsx
       ├─ GradientEffects (from chipp-landing)
       ├─ BottomGradientEffects (from chipp-landing)
       ├─ PlanCard.tsx (x3: Pro, Team, Business)
       ├─ Add-ons Section (inline)
       ├─ "What to Tell IT" Section (inline)
       ├─ Compare Plans Table (inline)
       ├─ "All About Usage" Section (inline)
       ├─ FAQ Accordion (inline)
       ├─ Embedded Chipp Support AI iframe
       └─ Footer (from chipp-landing)
```

### Component Files

| Component | Purpose | File |
|-----------|---------|------|
| `page.tsx` | Server component - fetches auth + subscription data | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/page.tsx` |
| `Plans.tsx` | Main client component - all page sections | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx` |
| `PlanCard.tsx` | Individual plan card (Pro/Team/Business) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/PlanCard.tsx` |
| `PlansNavigation.tsx` | Fixed header nav with mobile menu | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/PlansNavigation.tsx` |
| `ROICalculator.tsx` | Interactive ROI slider (currently unused) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/ROICalculator.tsx` |

### Shared Landing Page Components

These are imported from `chipp-landing`:

| Component | Purpose | File |
|-----------|---------|------|
| `GradientEffects` | Animated gradient blobs (top) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/hero-section/gradient-effects/index.tsx` |
| `BottomGradientEffects` | Animated gradient blobs (bottom) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/hero-section/gradient-effects/bottom-gradient-effects.tsx` |
| `Footer` | Site footer | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/footer.tsx` |
| `COLORS` | Design system constants | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/hero-section/constants.ts` |

## Tier Display Configuration

### Pricing Plans Data Structure

```typescript
const plans = [
  {
    plan: "Pro",
    tagline: "Perfect for one person building & sharing.",
    cost: "29",
    costCaption: "/month + usage over $10",
    buttonText: "Get Started",
    subheading: "Includes $10 of AI Usage, Plus:",
    benefits: [
      "Best Models",
      "Unlimited Knowledge Sources",
      "API Access",
      "Voice Agents",
      "Deploy to WhatsApp, Slack, more",
      "Sell Individual Agents",
      "Community Support",
    ],
    onClick: () => handlePlanClick("PRO"),
    disabled: currentSubscriptionTier === SubscriptionTier.PRO && !isInTrial,
    isLoading: loadingTier === "PRO",
  },
  {
    plan: "Team",
    tagline: "Best for working with others.",
    cost: "99",
    costCaption: "/month + usage over $30",
    buttonText: "Get Started",
    subheading: "Includes $30 of AI Usage, Pro Features, Plus:",
    benefits: [
      "Unlimited AI HQs",
      "Team Management",
      "Voice Cloning",
      "Sell Agent Bundles",
      "Email Support",
    ],
    onClick: () => handlePlanClick("TEAM"),
    highlight: true,  // Yellow border
    mostPopular: true, // Shows badge
    disabled: currentSubscriptionTier === SubscriptionTier.TEAM && !isInTrial,
    isLoading: loadingTier === "TEAM",
  },
  {
    plan: "Business",
    tagline: "Keep data private - no data shared with model providers like OpenAI.",
    cost: "299",
    costCaption: "/month + usage over $100",
    buttonText: "Get Started",
    subheading: "Includes $100 of AI Usage, Team Features, Plus:",
    benefits: [
      "Zero Data Retention (ZDR)",
      "HIPAA Compliant",
      "White Glove Onboarding and Training",
      "Private Slack Support",
    ],
    onClick: () => handlePlanClick("BUSINESS"),
    mostPrivate: true, // Shows "Most Private" badge
    disabled: currentSubscriptionTier === SubscriptionTier.BUSINESS && !isInTrial,
    isLoading: loadingTier === "BUSINESS",
  },
];
```

### Add-ons Configuration

```typescript
const addOns = [
  {
    title: "White Label Chipp",
    price: "$1000/mo",
    features: [
      { name: "Custom Domain", description: "Use Chipp on your site..." },
      { name: "White-label Platform", description: "Remove all Chipp branding..." },
      { name: "Sell Subscriptions", description: "Sell access to your platform..." },
      { name: "Custom Email and Authentication", description: "..." },
    ],
    mostPopular: true,
  },
];
```

### Comparison Matrix Data

```typescript
const comparisonRows = [
  { label: "Usage Included (monthly)", pro: "$10", team: "$30", business: "$100", enterprise: "Custom" },
  { label: "Agents + Knowledge + Users", pro: "Unlimited", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  { label: "Team Members", pro: "1", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  { label: "AI HQs (Agent Bundles)", pro: "-", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  { label: "Voice", pro: "Voice Agents", team: "Voice Agents + Voice Cloning", business: "Voice Agents + Voice Cloning", enterprise: "Custom" },
  { label: "Compliance", pro: "-", team: "-", business: "HIPAA Compliant + ZDR", enterprise: "Custom" },
  { label: "Sales Capabilities", pro: "Sell Agents", team: "Sell Agent Bundles", business: "Sell Agent Bundles", enterprise: "Sell White-Label Platform" },
  { label: "Support", pro: "Community", team: "Email", business: "Private Slack + White Glove Onboarding", enterprise: "Embedded Expert" },
];
```

## Stripe Checkout Integration

### API Route
- **Endpoint**: `GET /api/stripe/plans/payment-url`
- **File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/plans/payment-url/route.ts`

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subscriptionTier` | Yes | PRO, TEAM, or BUSINESS |
| `subscriptionPeriod` | Yes | MONTHLY or YEARLY (currently only MONTHLY used) |
| `returnToUrl` | Yes | URL to redirect after successful payment |
| `cancelUrl` | No | URL for cancel button (defaults to returnToUrl) |
| `rewardfulReferral` | No | Rewardful affiliate tracking ID |
| `upsellSource` | No | Analytics tracking source |

### Stripe Price Constants

Location: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts`

```typescript
// V2 Usage-Based Pricing (current)
USAGE_BASED_PRO_MONTHLY_PRICE = { LIVE: "bpp_61TqjPr9aBFLlL1sS16PAYkwRuSQV6uTJRipwOFHUF96" }  // $29/mo
USAGE_BASED_TEAM_MONTHLY_PRICE = { LIVE: "bpp_61TqjNcQzOlILWykg16PAYkwRuSQV6uTJRipwOFHUI5g" }  // $99/mo
USAGE_BASED_BUSINESS_MONTHLY_PRICE = { LIVE: "bpp_61TqjQUV9CZIlomEz16PAYkwRuSQV6uTJRipwOFHULUu" }  // $299/mo

// Legacy Subscription Pricing
PRO_MONTHLY_PRICE = { LIVE: "price_1OYuakDDECPSIOsvkN4IaAXC" }
TEAM_MONTHLY_PRICE = { LIVE: "price_1QJpnsDDECPSIOsvSt5WlYHY" }
BUSINESS_MONTHLY_PRICE = { LIVE: "price_1SDYRCDDECPSIOsv5wKLFsMV" }
```

### Checkout Flow

1. User clicks "Get Started" button on PlanCard
2. `handlePlanClick(tier)` is called
3. If authenticated:
   - Fetch `/api/stripe/plans/payment-url` with tier + period
   - API creates Stripe Checkout Session (v2 billing or legacy based on org settings)
   - Redirect to Stripe Checkout URL
4. If not authenticated:
   - Redirect to `/auth/login?next=/plans?autoCheckout={tier}&period=MONTHLY`
   - After login, `useEffect` detects `autoCheckout` param and triggers checkout

### Upsell Source Tracking

Location: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/upsellSources.ts`

```typescript
// Plans page sources
PLANS_PAGE_PRO = "plans_page:pro_card"
PLANS_PAGE_TEAM = "plans_page:team_card"
PLANS_PAGE_BUSINESS = "plans_page:business_card"
```

## Animations and Interactive Elements

### Framer Motion Animations

1. **Staggered Section Reveal**
   ```typescript
   const ANIMATION_DELAYS = {
     header: 0,
     plans: 0.2,
     addons: 0.6,
     comparison: 0.8,
     usage: 1.0,
     faq: 1.2,
     moreQuestions: 1.4,
   };

   // Usage pattern:
   <motion.div
     initial={{ opacity: 0, y: 20 }}
     animate={{ opacity: 1, y: 0 }}
     transition={{ delay: ANIMATION_DELAYS.plans }}
   >
   ```

2. **Plan Card Stagger**
   ```typescript
   {plans.map((plan, index) => (
     <motion.div
       initial={{ opacity: 0, y: 30 }}
       animate={{ opacity: 1, y: 0 }}
       transition={{ delay: 0.3 + index * 0.1, duration: 0.6 }}
     >
       <PlanCard {...plan} />
     </motion.div>
   ))}
   ```

### Gradient Effects (Desktop Only)

- Shimmer animation on gradient blobs
- Mobile detection to disable heavy effects
- CSS keyframe animation:
  ```css
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  ```

### FAQ Accordion

```typescript
const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

// Toggle logic
onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}

// Animation
className={`overflow-hidden transition-all duration-300 ${
  openFaqIndex === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
}`}
```

### PlanCard Hover Effects

```typescript
// Card wrapper
className="transition-all duration-300 ease-out hover:transform hover:-translate-y-2 hover:shadow-2xl"

// Button hover
className="transition-all duration-300 ease-out hover:transform hover:-translate-y-1 hover:shadow-lg hover:opacity-90"
```

### Loading State

```typescript
// In PlanCard
{isLoading ? (
  <Loader2 className="w-5 h-5 animate-spin" />
) : (
  buttonText
)}
```

## Design System Constants

### Brand Colors

```typescript
const BRAND_COLORS = {
  yellow: "rgb(249, 210, 0)",  // Primary CTA color
  black: "#111111",            // Text color
  gray: "#616161",             // Secondary text
  lightGray: "#fafafa",        // Backgrounds
  indigo: "#6366f1",           // "Most Private" badge
  lightIndigo: "#e0e7ff",      // Badge border
};
```

### Font Families

```typescript
const FONTS = {
  heading: "Chubbo, serif",    // Titles, prices
  body: "Mulish, sans-serif",  // Body text, buttons
};
```

### Background Color

```typescript
// From chipp-landing constants
COLORS.background = "rgb(252, 251, 247)"  // Warm off-white
```

## UI/UX Patterns

### PlanCard Props Interface

```typescript
interface PlanCardProps {
  plan?: string;           // Plan name (Pro/Team/Business)
  tagline?: string;        // Description below name
  cost: string;            // Price number (e.g., "29")
  costCaption?: string;    // Additional price text
  className?: string;
  buttonText: string;      // CTA button text
  buttonColor?: string;    // Custom button color
  subheading?: string;     // Section header above benefits
  benefits: string[];      // Feature list
  onClick?: () => void;
  disabled?: boolean;      // For current plan
  highlight?: boolean;     // Yellow border (Team plan)
  mostPopular?: boolean;   // Shows badge image
  mostPrivate?: boolean;   // Shows "Most Private" badge
  isLoading?: boolean;     // Shows spinner
}
```

### Badge Display Logic

```typescript
// Most Popular (Team plan)
{mostPopular && (
  <div className="absolute -top-4 right-4">
    <img src="/assets/most-popular-badge.avif" className="rotate-6" />
  </div>
)}

// Most Private (Business plan)
{mostPrivate && (
  <div className="absolute -top-4 left-6">
    <div className="px-4 py-2 rounded-full text-xs font-bold shadow-lg transform -rotate-3 border-2"
         style={{ backgroundColor: BRAND_COLORS.indigo, color: "#fff" }}>
      Most Private
    </div>
  </div>
)}
```

### Button Color Logic

```typescript
style={{
  backgroundColor: buttonText.includes("Get Started")
    ? BRAND_COLORS.yellow
    : buttonColor || BRAND_COLORS.black,
  color: buttonText.includes("Get Started")
    ? BRAND_COLORS.black
    : "white",
}}
```

## Configuration & Constants

### SubscriptionTier Enum

Location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma:45`

```prisma
enum SubscriptionTier {
  FREE
  PRO
  TEAM
  BUSINESS
  ENTERPRISE
}
```

### Tier Order (for downgrade detection)

```typescript
const tierOrder = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  BUSINESS: 3,
  ENTERPRISE: 4,
};
```

### Assets Used

| Asset | Path |
|-------|------|
| Build sticker | `/assets/build-sticker.png` |
| Share sticker | `/assets/share-sticker.png` |
| Grow sticker | `/assets/grow-sticker.png` |
| Most Popular badge | `/assets/most-popular-badge.avif` |
| SOC 2 badge | `/assets/soc-2-badge.png` |
| Chipp nav logo | `/assets/icons/chipp-nav-logo-new.svg` |

## Navigation Component

### PlansNavigation State

```typescript
const [hasScrolled, setHasScrolled] = useState(false);     // Header transparency
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
const [mainAppUrl, setMainAppUrl] = useState<string>("");
```

### Navigation Links

```typescript
const navigationLinks = [
  { href: "https://info.chipp.ai/", label: "About", external: true },
  { href: `${mainAppUrl}/plans`, label: "Pricing", external: true },
  { href: `${mainAppUrl}/marketplace`, label: "Templates", external: true },
  { href: "https://chipp.disco.co/", label: "Academy", external: true },
  { href: "https://chipp.ai/blog", label: "Blog", external: true },
];
```

### Scroll-based Header Styling

```typescript
className={`fixed z-[999] ... transition-all duration-300 ${
  hasScrolled
    ? "backdrop-blur-md bg-[#FCFBF7]/90 border-b border-border shadow-sm"
    : ""
}`}
```

## FAQ Data

The FAQ section contains 9 questions with answers. Note that one answer includes inline HTML for a link:

```typescript
const faqData = [
  {
    question: "Are there API costs?",
    answer: "Chipp pays for all API costs - no extra charge to you..."
  },
  {
    question: "What is a message?",
    answer: "A message is each interaction sent to your AI agent..."
  },
  // ... 7 more items
  {
    question: "Are you SOC2 Certified?",
    answer: "Yes! Chipp is SOC 2 Type II certified. Visit our <a href='https://trust.chipp.ai/' ...>Trust Center</a>..."
  },
];
```

**Note**: The FAQ answers use `innerHTML` rendering for links. In Svelte, use `{@html}` but sanitize content with DOMPurify or use static text with proper link components.

## Migration Recommendations

### Files to Reference

1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/Plans.tsx` - Main component logic
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/PlanCard.tsx` - Card component
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/PlansNavigation.tsx` - Header nav
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/constants.ts` - Stripe price IDs
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/stripe/plans/payment-url/route.ts` - Checkout API
6. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/upsellSources.ts` - Analytics tracking

### Key Differences to Consider

| ChippMono (React) | ChippDeno (Svelte 5) |
|-------------------|----------------------|
| `useState` | `$state()` rune |
| `useEffect` | `$effect()` rune |
| `useRouter/useSearchParams` | `import { push } from 'svelte-spa-router'` + URL parsing |
| Framer Motion `<motion.div>` | Svelte `transition:` or `use:` directives |
| Next.js `auth()` | Hono auth middleware + Svelte store |
| Prisma ORM | Kysely query builder |
| `innerHTML` rendering | `{@html content}` with DOMPurify sanitization |

### Svelte Animation Equivalents

```svelte
<!-- Staggered fade-in -->
<script>
  import { fade, fly } from 'svelte/transition';

  let visible = $state(false);
  $effect(() => { visible = true; });
</script>

{#if visible}
  <div in:fly={{ y: 20, delay: 200, duration: 600 }}>
    Content
  </div>
{/if}
```

### Implementation Order

1. **Create Svelte route** at `web/src/routes/PlansPage.svelte`
2. **Port design system constants** (colors, fonts) to shared file
3. **Create PlanCard component** in `web/src/lib/design-system/`
4. **Create PlansNavigation component** with scroll detection
5. **Port gradient effects** or simplify (CSS-only version)
6. **Implement Stripe checkout API** in `src/api/routes/stripe/plans/`
7. **Wire up auth-aware checkout flow**
8. **Add FAQ accordion** with Svelte transitions
9. **Add comparison table** (pure HTML/CSS)
10. **Test responsive behavior** and mobile menu

### Simplification Opportunities

1. **Gradient effects**: Consider CSS-only gradients instead of JS animation
2. **FAQ**: Use Svelte `slide` transition instead of CSS max-height
3. **Mobile menu**: Use Svelte `slide` transition for drawer
4. **Loading states**: Svelte `{#await}` blocks for cleaner async UI

## Related Features

- **Billing Settings** (`/settings/billing`) - shares PlanCard component, different context
- **Onboarding Flow** - uses similar plan selection with `returnToUrl` pattern
- **Credit Exhausted Modal** - links to plans page with upsell tracking
- **Stripe Webhooks** - processes subscription changes after checkout
