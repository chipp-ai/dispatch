# Dispatch

Autonomous agent orchestration platform. Next.js + PostgreSQL + pgvector + GitHub Actions + Claude.

## Architecture

```
app/              -- Next.js pages and API routes
components/       -- React components (terminal, board, issue detail)
lib/
  services/       -- Business logic layer (raw SQL queries via pg)
  mcp/            -- MCP server (tools for issue management)
  utils/          -- Auth, embeddings, helpers
  terminal/       -- WebSocket server for terminal streaming
scripts/
  migrations/     -- Database migrations (run sequentially)
.github/workflows/ -- Agent workflow definitions (Claude Code in GH Actions)
charts/           -- Kubernetes deployment examples
```

## Key Patterns

### Database
- PostgreSQL with pgvector for semantic search
- Raw SQL via `pg` -- no ORM. All queries live in `lib/services/`
- Tables use `dispatch_` prefix
- Parameterized queries only (`$1, $2`, never string interpolation)

### API Routes
- Next.js App Router at `app/api/`
- Auth via `requireAuth()` from `lib/utils/auth.ts` -- checks session cookie OR Bearer token
- All user-facing inputs sanitized, env vars for sensitive config

### Agent Workflows
- 5 workflow types: `auto-investigate`, `prd-investigate`, `prd-implement`, `qa-test`, `deep-research`
- Agents communicate back via REST API (`DISPATCH_API_URL` + `DISPATCH_API_KEY`)
- Terminal output streamed via SSE to the issue detail page
- Run results declared in `.scratch/run-result.json` with structured outcomes

### Terminal
- WebSocket server at `lib/terminal/websocket-server.ts`
- Orchestrator uses Claude API with tool calling to route requests
- Tools defined in `lib/services/orchestratorTools.ts`

### MCP Server
- Streamable HTTP transport at `/api/mcp`
- Server definition in `lib/mcp/server.ts`
- 18+ tools for issue CRUD, agent dispatch, plan management

## Common Commands

```bash
npm run dev      # Start dev server (port 3002)
npm run build    # Production build
npm run test     # Run tests
```

## Configuration

All branding and infrastructure is configurable via env vars. See `.env.example` for the full list.

Key env vars:
- `PG_DATABASE_URL` -- PostgreSQL connection string
- `ANTHROPIC_API_KEY` -- For orchestrator and agents
- `DISPATCH_PASSWORD` -- Web UI login
- `DISPATCH_API_KEY` -- API authentication
- `GITHUB_REPO` -- Target repository (owner/repo)
- `GITHUB_TOKEN` -- For dispatching agent workflows
- `NEXT_PUBLIC_APP_NAME` -- Display name (default: "Dispatch")
- `DEFAULT_ISSUE_PREFIX` -- Issue identifier prefix (default: "DISPATCH")
