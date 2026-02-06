# Feature Migration Report: OTP Authentication System

## Executive Summary

- **What it does**: A 6-digit one-time password system used across three contexts: developer signup (chipp-admin), consumer/end-user email verification (w/chat), and landing page signup. OTPs are generated server-side, stored in the database with a 10-minute expiry, emailed via SMTP (nodemailer), and verified before account activation.
- **Complexity**: Medium - The core OTP logic is simple, but the system spans 3 separate user flows with different branding, email templates, and database tables.
- **Dependencies**: SMTP email service, feature flags system, i18n/localization, white-label branding (brand colors, app name, custom from-email), custom domain configuration.
- **Recommended approach**: ChippDeno already has the consumer OTP flow implemented (database, service, routes, UI). The main gaps are: (1) actual email sending (currently just `console.log`), (2) developer/builder OTP flow (not yet built), and (3) the HTML email template with brand customization.

## System Overview: Three Distinct OTP Contexts

ChippMono has OTP in three contexts, each with its own database table and flow:

### 1. Developer Signup OTP (chipp-admin)
- **Who**: App builders signing up for a Chipp account
- **Table**: `DeveloperEmailVerificationOtp` (email unique)
- **Feature-flagged**: `ENABLE_OTP` flag must be enabled
- **Branding**: Chipp-branded (yellow `#F9DB00` accent)
- **From email**: `SMTP_FROM_EMAIL` env var (default: `noreply@chipp.ai`)
- **Flow**: Signup -> API returns `{requiresOtp: true}` -> send-otp -> verify-otp -> create account -> auto-login

### 2. Consumer Email Verification OTP (w/chat)
- **Who**: End-users of published chat applications
- **Table**: `ConsumerEmailVerificationOtp` (email+applicationId unique)
- **Always enabled**: No feature flag check
- **Branding**: White-labeled per application (app name, brand color, custom from-email via custom domain)
- **From email**: Derived from custom domain config or fallback `info@chipp.ai`
- **Flow**: Signup creates user (unverified) -> send-otp -> verify-otp -> mark `emailHasBeenVerified=true` -> auto-login

### 3. Landing Page OTP (chipp-landing)
- **Who**: Users signing up from the marketing site
- **Proxied**: Landing page forwards requests to chipp-admin's `/api/auth/send-otp` and `/api/auth/verify-otp`
- **No independent logic**: Pure proxy pattern

## Data Model

### Database Tables (ChippMono - MySQL via Prisma)

**`DeveloperEmailVerificationOtp`** - For builder/developer signups

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | Primary key |
| `email` | String | **Unique** - one OTP per email |
| `otpCode` | String | 6-digit numeric code |
| `expiresAt` | DateTime | Set to `now() + 10 minutes` |
| `createdAt` | DateTime | Auto-set |

Indexes: `email`, `expiresAt`

**`ConsumerEmailVerificationOtp`** - For end-user/consumer signups

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | Primary key |
| `email` | String | Part of unique composite |
| `otpCode` | String | 6-digit numeric code |
| `expiresAt` | DateTime | Set to `now() + 10 minutes` |
| `applicationId` | Int | Part of unique composite |
| `createdAt` | DateTime | Auto-set |

Indexes: `email`, `expiresAt`. Unique constraint: `(email, applicationId)`

### Database Tables (ChippDeno - PostgreSQL via Kysely)

**`app.consumer_otps`** - Already exists in migration `013_add_consumer_auth.sql`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key, auto-generated |
| `email` | VARCHAR(255) | Not unique alone |
| `application_id` | UUID | FK to `app.applications(id)` ON DELETE CASCADE |
| `otp_code` | VARCHAR(6) | 6-digit numeric code |
| `expires_at` | TIMESTAMPTZ | Set to `now() + 10 minutes` |
| `attempts` | INTEGER | Default 0, max 5 attempts (ChippDeno improvement) |
| `created_at` | TIMESTAMPTZ | Auto-set |

Indexes: `(application_id, email)`, `(expires_at)`

**Note**: ChippDeno does NOT have a `developer_email_verification_otps` table yet. It would need one if developer OTP signup is implemented.

### Related Consumer Fields

The `Consumer` (ChippMono) / `app.consumers` (ChippDeno) table has these auth-related fields:

| ChippMono Field | ChippDeno Field | Purpose |
|-----------------|-----------------|---------|
| `emailHasBeenVerified` (Boolean) | `email_verified` (Boolean) | Whether email was OTP/magic-link verified |
| `magicLinkToken` (String?) | `magic_link_token` (VARCHAR) | Token for magic link auth |
| `magicLinkTokenExpiry` (DateTime?) | `magic_link_expiry` (TIMESTAMPTZ) | Expiry for magic link |
| `resetToken` (String?) | `reset_token` (VARCHAR) | Password reset token |
| `resetTokenExpiry` (DateTime?) | `reset_token_expiry` (TIMESTAMPTZ) | Password reset expiry |
| `password` (String) | `password_hash` (VARCHAR) | bcrypt-hashed password |

### Schema File Locations

- ChippMono Prisma schema: `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` (lines 2487-2513 for OTP models)
- ChippDeno migration: `/Users/hunterhodnett/code/chipp-deno/db/migrations/013_add_consumer_auth.sql` (lines 60-71 for consumer_otps)
- ChippDeno schema types: `/Users/hunterhodnett/code/chipp-deno/db/schema.ts`

## OTP Generation and Verification Logic

### Core Utility: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/auth/otpUtils.ts`

```typescript
// Generate 6-digit OTP using crypto.randomInt (cryptographically secure)
export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Validate email - blocks '+' addresses to prevent abuse
export function validateEmailForOtp(email: string): void {
  if (!email) throw new Error("Email is required");
  if (email.includes("+")) throw new Error("Email addresses with '+' are not allowed");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new Error("Invalid email format");
}

// Create expiration date (default 10 minutes)
export function createOtpExpiration(minutesFromNow: number = 10): Date {
  return new Date(Date.now() + minutesFromNow * 60 * 1000);
}

// Validate OTP record against provided code
export function validateOtpRecord(
  otpRecord: { otpCode: string; expiresAt: Date } | null,
  providedCode: string
): OtpValidationResult {
  if (!otpRecord) return { isValid: false, error: "Invalid or expired OTP code" };
  if (otpRecord.otpCode !== providedCode) return { isValid: false, error: "Invalid OTP code" };
  if (new Date() > otpRecord.expiresAt) return { isValid: false, error: "OTP code has expired" };
  return { isValid: true };
}

// Sanitize OTP input (digits only)
export function sanitizeOtpCode(otpCode: string): string {
  return String(otpCode).replace(/[^\d]/g, "");
}
```

### ChippDeno Equivalent: `/Users/hunterhodnett/code/chipp-deno/src/services/consumer-auth.service.ts`

ChippDeno already has equivalent logic with one improvement -- an **attempt counter** (max 5 attempts per OTP):

```typescript
// Generate OTP using Web Crypto API (Deno-compatible)
function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 900000 + 100000);
}

// Constants
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
```

## Email Sending Infrastructure

### SMTP Client: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/smtpClient.ts`

ChippMono uses **nodemailer** with SMTP:

```typescript
import nodemailer from "nodemailer";

const smtpClient = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
  secure: true,
});
```

**Environment variables needed**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`

### Email Sending Functions

**Developer OTP Email**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmail.ts`

```typescript
async function sendOtpEmail({ toEmail, otpCode }) {
  const safeOtpCode = String(otpCode).replace(/[^\d]/g, "");
  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "Chipp";
  const fromName = process.env.SMTP_FROM_NAME || companyName;
  const fromEmail = process.env.SMTP_FROM_EMAIL || "noreply@chipp.ai";

  const emailParams = {
    otpCode: safeOtpCode,
    appName: companyName,
    verificationTitle: `Welcome to ${companyName}!`,
    verificationInstruction: "Enter this verification code to complete your signup:",
    expiryMessage: "This code will expire in 10 minutes",
    ignoreMessage: "If you didn't request this code, please ignore this email.",
    brandColor: "#F9DB00", // Chipp Primary yellow
  };

  const msg = {
    to: toEmail,
    from: `"${fromName}" <${fromEmail}>`,
    subject: `Your ${companyName} verification code`,
    text: generateOtpEmailText(emailParams),
    html: generateOtpEmailHtml(emailParams),
  };

  await smtpClient.sendMail(msg);
}
```

**Consumer/Chat OTP Email**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailForChat.ts`

This version accepts per-app branding:

```typescript
async function sendOtpEmailForChat({ toEmail, otpCode, appName, fromEmail, strings, brandColor }) {
  const safeOtpCode = String(otpCode).replace(/[^\d]/g, "");
  const emailParams = {
    otpCode: safeOtpCode,
    appName: appName,
    verificationTitle: strings.otp_email_subject(appName),
    verificationInstruction: strings.enter_6_digit_code_email,
    expiryMessage: strings.otp_email_expiry_message,
    ignoreMessage: strings.otp_email_ignore_message,
    brandColor: brandColor,
  };

  const msg = {
    to: toEmail,
    from: `"${appName}" <${fromEmail}>`,
    subject: strings.otp_email_subject(appName),
    text: generateOtpEmailText(emailParams),
    html: generateOtpEmailHtml(emailParams),
  };

  await smtpClient.sendMail(msg);
}
```

### Custom From Email Resolution: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/utils/getFromEmailFromBaseUrl.ts`

```typescript
export default async function getFromEmailFromBaseUrl(baseUrl: string) {
  let fromEmail = "info@chipp.ai";

  const baseUrlWithoutProtocol = baseUrl.replace(/(^\w+:|^)\/\//, "");
  const customDomainRecord = await prisma.applicationCustomDomain.findFirst({
    where: { domain: baseUrlWithoutProtocol, customEmailVerified: true },
    select: { id: true, customEmail: true },
  });

  if (customDomainRecord) {
    fromEmail = customDomainRecord.customEmail || "info@chipp.ai";
  }

  return fromEmail;
}
```

### HTML Email Template: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailTemplate.ts`

The template generates an HTML email with:
- Responsive design (media query for mobile at 600px)
- White background OTP box with brand-color border
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- Brand color used ONLY as a 2px border accent (not background) for email client compatibility
- Text is always `#111111` on white for legibility
- Footer with copyright and app name

Key template interface:
```typescript
export interface OtpEmailTemplateParams {
  otpCode: string;
  appName: string;
  verificationTitle: string;
  verificationInstruction: string;
  expiryMessage: string;
  ignoreMessage: string;
  brandColor?: string;
}
```

## White-Label / Branding Aspects

### Consumer OTP (per-app branding)

When sending OTP for consumer chat auth, the system customizes:

1. **App name**: Used in email subject, title, and footer
2. **Brand color**: From `application.brandStyles?.primaryColor` or `applicationBrandStyles?.primaryColor` (fallback `#000000`)
3. **From email**: Custom domain email if verified (`applicationCustomDomain.customEmail`), otherwise `info@chipp.ai`
4. **Language/i18n**: All text is localized via `STRINGS[application.language]`
5. **From name**: Set to the application name

### Developer OTP (Chipp-branded)

Developer OTP is always Chipp-branded:
- From: `"Chipp" <noreply@chipp.ai>` (configurable via `SMTP_FROM_NAME`/`SMTP_FROM_EMAIL` env vars)
- Brand color: `#F9DB00` (Chipp yellow)
- App name: `process.env.NEXT_PUBLIC_COMPANY_NAME || "Chipp"` (supports white-label instances)

### i18n Strings for OTP

From `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/i18n.ts`:

```typescript
verify_your_email: "Verify your email",
verification_code_sent_to: (email) => `We've sent a verification code to ${email}`,
enter_6_digit_code: "Enter the 6-digit code we sent to your email",
enter_6_digit_code_email: "Please use this 6-digit verification code:",
verify_code: "Verify Code",
resend_verification_code: "Resend verification code",
resend_available_in_seconds: (seconds) => `Resend available in ${seconds} seconds`,
verification_code_sent: "Verification code sent!",
otp_email_subject: (appName) => `Your ${appName} verification code`,
otp_email_body: (otpCode) => `Your verification code is: ${otpCode}`,
otp_email_expiry_message: "This code will expire in 10 minutes.",
otp_email_ignore_message: "If you didn't request this code, please ignore this email.",
your_information_is_secure: "Your information is secure",
```

Multiple languages are supported (English, Spanish, Portuguese, French, German, Italian, etc.).

## API Endpoints

### ChippMono Endpoints

#### Developer Signup Flow
| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/auth/signup` | POST | Create account; if OTP enabled, returns `{requiresOtp: true}` | `apps/chipp-admin/app/api/auth/signup/route.ts` |
| `/api/auth/send-otp` | POST | Generate OTP, store in DB, send email | `apps/chipp-admin/app/api/auth/send-otp/route.ts` |
| `/api/auth/verify-otp` | POST | Verify OTP, create account, delete OTP record | `apps/chipp-admin/app/api/auth/verify-otp/route.ts` |
| `/api/auth/magic-link` | POST | Send magic link email (alternative to OTP) | `apps/chipp-admin/app/api/auth/magic-link/route.ts` |

#### Consumer Chat Auth Flow
| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/w/chat/api/auth/signup?appNameId=X` | POST | Create consumer (unverified) | `apps/chipp-admin/app/w/chat/api/auth/signup/route.ts` |
| `/w/chat/api/auth/send-otp?appNameId=X` | POST | Send OTP with app branding | `apps/chipp-admin/app/w/chat/api/auth/send-otp/route.ts` |
| `/w/chat/api/auth/verify-otp?appNameId=X` | POST | Verify OTP, set emailHasBeenVerified=true | `apps/chipp-admin/app/w/chat/api/auth/verify-otp/route.ts` |
| `/w/chat/api/auth/magic-link?appNameId=X` | POST | Send magic link with app branding | `apps/chipp-admin/app/w/chat/api/auth/magic-link/route.ts` |
| `/w/chat/api/auth/reset-password` | POST | Reset password with token | `apps/chipp-admin/app/w/chat/api/auth/reset-password/route.ts` |

#### Landing Page Proxies
| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/auth/send-otp` | POST | Proxies to chipp-admin | `apps/chipp-landing/app/api/auth/send-otp/route.ts` |
| `/api/auth/verify-otp` | POST | Proxies to chipp-admin | `apps/chipp-landing/app/api/auth/verify-otp/route.ts` |

### ChippDeno Endpoints (Already Implemented)

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/consumer/:appNameId/auth/signup` | POST | Create consumer, generate OTP | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/verify` | POST | Verify OTP, create session | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/resend-otp` | POST | Regenerate OTP | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/login` | POST | Email/password login | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/magic-link` | POST | Request magic link | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/magic-link/verify` | POST | Verify magic link token | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/password-reset` | POST | Request password reset | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/password-reset/confirm` | POST | Reset password | `src/api/routes/consumer/index.ts` |
| `/consumer/:appNameId/auth/logout` | POST | End session | `src/api/routes/consumer/index.ts` |

## UX Flow Details

### Developer Signup with OTP (chipp-admin)

1. User navigates to `/auth/signup`
2. Sees Google/Microsoft OAuth buttons + "Continue with email" option
3. Enters email -> password fields reveal with animation (Framer Motion)
4. Enters password + confirm password
5. Clicks "Continue with email"
6. **Backend**: POST `/api/auth/signup` -- checks `ENABLE_OTP` flag
   - If OTP disabled: creates account immediately, auto-signs-in
   - If OTP enabled: returns `{requiresOtp: true}`, does NOT create account yet
7. **Frontend**: Sends POST `/api/auth/send-otp` with email
8. UI transitions to OTP verification view (AnimatePresence transition)
9. Shows 6 individual digit input boxes with auto-focus-next behavior
10. User enters 6-digit code (or pastes -- paste handler distributes digits)
11. Clicks "Verify and Continue"
12. **Backend**: POST `/api/auth/verify-otp` with email, otpCode, password
    - Validates OTP against DB record
    - Checks expiry (10 minutes)
    - Deletes OTP record
    - Creates user account via `newUser()`
    - Checks email domain intelligence (suspicious domain detection, notifies Slack)
13. **Frontend**: Signs in via NextAuth `signIn("credentials", ...)`, redirects to post-login
14. Resend: 60-second cooldown timer, "Resend verification code" button

### Consumer Chat Signup with OTP (w/chat)

1. User navigates to `/w/chat/{appSlug}/signup`
2. Sees app logo, name, and "Welcome!" message
3. Enters email, password, confirm password
4. Clicks continue button (styled with app brand color gradient)
5. **Backend**: POST `/w/chat/api/auth/signup?appNameId=X`
   - Checks domain restriction (`signupsRestrictedToDomain`)
   - Creates consumer record with `emailHasBeenVerified: false`
   - If user exists but unverified, updates password
6. **Frontend**: Sends POST `/w/chat/api/auth/send-otp?appNameId=X`
7. UI transitions to OTP verification (same page, conditional rendering)
8. Shows 6 individual digit inputs with brand-color border highlight
9. User enters code
10. Clicks verify button
11. **Backend**: POST `/w/chat/api/auth/verify-otp?appNameId=X`
    - Validates OTP against `ConsumerEmailVerificationOtp` table
    - Deletes OTP record
    - Sets `emailHasBeenVerified: true` on consumer
12. **Frontend**: Signs in via NextAuth `signIn("credentials", ...)`, redirects to chat or custom redirect URL
13. Resend: 60-second cooldown, brand-colored countdown display

### Error States

- **Expired OTP**: "OTP code has expired" -- user must request a new one
- **Invalid OTP**: "Invalid OTP code" -- user can retry (ChippDeno adds max 5 attempts)
- **Email with '+'**: Blocked client-side and server-side
- **Email already exists** (developer): "Account already exists. Please sign in."
- **Email already verified** (consumer): Redirected to login
- **Feature flag disabled** (developer): "OTP verification is not enabled"
- **Application not found** (consumer): 400 error

## Feature Flags

ChippMono uses a `FeatureFlag` table with a flag `enable_OTP` to control developer OTP:

```typescript
const FEATURE_FLAGS = {
  ENABLE_OTP: "enable_OTP",
  // ... other flags
};

// Usage:
const isOtpEnabled = await isFeatureFlagEnabled(FEATURE_FLAGS.ENABLE_OTP);
```

Consumer OTP has NO feature flag -- it is always enabled for consumer signups.

**Migration note for ChippDeno**: ChippDeno does not use this feature flag for consumer auth (correctly, since it matches ChippMono behavior). If developer signup OTP is needed, a similar flag mechanism would be required.

## CSS / Styling Details

### Developer Signup OTP Input (React/ChippMono)

```tsx
// 6 individual input boxes
<div className="flex gap-2 justify-center px-2">
  {[0, 1, 2, 3, 4, 5].map((index) => (
    <input
      type="text"
      inputMode="numeric"
      maxLength={1}
      data-otp-index={index}
      className={cn(
        "w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-semibold rounded-lg transition-all duration-200",
        "bg-background border-2",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black",
        otpCode[index] ? "border-black" : "border-border",
        "placeholder-muted-foreground"
      )}
      placeholder="0"
    />
  ))}
</div>
```

### Consumer Signup OTP Input (React/ChippMono)

Uses app brand color for active state:
```tsx
<input
  className={clsx(
    "w-full h-14 sm:h-16 text-center text-xl sm:text-2xl font-semibold rounded-xl transition-all duration-200",
    "bg-background/90 backdrop-blur-sm border-2",
    "focus:outline-none focus:ring-2 focus:ring-offset-2",
  )}
  style={{
    borderColor: otpCode[index] ? appPrimaryColor : undefined,
    boxShadow: otpCode[index] ? `0 0 0 3px ${appPrimaryColor}20` : undefined,
  }}
/>
```

### ChippDeno Consumer Verify OTP (Svelte - Already Exists)

Uses CSS custom properties for theme support:
```svelte
<input
  id="otp"
  type="text"
  inputmode="numeric"
  pattern="[0-9]*"
  maxlength="6"
  class="otp-input"
  autocomplete="one-time-code"
/>

<style>
  .otp-input {
    text-align: center;
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    letter-spacing: 0.5em;
    padding: var(--space-4);
  }
  .submit-button {
    background: var(--consumer-primary, hsl(var(--primary)));
    color: hsl(var(--primary-foreground));
  }
</style>
```

### Color Mapping for White-Label

| ChippMono Source | ChippDeno CSS Variable |
|-----------------|----------------------|
| `#F9DB00` (Chipp yellow brand color) | `var(--brand-yellow)` |
| `#111111` / `#1a1a1a` (title text) | `hsl(var(--foreground))` |
| `#666666` (body text) | `hsl(var(--muted-foreground))` |
| `#999999` (hint text) | `hsl(var(--muted-foreground))` |
| `#ffffff` (card background) | `hsl(var(--card))` or `hsl(var(--background))` |
| `border-border` / `border-2` | `hsl(var(--border))` |
| `appPrimaryColor` (dynamic) | `var(--consumer-primary, hsl(var(--primary)))` |
| `bg-black` (buttons) | `hsl(var(--primary))` |
| `font-family: system` | `var(--font-body)` |
| `focus:ring-black` | `focus ring with hsl(var(--ring))` |

## Configuration & Constants

### Environment Variables (ChippMono)

| Variable | Purpose | Default |
|----------|---------|---------|
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | `465` |
| `SMTP_USERNAME` | SMTP auth username | - |
| `SMTP_PASSWORD` | SMTP auth password | - |
| `SMTP_FROM_NAME` | Display name for from address | `NEXT_PUBLIC_COMPANY_NAME` or `"Chipp"` |
| `SMTP_FROM_EMAIL` | From email address | `noreply@chipp.ai` |
| `NEXT_PUBLIC_COMPANY_NAME` | Company name for branding | `"Chipp"` |

### Constants

| Constant | Value | Location |
|----------|-------|----------|
| OTP length | 6 digits | `otpUtils.ts`, `consumer-auth.service.ts` |
| OTP expiry | 10 minutes | `otpUtils.ts`, `consumer-auth.service.ts` |
| Resend cooldown | 60 seconds | Client-side only |
| Max attempts | 5 (ChippDeno only) | `consumer-auth.service.ts` |
| Magic link expiry (developer) | 1 hour | `auth/magic-link/route.ts` |
| Magic link expiry (consumer) | 1 month | `w/chat/api/auth/magic-link/route.ts` |
| Session expiry | 30 days | `consumer-auth.service.ts` |

## Current State: ChippDeno vs ChippMono Gap Analysis

### What ChippDeno Already Has (Consumer Auth)

- Database: `app.consumer_otps` table with attempts tracking
- Service: `consumer-auth.service.ts` with `signup()`, `createOtp()`, `verifyOtp()`, `login()`, `requestMagicLink()`, `verifyMagicLink()`, `requestPasswordReset()`, `resetPassword()`
- API Routes: All consumer auth routes in `/consumer/:appNameId/auth/*`
- UI: `ConsumerSignup.svelte`, `ConsumerVerify.svelte`, `ConsumerLogin.svelte`
- Store: `consumerAuth.ts` with all client-side methods
- Tests: `consumer_auth_test.ts` with comprehensive test coverage

### What ChippDeno is MISSING

1. **Email Sending**: OTP codes are logged to console (`console.log`), NOT emailed
   - All 3 locations that generate OTPs/magic-links/reset-tokens just log them
   - Need: SMTP client or email service (nodemailer, AWS SES, SendGrid, Resend, etc.)
   - Need: HTML email template (can port from ChippMono)
   - Need: Custom from-email resolution for white-label domains

2. **Developer/Builder OTP Signup**: Not implemented at all
   - ChippDeno currently uses session-based auth for developers
   - The `/auth/signup` and `/auth/login` flows exist but do not include OTP
   - Would need: `developer_email_verification_otps` table, routes, UI

3. **6-Digit Individual Input Boxes**: ChippDeno consumer verify page uses a single wide input field instead of the 6 individual boxes like ChippMono
   - ChippMono has auto-focus-next, paste distribution, backspace-previous behavior
   - ChippDeno has a simpler single input with letter-spacing

4. **Feature Flag Integration**: No `ENABLE_OTP` flag mechanism for developer signups

5. **i18n Support**: ChippDeno does not yet have the full i18n system for consumer auth text

6. **Suspicious Email Domain Detection**: ChippMono's `checkEmailDomainIntelligence()` and Slack notifications for suspicious signups are not in ChippDeno

## Migration Recommendations

### Priority 1: Email Sending Service

This is the most critical gap. Without it, OTPs are useless in production.

**Files to reference:**
- `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/smtpClient.ts` - SMTP transport config
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmail.ts` - Developer email
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailForChat.ts` - Consumer email with branding
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailTemplate.ts` - HTML template

**Implementation in ChippDeno:**
1. Create `src/services/email.service.ts` with nodemailer or Deno-compatible SMTP library
2. Port the `generateOtpEmailHtml()` and `generateOtpEmailText()` template functions
3. Create `sendConsumerOtpEmail()` function that accepts `{ toEmail, otpCode, appName, fromEmail, brandColor }`
4. Wire into the consumer route handlers at `/consumer/:appNameId/auth/signup` and `resend-otp`
5. Add custom from-email resolution (query `app.application_custom_domains` for verified custom emails)

### Priority 2: Upgrade Consumer Verify UI

The ChippDeno `ConsumerVerify.svelte` works but uses a single input. Consider upgrading to 6 individual boxes for better UX.

**Files to reference:**
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/signup/SignupForm.tsx` lines 354-451 - Consumer OTP input with brand color
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/SignupClient.tsx` lines 509-618 - Developer OTP input

### Priority 3: Developer OTP Signup (if needed)

Only needed if the `ENABLE_OTP` feature flag behavior is desired for developer signups.

**Implementation order:**
1. Create `app.developer_email_verification_otps` database table
2. Add OTP generation to developer signup route
3. Add OTP verification route
4. Create developer signup UI with OTP step
5. Add feature flag support

### Key Differences to Consider

| Aspect | ChippMono | ChippDeno |
|--------|-----------|-----------|
| Runtime | Node.js | Deno |
| API framework | Next.js API Routes | Hono |
| UI framework | React + Framer Motion | Svelte 5 |
| ORM | Prisma (MySQL) | Kysely (PostgreSQL) |
| Auth sessions | NextAuth (JWT/cookie) | Custom cookie-based sessions |
| Email | nodemailer (SMTP) | TBD (need Deno-compatible solution) |
| Crypto | Node `crypto.randomInt()` | Web Crypto `crypto.getRandomValues()` |
| Password hashing | bcrypt (npm) | bcrypt via `jsr:@std/crypto` or similar |
| Validation | Manual | Zod schemas |

### Implementation Order

1. **Create email service** (`src/services/email.service.ts`)
2. **Port HTML email template** (inline styles, responsive, brand-color-aware)
3. **Wire email sending** into consumer auth routes (replace `console.log` calls)
4. **Add custom from-email resolution** (query custom domains table)
5. **Upgrade OTP input UI** (6-box input component in Svelte)
6. **(Optional) Developer OTP** - database migration, routes, UI

## Related Features

- **Magic Link Authentication** - Shares email infrastructure, consumer auth flow. File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/magic-link/route.ts`
- **Password Reset** - Also sends emails via SMTP. File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/reset-password/route.ts`
- **Custom Domains** - Determines from-email address for white-label. File: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/utils/getFromEmailFromBaseUrl.ts`
- **Email Domain Intelligence** - Suspicious signup detection. File: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/domains/utils/server.ts`
- **i18n/Localization** - All user-facing OTP strings. File: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/i18n.ts`
- **Feature Flags** - Controls developer OTP enablement. File: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/featureFlags.ts`
- **Stripe/Billing** - Not directly related to OTP.

## Appendix: Complete File Reference

### ChippMono Files

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/auth/otpUtils.ts` | Core OTP generation/validation utilities |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/smtpClient.ts` | Nodemailer SMTP transport |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmail.ts` | Developer OTP email sender |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailForChat.ts` | Consumer OTP email sender (white-label) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/auth/sendOtpEmailTemplate.ts` | HTML/text email templates |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/send-otp/route.ts` | Developer send-OTP API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/verify-otp/route.ts` | Developer verify-OTP API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/signup/route.ts` | Developer signup API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/auth/magic-link/route.ts` | Developer magic link API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/send-otp/route.ts` | Consumer send-OTP API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/verify-otp/route.ts` | Consumer verify-OTP API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/signup/route.ts` | Consumer signup API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/magic-link/route.ts` | Consumer magic link API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/reset-password/route.ts` | Consumer password reset API |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/auth/[...nextauth]/route.ts` | Consumer NextAuth config (credentials + magic-link providers) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/utils/getFromEmailFromBaseUrl.ts` | Custom domain email resolution |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/SignupClient.tsx` | Developer signup UI (with OTP) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/utils/otpHelpers.ts` | Client-side OTP helpers |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/signup/SignupForm.tsx` | Consumer signup UI (with OTP, white-labeled) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/email-confirmation/EmailConfirmation.tsx` | Magic link confirmation page |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/email-confirmation/page.tsx` | Developer magic link confirmation page |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/api/auth/send-otp/route.ts` | Landing page OTP proxy |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/api/auth/verify-otp/route.ts` | Landing page OTP verify proxy |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/signup-modal.tsx` | Landing page signup modal (with OTP) |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` | Database schema (OTP models at lines 2487-2513) |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/i18n.ts` | i18n strings for OTP |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/lib/utils/featureFlags.ts` | Feature flags (ENABLE_OTP) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/auth.ts` | Developer NextAuth config |

### ChippDeno Files (Already Exist)

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-deno/src/services/consumer-auth.service.ts` | Consumer auth service with OTP logic |
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/index.ts` | Consumer API routes |
| `/Users/hunterhodnett/code/chipp-deno/web/src/routes/consumer/ConsumerSignup.svelte` | Consumer signup page |
| `/Users/hunterhodnett/code/chipp-deno/web/src/routes/consumer/ConsumerVerify.svelte` | Consumer OTP verify page |
| `/Users/hunterhodnett/code/chipp-deno/web/src/routes/consumer/ConsumerLogin.svelte` | Consumer login page |
| `/Users/hunterhodnett/code/chipp-deno/web/src/stores/consumerAuth.ts` | Consumer auth store |
| `/Users/hunterhodnett/code/chipp-deno/db/migrations/013_add_consumer_auth.sql` | Consumer tables migration |
| `/Users/hunterhodnett/code/chipp-deno/src/__tests__/routes/consumer_auth_test.ts` | Consumer auth tests |
