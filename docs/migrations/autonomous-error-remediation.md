# Autonomous Error Remediation System

## Overview

Wire up Loki errors → Chipp Issues → autonomous Claude Code sessions → fix PRs.

**Chipp Issues** (`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-issues`) is a standalone Next.js app with its own Postgres DB, pgvector, MCP server, and full issue lifecycle. It's dormant (not in production use) and kept independent from chipp-deno for fault tolerance.

**Goal**: Errors from chipp-deno's Loki logging infrastructure automatically create deduplicated issues in Chipp Issues, which then spawns Claude Code sessions via GitHub Actions to autonomously investigate and fix bugs, opening PRs against chipp-deno.

## Architecture

```
chipp-deno pods (stdout)
    |
    v
Promtail --> Loki (GCS, 30-day retention)
    |
    v
Grafana Alert Rule (new error fingerprint or spike)
    | webhook (POST with auth header)
    v
Chipp Issues /api/loki/webhook
    |
    v
Fingerprint + Dedup (chipp_external_issue table, UNIQUE(source, external_id))
    |
    +-- Known issue --> increment count, update last_seen, SKIP spawn
    |
    +-- NEW issue --> create issue record
                        |
                        v
                  Spawn Gate Check:
                    - active investigations < MAX_CONCURRENT (2)
                    - daily count < DAILY_BUDGET (10)
                    - fingerprint not in cooldown
                    - kill switch not enabled
                        |
                        v
                  GitHub Actions workflow_dispatch
                  (chipp-deno repo: .github/workflows/auto-investigate.yml)
                        |
                        v
                  Claude Code session:
                    1. /autonomous-investigation with full error context
                    2. Attempt fix based on investigation report
                    3. Open PR with CHIPP-XXX in title
                    4. Post activity updates back to Chipp Issues API
                        |
                        v
                  Existing Chipp Issues infrastructure:
                    - PR auto-matched to issue (3-step: identifier, semantic, Gemini)
                    - Auto-status transitions (In Review -> In Staging -> In Production)
                    - Fix verification (48h monitoring window)
                    - Priority escalation on fix failure (P4->P3->P2->P1)
```

## Dedup Strategy

### Error Fingerprinting

Loki structured logs have: `source`, `feature`, `msg` (plus entity IDs, stack traces)

1. **Normalize message**: strip UUIDs, customer IDs, timestamps, amounts, specific values
   - `"Stripe API error: card_declined for cus_abc123"` -> `"Stripe API error: card_declined for cus_*"`
   - `"Failed to fetch https://api.example.com/v1/thing/12345"` -> `"Failed to fetch https://api.example.com/v1/thing/*"`
2. **Fingerprint**: `sha256(source + "|" + feature + "|" + normalizedMessage)`
3. **Dedup lookup**: `SELECT FROM chipp_external_issue WHERE source = 'loki' AND external_id = fingerprint`
4. **If exists**: increment event count, update last_seen, do NOT spawn
5. **If new**: create issue, create external_issue link, check spawn gate

### Cooldown

After an investigation completes (success or failure), the fingerprint enters cooldown:
- Default: 24 hours
- Configurable per-issue
- During cooldown, new events for the same fingerprint just increment count

## Implementation Plan

### Piece 1: Grafana Alerting Configuration
**Where**: `monitoring/` in chipp-deno
**What**:
- Add unified alerting config to `monitoring/grafana/values.yaml`
- Add contact point: webhook to Chipp Issues
- Add alert rule: fires on new error fingerprints or error spikes
- Auth: bearer token in webhook header (CHIPP_ISSUES_API_KEY)

### Piece 2: Loki Webhook Handler in Chipp Issues
**Where**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-issues`
**Files to create/modify**:
- `app/api/loki/webhook/route.ts` — NEW: Grafana alert receiver
- `lib/services/lokiService.ts` — NEW: fingerprinting, message normalization, context extraction
- `lib/services/spawnService.ts` — NEW: GitHub Actions dispatch, concurrency gate, budget tracking
- `lib/services/issueService.ts` — MODIFY: hook issue creation → spawn service

**DB changes**:
```sql
-- Spawn tracking columns on chipp_issue
ALTER TABLE chipp_issue ADD COLUMN spawn_status TEXT; -- null, queued, running, completed, failed
ALTER TABLE chipp_issue ADD COLUMN spawn_run_id TEXT; -- GitHub Actions run ID
ALTER TABLE chipp_issue ADD COLUMN spawn_started_at TIMESTAMP;
ALTER TABLE chipp_issue ADD COLUMN spawn_completed_at TIMESTAMP;

-- Daily budget tracking
CREATE TABLE chipp_spawn_budget (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  spawn_count INT DEFAULT 0,
  max_spawns INT DEFAULT 10
);

-- Cooldown tracking (reuse chipp_external_issue.metadata or add column)
ALTER TABLE chipp_external_issue ADD COLUMN cooldown_until TIMESTAMP;
ALTER TABLE chipp_external_issue ADD COLUMN event_count INT DEFAULT 1;
ALTER TABLE chipp_external_issue ADD COLUMN last_seen_at TIMESTAMP DEFAULT NOW();
```

### Piece 3: GitHub Actions Workflow
**Where**: `chipp-deno/.github/workflows/auto-investigate.yml`
**What**:
- Triggered by `workflow_dispatch` with inputs (issue_id, identifier, title, description, source, feature, error_context)
- Checks out chipp-deno at `staging`
- Installs Claude Code CLI
- Runs autonomous investigation with full error context
- Attempts fix, opens PR with `CHIPP-XXX` in title targeting `staging`
- Posts activity updates back to Chipp Issues API
- Updates issue spawn_status throughout lifecycle

### Piece 4: Fix Verification Adaptation
**Where**: Chipp Issues `lib/services/fixTrackingService.ts`
**What**:
- Currently verifies fixes by checking Sentry for recurring events
- Modify to check Loki: query Loki API for the fingerprint after deploy
- If fingerprint fires again during 48h monitoring window → fix failed
- Keep same escalation logic (priority bump, reopen, add label)

## Existing Chipp Issues Infrastructure (No Changes Needed)

These features work as-is once PRs start coming in:
- `chipp_external_issue` table with UNIQUE(source, external_id) for dedup
- `chipp_agent_activity` table for investigation logging
- `chipp_issue_pr` table for PR tracking
- PR matching (identifier → semantic → Gemini AI at 85% threshold)
- Auto-status transitions (PR opened → In Review → merged → In Staging → In Production)
- Priority escalation on fix failure
- Full audit trail (`chipp_issue_history`)
- MCP server with 15 tools (agents can use these during investigation)
- Kanban board UI for human oversight
- Webhook dispatch for notifications

## Key Files in Chipp Issues (Reference)

| File | Purpose |
|------|---------|
| `app/api/sentry/webhook/route.ts` | Model for Loki webhook (similar pattern) |
| `lib/services/externalIssueService.ts` | Dedup logic (findByExternalId, linkExternalIssue) |
| `lib/services/issueService.ts` | Issue CRUD, embedding generation |
| `lib/services/prMatchingService.ts` | 3-step PR matching pipeline |
| `lib/services/fixTrackingService.ts` | Fix verification lifecycle |
| `lib/services/sentryService.ts` | Sentry API calls (model for Loki equivalent) |
| `lib/services/notificationService.ts` | Slack notifications |
| `lib/services/webhookService.ts` | Outbound webhook dispatch |
| `lib/mcp/server.ts` | MCP server with 15 tools |
| `lib/db.ts` | Database pool and query helpers |
| `lib/db/migrations/` | Migration files |

## Safety Controls

| Control | Value | Purpose |
|---------|-------|---------|
| MAX_CONCURRENT | 2 | Max simultaneous investigations |
| DAILY_BUDGET | 10 | Max investigations per day |
| COOLDOWN_HOURS | 24 | Time before same fingerprint can re-trigger |
| KILL_SWITCH | env var | Emergency stop for all spawning |
| MIN_EVENT_COUNT | 3 | Minimum events before triggering (avoid transient errors) |
| SPAWN_DELAY_MINUTES | 5 | Wait after first event before spawning (let events accumulate for context) |

## Environment Variables (Chipp Issues)

```
# Loki webhook auth
LOKI_WEBHOOK_SECRET=<shared secret for Grafana webhook>

# GitHub Actions dispatch
GITHUB_TOKEN=<PAT with workflow dispatch permission on chipp-deno repo>
GITHUB_REPO_OWNER=<org>
GITHUB_REPO_NAME=chipp-deno
GITHUB_WORKFLOW_ID=auto-investigate.yml

# Spawn controls
MAX_CONCURRENT_SPAWNS=2
DAILY_SPAWN_BUDGET=10
SPAWN_COOLDOWN_HOURS=24
MIN_EVENT_COUNT_TO_SPAWN=3
SPAWN_DELAY_MINUTES=5
SPAWN_KILL_SWITCH=false
```

## Environment Variables (chipp-deno GitHub Actions)

```
# In auto-investigate.yml workflow
CHIPP_ISSUES_API_URL=https://chipp-issues.yourhost
CHIPP_ISSUES_API_KEY=<bearer token>
ANTHROPIC_API_KEY=<for Claude Code>
```
