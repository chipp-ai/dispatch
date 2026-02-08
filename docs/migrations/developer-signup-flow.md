# Feature Migration Report: Developer/Builder Signup Flow

## Executive Summary
- **What it does**: The developer signup flow handles new platform users who want to build chatbots on Chipp. It supports email+password (with optional OTP verification), Google OAuth, and Microsoft OAuth. On signup it creates a Developer record, Workspace, WorkspaceHQ, Organization, Stripe customer, and FREE subscription -- then routes through post-login to onboarding.
- **Complexity**: High
- **Dependencies**: NextAuth (session management), Stripe (customer/subscription creation), SMTP (email sending), Slack webhooks (notifications), ActiveCampaign (ESP/marketing), Rewardful (referral tracking), feature flags system, domain intelligence checking
- **Recommended approach**: Reimplementation with improvements. ChippDeno uses Hono + custom JWT auth instead of NextAuth. The core data creation logic (newUser) should be ported, but the UI will be Svelte 5 and the auth layer is already different.

## Data Model

### Database Tables Created During Signup

1. **`Developer`** (main user record)
   - Key columns: `id` (autoincrement), `email` (unique), `name`, `password` (bcrypt hashed), `pictureUrl`, `emailHasBeenVerified`, `hasCompletedOnboarding`, `onboardingVersion`, `activeWorkspaceId`, `acquisitionSource`, `acquisitionReferrerUrl`, `referralId`, `username`, `magicLinkToken`, `magicLinkTokenExpiry`, `subscriptionTier` (default FREE)
   - Relationships: has many `WorkspaceMember`, has many `Application`, has one `DeveloperCredentials`, belongs to `OrganizationMember`
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 1092)

2. **`DeveloperCredentials`** (new credential system, created alongside Developer)
   - Key columns: `password`, `emailHasBeenVerified`, `resetToken`, `magicLinkToken`, `otpCode`, `otpCodeExpiry`, `isSuperAdmin`
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 1306)

3. **`Workspace`** (developer's workspace)
   - Key columns: `id`, `name`, `slug` (unique, format: `{firstname}-workspace-{uuid}`), `pictureUrl`, `visibility` (default PRIVATE), `tier` (default STARTER)
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 252)

4. **`WorkspaceHQ`** (public-facing workspace page)
   - Key columns: `workspaceId` (unique FK), `name`, `slug` (unique), `pictureUrl`, `bannerUrl`, `isVerified`, `isHqPublic`
   - Created alongside Workspace with matching name/slug
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 1202)

5. **`WorkspaceMember`** (join table)
   - Key columns: `developerId`, `workspaceId`, `role` (DeveloperRole enum: OWNER/EDITOR/VIEWER)
   - Created as OWNER during signup
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 351)

6. **`Organization`** (billing/team entity)
   - Key columns: `id`, `name` (format: `{firstname}'s Organization`), `creatorId` (FK to Developer), `subscriptionTier` (default FREE), `stripeCustomerId`, `stripeSandboxCustomerId`, `stripeSubscriptionId`, `usageBasedBillingEnabled` (default true for new signups), `featureFlags` (JSON, default `{"allow_expensive_models": true}`)
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 2653)

7. **`OrganizationMember`** (join table)
   - Key columns: `organizationId`, `developerId`, `role` (OWNER)
   - Unique constraint: `[organizationId, developerId]`
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 2756)

8. **`DeveloperEmailVerificationOtp`** (OTP records, temporary)
   - Key columns: `id` (cuid), `email` (unique), `otpCode`, `expiresAt`
   - Indexes on `email` and `expiresAt`
   - Deleted after successful verification
   - Schema location: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (line 2487)

### Enums

```
enum SubscriptionTier { FREE, PRO, TEAM, BUSINESS, ENTERPRISE }
enum SubscriptionPeriod { MONTHLY, YEARLY }
enum DeveloperRole { OWNER, EDITOR, VIEWER }
```

## Implementation Details

### Signup Flow Overview (Two Paths)

#### Path A: Email+Password Signup (Non-OTP)

```
User fills signup form
  -> POST /api/auth/signup (creates Developer, Workspace, Org, Stripe customer)
  -> Client calls signIn("credentials") with NextAuth
  -> NextAuth validates password via handleUsernamePasswordLogin
  -> Client redirects to /api/developer/post-login?newSignup=true
  -> Post-login checks hasCompletedOnboarding
  -> If false: redirect to /onboarding-v2
  -> If true: redirect to /applications
```

#### Path B: Email+Password Signup (OTP Enabled)

```
User fills signup form
  -> POST /api/auth/signup (detects OTP flag, returns {requiresOtp: true})
  -> Client sends POST /api/auth/send-otp (generates 6-digit OTP, stores in DB, emails it)
  -> User enters OTP code
  -> POST /api/auth/verify-otp (validates OTP, creates Developer via newUser(), deletes OTP record)
  -> Client calls signIn("credentials") with email/password
  -> Same post-login flow as Path A
```

#### Path C: OAuth Signup (Google/Microsoft)

```
User clicks "Continue with Google" or "Continue with Microsoft"
  -> signIn("google" | "microsoft-entra-id", { callbackUrl: postSignupUrl })
  -> OAuth provider handles authentication
  -> Callback returns to /api/developer/post-login?newSignup=true
  -> Post-login finds no Developer record for email
  -> Creates Developer, Workspace, Org, Stripe customer (duplicated logic from newUser)
  -> Redirects to /onboarding-v2 or /applications
```

### API Routes

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/auth/signup` | POST | Create user account (email+password, or detect OTP) | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/signup/route.ts` |
| `/api/auth/send-otp` | POST | Generate and email 6-digit OTP | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/send-otp/route.ts` |
| `/api/auth/verify-otp` | POST | Verify OTP and complete signup | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/verify-otp/route.ts` |
| `/api/auth/magic-link` | POST | Send magic link email for verification | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/magic-link/route.ts` |
| `/api/developer/post-login` | GET | Handle post-login provisioning and redirects | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/developer/post-login/route.ts` |
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler | `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/[...nextauth]/route.ts` |

### Core Business Logic

#### `newUser()` - The Heart of Signup
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/utils/newUser.ts`
- **Called by**: `/api/auth/signup` (non-OTP path), `/api/auth/verify-otp` (OTP path)
- **NOT called by**: OAuth path (post-login has its own inline creation logic)

**Sequence of operations in `newUser()`:**

1. Hash password with bcrypt (10 rounds)
2. Generate workspace slug: `{firstname}-workspace-{uuid}` (or `your-workspace-{uuid}` if no name)
3. Check WorkspaceHQ slug uniqueness (loop with counter if taken)
4. Create `Workspace` with nested `WorkspaceHQ` creation
5. Log acquisition source to Axiom
6. Create `Developer` with:
   - Nested `WorkspaceMember` (OWNER role)
   - `activeWorkspaceId` set to new workspace
   - `emailHasBeenVerified: true`
   - `hasCompletedOnboarding: false`
   - Nested `DeveloperCredentials` (if password provided)
7. Create `Organization` with:
   - `creatorId: developer.id`
   - Nested `OrganizationMember` (OWNER role)
   - `subscriptionTier`: checks `unlock_tiers` feature flag -> ENTERPRISE if true, else FREE
   - `usageBasedBillingEnabled: true` (all new signups)
   - `featureFlags: { allow_expensive_models: true }`
   - Connect workspace to org
8. Create Stripe customer via `createStripeCustomerForOrganization()`
9. If FREE tier: create FREE Stripe subscription via `ensureFreeSubscriptionForOrganization()`
10. Send Slack notification via `notifySlackOfNewUser()`
11. Add contact to ActiveCampaign ESP via `addContactToESP()`
12. Track signup event via `trackSignup()`

#### `createStripeCustomerForOrganization()` - Stripe Customer Creation
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/customer.ts`
- Creates a Stripe customer with metadata: `{ organizationId, type: "organization", environment, createdAt }`
- Saves `stripeCustomerId` (or `stripeSandboxCustomerId`) to Organization
- Non-blocking: catches errors and logs, does not fail signup

#### `ensureFreeSubscriptionForOrganization()` - FREE Subscription
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/customer.ts`
- Checks if org is FREE tier and has no subscription ID yet
- Creates a v2 Stripe subscription using `createV2Subscription()`
- Syncs notification alerts for the new customer
- Saves `stripeSubscriptionId` to Organization

#### `ensureOrganizationExists()` - Defensive Check
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/utils/ensureOrganization.ts`
- Called in post-login for ALL developers (not just new signups)
- If developer has no OrganizationMember, creates an Organization with all defaults
- Handles edge cases: DB restores, legacy users without orgs

### Signup Tracking & Analytics

#### Server Middleware: `signupTrackingMiddleware`
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/server-middleware/src/middleware/signupTracking.ts`
- Runs on every request before Next.js
- Captures `original_referrer` cookie (external referrers only, 24h TTL)
- Captures `signup_source` cookie (from `?source=appGenerator` or `?source=landingPage`)
- Captures UTM parameters as first-touch cookies (30-day TTL): `utm_source`, `utm_medium`, `utm_campaign`, `ref`, `original_referrer`

#### Acquisition Source Format
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/acquisition-sources.ts`
- Format: `{referral_source}:{auth_method}`
- Examples: `"direct:email_password"`, `"app_generator:google_oauth"`, `"workspace_invite:microsoft_oauth"`
- Referral sources: `direct`, `app_generator`, `landing_page`, `marketplace`, `workspace_invite`, `app_duplication`
- Auth methods: `email_password`, `google_oauth`, `microsoft_oauth`

### Authentication / NextAuth Configuration
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/auth.ts`
- **Session strategy**: JWT (not database sessions)
- **Cookie names**: `next-auth.session-token`, `next-auth.callback-url`, `next-auth.csrf-token`
- **Secret**: `NEXTAUTH_SECRET` or `AUTH_SECRET` env var
- **Pages**: signIn: `/auth/login`, newUser: `/auth/signup`, error: `/auth/error`

#### Credential Providers:
1. **`credentials`** - Email/password login. Validates `emailHasBeenVerified`, bcrypt compare
2. **`magic-link`** - Token-based verification. Validates token + expiry, marks email verified
3. **`invite-token`** - Workspace/org invite acceptance with password
4. **`super-admin`** - Impersonation via `SUPER_ADMIN_PASSWORD` env var
5. **`stripe-checkout`** - Auto-login after Stripe checkout session

#### OAuth Providers:
1. **Google** - via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
2. **Microsoft Entra ID** - via `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET`, optional tenant lock via `AZURE_AD_TENANT_ID`

### Email Sending

#### OTP Email
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmail.ts`
- Uses SMTP via nodemailer (`shared-utils-server/src/smtpClient.ts`)
- Env vars: `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_USERNAME`, `SMTP_PASSWORD`
- From: `SMTP_FROM_NAME` (default company name) / `SMTP_FROM_EMAIL` (default `noreply@chipp.ai`)
- Subject: `"Your {companyName} verification code"`
- HTML template with brand color accent border, 6-digit code display
- Template location: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailTemplate.ts`

#### Magic Link Email
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendConfirmationEmail.ts`
- Plain text email with magic link URL
- URL format: `{BASE_URL}/email-confirmation?token={token}&email={email}&next={next}`
- Token: 20 random hex bytes, expires in 1 hour

#### SMTP Client
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/smtpClient.ts`
- Uses nodemailer with TLS (secure: true)
- Port 465 default

### OTP Utilities
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/auth/otpUtils.ts`
- `generateOTP()`: `crypto.randomInt(100000, 999999).toString()` -- 6 digits
- `validateEmailForOtp()`: blocks `+` in email, basic format validation
- `createOtpExpiration()`: 10 minutes from now (default)
- `validateOtpRecord()`: checks existence, code match, expiry
- `sanitizeOtpCode()`: strips non-digit characters

### OTP Feature Flag
- Feature flag: `enable_OTP` (stored in `FEATURE_FLAGS` table)
- When enabled: signup returns `{requiresOtp: true}` instead of creating user immediately
- When disabled: traditional flow (create user, send magic link for verification)
- **Important**: OTP is checked both server-side (API routes) and client-side (fetches `/api/featureFlags`)

## UI/UX Patterns

### Signup Page (`/auth/signup`)
- **Server component**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/page.tsx`
- **Client component**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/SignupClient.tsx`

#### Layout:
- Two-column layout on large screens
- Left: signup form (max-width 325px, centered)
- Right: yellow (bg-yellow-300) panel with testimonials, SVG illustrations (Chipp branding only, hidden when whitelabeled)

#### Form Flow (Progressive Disclosure):
1. **Initial state**: Shows Google/Microsoft OAuth buttons + email input + "Continue with email" button
2. **After email entered**: OAuth buttons animate away (framer-motion), password + confirm password fields slide in
3. **After form submit**: If OTP enabled, shows OTP verification screen; otherwise creates account and signs in
4. **OTP screen**: 6 individual digit inputs with auto-advance, paste support, backspace navigation; resend cooldown (60s); "Back to signup" button

#### Form Fields Collected:
- `email` (required, validated with regex, `+` blocked)
- `password` (required)
- `confirmPassword` (required, must match password)
- `referralId` (from Rewardful, captured automatically)
- `startingApplicationId` (from URL param, for app generator flow)

#### Validations:
- Email regex: `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`
- `+` character blocked in email
- Domain intelligence check (non-blocking, notifies Slack of suspicious domains)
- Domain validation (for whitelabel installs with restricted domains)
- Passwords must match
- OTP: 6 digits, expires in 10 minutes

#### White-label Support:
- Company logo replaces Chipp logo
- Company name in welcome text
- Right panel with testimonials hidden
- Font changes: `font-serif` -> `font-sans` in whitelabel mode

#### Special Entry Points:
- **App Generator flow**: `?d={encoded_data}&source=appGenerator` -- saves data to localStorage, redirects to `/create-app-from-landing` after signup
- **Invite flow**: `?inviteToken={token}` -- processes workspace/org invite after account creation
- **Next redirect**: `?next={url}` -- custom redirect after signup

### Login Page (`/auth/login`)
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/login/page.tsx`
- Email + password form
- Google and Microsoft OAuth buttons
- Link to forgot-password
- Link to signup page
- After successful credentials login: redirect to `/api/developer/post-login`

### Email Confirmation Page (`/email-confirmation`)
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/email-confirmation/page.tsx`
- Auto-signs in via `signIn("magic-link", { token })` on page load
- Shows "One moment please" / "Signing in" while processing
- On error: shows error message and "Request another signin link" button
- Redirects to post-login handler on success

### Post-Signup Onboarding

#### Onboarding V1 (Legacy)
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding/onboardingFlow.ts`
- 2 steps: `profile` -> `templates`

#### Onboarding V2 (Current)
- **Location**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/onboardingV2Flow.ts`
- 4 steps: `build` -> `train` -> `share` -> `unlock`
- Build: Choose template (Website Assistant, Support Agent, Lead Qualifier) or "Build Your Own"
- Train: Add knowledge (Website, Files, Integrations sub-steps)
- Share: Get sharing link/embed code
- Unlock: Pricing plans (Pro $29/mo, Team $99/mo, Business $299/mo)

#### Onboarding Gating:
- Only triggered if `isNewSignup=true` AND `!hasCompletedOnboarding` AND not whitelabeled AND not `skipOnboarding`
- Skipped for app generator flow (sets `hasCompletedOnboarding: true` and auto-generates username)

## Configuration & Constants

### Environment Variables Required for Signup

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | JWT signing secret |
| `AUTH_URL` / `NEXTAUTH_URL` | Base URL for redirects |
| `BASE_URL` | Base URL for magic link generation |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `AZURE_AD_CLIENT_ID` | Microsoft OAuth |
| `AZURE_AD_CLIENT_SECRET` | Microsoft OAuth |
| `AZURE_AD_TENANT_ID` | Optional: restrict to single AD tenant |
| `SMTP_HOST` | Email server host |
| `SMTP_PORT` | Email server port (default 465) |
| `SMTP_USERNAME` | Email server auth |
| `SMTP_PASSWORD` | Email server auth |
| `SMTP_FROM_NAME` | Email sender name |
| `SMTP_FROM_EMAIL` | Email sender address |
| `STRIPE_CHIPP_KEY` | Stripe API key for customer creation |
| `WEBHOOK_URL_NEW_USER` | Slack webhook for signup notifications |
| `ACTIVECAMPAIGN_API_URL` | Marketing ESP |
| `ACTIVECAMPAIGN_API_KEY` | Marketing ESP |
| `SUPER_ADMIN_PASSWORD` | Super admin impersonation |
| `NEXT_PUBLIC_COMPANY_NAME` | White-label company name |
| `NEXT_PUBLIC_WHITELABELED` | White-label mode flag |

### Feature Flags
- `enable_OTP` -- toggles OTP verification vs magic link flow
- `unlock_tiers` -- if true, new signups get ENTERPRISE tier (for whitelabel)
- `allow_expensive_models` -- default true for all new orgs (in featureFlags JSON)

## Stripe/Billing Integration During Signup

### What Happens on Signup:
1. **Stripe Customer Created**: Every new organization gets a `stripeCustomerId` immediately
2. **FREE Subscription Created**: v2 Stripe subscription to FREE pricing plan
3. **Notification Alerts Synced**: Default low-credits alert at 50% of tier allowance

### Stripe API Details:
- API version: `2025-09-30.clover`
- Customer metadata: `{ organizationId, type: "organization", environment, createdAt }`
- Non-blocking: Stripe errors are caught and logged, signup continues

## Migration Recommendations

### Files to Reference
1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/utils/newUser.ts` -- Core user provisioning logic (MOST IMPORTANT)
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/auth.ts` -- Auth configuration and all credential providers
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/signup/route.ts` -- Signup API route
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/send-otp/route.ts` -- OTP sending
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/verify-otp/route.ts` -- OTP verification
6. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/developer/post-login/route.ts` -- Post-login provisioning
7. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/SignupClient.tsx` -- Signup UI
8. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/stripe/customer.ts` -- Stripe customer creation
9. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/auth/otpUtils.ts` -- OTP generation/validation
10. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmail.ts` -- OTP email sending
11. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailTemplate.ts` -- OTP email template
12. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/acquisition-sources.ts` -- Acquisition tracking constants

### Key Differences to Consider

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Auth library | NextAuth v5 | Custom JWT via Hono middleware |
| Session storage | JWT in cookies | JWT in cookies (already built) |
| Database ORM | Prisma (MySQL) | Kysely (PostgreSQL) |
| Frontend | React + Next.js | Svelte 5 SPA |
| API framework | Next.js API routes | Hono routes |
| Email | nodemailer SMTP | (needs implementation) |
| Password hashing | bcrypt | (likely bcrypt or argon2) |

### Critical Design Decisions for ChippDeno

1. **Consolidate OAuth + Email signup paths**: In ChippMono, the post-login route duplicates most of `newUser()` for OAuth signups. ChippDeno should use a single `provisionNewDeveloper()` function called from all signup paths.

2. **OTP as default**: ChippMono uses OTP behind a feature flag. ChippDeno could make OTP the default since it provides better security and email verification in one step.

3. **Workspace + Organization hierarchy**: ChippMono creates both a Workspace AND an Organization. These serve somewhat overlapping purposes. Consider whether ChippDeno needs both or can simplify.

4. **WorkspaceHQ**: Created during signup but mostly used for the marketplace/public workspace pages. May not be needed initially.

5. **DeveloperCredentials**: ChippMono has BOTH `Developer.password` and `DeveloperCredentials.password` (migration artifact). ChippDeno should use a clean single source.

6. **Stripe on signup**: Creating a Stripe customer + FREE subscription on signup is important for the usage-based billing model. The ChippDeno webhook handlers already expect organizations to have Stripe customer IDs.

### Implementation Order

1. **Database migration** -- Ensure `developers`, `workspaces`, `organizations`, `workspace_members`, `organization_members`, `developer_email_verification_otp` tables exist with the right columns
2. **Core provisioning service** -- `src/services/developer-provisioning.service.ts` with a single `provisionNewDeveloper()` function that creates all entities
3. **OTP service** -- `src/services/otp.service.ts` with generate, store, validate, delete
4. **Email service** -- `src/services/email.service.ts` with SMTP sending (or leverage existing transactional-email service)
5. **API routes** -- `POST /api/auth/signup`, `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`
6. **Signup UI** -- Svelte 5 signup page with progressive disclosure, OTP input
7. **OAuth integration** -- Google/Microsoft OAuth flows if needed
8. **Post-login middleware** -- Handle provisioning for OAuth users who don't exist yet
9. **Onboarding flow** -- Multi-step wizard after signup
10. **Notifications** -- Slack webhook, ESP integration

### White-Label Theming Considerations

| Source (React hardcoded) | Target (Svelte CSS variable) |
|--------------------------|------------------------------|
| `bg-black` (signup buttons) | `hsl(var(--primary))` |
| `bg-yellow-300` (right panel) | `var(--brand-yellow)` |
| `text-black` (OTP focus ring) | `hsl(var(--foreground))` |
| `border-black` (OTP filled) | `hsl(var(--foreground))` |
| `border-border` (OTP empty) | `hsl(var(--border))` |
| `text-muted-foreground` | `hsl(var(--muted-foreground))` |
| `bg-background` | `hsl(var(--background))` |
| `font-serif` (Chubbo heading) | `var(--font-heading)` |
| `font-sans` (whitelabel) | `var(--font-body)` |
| `#F9DB00` (brand yellow in OTP email) | `var(--brand-yellow)` |

## Related Features
- **OTP Authentication** -- already documented at `docs/migrations/otp-authentication.md` (covers all 3 OTP contexts)
- **Subscription Tiers/Billing** -- already migrated, see `docs/migrations/CHECKPOINT.json`
- **Stripe Webhooks** -- already migrated
- **Consumer Auth** -- separate from developer auth, uses different NextAuth config at `/w/chat/api/auth/`
- **Team Management / Invites** -- invite token handling in signup intersects with workspace/org invite system
- **Onboarding** -- separate feature, should be migrated after core signup works
