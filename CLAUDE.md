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
- 6 workflow types: `auto-investigate`, `prd-investigate`, `prd-implement`, `qa-test`, `deep-research`, `auto-triage`
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

## Database Access

### Local
```
postgresql://localhost:5432/dispatch
```

### Production (issues.chipp.ai)
Production dispatch runs on the same Cloud SQL instance as chipp-deno (`primary-postgres` at `34.41.92.151`) but in the `dispatch` database.

To connect via the chipp-database MCP tool:
```
db_connect(connectionUrl: "postgresql://postgres:<password>@34.41.92.151:5432/dispatch")
```

The password is in the K8s secret `chipp-issues` under `PG_DATABASE_URL`:
```bash
kubectl get secrets chipp-issues -o jsonpath='{.data.PG_DATABASE_URL}' | base64 -d
```

Key tables: `dispatch_issue`, `dispatch_status`, `dispatch_comment`, `dispatch_label`, `dispatch_issue_label`, `dispatch_agent_runs`.

The `dispatch_status` table defines board columns (Backlog, Investigating, Needs Review, In Progress, In Review, Done, Canceled). Filter issues by `status_id` to query specific columns.

## Cost Controls

Dispatch has a multi-layer cost control system to prevent runaway agent spend (added after DISPATCH-31 cost $257.90):

### Per-Run Cap (`--max-budget-usd`)
Every `claude --print` invocation in all 6 workflow files includes `--max-budget-usd "${MAX_AGENT_COST_PER_RUN:-25}"`. Claude CLI tracks cost client-side and self-terminates after the budget is exceeded.

- Default: $25 per run (configurable via GitHub Actions `vars.MAX_AGENT_COST_PER_RUN`)
- The `result` event is still emitted on budget termination with `"subtype":"error_max_budget_usd"` and `is_error: false`
- Cost extraction and persistence still works normally
- **First API call can exceed the cap** (checked after each call completes), but this is negligible for $25 budgets

### Daily Cost Limit (server-side)
`canSpawn()` in `lib/services/spawnService.ts` has 4 gates:
1. Kill switch (`SPAWN_KILL_SWITCH`)
2. Concurrency limit (`MAX_CONCURRENT_SPAWNS_*`)
3. Daily spawn count (`DAILY_SPAWN_BUDGET_*`)
4. **Daily cost limit** (`DAILY_COST_LIMIT_USD`, default $200)

The daily cost gate sums `cost_usd` from `dispatch_agent_runs WHERE started_at >= CURRENT_DATE`.

### Slack Budget Warnings
When a run's cost reaches 90% of the per-run cap, the Slack notification includes a `:warning: hit budget limit` suffix.

### Stats Endpoint
`GET /api/spawns/stats` returns `dailyCostLimit` alongside `dailyCost` for dashboard display.

### Configuration
| Env Var | Default | Where | Purpose |
|---------|---------|-------|---------|
| `MAX_AGENT_COST_PER_RUN` | `25` | GitHub Actions vars | Per-run dollar cap |
| `DAILY_COST_LIMIT_USD` | `200` | Server env | Daily total cost gate |

See `docs/cost-controls.md` for full architecture details.

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
