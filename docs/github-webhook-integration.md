# GitHub Webhook Integration

This document describes how Dispatch integrates with GitHub to automatically track pull requests, update issue statuses, and verify fixes after deployment.

## Overview

The GitHub webhook integration provides:

- **Automatic PR-to-issue linking** via explicit identifiers, semantic search, and AI verification
- **Issue status automation** -- issues move through the board as PRs are opened, merged, and deployed
- **Fix verification** -- tracks whether merged PRs actually fix the underlying error (Sentry/Loki)
- **Release tracking** -- detects staging-to-main merges and marks all included issues as Done
- **Deployment detection** -- listens for workflow completion to trigger fix monitoring

## Architecture

```
┌──────────────┐  pull_request   ┌──────────────────────────┐  links/updates  ┌─────────────────┐
│   GitHub     │────────────────▶│  /api/github/webhook     │────────────────▶│ dispatch_issue  │
│  (webhooks)  │  workflow_run   │  (route.ts)              │                 │ dispatch_issue_pr│
└──────────────┘                 └──────────────────────────┘                 └─────────────────┘
                                          │                                          │
                                   ┌──────┴──────────┐                    ┌──────────┴──────────┐
                                   │                  │                    │                     │
                                   ▼                  ▼                    ▼                     ▼
                          ┌────────────────┐  ┌───────────────┐  ┌────────────────┐  ┌──────────────────┐
                          │ prMatchingService│  │fixTrackingService│  │issueHistoryService│  │boardBroadcast│
                          │ (Gemini AI)    │  │ (verification) │  │ (audit trail)  │  │ (SSE real-time)│
                          └────────────────┘  └───────────────┘  └────────────────┘  └──────────────────┘
```

## Setup

### 1. Create a GitHub Webhook

1. Go to **GitHub > Repository > Settings > Webhooks**
2. Click **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-dispatch-domain.com/api/github/webhook`
   - **Content type**: `application/json`
   - **Secret**: A strong random string (this becomes `GITHUB_WEBHOOK_SECRET`)
4. Select events:
   - **Pull requests** (opened, closed, edited, reopened)
   - **Workflow runs** (for deployment detection)

### 2. Configure Environment Variables

```bash
# Required: webhook signature verification
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Required: for PR matching and commit analysis
GITHUB_TOKEN=ghp_...

# Required: target repository
GITHUB_REPO=yourorg/yourrepo

# Required: for AI-powered PR matching
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
```

### 3. Verify the Integration

```bash
curl https://your-dispatch-domain.com/api/github/webhook
```

Expected response:

```json
{
  "status": "ok",
  "endpoint": "/api/github/webhook",
  "supported_events": [
    "pull_request (opened, merged, closed, edited)",
    "workflow_run (production deployment completion)",
    "ping"
  ]
}
```

## Webhook Events

### Pull Request Events

The webhook handles the `pull_request` event with the following actions:

| Action | Behavior |
|--------|----------|
| `opened` | Match PR to issues, link PR, move issues to "In Review" |
| `reopened` | Same as `opened` -- re-matches and re-links |
| `closed` (merged) | Update PR status, move issues to "Done", create fix tracking entries |
| `closed` (not merged) | Update PR status to `closed`, no issue status change |
| `edited` | Re-run matching if PR wasn't linked yet, update title if already linked |

### Workflow Run Events

The webhook handles the `workflow_run` event for deployment detection:

| Condition | Behavior |
|-----------|----------|
| Production deploy workflow completes successfully on `main` | Marks all `awaiting_deploy` fix attempts as `monitoring` |
| Non-production workflow, or failure | Ignored |

Production workflows are detected by name containing `"production"` or `"deploy-prod"`.

## PR-to-Issue Matching

When a PR is opened (or merged without a prior link), the system uses a three-layer matching pipeline:

### Layer 1: Explicit Identifiers

Scans PR title, body, and branch name for issue identifier patterns (`[A-Z]+-\d+`, e.g., `DISPATCH-123`). Matched identifiers are looked up directly in the database.

### Layer 2: Semantic Search

Creates a vector embedding of the PR text (title + body + branch name) using the embedding service and performs a pgvector similarity search against open issues in the workspace.

### Layer 3: AI Verification (Gemini)

All candidates from layers 1 and 2 are passed to Gemini (gemini-2.5-pro) for confidence scoring. The model analyzes each candidate and returns a confidence score (0-100). Only matches with confidence >= 85% are accepted.

The high threshold is intentional -- false positives trigger customer notifications, which would be embarrassing.

```
PR opened → Extract identifiers → Semantic search → Gemini verification → Link + status update
              (exact match)        (vector similarity)   (85% threshold)
```

## Issue Status Lifecycle

The webhook drives issues through the board automatically:

```
                   PR opened
Backlog ──────────────────────▶ In Review
Investigating ────────────────▶ In Review
Needs Review ─────────────────▶ In Review
In Progress ──────────────────▶ In Review

                   PR merged (to staging)
In Review ────────────────────▶ Done
(any status) ─────────────────▶ Done

                   Release PR merged (staging → main)
In Review ────────────────────▶ Done
In Progress ──────────────────▶ Done
```

**Status guards**: Issues already at or past "In Review" are not moved backward when a new PR is opened.

## Fix Verification Pipeline

For issues linked to error sources (Sentry or Loki), merging a PR triggers the fix verification pipeline:

```
PR merged to staging
  └─▶ Fix attempt created (status: awaiting_deploy)
        └─▶ Production deploy detected via workflow_run webhook
              └─▶ Status changes to "monitoring" (48-hour window starts)
                    ├─▶ No errors in 48h → status: "verified"
                    └─▶ Error detected → status: "failed"
                          ├─▶ Issue moved back to Backlog
                          ├─▶ Priority escalated (P3→P2, P2→P1)
                          ├─▶ "Fix Failed" label added
                          └─▶ Comment posted with failure details
```

### Fix Attempt Statuses

| Status | Meaning |
|--------|---------|
| `awaiting_deploy` | PR merged, waiting for production deploy workflow |
| `monitoring` | Deployed, watching for 48 hours for error recurrence |
| `verified` | 48 hours elapsed with no errors -- fix is confirmed |
| `failed` | Error reoccurred after deployment -- fix didn't work |

### Immediate Failure Detection

The fix verification system doesn't just wait for the 48-hour deadline. It also receives signals from:

- **Sentry webhooks**: If a Sentry event fires for a monitored issue after deployment, the fix is marked as failed immediately.
- **Loki webhooks**: If a Loki error event fires for a monitored issue after deployment, the fix is marked as failed immediately.

### Close Status Gating

Issues linked to error sources (Sentry/Loki) cannot be manually moved to "Done" unless:
- The latest fix attempt is `verified`, OR
- The issue has no error source link

This prevents premature closure of error-sourced issues before the fix is confirmed.

## Release PR Handling

When a PR merges `staging` into `main` (a release), it receives special treatment:

1. All issues in "In Review" or "In Progress" status are gathered as candidates
2. Issue identifiers are extracted from PR commits (if available)
3. Gemini analyzes the release PR to determine which issues are included
4. Matched issues are moved to "Done"

This ensures issues are marked as shipped when code reaches production, not just when it reaches staging.

## Database Schema

### dispatch_issue_pr

Links pull requests to issues.

```sql
CREATE TABLE dispatch_issue_pr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  pr_title TEXT NOT NULL,
  pr_status TEXT NOT NULL DEFAULT 'open',     -- 'open', 'merged', 'closed'
  branch_name TEXT,
  author TEXT,
  base_branch TEXT,
  head_branch TEXT,
  ai_summary TEXT,                            -- Gemini-generated summary of how PR relates to issue
  match_confidence FLOAT,                     -- 0.0-1.0 confidence score from matching
  merged_at TIMESTAMPTZ,
  run_id TEXT REFERENCES dispatch_agent_runs(id) ON DELETE SET NULL,  -- if created by an agent run
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(issue_id, pr_number)
);
```

### dispatch_fix_attempt

Tracks fix verification for error-sourced issues.

```sql
CREATE TABLE dispatch_fix_attempt (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  pr_title TEXT NOT NULL,
  pr_body TEXT,
  merged_at TIMESTAMPTZ NOT NULL,
  merged_sha TEXT NOT NULL,
  deployed_sha TEXT,
  deployed_at TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'awaiting_deploy',  -- awaiting_deploy, monitoring, verified, failed
  verification_deadline TIMESTAMPTZ,
  verification_checked_at TIMESTAMPTZ,
  failure_reason TEXT,
  sentry_events_post_deploy INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Key Files

| File | Purpose |
|------|---------|
| `app/api/github/webhook/route.ts` | Webhook entry point, event routing, status transitions |
| `lib/services/prMatchingService.ts` | Three-layer PR-to-issue matching (explicit + semantic + Gemini) |
| `lib/services/issuePRService.ts` | CRUD for PR links (`dispatch_issue_pr`) |
| `lib/services/fixTrackingService.ts` | Fix verification pipeline, error detection, close status gating |
| `lib/services/issueHistoryService.ts` | Audit trail for status changes and PR links |
| `lib/services/boardBroadcast.ts` | SSE broadcasts for real-time board updates |
| `lib/utils/webhookVerification.ts` | HMAC-SHA256 signature verification |
| `scripts/test-github-webhook.sh` | Test script simulating all webhook scenarios |

## Security

### Webhook Signature Verification

All incoming webhooks are verified using HMAC-SHA256:

1. GitHub signs the request body using your webhook secret
2. The signature is sent in the `X-Hub-Signature-256` header
3. Dispatch recomputes the signature and compares using `crypto.timingSafeEqual()`
4. Invalid signatures return `401 Unauthorized`

## Testing

Use the test script to simulate all webhook scenarios locally:

```bash
# Default: http://localhost:3002
./scripts/test-github-webhook.sh

# Custom URL
./scripts/test-github-webhook.sh https://your-domain.com
```

The script covers:
1. PR opened (to staging)
2. PR merged (to staging)
3. Release PR merged (staging -> main)
4. PR closed (not merged)
5. PR edited
6. Non-PR event (ignored)
7. Invalid signature (401)
8. PR reopened

## Troubleshooting

### Common Issues

#### PRs not being matched to issues

1. Check server logs for `[GitHub Webhook]` messages
2. Verify `GOOGLE_GENERATIVE_AI_API_KEY` is set (required for Gemini matching)
3. Check that issues have embeddings (`embedding IS NOT NULL` in `dispatch_issue`)
4. Lower the confidence threshold in `prMatchingService.ts` if too many valid matches are rejected

#### Issues not moving to "In Review"

1. Verify the issue is in a status earlier than "In Review" (Backlog, Investigating, Needs Review, In Progress)
2. Check that the "In Review" status exists in the workspace
3. Look for errors in the `recordStatusChange` call

#### Fix verification not starting

1. Ensure the PR references a Sentry or Dispatch issue ID in the title or body
2. Check that the issue has an external link in `dispatch_external_issue` with source `sentry` or `loki`
3. Verify the workflow_run webhook is configured and the deploy workflow name matches

#### Deployment not detected

1. The webhook looks for workflow names containing "production" or "deploy-prod" (case-insensitive)
2. Only successful completions on `main`/`master` branch are processed
3. Check that the `workflow_run` event type is enabled on the GitHub webhook

### Debugging

Enable verbose logging by checking server logs:

```
[GitHub Webhook] PR #123 - action: opened
[GitHub Webhook] Matched PR #123 to DISPATCH-45 (confidence: 0.92)
[GitHub Webhook] Updated DISPATCH-45 status to "In Review"
[GitHub Webhook] Processing PR merged: #123
[GitHub Webhook] Updated DISPATCH-45 status to "Done"
[Fix Tracking] Created fix attempt for issue abc-123 from PR #123
[Fix Tracking] Marked 2 fix attempts as deployed (SHA: abc1234)
[Fix Tracking] Fix attempt xyz-789 marked as VERIFIED
```
