# Feature Migration Report: App Generator Landing Flow ("Create App from Landing")

## Executive Summary
- **What it does**: A landing-page-to-app-creation pipeline where users describe an AI app idea, sign up/log in, then watch a multi-step progress animation ("dominoes order tracker") as the app is generated through a sequence of AI calls (name, logo, personality, conversation starters, welcome message, logo generation, splash screens, optional company knowledge). Ends with a confetti-celebration success screen.
- **Complexity**: Medium-High (multi-step orchestrated AI calls, cross-app data handoff, company email detection, SSE knowledge source ingestion, confetti/animations)
- **Dependencies**: OpenAI API (gpt-4.1 in ChippMono, gpt-4o-mini in ChippDeno), Application CRUD, email domain detection, website metadata scraping, knowledge source upload, canvas-confetti
- **ChippDeno status**: Already has a near-complete port. The Svelte components, store, API routes, and progress tracker are all implemented. Several gaps remain (see Migration Recommendations below).

## Data Flow: Landing to App Generator

### 1. Entry Point: Landing Page Prompt Generator

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/hero-section/content/prompt-generator.tsx`

The landing page has a `PromptGenerator` component with:
- A `<textarea>` where users describe their AI app idea (max 500 chars)
- 5 "popular use case" quick-fill buttons (Lead Qualifier, Demo Scheduler, ROI Calculator, Lead Magnet, Pipeline Bot)
- A "Generate" button

**On submit**, the prompt is encoded and handed off:

```typescript
// If logged in: direct redirect
const encodedPrompt = btoa(encodeURIComponent(prompt));
params.append("d", encodedPrompt);
params.append("source", "appGenerator");
window.location.href = `${appUrl}/create-app-from-landing?${params.toString()}`;

// If not logged in: show GetStartedModal
setShowGetStartedModal(true);
```

### 2. GetStartedModal (unauthenticated users)

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/get-started-modal.tsx`

Shown when non-logged-in user clicks Generate. Contains:
- Social proof (avatar images, "80,000+ AI apps created")
- CTA button linking to: `{mainAppUrl}/auth/signup?d={encodedPrompt}&source=appGenerator&original_referrer={cookie}`

### 3. Signup Page Handoff

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/page.tsx`

Server component checks: if already authenticated + has `d` param, immediately redirect to `/create-app-from-landing?d={d}&skipOnboarding=true`.

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/SignupClient.tsx` (lines 76-130)

Client component:
1. Stores `d` and `source=appGenerator` in localStorage as backup
2. Sets `postSignupUrl` to include `&source=appGenerator`
3. Sets `next` URL to `/create-app-from-landing?d={d}&skipOnboarding=true`
4. After successful signup/login, user is redirected to the create page

### 4. URL Parameters

| Parameter | Format | Purpose |
|-----------|--------|---------|
| `d` | Base64(encodeURIComponent(prompt)) | The user's app idea, encoded |
| `skipOnboarding` | `"true"` | Skip normal onboarding flow, go straight to generator |
| `source` | `"appGenerator"` | Identifies this as app generator flow |
| `original_referrer` | URL string | Landing page referrer tracking |

## Main Page: `/create-app-from-landing`

### Server Component (page.tsx)

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/page.tsx`

1. Checks authentication via `auth()` - redirects to login if not authenticated, preserving all query params
2. Fetches developer record from Prisma (id, email, username, activeWorkspaceId)
3. Passes developer info as props to client component

### Client Component (client.tsx)

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/client.tsx`

**Props received**: `userEmail`, `developerId`, `username`, `activeWorkspaceId`

**On mount** (useEffect):
1. Reads `d` param from URL
2. Decodes: `decodeURIComponent(atob(encodedData))`
3. If no `d` param, redirects to `/`
4. Calls `createApp(userPrompt, skipOnboarding)`

**Layout structure**:
```
<div className="min-h-screen bg-[#FCFBF7]">
  <dot-pattern-background />
  <chipp-logo (fixed top-left) />
  <content-container (max-w-3xl)>
    {!showSuccessScreen && <AppGenerationProgress items={stagesWithStatus} />}
    {showSuccessScreen && <SuccessScreen ... />}
  </content-container>
  <GradientStyles />
  {showCompanyWebsiteOffer && <CompanyWebsiteModal />}
</div>
```

## The Step Tracker: AppGenerationProgress

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.tsx`

This is the "dominoes order tracker" component. It displays a vertically scrolling list of task cards where:
- **Completed tasks** slide up and stay above
- **Active task** is sticky at the top with a glowing effect
- **Pending tasks** sit below, waiting
- **Fade overlays** at top and bottom create the appearance of items emerging from/disappearing into fog

### Visual Architecture

```
+------------------------------------------+
|  //////// FADE OVERLAY (top) /////////// |  <-- z-index: 200, gradient from #FCFBF7 to transparent
|                                          |
|  [v] Created Your App       Done   just  |  <-- Completed card (green check, bg-background/40)
|  [v] Designed Your Logo     Done   just  |  <-- Completed card
|                                          |
|  +======================================+|  <-- ACTIVE card (sticky top:0, z-index:10)
|  | [glow effect behind]                 ||  <-- blue-purple gradient glow, blur-lg, animate
|  | [shimmer sweeping across]            ||  <-- translateX(-100%) -> translateX(200%), 3s infinite
|  | (spinner) Building AI Personality    ||  <-- Loader2 spinning, green pulsing dot
|  |          In progress...              ||
|  +======================================+|
|                                          |
|  (emoji) Add Conversation Starters       |  <-- Pending card (bg-background/20, muted text)
|          Waiting...                      |
|                                          |
|  //////// FADE OVERLAY (bottom) /////// |  <-- z-index: 200, gradient from #FCFBF7 up
+------------------------------------------+
```

### Animation and CSS Details

#### Keyframe Animations

```css
/* Shimmer sweep across active card */
@keyframes shimmer {
  to { transform: translateX(200%); }
}

/* Glow pulsing on active card */
@keyframes gradient {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* Active card entrance */
@keyframes slide-in-from-bottom-2 {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Empty state fade */
@keyframes fade-in-50 {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

#### Active Card Glow Effect

```tsx
{/* Glow layer behind active card */}
<div className="absolute -inset-1 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400
  rounded-xl sm:rounded-2xl blur-lg sm:blur-xl opacity-70
  group-hover:opacity-100 transition-opacity animate-gradient" />
```

- Colors: blue-400 (#60a5fa) -> purple-400 (#a78bfa) -> blue-400 (#60a5fa)
- Blur: 12px mobile, 16px desktop
- Opacity pulses between 0.7 and 1.0 over 2s

#### Active Card Shimmer

```tsx
<div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite]
  bg-gradient-to-r from-transparent via-white/20 to-transparent" />
```

- Starts off-screen left (-100%), sweeps to 200% right
- 3s cycle, infinite repeat
- Semi-transparent white (20% opacity)

#### Green Pulsing Dot (on active card's icon)

```tsx
{/* Solid green dot */}
<div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1">
  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full" />
  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-400 rounded-full animate-ping" />
</div>
```

#### Scrollbar Hiding

```css
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
```

#### Auto-scrolling Behavior

The component auto-scrolls to center the active item in the viewport. When a task completes, the scroll position adjusts to push completed items up and center the newly active item. Uses `scrollTo({ behavior: "smooth" })`.

#### Fade Overlays

```tsx
{/* Top fade: from page bg to transparent */}
<div className="absolute top-0 left-0 right-0
  bg-gradient-to-b from-[#FCFBF7] via-[#FCFBF7]/80 via-[#FCFBF7]/30 to-transparent
  pointer-events-none h-[60px] sm:h-[80px]"
  style={{ zIndex: 200 }} />

{/* Bottom fade: from page bg up to transparent */}
<div className="absolute bottom-0 left-0 right-0
  bg-gradient-to-t from-[#FCFBF7] via-[#FCFBF7]/60 to-transparent
  pointer-events-none h-[80px] sm:h-[120px]"
  style={{ zIndex: 200 }} />
```

### Card States

| State | Background | Border | Icon | Text Color | Status Label |
|-------|-----------|--------|------|------------|-------------|
| **Completed** | `bg-background/40 backdrop-blur-sm` | `border-border/30` | Green gradient circle with white CheckCircle2 | `text-foreground` | "Done" (monospace) |
| **Active** | `bg-background/90 backdrop-blur-sm` + glow + shimmer | `border-border/50` + shadow-2xl | Spinner (Loader2) + green pulsing dot | `text-foreground` (semibold) | "In progress..." |
| **Pending** | `bg-background/20 backdrop-blur-sm` | `border-border/20` | Gray gradient circle with emoji | `text-muted-foreground` | "Up next" (hidden, shows on hover) |

### Card Dimensions

- Mobile: `min-h-[60px]`, padding `p-3`, rounded-xl, gap-3
- Desktop: `min-h-[100px]`, padding `p-5`, rounded-2xl, gap-4
- Icon wrapper: 32x32 mobile, 40x40 desktop
- Card margin: mb-2 mobile, mb-3 desktop

## Step Flow and API Calls

### Task Templates

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/stageUtils.ts`

7 base stages + 1 conditional:

| # | Task ID | Pending Name | Active Name | Completed Name | Icon |
|---|---------|-------------|-------------|---------------|------|
| 0 | `app-details` | Create Your App | Creating Your App | Created Your App | target emoji |
| 1 | `logo-description` | Design Your Logo | Designing Your Logo | Designed Your Logo | art emoji |
| 2 | `system-prompt` | Build AI Personality | Building AI Personality | Built AI Personality | brain emoji |
| 3 | `conversation-starters` | Add Conversation Starters | Adding Conversation Starters | Added Conversation Starters | speech emoji |
| 4 | `starting-message` | Craft Welcome Message | Crafting Welcome Message | Crafted Welcome Message | wave emoji |
| 5 | `logo-generation` | Generate Logo | Generating Logo | Generated Logo | sparkle emoji |
| 6 | `splash-screens` | Prepare Mobile Experience | Generating Mobile Experience | Mobile Experience Ready | mobile emoji |
| 7* | `company-knowledge` | Learn About Your Company | Learning About Your Company | Learned About Your Company | globe emoji |

*Step 7 only shown if user has a company email (not gmail/yahoo/etc.)

### Hook: useAppGeneration

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/hooks/useAppGeneration.ts`

Orchestrates the entire flow:

1. **Company email detection** (immediate, before any API calls)
   - Uses `detectCompanyDomain(email)` from `shared-utils/src/emailDomainDetection`
   - Checks against list of ~90 personal email domains (gmail, yahoo, hotmail, etc.)
   - If company email: adds company knowledge step, starts fetching website metadata

2. **Step 0: Generate App Details** (`/api/public/generate-app-details`)
   - Input: `{ userInput }`
   - Output: `{ appTitle, appDescription, primaryColor }`
   - Model: gpt-4.1 (ChippMono), gpt-4o-mini (ChippDeno)
   - Schema validation: title <= 30 chars, description <= 200 chars, valid hex color
   - Includes field regeneration if limits exceeded

3. **Step 1: Generate Logo Description** (`/api/public/generate-logo-description`)
   - Input: `{ userInput, appName, appDescription, primaryColor }`
   - Output: `{ logoDescription }`
   - Model: gpt-4.1
   - Delay: `LOGO_GENERATION_DELAY` (2000ms) before API call

4. **Step 2: Generate System Prompt** (`/api/public/generate-prompt`)
   - Input: `{ userInput }`
   - Output: `{ prompt }`
   - Model: gpt-4.1
   - Uses `promptGeneratorPrompt` constant (imported from builder constants in ChippMono)

5. **Step 3: Generate Conversation Starters** (`/api/public/generate-conversation-starters`)
   - Input: `{ userInput, appName, appDescription, systemPrompt }`
   - Output: `{ conversationStarters: string[4] }`
   - Model: gpt-4.1

6. **Step 4: Generate Starting Message** (`/api/public/generate-starting-message`)
   - Input: `{ userInput, appName, appDescription, systemPrompt }`
   - Output: `{ shouldHaveStartingMessage: boolean, startingMessage?: string }`
   - Model: gpt-4.1
   - Optional: failure is caught silently

7. **Step 5: Create Application** (`/api/applications` POST)
   - Input: `{ name, description, workspaceId, systemPrompt, suggestions, brandStyles, logoDescription, creationSource: "landing-generator", startingMessage }`
   - Creates the actual Application record in the database
   - Logo is generated server-side as part of application creation (from logoDescription)
   - Prefetches builder page route

8. **Step 6: Generate Splash Screens** (`/api/applications/{id}/splash-screens` POST)
   - Generates 10 PWA splash screen sizes
   - Has retry logic (2 attempts, exponential backoff)
   - 60-second timeout
   - Skips if default logo
   - Non-fatal: failure shows warning but continues

9. **Step 7 (conditional): Company Knowledge** - Shows modal offering to add company website
   - `CompanyWebsiteModal` appears
   - If accepted: calls `/api/upload/url?url={companyWebsite}&applicationId={id}&knowledgeSourceType=URL&crawlAllLinks=true`
   - Reads SSE stream for progress
   - Regenerates app facts after company knowledge added

10. **Completion**: Generate app facts, show success screen, trigger confetti

### Animation Timing Constants

```typescript
export const ANIMATION_TIMING = {
  STAGE_TRANSITION: 1500,        // ms between stages
  STAGE_ACTIVE_DURATION: 1000,   // ms a stage shows as active after completion
  STAGE_COMPLETED_HOLD: 2500,    // ms to hold final completed state
  LOGO_GENERATION_DELAY: 2000,   // ms delay before logo description API call
  CONFETTI_DELAY: 100,           // ms after success screen before first confetti burst
  CONFETTI_SECOND_BURST: 250,    // ms after first confetti for second burst
  CONFETTI_THIRD_BURST: 400,     // ms after first confetti for third burst
};
```

## Success Screen

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/SuccessScreen.tsx`

Uses `framer-motion` for animations (Svelte port uses `svelte/transition`).

### Elements
1. **Gradient glow** behind the card (matches app's primaryColor)
2. **App logo** with spring animation (scale 0 -> 1, rotate -10 -> 0)
3. **"Your new logo!" callout** - hand-drawn style tooltip with curved SVG arrow
4. **Title**: "Your AI Assistant is Ready!"
5. **Time badge**: "Created in {seconds} seconds" with green checkmark
6. **Features card**: "{AppName} is designed to:" + 3-4 AI-generated facts with colored bullet dots
7. **CTA button**: "Meet {AppName}" with gradient background matching primaryColor, bouncing arrow, glow effect
8. **Helper text**: "You can customize everything in the builder"

### Confetti

Uses `canvas-confetti` library:
- 3 bursts at 100ms, 250ms, 400ms delays
- Colors: app's primaryColor + gold, hot pink, turquoise, tomato, pale green
- Burst 1: center (100 particles)
- Burst 2: from left (50 particles, angle 60)
- Burst 3: from right (50 particles, angle 120)

## Company Website Modal

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/CompanyWebsiteModal.tsx`

- Blurred backdrop (`backdrop-blur-md bg-background/30`)
- Building2 icon (blue circle)
- Shows company name and website URL
- Fetches and displays company favicon
- Two buttons: "Skip for now" (outline) and "Add Website" (solid black)
- Loading state with Loader2 spinner during knowledge source addition

## Color Utilities

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/colorUtils.ts`

```typescript
// Adjusts hex color by amount (positive=lighter, negative=darker)
adjustColor(hex: string, amount: number): string

// Generates gradient colors from primary color
getButtonGradientColors(primaryColor?: string): { from, to, glow }
// Default fallback: purple-600 (#9333ea) to pink-600 (#ec4899)
```

## Email Domain Detection

**File**: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/emailDomainDetection.ts`

~90 personal email domains (gmail, yahoo, hotmail, outlook, icloud, protonmail, etc. + regional + ISP + disposable). If email domain is NOT in this list, it's considered a company email. Extracts company name by capitalizing the domain prefix.

## API Endpoints Summary

### Public Routes (no auth required)

| Endpoint | Method | Model | Input | Output |
|----------|--------|-------|-------|--------|
| `/api/public/generate-app-details` | POST | gpt-4.1 | `{ userInput }` | `{ appTitle, appDescription, primaryColor }` |
| `/api/public/generate-logo-description` | POST | gpt-4.1 | `{ userInput, appName, appDescription, primaryColor }` | `{ logoDescription }` |
| `/api/public/generate-prompt` | POST | gpt-4.1 | `{ userInput }` | `{ prompt }` |
| `/api/public/generate-conversation-starters` | POST | gpt-4.1 | `{ userInput, appName, appDescription, systemPrompt }` | `{ conversationStarters: string[4] }` |
| `/api/public/generate-starting-message` | POST | gpt-4.1 | `{ userInput, appName, appDescription, systemPrompt }` | `{ shouldHaveStartingMessage, startingMessage }` |

### Authenticated Routes

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/generate-app-facts` | POST | `{ name, description, systemPrompt, hasCompanyKnowledge }` | `{ facts: string[3] }` |
| `/api/applications` | POST | Full app creation payload | Application object |
| `/api/applications/{id}/splash-screens` | POST | None | Splash screen result |
| `/api/upload/url` | GET (SSE) | `?url=&applicationId=&knowledgeSourceType=URL&crawlAllLinks=true` | SSE stream |
| `/api/website-metadata` | GET | `?url=` | `{ title, favicon }` |

## ChippDeno Current Status

### Already Implemented

ChippDeno (inside chipp-monorepo at `apps/chipp-deno/`) already has a nearly complete port:

**Route**: `ChatbotGenerator.svelte` at `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/routes/ChatbotGenerator.svelte`
- Reads `d` param from URL, decodes, passes to `AppGenerator` component

**Main Component**: `AppGenerator.svelte` at `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/AppGenerator.svelte`
- Error, Progress, and Success states
- Properly uses CSS variables for whitelabel compatibility

**Progress Component**: `AppGeneratorProgress.svelte` at `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/AppGeneratorProgress.svelte`
- Full port of the scrolling task list with completed/active/pending states
- All animations ported (shimmer, glow pulse, slide-in, fade, ping, spin)
- Fade overlays at top and bottom
- Uses CSS variables instead of hardcoded colors (whitelabel-ready)

**Success Component**: `AppGeneratorSuccess.svelte` at `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/AppGeneratorSuccess.svelte`
- Logo showcase with callout tooltip
- Time badge, facts list, CTA button with gradient
- All CSS uses design system variables

**Store**: `appGenerator.ts` at `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/stores/appGenerator.ts`
- Svelte writable store managing all generation state
- 7 tasks (matches ChippMono minus splash screens)
- All API calls to `/generate/*` endpoints

**API Routes**: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/generate/index.ts`
- All 6 generate endpoints implemented
- Uses `gpt-4o-mini` (cheaper) vs ChippMono's `gpt-4.1` (better quality)
- Simpler system prompts than ChippMono

### Gaps in ChippDeno

1. **Model quality**: ChippDeno uses `gpt-4o-mini` for all endpoints; ChippMono uses `gpt-4.1` for better quality generation. The system prompts in ChippDeno are also significantly shorter/simpler.

2. **Company email detection**: Not implemented in ChippDeno. No `detectCompanyDomain()`, no `CompanyWebsiteModal`, no conditional company knowledge step.

3. **Splash screen generation**: ChippDeno has no splash screen step (step 6 in ChippMono). The "Finalize" step is a placeholder.

4. **Field regeneration**: ChippMono regenerates fields (title, description, color) if they exceed limits using a secondary AI call. ChippDeno just truncates.

5. **Logo description detail**: ChippMono's logo description prompt is much more detailed and specific about bold/simple/geometric constraints.

6. **App creation payload differences**: ChippMono sends `brandStyles`, `logoDescription`, `creationSource: "landing-generator"`, and `startingMessage` to the application creation endpoint. ChippDeno only sends basic fields.

7. **Confetti**: Not implemented in ChippDeno success screen. ChippMono uses `canvas-confetti` with 3 bursts.

8. **Signup flow integration**: ChippDeno doesn't have the signup -> create-app-from-landing handoff. The landing page integration needs to be adapted for ChippDeno's auth system.

9. **Conversation starters prompt quality**: ChippMono's conversation starters endpoint includes the original user input and full system prompt context for more relevant starters.

10. **App facts count**: ChippMono generates 3 ultra-concise facts (max 6 words each); ChippDeno generates 4 longer facts (max 50 chars each).

11. **Hardcoded background color**: The fade overlays in ChippDeno's `AppGeneratorProgress.svelte` use hardcoded `#FCFBF7` instead of a CSS variable, which breaks whitelabel support.

## White-Label Color Mapping

| ChippMono (React hardcoded) | ChippDeno (Svelte CSS variable) | Notes |
|--------------------------|------------------------------|-------|
| `#FCFBF7` page background | Should use `hsl(var(--background))` | Currently hardcoded in fade overlays |
| `from-blue-400 via-purple-400 to-blue-400` active glow | `#60a5fa, #a78bfa, #60a5fa` hardcoded | Could use `hsl(var(--primary))` variants |
| `from-green-400 to-green-500` completed icon | `#4ade80, #22c55e` hardcoded | Acceptable - green is universal "done" |
| `bg-black text-white` error button | `hsl(var(--foreground))` / `hsl(var(--background))` | Already correctly mapped in ChippDeno |
| `text-gray-300` "Up next" label | `#d1d5db` hardcoded | Should use `hsl(var(--muted-foreground))` with lower opacity |
| `from-gray-100 to-gray-200` pending icon bg | `#f3f4f6, #e5e7eb` | Works for light mode; needs dark mode variant |
| `font-serif` headings | `var(--font-serif)` | Already correctly mapped |
| `from-[#9333ea] to-[#ec4899]` default button gradient | Same values | Fallback gradient when no primaryColor |

## Migration Recommendations

### Priority 1: Model and Prompt Quality (Quick Win)

Update ChippDeno's `/generate` routes to use better models and the richer system prompts from ChippMono. The prompt quality difference is significant - ChippMono's prompts produce notably better results.

**Files to reference**:
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-app-details/route.ts` (lines 33-81)
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-logo-description/route.ts` (lines 33-80)
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-prompt/route.ts` (lines 35-46)
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-conversation-starters/route.ts` (lines 36-80)
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-starting-message/route.ts` (lines 36-98)
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/generate-app-facts/route.ts` (lines 55-139)

### Priority 2: Company Email Detection

Port `detectCompanyDomain()` and the `CompanyWebsiteModal` flow. This is a significant UX enhancement for B2B users.

**Files to reference**:
- `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/emailDomainDetection.ts` (full file)
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/CompanyWebsiteModal.tsx`
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/hooks/useAppGeneration.ts` (lines 186-458)

### Priority 3: Fix Whitelabel Issues

Replace hardcoded `#FCFBF7` in fade overlays with CSS variables.

**File to fix**: The ChippDeno `AppGeneratorProgress.svelte` fade overlays (lines 629-661)

### Priority 4: Confetti

Add `canvas-confetti` to the success screen. Simple integration.

**Files to reference**:
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/hooks/useAppGeneration.ts` (lines 91-122)

### Priority 5: App Creation Payload Enhancement

Pass additional fields (brandStyles, logoDescription, creationSource, startingMessage) when creating the application.

### Priority 6: Splash Screen Generation

Depends on having a splash screen generation endpoint in ChippDeno.

### Implementation Order

1. Upgrade model + prompts in `/generate` routes
2. Port `detectCompanyDomain()` utility
3. Fix hardcoded colors in fade overlays
4. Add confetti to success screen
5. Build CompanyWebsiteModal Svelte component
6. Integrate company knowledge flow into appGenerator store
7. Enhance app creation payload
8. Add splash screen generation (if endpoint exists)

## All Source Files Referenced

### ChippMono: create-app-from-landing

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/page.tsx` | Server component - auth check, developer lookup |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/client.tsx` | Client component - orchestrates the full flow |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.tsx` | **Step tracker component** - the core visual element |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.md` | Documentation for the progress component |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/constants.ts` | All constants: loading states, timing, API endpoints, UI text |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/types.ts` | TypeScript interfaces |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/hooks/useAppGeneration.ts` | Main business logic hook |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/services/appGenerationService.ts` | API service layer |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/colorUtils.ts` | Color adjustment utilities |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/stageUtils.ts` | Task templates and stage management |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/styles.tsx` | Shared CSS (gradient animation) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/SuccessScreen.tsx` | Success screen with framer-motion |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/CompanyWebsiteModal.tsx` | Company knowledge offer modal |

### ChippMono: Landing Page Entry Points

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/hero-section/content/prompt-generator.tsx` | Landing page prompt input |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-landing/app/components/get-started-modal.tsx` | Signup CTA modal for non-logged-in users |

### ChippMono: Auth Handoff

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/page.tsx` | Server-side redirect if authenticated + has d param |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/auth/signup/SignupClient.tsx` | Client-side localStorage backup + URL construction |

### ChippMono: API Routes

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-app-details/route.ts` | App name/description/color generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-logo-description/route.ts` | Logo description generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-prompt/route.ts` | System prompt generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-conversation-starters/route.ts` | Conversation starters generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/public/generate-starting-message/route.ts` | Starting message generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/generate-app-facts/route.ts` | App facts for success screen |

### ChippMono: Shared Utilities

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/emailDomainDetection.ts` | Company email domain detection |

### ChippDeno: Existing Implementation

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/routes/ChatbotGenerator.svelte` | Route component |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/AppGenerator.svelte` | Main component |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/AppGeneratorProgress.svelte` | Progress tracker (ported) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/components/AppGeneratorSuccess.svelte` | Success screen (ported) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/stores/appGenerator.ts` | Generation state store |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-deno/web/src/lib/design-system/utils/colorUtils.ts` | Color utilities (ported) |
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/generate/index.ts` | API routes (simplified) |

## Related Features
- **Developer Signup Flow** - shares auth handoff mechanics (see `docs/migrations/developer-signup-flow.md`)
- **Application CRUD** - app creation endpoint used by generator
- **Knowledge Sources/RAG** - company website ingestion
- **PWA/Splash Screens** - mobile experience generation
- **Onboarding** - skipOnboarding param bypasses normal onboarding
