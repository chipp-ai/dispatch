# Feature Migration Report: Progressive Web App (PWA)

## Executive Summary
- **What it does**: Turns each white-labeled chat app into an installable PWA with custom icons, branded splash screens, offline support, home screen installation, and push notification scaffolding. Every aspect is dynamically generated per tenant using app branding (logo, primary color, name).
- **Complexity**: Medium -- most pieces already exist in ChippDeno
- **Dependencies**: Application branding (brandStyles), R2/storage for pre-generated splash screens, Sharp image processing library
- **Recommended approach**: Gap-fill and polish -- ChippDeno already has near-complete PWA support with all major components ported. The gaps are in splash screen fidelity (SVG-only vs Sharp-generated PNG with grid lines/gradients) and the builder-side "Deploy as PWA" dialog.

## Current State: ChippDeno vs ChippMono

| Component | ChippMono | ChippDeno | Status |
|-----------|-----------|-----------|--------|
| Service Worker | `/public/sw.js` (301 lines) | `/web/public/consumer-sw.js` (197 lines) | Done -- simpler but functional |
| PWA Init script | `/public/pwa-init.js` | `/web/public/pwa-init.js` | Done -- already ported |
| Dynamic Manifest | `/w/chat/api/manifest/route.ts` | `/consumer/:appNameId/manifest.json` route | Done |
| Icon Generation | `/w/chat/api/icons/[size]/route.tsx` (Sharp) | `/consumer/:appNameId/pwa/icon/:size` (SVG fallback) | Partial -- missing Sharp resize |
| Splash Screens | `/w/chat/api/splash/[dimensions]/route.tsx` (Sharp with grid + gradients) | `/consumer/:appNameId/pwa/splash/:dimensions` (SVG only) | Partial -- no grid/gradient |
| Install Prompt | `InstallPrompt.tsx` (React) | `InstallPrompt.svelte` | Done |
| Install Button | `InstallAppButton.tsx` (React) | `InstallAppButton.svelte` | Done |
| SW Registration | `ServiceWorkerRegistration.tsx` | `ServiceWorkerRegistration.svelte` | Done |
| PWA Update Manager | `PWAUpdateManager.tsx` | Not ported | Missing |
| PWA Debug Panel | `PWADebugPanel.tsx` | Not ported | Missing (dev-only) |
| Deploy Card (builder) | `DeployPWACard.tsx` + `PWADeploySetupDialog.tsx` | Not ported | Missing |
| Offline page | `/public/offline.html` | Not ported | Missing |
| Splash screen sizes | `lib/pwa/splashScreenSizes.ts` | Inline in `pwa.ts` | Done |
| Metadata injection | `layout.tsx` (Next.js Metadata API) | Manual HTML injection needed | Partial |

---

## 1. Service Worker

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/public/sw.js`

**Version**: `v1.0.4` (cache name: `chipp-chat-v1.0.4`)

**Cache Strategies**:
| Pattern | Strategy | Rationale |
|---------|----------|-----------|
| Development (localhost/ngrok) | Network-first for everything | Avoid stale dev content |
| `/api/*` | Network-first | API responses need freshness |
| `/_next/static/*` | Cache-first | Content-hashed, immutable |
| `.js`, `.css`, `.png`, `.woff2`, `/assets/` | Cache-first | Static assets |
| Navigation (`text/html`) | Stale-while-revalidate | Show cached, update in background |
| Root route (`/`) | Pass-through (no cache) | It's a server-side redirect |
| Everything else | Network-first | Default safe strategy |

**Per-App Cache Isolation**: Caches are namespaced by app identifier: `app-{appNameId}-v1.0.4`. This prevents one app's cached content from leaking into another.

**Features**:
- `cleanResponse()` -- strips redirect metadata to avoid "redirect mode is not follow" errors
- `SKIP_WAITING` message handler -- lets UI trigger immediate activation
- `CLEAR_APP_CACHE` message handler -- clears caches for a specific app
- Push notification handler (scaffolded, not wired to backend)
- Notification click handler -- opens `/w/chat`
- Versioned cache cleanup on activate

### ChippDeno: `/Users/hunterhodnett/code/chipp-deno/web/public/consumer-sw.js`

**Version**: `v1.0.0` (cache prefix: `chipp-consumer`)

**Differences from ChippMono**:
- Uses regex patterns for route matching instead of string checks
- Explicitly bypasses SSE streaming endpoints, session activity, and auth endpoints
- No `cleanResponse()` helper (may cause redirect caching issues)
- No `CLEAR_APP_CACHE` handler (only `SKIP_WAITING`)
- No push notification handling
- Simpler strategy: stale-while-revalidate for static assets, network-first for everything else

**Gaps to fill**:
1. Add `cleanResponse()` utility to prevent redirect caching bugs
2. Add `CLEAR_APP_CACHE` message handler for per-app cache clearing
3. Consider adding push notification scaffolding
4. Consider root route bypass (important if `/` is a redirect)

---

## 2. Dynamic Manifest Generation

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/manifest/route.ts`

**Key behavior**:
- Resolves app via `appId` query param OR host header (subdomain/custom domain)
- `start_url` varies by routing type: `/w/chat` for subdomain, `/w/chat/{appIdentifier}` for path-based
- `short_name` truncated to 12 chars (iOS home screen limit)
- `display: "standalone"`, `orientation: "portrait-primary"`
- `theme_color` = app's `primaryColor` (default `#F9DB00`)
- `background_color` = white if primary is dark, black if primary is light (via `shouldUseLightText`)
- Icons: 192x192, 512x512 (both any + maskable), plus iOS-specific 180, 152, 167
- Shortcuts: "New Chat" with `?newChat=true`
- `apple_touch_startup_images`: All 11 iOS splash screen sizes with media queries
- `lang` from app settings, `dir` supports RTL via `TextDirection` enum
- Cache: `public, max-age=3600` (1 hour)

### ChippDeno: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/pwa.ts` (lines 248-372)

**Already ported**: Nearly identical manifest structure. Key differences:
- Uses `/#/chat` for `start_url` (hash routing in SPA)
- Icon paths use `/consumer/{appNameId}/pwa/icon/{size}` pattern
- Missing `dir` (RTL) support
- Missing `display_override` (not present in either, but could be added)

**Gap**: RTL `dir` field not set from app config.

---

## 3. Icon Generation

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/icons/[size]/route.tsx`

**Flow**:
1. Resolve app by `appId` query param or host header
2. If app has a `logoUrl`:
   - Fetch the image from URL (handles both external and relative paths)
   - Use **Sharp** to resize to requested size with `fit: "contain"`, transparent background
   - Convert to PNG
   - Return with `Cache-Control: public, max-age=31536000, immutable` (1 year)
3. If no logo or fetch fails:
   - Generate SVG fallback: colored square with first letter of app name
   - Maskable variant uses solid primary color background
   - Return as `image/svg+xml`

**Key detail**: The Sharp-based resize produces proper PNG output suitable for all platforms. The SVG fallback is only used when logo processing fails.

### ChippDeno: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/pwa.ts` (lines 378-469)

**Current behavior**:
- Proxies logo URL directly if available (no resize)
- SVG fallback for when logo is unavailable or maskable
- Has SSRF protection (`isAllowedFetchUrl`, `isPrivateHost`)
- Does NOT use Sharp for resize -- just proxies raw image

**Gaps**:
1. No Sharp-based image resize -- icons may be wrong size if logo is not already square
2. Proxied images may not be PNG (could be SVG, JPEG, WebP)
3. Cache headers less aggressive (86400 vs 31536000)

---

## 4. Splash Screen Generation

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/splashScreen/generateSplashScreen.ts`

This is the **most visually complex** component. The splash screen uses:

1. **Solid background**: Dark (`#0A0A0A`) for light brand colors, white (`#FFFFFF`) for dark brand colors. Uses a sophisticated `shouldUseDarkBackground()` with hue-aware luminance thresholds (warm colors like yellow/orange get a lower threshold).

2. **Grid pattern overlay**: 60px grid lines at `rgba(255,255,255,0.3)` (dark bg) or `rgba(0,0,0,0.3)` (light bg), 0.75 opacity. This creates the distinctive "grid lines" visual.

3. **Two radial gradients** from brand color:
   - Bottom-left: `cx=0% cy=100% r=65%` with stops from 0.352 to 0 opacity
   - Top-right: `cx=100% cy=0% r=75%` with stops from 0.462 to 0 opacity
   - These create the branded atmosphere glow effect

4. **Logo** centered with rounded corners (20% border radius):
   - If logo URL exists: fetched, resized to 30% of shortest dimension, `fit: "cover"`, rounded mask applied
   - If no logo: placeholder square with brand color and first letter

5. **Final composition**: All layers composited via Sharp, output as PNG with quality 90, compression 9

### ChippMono Splash Route: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/splash/[dimensions]/route.tsx`

**Flow**:
1. Check for pre-generated splash screen URLs in `applicationBrandStyles.splashScreenUrls`
2. If pre-generated exists: fetch and proxy (iOS doesn't follow redirects)
3. If not: generate dynamically using `generateSplashScreen()` from shared utils
4. Cache: `public, max-age=86400, immutable` with ETag

### ChippDeno: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/pwa.ts` (lines 475-566)

**Current behavior**: Generates a simple SVG with:
- Solid background (white/black based on brand color)
- Logo as `<image>` element (or letter placeholder)
- App name text below logo
- **No grid pattern, no radial gradients**

**Gaps**:
1. Missing grid pattern overlay (the distinctive "grid lines" visual)
2. Missing radial gradient atmosphere effects
3. No Sharp-based PNG generation (SVG only)
4. No rounded logo corners
5. No pre-generated splash screen lookup
6. Splash screens look flat/plain vs ChippMono's branded atmosphere

---

## 5. iOS Splash Screen Sizes

### Shared between both: 11 device sizes

```typescript
const iosSplashScreenSizes = [
  { width: 1320, height: 2868, deviceWidth: 440, deviceHeight: 956, ratio: 3 }, // iPhone 16 Pro Max
  { width: 1206, height: 2622, deviceWidth: 402, deviceHeight: 874, ratio: 3 }, // iPhone 15/16 Pro
  { width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3 }, // iPhone 14 Pro Max, 15/16 Plus
  { width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3 }, // iPhone 14 Plus
  { width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3 }, // iPhone 14 Pro, 15, 16
  { width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3 }, // iPhone 12/13/14
  { width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3 }, // iPhone 12/13 Mini, X, XS
  { width: 828,  height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2 }, // iPhone 11, XR
  { width: 750,  height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2 }, // iPhone SE, 8, 7
  { width: 2048, height: 2732, deviceWidth: 1024, deviceHeight: 1366, ratio: 2 }, // iPad Pro 12.9"
  { width: 1668, height: 2388, deviceWidth: 834, deviceHeight: 1194, ratio: 2 }, // iPad Pro 11"
];
```

Media query format: `(device-width: Xpx) and (device-height: Ypx) and (-webkit-device-pixel-ratio: Z)`

**Status**: Already duplicated in ChippDeno's `pwa.ts` file.

---

## 6. HTML Metadata Injection

### ChippMono: Two-Layer Metadata

**Layer 1 -- Chat layout** (`/w/chat/layout.tsx`):
- Next.js `generateMetadata()` injects `<link rel="manifest">`, `<meta name="theme-color">`, `apple-touch-icon` links, `appleWebApp` config
- `<PWASplashLinks />` server component renders all 11 `<link rel="apple-touch-startup-image">` tags
- `<Script src="/w/chat/pwa-init.js" strategy="afterInteractive" />` loads install prompt capture
- Version params (`v=timestamp`) and cache busters (`cb=now`) on all URLs

**Layer 2 -- App-specific layout** (`/w/chat/[appNameId]/layout.tsx`):
- More specific metadata including all icon sizes (152, 167, 180, 192, 512)
- All splash screen startup images with media queries
- `apple-mobile-web-app-capable: yes`
- `viewport: width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`

### ChippDeno Approach
Since ChippDeno is an SPA served via Cloudflare Worker, metadata injection happens differently:
- The Worker's HTML template can inject meta tags server-side
- `pwa-init.js` is loaded as a static public asset
- Manifest link must be injected into the HTML `<head>` with the correct `appId`
- Apple touch icons and splash screen links need to be injected per-app

---

## 7. Install Prompt

### ChippMono: Two Components

**`InstallPrompt.tsx`** -- Automatic floating prompt:
- Mobile-only (hidden on desktop via `isMobileDevice()`)
- Listens for `beforeinstallprompt` event and custom `pwainstallready` event
- First shows minimal floating button (Download icon, branded color)
- After 3 seconds, expands to full card with app logo, name, "Install" and "Not now" buttons
- Remembers dismissal per app in localStorage: `pwa-install-dismissed-{appId}`
- iOS fallback text: "Tap share button then Add to Home Screen"

**`InstallAppButton.tsx`** -- Manual install button (in menu):
- Two variants: `"menu"` (list item) and `"standalone"` (button)
- Opens bottom Sheet with step-by-step instructions
- Platform-specific: iOS (Share > Add to Home Screen), Android (Menu > Install app)
- "Why install?" benefits section
- "Don't show again" with 30-day localStorage expiry
- iOS 16.4+ push notification tip

### ChippDeno Status: Both ported as Svelte components
- `InstallPrompt.svelte` -- functionally identical
- `InstallAppButton.svelte` -- functionally identical with Sheet component
- Both use CSS variables (`hsl(var(--background))`, etc.) for white-label support

---

## 8. PWA Update Manager (Not Yet Ported)

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/PWAUpdateManager.tsx`

**Purpose**: Detects when the app builder publishes a new version and prompts installed PWA users to update.

**Behavior**:
- Polls `/api/applications/{id}/version` every 5 minutes
- Compares `currentVersionId` with `publishedVersionId`
- Listens for service worker `swupdateavailable` events
- When update available: shows fixed bottom card with "Update Now" / "Later" buttons
- "Update Now": clears app-specific caches, sends `SKIP_WAITING` to SW, reloads
- Stores update info in localStorage: `pwa-update-${applicationId}`

### ChippDeno: Not ported. Lower priority since the service worker's stale-while-revalidate already handles most update scenarios.

---

## 9. Deploy as PWA (Builder Page)

### ChippMono: Two Components

**`DeployPWACard.tsx`** (`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployPWACard.tsx`):
- Card with gradient SVG icon (blue-to-purple phone icon)
- Title: "Deploy as PWA"
- Description: "Install your app directly on mobile devices..."
- Opens `PWADeploySetupDialog`

**`PWADeploySetupDialog.tsx`** (`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/PWADeploySetupDialog.tsx`):
- Dialog with:
  - **Status section**: Green dot "PWA Ready" with last updated time
  - **App URL**: Copy/open buttons
  - **Installation Instructions**: iOS (Safari) and Android (Chrome) step-by-step
  - **Update Management**: Auto-update info + manual "Refresh Now" button
  - **Splash Screen section**: Shows all generated splash screens (thumbnails), refresh button to regenerate
  - **Features grid**: Instant Access, Home Screen Icon, Full Screen, Fast Loading
  - **Pro Tips**: Logo/color recommendations, update behavior, testing
  - Splash screen preview modal (click thumbnail to enlarge)

### ChippDeno: Not yet built. This is a builder-side feature.

---

## 10. Offline Page

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/public/offline.html`

Simple standalone HTML page:
- System font stack
- Light gray background with centered white card
- SVG icon, "You're Offline" heading
- "Try Again" button (yellow `#f9db00`)
- Auto-reload on `navigator.onLine` change
- Periodic connectivity check every 5 seconds

### ChippDeno: No offline page exists yet. Service worker references `/offline.html` but the file does not exist.

---

## 11. PWA Debug Panel (Dev-Only)

### ChippMono: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/components/PWADebugPanel.tsx`

Comprehensive debug panel (hidden in production unless `NEXT_PUBLIC_SHOW_PWA_DEBUG=true`):
- Shows: secure context, SW support/registration, manifest detection, install prompt status, standalone mode, Apple touch icons count
- Debug info: user agent, platform, touch points, iOS detection method
- Application info: ID, name, logo URL, primary color
- iOS meta tags audit
- Buttons: Test Manifest, Test Icon, Icon Debug, Recheck Status, Fix iOS Tags, Force Refresh, Clear SW Cache, Inject Manifest

### ChippDeno: Not ported (dev tool, not user-facing).

---

## 12. Pre-Generated Splash Screens and Brand Sync

### ChippMono Flow
1. Builder uploads logo/changes brand color
2. Backend generates splash screens via `generateSplashScreen()` using Sharp
3. Results stored in `applicationBrandStyles.splashScreenUrls` as `{dimensions: url}` map
4. URLs point to cloud storage (GCS or similar)
5. Splash route checks for pre-generated URLs first, falls back to dynamic generation

### ChippDeno: Brand Sync Service
- `/Users/hunterhodnett/code/chipp-deno/src/services/brand-sync.service.ts`
- Syncs branding to R2 for edge access
- Stores `config.json`, `logo.png`, `og.png` per slug
- Does NOT currently generate splash screens (only OG images)

---

## Data Model

### Relevant Fields (No New Tables Needed)

**`app.applications`**:
- `brand_styles` (JSON): `{ primaryColor, logoUrl, splashScreenUrls }`
- `name`, `description`, `language`
- `custom_domain`

**`app.application_brand_styles`** (separate table):
- `splash_screen_urls` (JSON): `{ "1320x2868": "https://storage.../splash.png", ... }`
- `logo_url`, `updated_at`

---

## White-Label Support

### How PWA Handles White-Labeling

1. **Manifest**: All fields (name, colors, icons) derived from per-app `brandStyles`
2. **Icons**: Generated from app's `logoUrl` and `primaryColor`
3. **Splash screens**: Background/text colors derived from brand color luminance
4. **Install prompt**: Uses app's `primaryColor` for button color, computes text contrast
5. **Theme color**: `<meta name="theme-color">` set to app's `primaryColor`

### CSS Variable Mapping for PWA Components

| ChippMono Pattern | ChippDeno Equivalent |
|---|---|
| `primaryColor` from `brandStyles` | `var(--consumer-primary, var(--brand-color-ui))` |
| `shouldUseLightText(primaryColor)` | Same utility -- compute text contrast |
| `bg-background` | `hsl(var(--background))` |
| `text-foreground` | `hsl(var(--foreground))` |
| `text-muted-foreground` | `hsl(var(--muted-foreground))` |
| `bg-muted` | `hsl(var(--muted))` |
| `border-border` | `hsl(var(--border))` |

ChippDeno's Svelte components already use CSS variables correctly. No changes needed for white-label compatibility in existing components.

---

## Security Considerations (ChippDeno)

ChippDeno's PWA route (`pwa.ts`) includes security measures not present in ChippMono:

1. **SSRF Protection**: `isAllowedFetchUrl()` validates URLs before fetching
2. **Private Host Blocking**: `isPrivateHost()` blocks localhost, private IP ranges, link-local
3. **Redirect Blocking**: `redirect: "error"` prevents SSRF via redirects
4. **Content-Type Validation**: Only proxies `image/*` content types
5. **XSS Prevention**: `escapeForXML()` sanitizes app names in SVG generation
6. **URL Sanitization**: `sanitizeImageUrl()` validates image URLs for SVG `<image>` tags

These are improvements over ChippMono and should be preserved.

---

## Migration Recommendations

### Priority 1: Splash Screen Fidelity (High Impact, Medium Effort)

The biggest visual gap is splash screen quality. ChippMono generates rich PNG splash screens with grid patterns and radial gradients. ChippDeno generates flat SVGs.

**Options**:
1. **Port Sharp-based generation** to Deno (Sharp works via `npm:sharp` with `--allow-ffi`). Generate the grid pattern, radial gradients, and rounded logo exactly as ChippMono does.
2. **Improve SVG splash screens** to include grid pattern and radial gradients. SVGs can include `<pattern>` for grid and `<radialGradient>` for atmosphere. This avoids the Sharp dependency but produces SVG instead of PNG (some iOS versions prefer PNG).
3. **Pre-generate at publish time** using brand-sync service. Store PNGs to R2. Serve from edge.

**Recommended**: Option 2 (SVG with grid + gradients) as a quick win, then Option 3 for production quality.

### Priority 2: Offline Page (Low Effort, Important)

Create `/Users/hunterhodnett/code/chipp-deno/web/public/offline.html`. Copy from ChippMono with CSS variable adaptation. The service worker already references it.

### Priority 3: Icon Resize (Medium Effort)

Currently ChippDeno proxies the raw logo without resize. For proper PWA icons, the image should be resized to exact dimensions. Options:
1. Use Sharp in Deno for proper PNG generation
2. Use Cloudflare Image Resizing if available
3. Accept SVG fallback as-is (works but not ideal for all platforms)

### Priority 4: Deploy as PWA Dialog (Builder Feature)

Build `PWADeploySetupDialog.svelte` for the builder share page. Components:
- Status indicator
- App URL with copy button
- iOS/Android installation instructions
- Cache refresh button
- Splash screen preview thumbnails

### Priority 5: PWA Update Manager (Nice-to-Have)

Port the update detection/notification system. Lower priority since SW handles basic updates automatically.

### Implementation Order
1. Create `offline.html` in `web/public/`
2. Enhance splash screen SVG generation with grid + gradients
3. Add `cleanResponse()` to consumer-sw.js
4. Add `CLEAR_APP_CACHE` handler to consumer-sw.js
5. Build PWA deploy dialog for builder
6. Consider Sharp-based icon resize if image quality issues arise

---

## Files to Reference

### ChippMono Source Files

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/public/sw.js` | Service worker (301 lines) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/public/pwa-init.js` | Install prompt capture |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/public/offline.html` | Offline fallback page |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/manifest/route.ts` | Dynamic manifest generation |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/icons/[size]/route.tsx` | Icon generation with Sharp |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/splash/[dimensions]/route.tsx` | Splash screen serving |
| `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/splashScreen/generateSplashScreen.ts` | Splash screen PNG generation (grid + gradients) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/lib/pwa/splashScreenSizes.ts` | iOS device splash sizes |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/components/InstallPrompt.tsx` | Auto install prompt |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/components/InstallAppButton.tsx` | Manual install button + sheet |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/components/ServiceWorkerRegistration.tsx` | SW registration + update toast |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/PWAUpdateManager.tsx` | App version update detection |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/components/PWADebugPanel.tsx` | Debug panel (dev-only) |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/layout.tsx` | Metadata injection + splash links |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/[appNameId]/layout.tsx` | App-specific metadata |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployPWACard.tsx` | Builder deploy card |
| `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/PWADeploySetupDialog.tsx` | Builder deploy dialog |

### ChippDeno Files (Already Ported)

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-deno/web/public/consumer-sw.js` | Service worker |
| `/Users/hunterhodnett/code/chipp-deno/web/public/pwa-init.js` | Install prompt capture |
| `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/pwa.ts` | Manifest + icons + splash API routes |
| `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/consumer/InstallPrompt.svelte` | Auto install prompt |
| `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/consumer/InstallAppButton.svelte` | Manual install button + sheet |
| `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/consumer/ServiceWorkerRegistration.svelte` | SW registration |
| `/Users/hunterhodnett/code/chipp-deno/src/services/brand-sync.service.ts` | R2 brand sync (could extend for splash) |

### Migration Doc

| File | Purpose |
|------|---------|
| `/Users/hunterhodnett/code/chipp-monorepo/docs/deno-migration/pwa.md` | Earlier migration plan with code samples |

---

## Splash Screen: Grid Pattern + Gradient Details

This is the most important visual detail to port. Here is exactly how ChippMono builds the splash screen atmosphere:

### Grid Pattern
```svg
<pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
  <path d="M 60 0 L 0 0 0 60" fill="none"
        stroke="rgba(255,255,255,0.3)" stroke-width="1"/>  <!-- dark bg -->
        <!-- OR rgba(0,0,0,0.3) for light bg -->
</pattern>
<rect width="100%" height="100%" fill="url(#grid)" opacity="0.75"/>
```

### Bottom-Left Radial Gradient
```svg
<radialGradient id="bottomLeftGrad" cx="0%" cy="100%" r="65%">
  <stop offset="0%"   stop-color="{primaryColor}" stop-opacity="0.352"/>
  <stop offset="20%"  stop-color="{primaryColor}" stop-opacity="0.307"/>
  <stop offset="30%"  stop-color="{primaryColor}" stop-opacity="0.201"/>
  <stop offset="45%"  stop-color="{primaryColor}" stop-opacity="0.106"/>
  <stop offset="70%"  stop-color="{primaryColor}" stop-opacity="0.008"/>
  <stop offset="80%"  stop-color="{primaryColor}" stop-opacity="0"/>
</radialGradient>
```

### Top-Right Radial Gradient
```svg
<radialGradient id="topRightGrad" cx="100%" cy="0%" r="75%">
  <stop offset="0%"   stop-color="{primaryColor}" stop-opacity="0.462"/>
  <stop offset="20%"  stop-color="{primaryColor}" stop-opacity="0.347"/>
  <stop offset="40%"  stop-color="{primaryColor}" stop-opacity="0.231"/>
  <stop offset="60%"  stop-color="{primaryColor}" stop-opacity="0.116"/>
  <stop offset="80%"  stop-color="{primaryColor}" stop-opacity="0.058"/>
  <stop offset="100%" stop-color="{primaryColor}" stop-opacity="0"/>
</radialGradient>
```

### Background Color Selection
```typescript
function shouldUseDarkBackground(hex: string): boolean {
  // Special handling for warm colors (hue 25-65, yellow-orange)
  // Lower luminance threshold for warm colors (0.35 vs 0.5)
  // Returns true if color is "light" and needs dark background
}
```
- Dark bg: `#0A0A0A` (near-black, not pure black)
- Light bg: `#FFFFFF`

---

## Related Features
- **Brand Sync Service** - used for edge-cached branding, could extend for splash screens
- **Custom Domains** - affects manifest `start_url` and metadata injection
- **App Publishing** - `publishedVersionId` used by PWA Update Manager
- **Chat Widget** - separate from PWA, embeds via iframe (not related)
- **Native Apps (Capacitor)** - separate mobile packaging, unrelated to PWA
