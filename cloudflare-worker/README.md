# Chipp Deno SPA Worker

Cloudflare Worker that serves the Svelte SPA from R2 and proxies API calls to GKE.

## Architecture

```
Browser Request
      │
      ▼
┌─────────────────┐
│   Cloudflare    │
│     Worker      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌──────────────────┐
│  R2   │  │ dino-mullet.     │
│Bucket │  │ chipp.ai (GKE)   │
│(SPA)  │  │                  │
└───────┘  └──────────────────┘
```

- **Static files** (`.js`, `.css`, `.html`, images) → Served from R2
- **API routes** (`/api/*`, `/auth/*`, `/ws/*`, etc.) → Proxied to GKE

## Setup

### 1. Create R2 Bucket

```bash
wrangler r2 bucket create chipp-deno-spa
```

### 2. Build and Upload SPA

```bash
# Build the Svelte SPA
cd ../web
npm run build

# Upload to R2
cd ../cloudflare-worker
./scripts/upload-assets.sh
```

### 3. Deploy Worker

```bash
npm install
npm run deploy
```

### 4. Configure Custom Domain (optional)

In Cloudflare dashboard:

1. Go to Workers & Pages → chipp-deno-spa
2. Settings → Triggers → Custom Domains
3. Add `deno.staging.chipp.ai`

## Development

```bash
npm run dev
```

This starts a local dev server with the worker. Note: R2 bindings require `--remote` flag for actual bucket access.

## API Routes Proxied

- `/api/*` - All API endpoints
- `/auth/*` - Authentication (OAuth, sessions)
- `/ws/*` - WebSocket connections
- `/consumer/*` - Consumer (end-user) routes
- `/generate/*` - AI generation endpoints
- `/webhooks/*` - Stripe, Twilio webhooks
- `/health` - Health check

## Environment Variables

| Variable     | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `API_ORIGIN` | Deno API server URL (default: `https://dino-mullet.chipp.ai`) |

Set in `wrangler.toml` or via Cloudflare dashboard.
