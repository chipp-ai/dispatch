# External Issue Linking

This document describes the external issue linking system used to connect chipp-issues with external tracking systems like Sentry, GitHub, and Linear.

## Overview

The external issue linking system provides:

- **Deduplication**: Prevent creating duplicate chipp-issues for the same external issue
- **Traceability**: Link chipp-issues back to their source (Sentry error, GitHub issue, etc.)
- **Metadata storage**: Keep relevant context from the external system

## Database Schema

```sql
CREATE TABLE chipp_external_issue (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    issue_id TEXT NOT NULL REFERENCES chipp_issue(id) ON DELETE CASCADE,
    source TEXT NOT NULL,           -- 'sentry', 'github', 'linear'
    external_id TEXT NOT NULL,      -- ID in the external system
    external_url TEXT,              -- Direct link to the external issue
    metadata JSONB,                 -- Additional data from external system
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, external_id)     -- Ensures one link per external issue
);

-- Indexes for efficient lookups
CREATE INDEX chipp_external_issue_issue_id_idx ON chipp_external_issue(issue_id);
CREATE INDEX chipp_external_issue_source_idx ON chipp_external_issue(source);
CREATE INDEX chipp_external_issue_external_id_idx ON chipp_external_issue(external_id);
```

## Service API

The `externalIssueService.ts` provides the following functions:

### findByExternalId

Find an existing chipp-issue linked to an external issue.

```typescript
import { findByExternalId } from "@/lib/services/externalIssueService";

const link = await findByExternalId("sentry", "12345");
if (link) {
  console.log(`Already linked to issue: ${link.issue_id}`);
}
```

### linkExternalIssue

Create a new link between a chipp-issue and an external issue.

```typescript
import { linkExternalIssue } from "@/lib/services/externalIssueService";

await linkExternalIssue({
  issueId: "chipp-issue-uuid",
  source: "sentry",
  externalId: "12345",
  externalUrl: "https://sentry.io/issues/12345/",
  metadata: {
    shortId: "MYPROJECT-42",
    project: "my-project",
    level: "error",
  },
});
```

### getExternalLinksForIssue

Get all external links for a chipp-issue.

```typescript
import { getExternalLinksForIssue } from "@/lib/services/externalIssueService";

const links = await getExternalLinksForIssue("chipp-issue-uuid");
// Returns array of ExternalIssue objects
```

### isExternalIssueLinked

Quick check if an external issue is already linked.

```typescript
import { isExternalIssueLinked } from "@/lib/services/externalIssueService";

const exists = await isExternalIssueLinked(
  "github",
  "BenchmarkAI/chipp-monorepo#123"
);
if (exists) {
  // Skip creating a new issue
}
```

## Supported Sources

| Source   | Description           | External ID Format                                           |
| -------- | --------------------- | ------------------------------------------------------------ |
| `sentry` | Sentry error tracking | Sentry issue ID (e.g., `12345`)                              |
| `github` | GitHub issues/PRs     | `owner/repo#number` (e.g., `BenchmarkAI/chipp-monorepo#123`) |
| `linear` | Linear issues         | Linear issue ID (e.g., `ENG-123`)                            |

## Usage Pattern

The typical pattern for integrating an external system:

```typescript
import {
  findByExternalId,
  linkExternalIssue,
} from "@/lib/services/externalIssueService";
import { createIssue } from "@/lib/services/issueService";

async function handleExternalWebhook(externalId: string, data: ExternalData) {
  // 1. Check for existing link (deduplication)
  const existingLink = await findByExternalId("source", externalId);
  if (existingLink) {
    // Already have an issue for this
    return { deduplicated: true, issueId: existingLink.issue_id };
  }

  // 2. Create the chipp-issue
  const issue = await createIssue(workspaceId, {
    title: data.title,
    description: data.description,
    priority: mapPriority(data.priority),
  });

  // 3. Link to external issue
  await linkExternalIssue({
    issueId: issue.id,
    source: "source",
    externalId: externalId,
    externalUrl: data.url,
    metadata: {
      // Store relevant external data
    },
  });

  return { created: true, issueId: issue.id };
}
```

## Metadata Examples

### Sentry

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

### GitHub

```json
{
  "repo": "BenchmarkAI/chipp-monorepo",
  "number": 123,
  "state": "open",
  "author": "username",
  "labels": ["bug", "high-priority"]
}
```

### Linear

```json
{
  "identifier": "ENG-123",
  "team": "Engineering",
  "state": "In Progress",
  "assignee": "john@example.com"
}
```

## Constraints

### Unique Constraint

The `UNIQUE(source, external_id)` constraint ensures:

- Each external issue can only be linked once
- Attempting to create a duplicate link will fail with a unique violation
- Use `findByExternalId` to check before creating

### Cascade Delete

When a chipp-issue is deleted, all its external links are automatically deleted via `ON DELETE CASCADE`. This maintains referential integrity.

## Querying

### Find all Sentry-linked issues

```sql
SELECT i.*, e.external_url as sentry_url
FROM chipp_issue i
JOIN chipp_external_issue e ON i.id = e.issue_id
WHERE e.source = 'sentry';
```

### Find unlinked issues (created manually)

```sql
SELECT i.*
FROM chipp_issue i
LEFT JOIN chipp_external_issue e ON i.id = e.issue_id
WHERE e.id IS NULL;
```

### Count issues by source

```sql
SELECT source, COUNT(*) as count
FROM chipp_external_issue
GROUP BY source;
```

## Future Considerations

### Bidirectional Sync

Currently, links are one-way (external → chipp-issues). Future enhancements could:

- Update external issue status when chipp-issue is resolved
- Add comments to external issues with chipp-issues activity
- Sync assignees between systems

### Multiple Links

A single chipp-issue could potentially link to multiple external issues:

- A Sentry error that also has a GitHub issue
- Related errors across different Sentry projects

The schema already supports this via the `issue_id` foreign key (not unique).

### Link Status

Could add a `status` column to track:

- `active` - Normal link
- `stale` - External issue was resolved but chipp-issue wasn't
- `broken` - External issue was deleted
