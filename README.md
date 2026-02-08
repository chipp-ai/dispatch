# Chipp Deno

Consumer-facing application for Chipp AI chatbots. Built with Deno + Hono API, Svelte 5 SPA, and Cloudflare Worker edge serving.

## Claude Code Setup

Start Claude Code with pre-configured auth and MCP tools:

```bash
# First time setup (run once)
./scripts/setup-service-account.sh  # Creates non-expiring GCloud key
./scripts/setup-shell-aliases.sh    # Adds cc/ccyolo aliases
source ~/.zshrc

# Daily usage
cc           # Start Claude Code (normal mode)
ccyolo       # Start Claude Code (autonomous mode, no prompts)
ccc          # Continue previous session
cccyolo      # Continue in autonomous mode
```

See `CLAUDE.md` for full documentation on commands, skills, and MCP tools.

## Quick Start

```bash
# Start development server
./scripts/dev.sh

# Services:
#   http://localhost:8000  - Deno API
#   http://localhost:5173  - Vite (Svelte SPA)
#   http://localhost:8788  - Cloudflare Worker (brand injection)
```

### Development Modes

```bash
./scripts/dev.sh              # Full stack (API + Vite + Worker)
./scripts/dev.sh --no-worker  # Skip Worker (faster startup)
./scripts/dev.sh --api-only   # Just the Deno API server
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                                    │
├─────────────────────────────────────────────────────────────────────┤
│   User Browser                                                       │
│        │                                                             │
│        ▼                                                             │
│   Cloudflare Worker (build.chipp.ai)                                │
│   ├── Serves SPA from R2 bucket                                     │
│   ├── Injects window.__APP_BRAND__ for instant branded splash       │
│   ├── Sets PWA manifest, icons, theme color per-app                 │
│   └── Proxies /api/*, /auth/*, /consumer/* to Deno API              │
│        │                                                             │
│        ▼                                                             │
│   Deno API (dino-mullet.chipp.ai)                                   │
│   ├── Authentication (OAuth, session management)                    │
│   ├── Application CRUD                                              │
│   ├── Chat/messaging                                                │
│   ├── PWA assets (manifest.json, icons, splash screens)             │
│   └── WebSocket for real-time updates                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
chipp-deno/
├── main.ts                 # Deno API entry point
├── deno.json               # Deno configuration and tasks
├── src/
│   ├── api/               # API routes (Hono)
│   ├── services/          # Business logic
│   ├── db/                # Kysely database client
│   └── llm/               # LLM adapter and providers
├── web/                   # Svelte SPA
│   ├── src/routes/        # Page components
│   ├── src/stores/        # Svelte stores
│   └── src/lib/           # Components, design system
├── cloudflare-worker/     # Edge worker for R2 serving + brand injection
├── db/                    # Database migrations
├── charts/                # Kubernetes manifests
└── scripts/               # Dev and deployment scripts
```

## Testing

```bash
deno task test                    # All tests
deno task test:routes             # Route tests only
deno task test:watch              # Watch mode
```

## Deployment

Merging to `staging` branch triggers automatic deployment to production GKE cluster.

## Environment Variables

Copy `.env.example` to `.env` and configure required variables for:
- Database connections
- Authentication (OAuth clients)
- R2/Cloudflare
- Stripe billing
- Sentry error tracking

## License

Proprietary - Chipp AI
