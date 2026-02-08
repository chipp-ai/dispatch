# Cloudflare Worker & R2

## Architecture

```
Browser → Cloudflare Worker → R2 (static assets) OR Deno API (API routes)
```

**What the Worker does:**

- Serves Svelte SPA from R2 bucket
- Injects `window.__APP_BRAND__` for instant branded splash screens
- Proxies API routes to Deno backend
- Serves PWA manifests and icons per-app

## Key Files

- `cloudflare-worker/src/index.ts` - Main worker entry
- `cloudflare-worker/src/brand-inject.ts` - Brand injection logic
- `cloudflare-worker/wrangler.toml` - Worker configuration
- `cloudflare-worker/scripts/dev.sh` - Development script
- `cloudflare-worker/scripts/upload-assets.sh` - Asset upload

## wrangler.toml

```toml
name = "chipp-deno-spa"
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "chipp-deno-spa"
preview_bucket_name = "chipp-deno-spa-dev"  # Dev bucket

[vars]
API_ORIGIN = "https://dino-mullet.chipp.ai"
```

## Routes Proxied to API

- `/api/*` - All API endpoints
- `/auth/*` - Authentication
- `/ws/*` - WebSocket connections
- `/consumer/*` - Consumer routes, PWA assets
- `/generate/*` - AI generation
- `/webhooks/*` - Stripe, Twilio
- `/health` - Health check

## Local Development

**Full Worker development (standalone):**

```bash
cd cloudflare-worker
./scripts/dev.sh                    # Full: build + upload + run
./scripts/dev.sh --skip-build       # Upload existing build
./scripts/dev.sh --worker-only      # Just start Worker (fastest)
```

**Integrated development (via main dev.sh):**

```bash
./scripts/dev.sh                    # Starts API + Vite + Worker together
./scripts/dev.sh --no-worker        # Skip Worker (use Vite directly at :5174)
```

**CRITICAL: The --remote flag:**

When running `wrangler dev`, use `--remote` to connect to real R2 bucket. Without it, Miniflare simulates an empty bucket and assets won't load.

## R2 Bucket Structure

```
chipp-deno-spa/
├── index.html
├── assets/
│   ├── *.js
│   ├── *.css
│   └── fonts/
└── brands/
    └── {app-slug}/
        ├── config.json    # Brand metadata
        ├── logo.png       # App logo
        └── og.png         # Social share image
```

## Brand Injection (window.__APP_BRAND__)

For consumer chat routes (`/w/chat/{slug}`), the Worker injects:

```javascript
window.__APP_BRAND__ = {
  slug: "my-app",
  name: "My App",
  color: "#FF5500",
  logo: "https://r2.chipp.ai/brands/my-app/logo.png",
};
```

This enables instant branded splash screens without waiting for API.

## Brand Sync Service

`src/services/brand-sync.service.ts` syncs app branding to R2:

- Called on app create/update
- Uses AWS Signature V4 for R2 auth (no SDK needed)
- Lazy-initialized, fails gracefully if R2 not configured

## Required Environment Variables

```bash
R2_ENDPOINT=https://{account}.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=chipp-deno-spa-dev
R2_PUBLIC_URL=https://r2.chipp.ai
```

## Updating SPA in R2

```bash
cd web && npm run build
cd ../cloudflare-worker
./scripts/upload-assets.sh
```

## Testing Brand Injection

1. Start full dev stack: `./scripts/dev.sh`
2. Navigate to `http://localhost:8788/#/w/chat/{app-slug}`
3. Splash should show app's logo and colors

## Debug Brand Config

```bash
npx wrangler r2 object get chipp-deno-spa-dev/brands/{slug}/config.json --pipe
```
