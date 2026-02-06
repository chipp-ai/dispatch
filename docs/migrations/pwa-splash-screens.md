# Feature Migration Report: PWA Splash Screen Generation

## Executive Summary
- **What it does**: Generates dynamic branded splash screens for PWA-installed apps on iOS/iPad devices, using the app's brand color and logo to produce images with grid patterns and gradient atmospheres.
- **Complexity**: Medium
- **Dependencies**: Sharp (image processing), Google Cloud Storage (pre-generation upload), brand color contrast detection, Prisma/Kysely database
- **Current state**: ChippDeno ALREADY has a near-complete SVG-based implementation that matches ChippMono's visual design. The key difference is ChippMono uses Sharp to generate PNG raster images while ChippDeno serves pure SVG. Both produce identical visual outputs (grid + dual radial gradients + centered logo).

## Architecture Comparison

### ChippMono: PNG via Sharp (Server-Side Rendering)
1. SVG fragments are composed and composited via Sharp
2. Logo is fetched, resized, and given rounded corners via Sharp masking
3. Final output is a rasterized PNG with `compressionLevel: 9`
4. Pre-generated PNGs are uploaded to Google Cloud Storage
5. Cached PNGs are served first; dynamic generation is the fallback

### ChippDeno: Pure SVG (Already Implemented)
1. Single SVG string is built with identical visual elements
2. Logo is embedded via `<image href="...">` with clip-path for rounded corners
3. Output is SVG with `Content-Type: image/svg+xml`
4. No pre-generation or storage upload -- always generated on demand
5. Two separate route files: consumer apps (`consumer/pwa.ts`) and builder dashboard (`pwa/index.ts`)

## Data Model

### Database Tables (ChippMono)
- `Application.brandStyles` (JSON column) - Contains `primaryColor`, `logoUrl`, `splashScreenUrls`
- `ApplicationBrandStyles` (related model) - Contains `splashScreenUrls` (JSON), `logoUrl`, `updatedAt`

### Schema File Locations
- `/Users/hunterhodnett/code/chipp-monorepo/shared/chipp-prisma/schema.prisma` - Application and ApplicationBrandStyles models

### ChippDeno Equivalent
- `app.applications.brand_styles` (JSONB column) - Contains `primaryColor`, `logoUrl`, `splashScreenUrls`
- No separate brand styles table exists in ChippDeno

## Implementation Details

### Source Files in ChippMono

| File | Purpose |
|------|---------|
| `shared/utils-server/src/splashScreen/generateSplashScreen.ts` | Core PNG generation with Sharp |
| `apps/chipp-admin/lib/pwa/splashScreenSizes.ts` | iOS device size definitions + media queries |
| `apps/chipp-admin/app/w/chat/api/splash/[dimensions]/route.tsx` | API route serving splash screens |
| `apps/chipp-admin/apiService/splashScreen/generateAndUploadSplashScreens.ts` | Batch generation + GCS upload |
| `apps/chipp-admin/app/api/applications/[applicationId]/splash-screens/route.ts` | Builder API to trigger regeneration |
| `apps/chipp-admin/app/w/chat/api/manifest/route.ts` | Manifest with splash screen references |
| `apps/chipp-admin/app/w/chat/layout.tsx` | HTML `<link>` injection for iOS |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/PWADeploySetupDialog.tsx` | Builder UI for splash screen management |
| `shared/utils/src/shouldUseLightText.ts` | Luminance-based contrast detection |

### Source Files in ChippDeno (Already Implemented)

| File | Purpose |
|------|---------|
| `src/api/routes/consumer/pwa.ts` | Consumer app PWA routes (manifest, icons, splash) |
| `src/api/routes/pwa/index.ts` | Builder dashboard PWA routes (manifest, icons, splash) |
| `src/services/brand-sync.service.ts` | R2 branding sync (no splash pre-gen) |
| `cloudflare-worker/src/brand-inject.ts` | HTML injection for consumer branding |

## Splash Screen Visual Design (Complete Specification)

### 1. Background Color Logic

**ChippMono** (`shouldUseDarkBackground()` in `generateSplashScreen.ts:63-93`):
```
Input: hex brand color
Steps:
  1. Convert hex -> RGB -> HSL
  2. Detect "warm colors" (hue 25-65 degrees = yellow/orange range)
  3. Calculate perceptual luminance using sRGB linearization:
     - linearize(v) = v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)^2.4
     - luminance = 0.2126*R + 0.7152*G + 0.0722*B
  4. Apply hue-aware threshold:
     - Warm colors: threshold = 0.35 (more likely to get dark bg)
     - Other colors: threshold = 0.50
  5. luminance >= threshold -> dark background (#0A0A0A)
     luminance < threshold -> light background (#FFFFFF)
```

**ChippDeno** (`shouldUseDarkBackground()` in `pwa/index.ts:103-122`):
```
Similar logic but uses simpler luminance formula:
  luminance = (0.299*R + 0.587*G + 0.114*B) / 255
Same warm color detection (hue 25-65) and threshold logic.
```

**Key difference**: ChippMono uses sRGB linearization (more perceptually accurate), ChippDeno uses BT.601 formula (simpler). The text color logic for `shouldUseLightText` is yet another formula. In practice the results are nearly identical for most brand colors.

| Condition | Background | Text Color |
|-----------|-----------|------------|
| Light/warm brand color | `#0A0A0A` (near-black) | `#FFFFFF` (white) |
| Dark brand color | `#FFFFFF` (white) | `#1F2937` (dark gray, ChippMono) or `#000000` (ChippDeno) |

### 2. Grid Pattern Overlay

Both ChippMono and ChippDeno use identical grid patterns:

```svg
<defs>
  <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
    <path d="M 60 0 L 0 0 0 60" fill="none" stroke="{gridLineColor}" stroke-width="1"/>
  </pattern>
</defs>
<rect width="{width}" height="{height}" fill="url(#grid)" opacity="0.75"/>
```

**Specifications:**
- **Grid spacing**: 60px
- **Stroke width**: 1px
- **Pattern shape**: L-shaped path (top and left edges of each cell)
- **Grid overlay opacity**: 0.75
- **Grid line color (dark bg)**: `rgba(255, 255, 255, 0.3)` -- white at 30%
- **Grid line color (light bg)**: `rgba(0, 0, 0, 0.3)` (ChippMono) or `rgba(0, 0, 0, 0.15)` (ChippDeno -- slightly lighter)

### 3. Radial Gradient Implementation

Two radial gradients create a "glow" atmosphere from opposite corners.

#### Bottom-Left Gradient
```svg
<radialGradient id="bottomLeftGrad" cx="0%" cy="100%" r="65%">
  <stop offset="0%"  stop-color="{primaryColor}" stop-opacity="0.352"/>
  <stop offset="20%" stop-color="{primaryColor}" stop-opacity="0.307"/>
  <stop offset="30%" stop-color="{primaryColor}" stop-opacity="0.201"/>
  <stop offset="45%" stop-color="{primaryColor}" stop-opacity="0.106"/>
  <stop offset="70%" stop-color="{primaryColor}" stop-opacity="0.008"/>
  <stop offset="80%" stop-color="{primaryColor}" stop-opacity="0"/>
</radialGradient>
```
- **Origin**: Bottom-left corner (`cx="0%" cy="100%"`)
- **Radius**: 65% of element
- **Peak opacity**: 0.352 (35.2%) at center
- **Fade pattern**: Aggressive falloff -- essentially invisible by 70%

#### Top-Right Gradient
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
- **Origin**: Top-right corner (`cx="100%" cy="0%"`)
- **Radius**: 75% (larger than bottom-left)
- **Peak opacity**: 0.462 (46.2%) -- brighter than bottom-left
- **Fade pattern**: Linear-ish falloff across 5 stops

**Both implementations (ChippMono and ChippDeno) use identical gradient stops.**

### 4. Logo/Branding

#### Logo Sizing
- **Logo size**: `Math.min(width, height) * 0.3` (ChippMono) or `* 0.2` (ChippDeno)
- **Border radius**: `logoSize * 0.2` (20% of logo size)
- **Vertical position**: Centered vertically, shifted up to account for text below

#### Logo with Image (ChippMono - Sharp compositing)
```
1. Fetch logo from URL (10s timeout)
2. Resize to logoSize x logoSize with fit: "cover", position: "center"
3. Apply rounded corners via SVG mask with dest-in blend
4. Composite onto background at calculated position
```

#### Logo with Image (ChippDeno - SVG clip-path)
```svg
<defs>
  <clipPath id="logoClip">
    <rect x="{x}" y="{y}" width="{logoSize}" height="{logoSize}" rx="{logoRadius}" />
  </clipPath>
</defs>
<image href="{logoUrl}" x="{x}" y="{y}" width="{logoSize}" height="{logoSize}"
       preserveAspectRatio="xMidYMid meet" clip-path="url(#logoClip)" />
```

#### Logo Placeholder (no logo provided)
Both create a rounded rectangle in the brand color with the app's first letter:
```
- Background: solid primaryColor rounded rect
- Letter: first character of app name, uppercase
- Font: -apple-system, system-ui, sans-serif
- Font size: 45% of logo size (ChippMono) or 40% of logo size (ChippDeno)
- Font weight: 600
- Text color: white
```

### 5. App Name Text
- **Font size**: `Math.min(width, height) * 0.065` (ChippMono, used for positioning) or `* 0.04` (ChippDeno, displayed below logo)
- **ChippMono**: Does NOT render the app name text in the final image (only uses fontSize for logo positioning offset)
- **ChippDeno**: Renders app name text below the logo with `opacity="0.8"` and `font-weight="500"`

## iOS Splash Screen Sizes

### Canonical List (11 sizes)

Both ChippMono (in `splashScreenSizes.ts`) and ChippDeno share the same 11 sizes:

| Device | Width | Height | Device Width | Device Height | Ratio |
|--------|-------|--------|-------------|--------------|-------|
| iPhone 16 Pro Max | 1320 | 2868 | 440 | 956 | 3x |
| iPhone 15/16 Pro | 1206 | 2622 | 402 | 874 | 3x |
| iPhone 14 Pro Max, 15/16 Plus | 1290 | 2796 | 430 | 932 | 3x |
| iPhone 14 Plus | 1284 | 2778 | 428 | 926 | 3x |
| iPhone 14 Pro, 15, 16 | 1179 | 2556 | 393 | 852 | 3x |
| iPhone 12/13/14 | 1170 | 2532 | 390 | 844 | 3x |
| iPhone 12/13 Mini, X, XS, 11 Pro | 1125 | 2436 | 375 | 812 | 3x |
| iPhone 11, XR | 828 | 1792 | 414 | 896 | 2x |
| iPhone SE, 8, 7, 6s, 6 | 750 | 1334 | 375 | 667 | 2x |
| iPad Pro 12.9" | 2048 | 2732 | 1024 | 1366 | 2x |
| iPad Pro 11" | 1668 | 2388 | 834 | 1194 | 2x |

### Additional Sizes (ChippMono batch generation only)

The `generateAndUploadSplashScreens.ts` batch list includes 2 additional iPad sizes not in the canonical list:

| Device | Width | Height | Device Width | Device Height | Ratio |
|--------|-------|--------|-------------|--------------|-------|
| iPad 10th gen | 1620 | 2160 | 810 | 1080 | 2x |
| iPad Air/Mini | 1536 | 2048 | 768 | 1024 | 2x |

### Media Query Format
```
(device-width: {deviceWidth}px) and (device-height: {deviceHeight}px) and (-webkit-device-pixel-ratio: {ratio})
```

## API Routes

### ChippMono Consumer Splash Route

**Endpoint**: `GET /w/chat/api/splash/{width}x{height}?appId={id}`
**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/splash/[dimensions]/route.tsx`

**Flow**:
1. Parse dimensions from URL path
2. Resolve application via appId query param or request context
3. Check for pre-generated splash URL in `ApplicationBrandStyles.splashScreenUrls` or `Application.brandStyles.splashScreenUrls`
4. If pre-generated URL found, fetch PNG from storage and proxy it (iOS doesn't follow redirects)
5. If no pre-generated, dynamically generate via `generateSplashScreen()` using Sharp
6. Return PNG with `Cache-Control: public, max-age=86400, immutable`
7. Fallback on any error: 1x1 transparent PNG

### ChippMono Builder Splash Generation API

**Endpoint**: `POST /api/applications/{applicationId}/splash-screens`
**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/api/applications/[applicationId]/splash-screens/route.ts`

**Flow**:
1. Authenticate developer
2. Verify application ownership via workspace membership
3. Validate app has custom logo (not default) and primaryColor
4. Call `generateAndUploadSplashScreens()`:
   - Fetch logo once (with SSRF protection: HTTPS only, allowed domains only, no redirects)
   - Generate all 10 splash sizes in parallel via Sharp
   - Upload each to GCS at `application-splash/{applicationId}/splash-{id}-{size}-{ts}.png`
   - Store URLs in both `ApplicationBrandStyles.splashScreenUrls` and `Application.brandStyles.splashScreenUrls`
5. Return JSON with `{ success: true, splashScreenUrls: { "1320x2868": "https://...", ... } }`

### ChippDeno Consumer Splash Route (Already Implemented)

**Endpoint**: `GET /consumer/:appNameId/pwa/splash/{width}x{height}`
**File**: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/pwa.ts`

**Flow**:
1. Parse dimensions, resolve app by appNameId
2. Check for pre-generated splash URL in `brandStyles.splashScreenUrls`
3. If found and URL passes SSRF validation, fetch and proxy PNG
4. Otherwise, generate SVG dynamically via `generateSplashSVG()`
5. Return SVG with `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=86400`

### ChippDeno Builder Splash Route (Already Implemented)

**Endpoint**: `GET /api/pwa/splash/{width}x{height}`
**File**: `/Users/hunterhodnett/code/chipp-deno/src/api/routes/pwa/index.ts`

**Flow**:
1. Parse dimensions (validated: 100-4096 range)
2. Resolve whitelabel brand from hostname
3. Generate SVG via `generateSplashSVG()`
4. Return SVG with `Cache-Control: public, max-age=86400`

## HTML Head Injection

### ChippMono (`/w/chat/layout.tsx`)
```html
<!-- For each of 11 splash sizes -->
<link
  rel="apple-touch-startup-image"
  href="/w/chat/api/splash/1320x2868?appId={id}&v={timestamp}&cb={cacheBuster}"
  media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)"
/>
```

### ChippDeno (manifest `apple_touch_startup_images`)
Both ChippDeno routes include splash screen references in the manifest JSON:
```json
{
  "apple_touch_startup_images": [
    {
      "media": "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)",
      "href": "/consumer/{slug}/pwa/splash/1320x2868"
    }
  ]
}
```

**Note**: ChippMono injects `<link rel="apple-touch-startup-image">` tags directly into HTML AND includes them in the manifest. ChippDeno only includes them in the manifest. iOS Safari requires the HTML `<link>` tags for splash screens to work -- the manifest `apple_touch_startup_images` field is non-standard and may not be honored by all browsers. This is a potential gap.

## Builder UI (PWADeploySetupDialog)

**ChippMono file**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/PWADeploySetupDialog.tsx`

**Features**:
- Status section with green "PWA Ready" indicator
- App URL display with copy/open buttons
- iOS and Android installation instructions
- Manual cache refresh button (updates `application.updatedAt`)
- Splash screen section:
  - "Refresh" button triggers POST to `/api/applications/{id}/splash-screens`
  - Thumbnail grid showing all generated splash screen sizes (12x20 thumbnails)
  - Click-to-preview modal for full-size splash screen view
  - Shows count of generated sizes
- Feature checklist (Instant Access, Home Screen Icon, Full Screen, Fast Loading)
- Pro tips info box

## Security Considerations

### SSRF Protection (ChippMono - `generateAndUploadSplashScreens.ts`)
- HTTPS-only URLs
- Allowed domain whitelist: `storage.googleapis.com`, `firebasestorage.googleapis.com`, custom storage URL
- `redirect: "manual"` to prevent redirect-based SSRF
- 10-second fetch timeout

### SSRF Protection (ChippDeno - `pwa.ts`)
- `isAllowedFetchUrl()`: validates protocol (http/https only), standard ports (80/443), blocks private IPs
- `isPrivateHost()`: blocks localhost, .local, .internal, RFC1918 ranges, IPv6 loopback/link-local
- `redirect: "error"` to block all redirects
- `sanitizeImageUrl()`: validates URLs, allows safe base64 data URIs
- `escapeForXML()`: prevents XSS in SVG text content

## Gaps Between ChippMono and ChippDeno

### 1. SVG vs PNG Output
- **ChippMono**: Generates PNG via Sharp (better for iOS compatibility)
- **ChippDeno**: Generates SVG (lighter, no Sharp dependency, but iOS Safari may not render SVG splash screens correctly)
- **Risk**: iOS Safari historically requires PNG for `apple-touch-startup-image`. SVG may show as blank.
- **Recommendation**: If iOS splash screens appear blank, add Sharp to ChippDeno for PNG output

### 2. Missing HTML `<link>` Tag Injection
- **ChippMono**: Injects `<link rel="apple-touch-startup-image">` directly into HTML `<head>` via React server component
- **ChippDeno**: Only includes splash URLs in manifest JSON (`apple_touch_startup_images`), which is non-standard
- **Impact**: iOS Safari requires the `<link>` tags in HTML. Without them, splash screens won't display.
- **Fix**: Inject splash `<link>` tags in the Cloudflare worker `brand-inject.ts` `transformHtml()` function

### 3. No Pre-Generation Pipeline
- **ChippMono**: Has a builder-triggered pipeline to batch-generate and upload PNGs to GCS
- **ChippDeno**: Always generates on-demand (acceptable for SVG, problematic if switching to PNG)
- **Impact**: Acceptable as-is with SVG; would need a pipeline if switching to PNG

### 4. Logo Size Difference
- **ChippMono**: `Math.min(width, height) * 0.3` = 30% of smallest dimension
- **ChippDeno**: `Math.min(width, height) * 0.2` = 20% of smallest dimension
- **Impact**: ChippDeno logos appear smaller. May want to increase to 0.3 for consistency.

### 5. Grid Line Color on Light Background
- **ChippMono**: `rgba(0, 0, 0, 0.3)` -- 30% black
- **ChippDeno**: `rgba(0, 0, 0, 0.15)` -- 15% black (lighter)
- **Impact**: Minor visual difference. ChippDeno grid is subtler on light backgrounds.

### 6. Text Color for Light Background
- **ChippMono**: `#1F2937` (Tailwind gray-800)
- **ChippDeno**: `#000000` (pure black)
- **Impact**: Very minor. `#1F2937` is more readable/softer.

### 7. App Name Display
- **ChippMono**: Does NOT render the app name in the splash screen image
- **ChippDeno**: Renders app name below logo with `opacity: 0.8`
- **Impact**: ChippDeno actually has MORE content. This is an enhancement, not a gap.

### 8. Missing `shouldUseLightText` Linearized Luminance
- **ChippMono** (`shared/utils/src/shouldUseLightText.ts`): Uses proper sRGB linearization with WCAG-aligned formula
- **ChippDeno** (`consumer/pwa.ts:63-70`): Uses simpler BT.601 formula `(0.299*R + 0.587*G + 0.114*B) / 255`
- **Impact**: May produce different bg color choices for edge-case brand colors (e.g., medium-tone greens). Most colors will match.

## Migration Recommendations

### If iOS Splash Screens Work with SVG (Test First)
No changes needed. ChippDeno already has feature parity with enhanced app name display.

### If iOS Requires PNG (Likely)
1. **Add Sharp to Deno**: `import sharp from "npm:sharp"` (requires `--allow-ffi`)
2. **Port the PNG generation function** from `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/splashScreen/generateSplashScreen.ts`
3. **Keep SVG as fallback** for non-iOS clients
4. **Add `<link>` injection** in `cloudflare-worker/src/brand-inject.ts`:
   ```typescript
   // In transformHtml(), before </head>:
   const splashLinks = iosSplashScreenSizes.map(size =>
     `<link rel="apple-touch-startup-image" href="/consumer/${config.slug}/pwa/splash/${size.width}x${size.height}" media="(device-width: ${size.deviceWidth}px) and (device-height: ${size.deviceHeight}px) and (-webkit-device-pixel-ratio: ${size.ratio})">`
   ).join('\n');
   html = html.replace('</head>', `${splashLinks}</head>`);
   ```

### Quick Fixes (Regardless of PNG/SVG Decision)
1. **Increase logo size** from 0.2 to 0.3 to match ChippMono
2. **Fix grid line color** on light bg from 0.15 to 0.3 opacity
3. **Fix text color** on light bg from `#000000` to `#1F2937`
4. **Add HTML `<link>` tags** for iOS splash screen support

## Files to Reference

1. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils-server/src/splashScreen/generateSplashScreen.ts` - Core Sharp-based PNG generation
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/lib/pwa/splashScreenSizes.ts` - iOS device sizes and media queries
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/api/splash/[dimensions]/route.tsx` - Splash route with pre-gen/fallback logic
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/apiService/splashScreen/generateAndUploadSplashScreens.ts` - Batch generation + upload pipeline
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/w/chat/layout.tsx` - HTML head injection of splash links
6. `/Users/hunterhodnett/code/chipp-monorepo/shared/utils/src/shouldUseLightText.ts` - Perceptually-accurate luminance function
7. `/Users/hunterhodnett/code/chipp-deno/src/api/routes/consumer/pwa.ts` - ChippDeno consumer PWA (already implemented)
8. `/Users/hunterhodnett/code/chipp-deno/src/api/routes/pwa/index.ts` - ChippDeno builder PWA (already implemented)

## Related Features
- **PWA Manifest** - shares the same routes and app resolution logic
- **PWA Icons** - generated alongside splash screens
- **Brand Sync Service** - R2-based branding for instant consumer loading
- **Cloudflare Worker Brand Injection** - HTML transformation for consumer chat
- **OG Image Generation** - similar grid+gradient visual design pattern
