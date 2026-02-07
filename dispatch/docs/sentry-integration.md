# Sentry Integration

This document describes how chipp-issues integrates with Sentry to automatically create issues from production errors.

## Overview

The Sentry integration allows chipp-issues to:

- Automatically create issues when new errors occur in production
- Track regressed errors (errors that come back after being resolved)
- Monitor escalating errors (errors with increasing frequency)
- Deduplicate issues to prevent creating multiple tickets for the same Sentry error

## Architecture

```
┌─────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│   Sentry    │ webhook │   chipp-issues       │ creates │   chipp_issue    │
│   (errors)  │────────▶│   /api/sentry/webhook│────────▶│   (database)     │
└─────────────┘         └──────────────────────┘         └──────────────────┘
                                  │
                          ┌───────┴───────┐
                          │ links         │ correlates
                          ▼               ▼
                ┌──────────────────┐  ┌──────────────────┐
                │chipp_external_   │  │   GitHub API     │
                │issue (dedup)     │  │  (commits/deploy)│
                └──────────────────┘  └──────────────────┘
```

## Setup

### 1. Create a Sentry Internal Integration

1. Go to **Sentry > Settings > Developer Settings > Internal Integrations**
2. Click **Create New Integration**
3. Configure the integration:

   - **Name**: `Chipp Issues`
   - **Webhook URL**: `https://your-domain.com/api/sentry/webhook`
   - **Overview**: "Automatically creates issues in Chipp Issues tracker"

4. Under **Webhooks**, enable:

   - **issue** - This sends webhooks for issue events

5. Under **Permissions**, set:

   - **Issue & Event**: Read (minimum required)
   - **Project**: Read (to get project details)

6. Click **Save Changes**

7. Copy the **Client Secret** (you'll need this for signature verification)

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Sentry webhook signature verification
SENTRY_CLIENT_SECRET=your-client-secret-here
```

> **Note**: If `SENTRY_CLIENT_SECRET` is not set, signature verification is skipped. This is useful for local development but should always be set in production.

### 3. Verify the Integration

Test the webhook endpoint:

```bash
curl https://your-domain.com/api/sentry/webhook
```

Expected response:

```json
{
  "status": "ok",
  "endpoint": "/api/sentry/webhook",
  "description": "Sentry webhook endpoint for automatic issue creation",
  "supported_events": [
    "issue.created (substatus=new)",
    "issue.unresolved (substatus=regressed)",
    "issue.unresolved (substatus=escalating)"
  ]
}
```

## Webhook Events

The integration handles the following Sentry webhook events:

### Events That Create Issues

| Action       | Substatus    | Description                                          |
| ------------ | ------------ | ---------------------------------------------------- |
| `created`    | `new`        | A brand new error occurred for the first time        |
| `unresolved` | `regressed`  | An error that was marked resolved has occurred again |
| `unresolved` | `escalating` | An existing error is spiking in frequency            |

### Events That Are Ignored

| Action     | Substatus | Reason                            |
| ---------- | --------- | --------------------------------- |
| `created`  | `ongoing` | Not a new unique error            |
| `resolved` | -         | Error was fixed, no action needed |
| `assigned` | -         | Just an assignment change         |
| `archived` | -         | Issue was intentionally ignored   |

## Deduplication

The integration uses the `chipp_external_issue` table to track which Sentry issues have already been linked to chipp-issues. This prevents creating duplicate issues when:

- Sentry sends multiple webhooks for the same issue
- An error regresses but we already have an open issue for it

### Database Schema

```sql
CREATE TABLE chipp_external_issue (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES chipp_issue(id) ON DELETE CASCADE,
    source TEXT NOT NULL,           -- 'sentry', 'github', etc.
    external_id TEXT NOT NULL,      -- Sentry issue ID
    external_url TEXT,              -- Link to Sentry issue
    metadata JSONB,                 -- Additional Sentry data
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, external_id)
);
```

### Stored Metadata

For each linked Sentry issue, we store:

```json
{
  "shortId": "MYPROJECT-1234",
  "project": {
    "id": "123",
    "name": "My Project",
    "slug": "my-project",
    "platform": "javascript"
  },
  "substatus": "new",
  "priority": "high",
  "level": "error",
  "platform": "javascript"
}
```

## Issue Creation

When a Sentry webhook triggers issue creation, the following happens:

### 1. Title Format

```
[project-slug] Error message
```

Example: `[chipp-admin] TypeError: Cannot read property 'foo' of undefined`

### 2. Priority Mapping

| Sentry Priority | Chipp Priority |
| --------------- | -------------- |
| high            | P1             |
| medium          | P2             |
| low             | P4             |
| (default)       | P3             |

### 3. Labels

All Sentry-created issues are automatically tagged with a **"Sentry"** label (color: #362D59 - Sentry brand purple).

### 4. Description

The issue description includes:

- **Header**: Warning if the error regressed or is escalating
- **Error Details**: Type and message
- **Location**: File, function, and culprit
- **Impact**: Event count, affected users, first/last seen
- **Project Info**: Name, platform, level
- **Links**: Direct link to Sentry issue

Example description:

```markdown
**This error has regressed after being marked as resolved.**

## Error

**Type:** `TypeError`
**Message:** Cannot read property 'foo' of undefined

## Location

**File:** `src/components/App.tsx`
**Function:** `handleClick`

## Impact

- **Events:** 42
- **Users affected:** 15
- **First seen:** 12/1/2024, 10:30:00 AM
- **Last seen:** 12/13/2024, 3:45:00 PM

## Project

- **Name:** chipp-admin
- **Platform:** javascript
- **Level:** error
- **Unhandled:** Yes

## Links

- [View in Sentry](https://sentry.io/organizations/chipp/issues/12345/)
- Sentry ID: `CHIPP-ADMIN-1234`
```

## Security

### Webhook Signature Verification

All incoming webhooks are verified using HMAC-SHA256:

1. Sentry signs the request body using your Client Secret
2. The signature is sent in the `Sentry-Hook-Signature` header
3. We recompute the signature and compare using `crypto.timingSafeEqual()`
4. Invalid signatures return `401 Unauthorized`

### Implementation

```typescript
function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(digest, "hex"),
    Buffer.from(signature, "hex")
  );
}
```

## Troubleshooting

### Common Issues

#### Webhook not receiving events

1. Check that the webhook URL is correct and publicly accessible
2. Verify the integration is enabled in Sentry
3. Check that "issue" webhooks are enabled

#### Issues not being created

1. Check the server logs for `[Sentry Webhook]` messages
2. Verify the event type and substatus match our filters
3. Check if the issue was deduplicated (look for `deduplicated: true` in response)

#### Signature verification failing

1. Ensure `SENTRY_CLIENT_SECRET` is set correctly
2. Check that you're using the Client Secret (not the Client ID)
3. Verify no proxy is modifying the request body

### Debugging

Enable verbose logging by checking server logs for entries like:

```
[Sentry Webhook] Received: resource=issue, action=created, substatus=new, issue=MYPROJECT-1234
[Sentry Webhook] Created issue CHIPP-5 from Sentry MYPROJECT-1234
```

Or for skipped events:

```
[Sentry Webhook] Skipping: action=resolved, substatus=undefined
```

## API Reference

### POST /api/sentry/webhook

Receives Sentry webhook events.

**Headers:**

- `Content-Type: application/json`
- `Sentry-Hook-Resource: issue`
- `Sentry-Hook-Signature: <hmac-sha256-signature>`

**Request Body:** Sentry webhook payload (see [Sentry docs](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issues/))

**Responses:**

| Status | Description                       |
| ------ | --------------------------------- |
| 200    | Success (created or deduplicated) |
| 401    | Invalid signature                 |
| 400    | Invalid JSON                      |
| 500    | Server error                      |

**Success Response (new issue created):**

```json
{
  "success": true,
  "issue": {
    "id": "uuid",
    "identifier": "CHIPP-5"
  },
  "sentry": {
    "id": "12345",
    "shortId": "MYPROJECT-1234"
  }
}
```

**Success Response (deduplicated):**

```json
{
  "success": true,
  "deduplicated": true,
  "issue": {
    "id": "uuid",
    "identifier": "CHIPP-3"
  },
  "sentry": {
    "id": "12345",
    "shortId": "MYPROJECT-1234"
  },
  "message": "Issue already tracked as CHIPP-3"
}
```

### GET /api/sentry/webhook

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "endpoint": "/api/sentry/webhook",
  "description": "Sentry webhook endpoint for automatic issue creation",
  "supported_events": [
    "issue.created (substatus=new)",
    "issue.unresolved (substatus=regressed)",
    "issue.unresolved (substatus=escalating)"
  ]
}
```

## GitHub Correlation

When a new error is detected, chipp-issues automatically correlates it with recent GitHub activity to help identify the root cause.

### How It Works

1. Extracts file paths from the error's stack trace
2. Searches for commits made within 48 hours before the error first appeared
3. Matches commit file changes against stack trace files
4. Fetches recent deployments to identify when code was released

### Configuration

Add these environment variables to enable GitHub correlation:

```bash
# GitHub personal access token with repo read access
GITHUB_TOKEN=ghp_...

# Repository in format "owner/repo"
GITHUB_REPO=BenchmarkAI/chipp-monorepo
```

### Issue Description Output

When correlation finds matches, the issue description includes:

```markdown
## Suspected Cause

### Recent Commits

These commits were made shortly before the error first appeared:

- [`abc1234`](https://github.com/...) - fix: update user handler
  - **Author:** John Doe
  - **Date:** 12/13/2024, 10:30:00 AM
  - **Files:** apps/chipp-admin/lib/userHandler.ts

### Recent Deployments

- **production** - `abc1234` (main) at 12/13/2024, 11:00:00 AM

### Files in Stack Trace Modified Recently

- `apps/chipp-admin/lib/userHandler.ts`
```

### Limitations

- Only searches the last 48 hours of commits (configurable)
- Limited to 20 most recent commits per error
- Requires `GITHUB_TOKEN` with appropriate repo access

## Future Enhancements

Potential improvements for the integration:

1. **Auto-resolve**: When a Sentry issue is resolved, automatically close the chipp-issue
2. **Comments**: Add comments to existing issues when they regress or escalate
3. **Assignee sync**: Map Sentry assignees to chipp-issues agents
4. **Metric alerts**: Support Sentry metric alerts (e.g., error rate thresholds)
5. **Project filtering**: Only create issues for specific Sentry projects
