<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
    <img src="docs/logo-light.svg" alt="Dispatch" width="480">
  </picture>
  <p><strong>Tell it what to build. Agents investigate, plan, implement, and ship.</strong></p>
  <p>
    <a href="#quick-start">Quick Start</a> &#8226;
    <a href="#what-it-looks-like">Screenshots</a> &#8226;
    <a href="#setting-up-github-actions-agents">Docs</a> &#8226;
    <a href="#mcp-integration">MCP</a> &#8226;
    <a href="#license">License</a>
  </p>
</div>

---

Dispatch sends Claude Code agents to investigate, plan, implement, test, and research across your codebase -- all orchestrated through a terminal UI with live streaming. Every mission runs as a real Claude Code session in GitHub Actions, with structured activity tracking.

## What it looks like

**Terminal** -- Describe what you want done. The orchestrator creates issues, picks a workflow, and dispatches agents.

<img src="docs/screenshots/terminal.png" width="100%" alt="Dispatch terminal - command center" />

**Orchestrator response** -- The agent searches existing missions, scopes the work, and confirms before dispatching.

<img src="docs/screenshots/terminal-chat.png" width="100%" alt="Dispatch terminal - orchestrator planning a mission" />

**Board** -- Track all missions across your pipeline. Issues flow from waiting, to development, to PR, to verification.

<img src="docs/screenshots/board.png" width="100%" alt="Dispatch board - kanban view of missions" />

**GitHub Actions** -- Each agent runs as a real Claude Code session. Watch it read files, run commands, and write code.

<img src="docs/screenshots/github-action.png" width="100%" alt="GitHub Actions - Claude Code agent investigating an issue" />

## What it does

- **Terminal-first orchestration** -- Type what you want done in natural language. The orchestrator creates issues, selects workflows, and dispatches agents.
- **5 workflow types** -- Auto-investigate (from error alerts), PRD investigate (exploration + plan), PRD implement (code changes + PR), QA test, and deep research.
- **Plan-review-implement loop** -- Agents investigate first, post a structured plan for human review, then implement on approval.
- **Live terminal streaming** -- Watch agent output in real-time via SSE as Claude Code reads files, runs commands, and writes code.
- **Customer portal** -- Give stakeholders read-only portal links to track their issues and agent activity.
- **MCP server** -- Integrate with Claude Code, Cursor, or any MCP-compatible client for bidirectional issue management.
- **Budget & safety controls** -- Daily spawn limits, per-issue concurrency, cooldowns, and a kill switch.

## Architecture

```
Terminal UI (Next.js)
    |
    v
Orchestrator (Claude API + tools)
    |
    v
GitHub Actions (Claude Code agents)
    |
    v
Your Codebase (PRs targeting your default branch)
    |
    v
Dispatch API (activity, plans, terminal streaming)
```

**Stack:** Next.js 15, PostgreSQL + pgvector, WebSocket (terminal streaming), GitHub Actions (agent runtime), Claude API (orchestrator + agents).

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/chipp-ai/dispatch.git
cd dispatch
npm install
```

### 2. Start the database

```bash
docker-compose up -d db
```

Or use an existing PostgreSQL instance -- it needs the [pgvector](https://github.com/pgvector/pgvector) extension. If using your own Postgres:

```bash
createdb dispatch
psql dispatch -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 3. Run the init migration

```bash
psql postgresql://postgres:postgres@localhost:5432/dispatch -f scripts/migrations/001-init.sql
```

This creates all 21 tables, enums, and indexes in a single step.

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values. Minimum required:

```env
PG_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dispatch
ANTHROPIC_API_KEY=sk-ant-...    # For orchestrator + agents
DISPATCH_PASSWORD=your-password  # Web UI login
GITHUB_REPO=your-org/your-repo  # Target codebase
GITHUB_TOKEN=ghp_...            # For dispatching agents (see note below)
```

> **GitHub token:** Must have **`repo`** and **`workflow`** scopes. Two options:
> - **Classic PAT** (recommended): Create at [github.com/settings/tokens/new](https://github.com/settings/tokens/new) with `repo` and `workflow` scopes selected.
> - **`gh auth` token**: Run `gh auth refresh -h github.com -s workflow` to add the required `workflow` scope to your existing token, then use `gh auth token` to get the value.
>
> Tokens without `workflow` scope will fail with a **502 Server Error** when dispatching agents.

### 5. Personalize your instance (optional)

Make it yours:

```bash
# Set your project name and issue prefix in .env
NEXT_PUBLIC_APP_NAME=MyProject
DEFAULT_ISSUE_PREFIX=ENG

# Generate braille art from your logo (displayed in the terminal)
npm run generate-logo -- path/to/your-logo.png
```

### 6. Start the dev server

```bash
npm run dev
```

Open http://localhost:3002 and log in with your `DISPATCH_PASSWORD`.

## Setting up GitHub Actions agents

Dispatch spawns agents by triggering GitHub Actions `workflow_dispatch` events on your target repository. The agent workflows ship with Dispatch and need to be copied into your target repo.

### 1. Copy workflows to your target repo

```bash
cp -r .github/workflows/{auto-investigate,prd-investigate,prd-implement,qa-test,deep-research}.yml ../your-repo/.github/workflows/
```

### 2. Add secrets to your target repo

Go to your target repo's **Settings > Secrets and variables > Actions** and add:

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key. Agents use this to run Claude Code sessions during workflows. |
| `DISPATCH_API_URL` | For callbacks | Your Dispatch instance URL (e.g. `https://dispatch.yoursite.com`). Agents call back to report activity, post plans, and stream terminal output. Without this, agents still run but can't report back. |
| `DISPATCH_API_KEY` | For callbacks | Must match the `DISPATCH_API_KEY` in your Dispatch `.env`. Used to authenticate agent callbacks. |

> **Tip:** For initial testing, you only need `ANTHROPIC_API_KEY`. The agent will run and investigate your codebase. Add `DISPATCH_API_URL` and `DISPATCH_API_KEY` when you're ready for live terminal streaming and activity tracking.

### 3. Configure your Dispatch `.env`

These environment variables control how Dispatch dispatches workflows:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | Must have `repo` and `workflow` scopes. Use a [classic PAT](https://github.com/settings/tokens/new), or run `gh auth refresh -h github.com -s workflow` then `gh auth token`. Without `workflow` scope, dispatches fail with 502. |
| `GITHUB_REPO` | Yes | Target repo in `owner/repo` format (e.g. `acme/backend`). |
| `GITHUB_REF` | No | Branch for workflow dispatch (default: `main`). Agents check out this branch when they run. Set this to your default branch if it's not `main`. |
| `NEXT_PUBLIC_GITHUB_REPO` | No | Same `owner/repo` value. Enables "View on GitHub" links in the UI for workflow runs. |

### 4. Branch configuration

All workflows accept an optional `ref` input that controls which branch agents check out. The precedence is:

1. `ref` input passed per-dispatch (set automatically from `GITHUB_REF`)
2. Falls back to `github.ref_name` (the branch the workflow was dispatched on)
3. Defaults to `main` if neither is set

If your default branch is `main`, no extra configuration is needed. If it's something else (e.g. `develop`), set `GITHUB_REF=develop` in your `.env`.

## Preparing your codebase for agents

Dispatch agents are Claude Code sessions that check out your codebase and work autonomously. The single most impactful thing you can do is add a `CLAUDE.md` file to your repository root. This is the context file that Claude Code reads at the start of every session -- it's how agents understand your project.

### CLAUDE.md (required)

Create a `CLAUDE.md` in your repository root. This file should give an agent everything it needs to navigate, understand, and safely modify your codebase.

**What to include:**

```markdown
# Project Name

Brief description of what the project does and its core architecture.

## Tech Stack

- Language/runtime (e.g. TypeScript, Node.js 20, Deno 2.x)
- Framework (e.g. Next.js 15, Express, Hono)
- Database (e.g. PostgreSQL with Prisma, MongoDB with Mongoose)
- Key libraries (e.g. Zod for validation, Tailwind for styling)

## Project Structure

```
src/
  api/         -- API route handlers
  services/    -- Business logic
  db/          -- Database queries and migrations
  utils/       -- Shared helpers
tests/         -- Test files mirror src/ structure
```

## Development Commands

```bash
npm run dev      # Start dev server
npm run test     # Run tests
npm run lint     # Lint check
npm run build    # Production build
```

## Key Patterns

- How requests flow through the system (middleware -> handler -> service -> db)
- How errors are handled (custom error classes, error middleware, logging patterns)
- How authentication works (JWT, sessions, API keys)
- How database queries are structured (ORM patterns, raw SQL conventions)
- How tests are written (testing framework, fixtures, mocks)

## Critical Rules

- Things agents must NEVER do (e.g. "never modify migration files that have already run")
- Security constraints (e.g. "always use parameterized queries, never string interpolation")
- Conventions (e.g. "all new API routes need tests", "use snake_case for DB columns")

## Common Pitfalls

- Known gotchas that trip up newcomers (and agents)
- Environment-specific quirks
- Things that look wrong but are intentional
```

**Why this matters:** Without a `CLAUDE.md`, agents can still read your code, but they'll spend time figuring out basics that you could tell them upfront. A good `CLAUDE.md` means agents spend more time solving the actual problem and less time orienting themselves.

### Subdirectory CLAUDE.md files

For larger codebases, you can add `CLAUDE.md` files to subdirectories. Claude Code automatically reads these when working in that directory. Useful for:

- `db/CLAUDE.md` -- Migration conventions, schema rules, query patterns
- `api/CLAUDE.md` -- Route patterns, auth middleware, request validation
- `tests/CLAUDE.md` -- Testing conventions, fixture setup, mock patterns

### Tips for effective agent context

1. **Be specific about commands.** Instead of "run the tests", say `npm run test -- --watch=false`. Agents execute exactly what you write.

2. **Document your git workflow.** Tell agents which branch to target for PRs, whether you use conventional commits, and any CI checks that must pass.

3. **List your non-obvious environment requirements.** If your tests need a running database, Redis, or specific env vars, say so. Agents will try to set these up.

4. **Explain what "done" looks like.** If every feature needs tests, types, and a migration, say that explicitly. Agents follow the standards you set.

5. **Include error handling patterns.** Show agents how you want errors logged and handled. This prevents agents from introducing inconsistent error handling.

6. **Keep it updated.** A stale `CLAUDE.md` is worse than none. When you change conventions, update the file. It's the source of truth for every agent session.

## Setting up webhooks

### GitHub webhook (PR reconciliation)

1. Go to your repo's Settings > Webhooks > Add webhook
2. Payload URL: `https://your-dispatch-instance.com/api/github/webhook`
3. Content type: `application/json`
4. Secret: Same as `GITHUB_WEBHOOK_SECRET` in your `.env`
5. Events: Pull requests

### Sentry webhook (optional, for error tracking)

1. Create an Internal Integration in Sentry
2. Set webhook URL: `https://your-dispatch-instance.com/api/sentry/webhook`
3. Enable events: Issue Created, Issue Resolved

## Configuration reference

See `.env.example` for all available configuration options with descriptions.

### Branding

Dispatch is fully white-labelable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_NAME` | `Dispatch` | Display name in UI |
| `NEXT_PUBLIC_APP_DESCRIPTION` | `Autonomous Agent Orchestration Platform` | Subtitle |
| `DEFAULT_ISSUE_PREFIX` | `DISPATCH` | Issue identifier prefix (e.g. `DISPATCH-123`) |
| `DEFAULT_WORKSPACE_NAME` | `My Workspace` | Default workspace name |
| `NEXT_PUBLIC_BRAND_BRAILLE` | (built-in art) | Override terminal braille art via env var |

### Logo customization

The terminal UI displays braille Unicode art as a brand mark. Generate it from any image:

```bash
npm run generate-logo -- path/to/your-logo.png

# Options
npm run generate-logo -- logo.png --width 30      # Wider output
npm run generate-logo -- logo.png --threshold 100  # Adjust brightness cutoff
npm run generate-logo -- logo.png --invert         # Light dots on dark
npm run generate-logo -- logo.png --preview        # Preview without writing file
```

This writes `lib/brand/logo-braille.ts` which the terminal components import. Alternatively, set `NEXT_PUBLIC_BRAND_BRAILLE` as an environment variable for Docker/k8s deployments.

## MCP integration

Dispatch exposes an MCP server at `/api/mcp`. Connect it to Claude Code:

```bash
claude mcp add dispatch --transport streamable-http https://your-dispatch-instance.com/api/mcp
```

Available tools: `search_issues`, `list_issues`, `get_issue`, `create_issue`, `update_issue`, `dispatch_investigation`, `dispatch_implementation`, `post_plan`, `report_blocker`, and more.

## Customer portal

Give your customers a branded, read-only portal to track the issues that matter to them. Each customer gets a unique portal link -- no login required, authenticated via a secure token in the URL. Customers see a kanban board of their issues and can drill into issue details with activity timelines.

### Why use it

- **Client visibility** -- Share real-time issue status with external stakeholders without giving them access to your internal tools.
- **Branded experience** -- Each customer's portal uses their brand color for a white-labeled feel.
- **Zero friction** -- Portal links work without any signup or login. Share via email, Slack, or embed in your support workflow.
- **Health tracking** -- The admin-side customer dashboard gives you a health score, stale issue alerts, and activity metrics per customer.

### Creating customers

1. Navigate to `/customers` in the sidebar
2. Click **New Customer**
3. Fill in:
   - **Name** (required) -- The customer or company name. A URL slug is auto-generated (e.g. "Acme Corp" becomes `acme-corp`).
   - **Brand Color** -- Hex color used throughout their portal (default: `#f9db00`).
   - **Logo URL** -- Optional logo shown in the portal header.
   - **Slack Channel ID** -- Optional. When set, Dispatch can auto-associate issues from that Slack channel with this customer.

A secure portal token is generated automatically. You can regenerate it at any time from the customer detail page.

### Linking issues to customers

Customers see issues where they are added as a **watcher**. To link issues to a customer:

- **From the issue detail page** -- Add the customer as a watcher in the issue sidebar.
- **Via the API** -- `POST /api/issues/:id` with the customer ID in the watcher list.
- **Via MCP** -- Use the `update_issue` tool to add watchers.
- **Automatically via Slack** -- When a customer has a `slackChannelId` configured, issues created from that channel are automatically linked.

### Sharing portal links

Click the **Portal** button on any customer card to copy their portal URL to your clipboard. The URL format is:

```
https://your-dispatch-instance.com/portal/{customer-slug}?token={portal-token}
```

Share this link with your customer. They can:
- View all their issues organized by status in a kanban board
- Click into any issue to see the full description, activity timeline, and metadata
- Toggle "Show closed" to see resolved issues

The portal is fully read-only -- customers cannot modify issues, only view them.

### Customer health dashboard

The admin-side customer detail page (`/customers/:id`) provides:

- **Health score** (0-100) -- Calculated based on critical issues, stale issues, unresponded items, and recent activity. Scores above 80 are good, 50-80 need attention, below 50 are at risk.
- **Metrics cards** -- Total issues, critical issues, average age, and last activity timestamp.
- **Filterable issues table** -- Filter by All, Critical, Stale, or Unresponded.
- **Activity feed** -- Recent activity across all of the customer's issues.

### Customer API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customers` | GET | List all customers with issue counts |
| `/api/customers` | POST | Create a new customer |
| `/api/customers/:id` | GET | Get customer details |
| `/api/customers/:id` | PATCH | Update customer (name, slug, brand color) |
| `/api/customers/:id` | DELETE | Delete customer (unlinks issues first) |
| `/api/customers/:id?action=regenerate-token` | POST | Regenerate portal token |
| `/api/customers/:id/stats` | GET | Get customer health metrics |
| `/api/portal/:slug?token=` | GET | Public portal data (issues by status) |
| `/api/portal/:slug/issue/:identifier?token=` | GET | Public issue detail |

## Autonomous error remediation

Dispatch can automatically detect production errors and spawn agents to investigate and fix them. This creates a closed loop: error occurs -> issue created -> agent investigates -> PR opened -> fix verified.

### How it works

```
Application logs (stdout)
    |
    v
Loki (log aggregation)
    |
    v
Grafana Alerting (error detection rules)
    |
    v
Dispatch webhook (/api/loki/webhook)
    |
    v
Fingerprint + deduplicate
    |
    v
Spawn gate (budget, cooldown, concurrency checks)
    |
    v
GitHub Actions (Claude Code auto-investigate workflow)
    |
    v
PR targeting your default branch + 48h fix verification
```

### Pipeline components

1. **Log aggregation** -- Your application writes structured JSON logs to stdout. A log collector (e.g. Promtail) ships them to Loki.

2. **Grafana alerting** -- Alert rules detect new error categories or error spikes. When triggered, Grafana sends a webhook to Dispatch with the error context (source, feature, message, event count).

3. **Loki webhook handler** (`/api/loki/webhook`) -- Receives Grafana alert payloads, extracts error context via `lokiService.ts` (fingerprinting, message normalization), deduplicates against existing issues via `dispatch_external_issue`, and creates new issues when novel errors appear.

4. **Spawn service** (`spawnService.ts`) -- Before dispatching an agent, checks safety gates:
   - **Daily budget** -- Configurable max spawns per day per workflow type (`DAILY_SPAWN_BUDGET_ERROR`)
   - **Concurrency limit** -- Max simultaneous agent runs (`MAX_CONCURRENT_SPAWNS_ERROR`)
   - **Cooldown** -- Per-fingerprint cooldown to avoid re-spawning for recurring errors (`SPAWN_COOLDOWN_HOURS`)
   - **Min event count** -- Only spawn after an error occurs N times (`MIN_EVENT_COUNT_TO_SPAWN`)

5. **Agent workflow** (`auto-investigate.yml`) -- GitHub Actions workflow that:
   - Checks out your codebase at your configured branch (`GITHUB_REF`, default: `main`)
   - Runs Claude Code with full error context
   - Investigates the root cause, attempts a fix
   - Opens a PR if changes are made
   - Reports activity back to Dispatch via API

6. **Fix verification** (`fixTrackingService.ts`) -- After a fix PR is merged, monitors for 48 hours. If the same error fingerprint reappears in Loki, the fix is marked as failed. If 48 hours pass with no recurrence, the fix is verified and the issue auto-closes.

### Setup

1. **Deploy a log aggregation stack** (Loki + Promtail + Grafana, or equivalent)

2. **Create Grafana alert rules** that detect errors and fire webhooks:
   ```yaml
   # Example: alert on new error categories
   condition: count by (source, feature, msg) > 3 in 15m
   ```

3. **Configure the webhook contact point** in Grafana to send to:
   ```
   POST https://your-dispatch-instance.com/api/loki/webhook
   Authorization: Bearer <DISPATCH_API_KEY>
   ```

4. **Set environment variables** in Dispatch:
   ```env
   # Safety controls
   MAX_CONCURRENT_SPAWNS_ERROR=3      # Max simultaneous error-fix agents
   DAILY_SPAWN_BUDGET_ERROR=10        # Max auto-spawns per day
   SPAWN_COOLDOWN_HOURS=24            # Don't re-spawn same error within 24h
   MIN_EVENT_COUNT_TO_SPAWN=3         # Minimum occurrences before spawning
   ```

5. **Copy the `auto-investigate.yml` workflow** to your target repository's `.github/workflows/` and configure the required secrets.

The Fleet Status panel in the sidebar shows real-time budget usage, active spawns, and daily outcomes.

### Structured logging requirements

The pipeline depends on your application writing structured JSON logs to stdout. Each error log must include `source`, `feature`, and `msg` fields so that Dispatch can fingerprint, deduplicate, and provide rich context to the investigating agent.

**Log format:**

```json
{
  "level": "error",
  "msg": "Failed to process payment: card declined",
  "source": "billing",
  "feature": "charge-customer",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "userId": "user_abc123",
  "orgId": "org_xyz789",
  "stripeCustomerId": "cus_abc",
  "amount": 2500,
  "currency": "usd",
  "error": "Stripe error: card_declined",
  "stack": "Error: card_declined\n    at ChargeService.charge (src/services/billing.ts:142)\n    at handleCheckout (src/api/routes/checkout.ts:58)"
}
```

**Required fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| `level` | Severity. Grafana alert rules filter on `level="error"` | `"error"`, `"warn"` |
| `msg` | Human-readable error message. Used for fingerprinting and agent context | `"Failed to process payment: card declined"` |
| `source` | Module or service area. Used for fingerprinting and routing | `"billing"`, `"auth"`, `"whatsapp-webhook"` |
| `feature` | Specific operation within the source. Used for fingerprinting | `"charge-customer"`, `"token-refresh"`, `"message-handler"` |

**Recommended fields (provide more context to the agent):**

| Field | Purpose |
|-------|---------|
| `error` / `stack` | Stack trace or error details -- the agent uses these to find the root cause |
| `userId`, `orgId`, `applicationId` | Entity IDs help the agent understand scope and reproduce |
| Domain-specific fields | Any relevant data (amounts, request IDs, external IDs) |

**Example loggers:**

```typescript
// Node.js / TypeScript -- simple structured logger
function logError(msg: string, context: Record<string, unknown>, error?: Error) {
  const entry = {
    level: "error",
    msg,
    ...context,
    ...(error && { error: error.message, stack: error.stack }),
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(entry));
}

// Usage
try {
  await chargeCustomer(customerId, amount);
} catch (err) {
  logError("Failed to process payment", {
    source: "billing",
    feature: "charge-customer",
    customerId,
    amount,
  }, err);
  throw err;
}
```

```python
# Python -- structured JSON logging
import json, sys, traceback
from datetime import datetime

def log_error(msg: str, source: str, feature: str, error: Exception = None, **context):
    entry = {
        "level": "error",
        "msg": msg,
        "source": source,
        "feature": feature,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **context,
    }
    if error:
        entry["error"] = str(error)
        entry["stack"] = traceback.format_exc()
    print(json.dumps(entry), file=sys.stderr)

# Usage
try:
    process_webhook(payload)
except Exception as e:
    log_error(
        "Webhook processing failed",
        source="stripe-webhook",
        feature="event-routing",
        error=e,
        event_type=payload.get("type"),
        event_id=payload.get("id"),
    )
    raise
```

```go
// Go -- slog with JSON handler
import (
    "log/slog"
    "os"
)

logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

// Usage
logger.Error("Failed to process payment",
    "source", "billing",
    "feature", "charge-customer",
    "customerId", customerId,
    "amount", amount,
    "error", err.Error(),
)
```

### Grafana alert rule configuration

The Grafana alert rule must extract `source`, `feature`, and `msg` from your logs and pass them as labels or annotations to the webhook. Here is a complete example:

```yaml
# In your Grafana alerting provisioning (e.g. values.yaml for Helm)
alerting:
  rules:
    - orgId: 1
      name: Dispatch Error Alerts
      folder: Dispatch
      interval: 1m
      rules:
        - uid: new-error-category
          title: New Error Category
          condition: C
          data:
            # Query A: count errors grouped by source, feature, msg
            - refId: A
              relativeTimeRange:
                from: 900    # 15 minutes
                to: 0
              datasourceUid: loki
              model:
                expr: |
                  count by (source, feature, msg) (
                    count_over_time(
                      {app="your-app", level="error"} | json [15m]
                    )
                  )
                queryType: range
            # Condition C: fire when count > 3
            - refId: C
              relativeTimeRange:
                from: 900
                to: 0
              datasourceUid: __expr__
              model:
                type: threshold
                expression: A
                conditions:
                  - evaluator:
                      type: gt
                      params: [3]

          # These labels are extracted from the query's group-by and passed to the webhook
          labels:
            severity: warning
          annotations:
            summary: "{{ $labels.source }}/{{ $labels.feature }}: {{ $labels.msg }}"
            description: "{{ $labels.msg }}"
            error_count: "{{ $values.A }}"

  contactPoints:
    - orgId: 1
      name: dispatch-webhook
      receivers:
        - uid: dispatch-loki
          type: webhook
          settings:
            url: "https://your-dispatch-instance.com/api/loki/webhook"
            httpMethod: POST
            authorization_scheme: Bearer
            authorization_credentials: "your-dispatch-api-key"

  policies:
    - orgId: 1
      receiver: dispatch-webhook
      group_by: ["alertname", "source", "feature"]
      group_wait: 5m
      group_interval: 1h
      repeat_interval: 24h
```

**How it flows:**

1. Your app writes `{"level":"error", "source":"billing", "feature":"charge-customer", "msg":"card declined", ...}` to stdout
2. Promtail (or your log collector) ships it to Loki with label `app="your-app"`
3. The Grafana alert rule queries `{app="your-app", level="error"} | json` -- the `| json` stage extracts `source`, `feature`, and `msg` as query-time labels
4. When the threshold fires (>3 events in 15min), Grafana sends a webhook with `labels.source`, `labels.feature`, `labels.msg` in the payload
5. Dispatch's `/api/loki/webhook` receives it, fingerprints by `source|feature|normalizedMsg`, deduplicates, and creates an issue
6. The spawn service checks budget/cooldown/concurrency gates, then dispatches `auto-investigate.yml` via GitHub Actions
7. Claude Code receives the full error context (source, feature, message, sample log lines, event count) and investigates your codebase

## Deployment

### Docker

```bash
docker build -t dispatch .
docker run -p 3002:3002 --env-file .env dispatch
```

### Docker Compose

```bash
docker-compose up
```

### Kubernetes

Example manifests are in `charts/`. See `charts/README.md` for instructions.

## Development

```bash
npm run dev            # Start dev server with hot reload
npm run build          # Production build
npm run test           # Run tests
npm run lint           # Lint check
npm run generate-logo  # Generate braille art from an image
```

## Troubleshooting

**502 when clicking Investigate / dispatching agents**

Your `GITHUB_TOKEN` is missing the `workflow` scope. This is the most common setup issue.

```bash
# Check your current scopes
gh auth status
# Look for 'workflow' in the Token scopes list

# Add the workflow scope
gh auth refresh -h github.com -s workflow

# Get the new token for your .env
gh auth token
```

Or create a new [classic PAT](https://github.com/settings/tokens/new) with `repo` + `workflow` scopes.

**Agent runs but doesn't report back to Dispatch**

The GitHub Actions workflow needs `DISPATCH_API_URL` and `DISPATCH_API_KEY` secrets set on your target repo. Without them, the agent still runs and can open PRs, but it can't stream terminal output or post activity updates back to the Dispatch UI.

**`GITHUB_REPO_OWNER not configured` error**

Set `GITHUB_REPO=owner/repo` in your `.env` (e.g. `GITHUB_REPO=acme/backend`). The owner and repo name are parsed from this value.

**Database migration fails with "extension vector does not exist"**

Install pgvector before running migrations:

```bash
psql dispatch -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

If using Docker Compose, the included `db` service has pgvector pre-installed.

**Port 3002 already in use / dev server won't start**

```bash
# Find and kill the stale process
lsof -ti :3002 | xargs kill -9

# Remove stale lock file if present
rm -f .next/dev/lock

# Restart
npm run dev
```

## License

MIT
