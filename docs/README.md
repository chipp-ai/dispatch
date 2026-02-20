# Dispatch Documentation

This folder contains documentation for Dispatch - an autonomous agent orchestration platform designed for AI agent workflows.

## Table of Contents

### Getting Started

- [Agent Orchestration Guide](./agent-orchestration.md) - How to manage autonomous Claude Code agents (start here)

### Integrations

- [GitHub Webhook Integration](./github-webhook-integration.md) - PR tracking, issue status automation, and fix verification
- [Sentry Integration](./sentry-integration.md) - Automatic issue creation from production errors
- [External Issue Linking](./external-issue-linking.md) - Connecting Dispatch with external tracking systems

### Architecture

- Database: PostgreSQL with pgvector extension
- Framework: Next.js 14 (App Router)
- Real-time: Server-Sent Events (SSE) for board updates

### Key Features

1. **Issue Tracking** - Create, update, and manage issues with priority levels (P1-P4)
2. **Agent Assignment** - Assign issues to AI agents for automated investigation
3. **Semantic Search** - Find similar issues using vector embeddings
4. **External Integrations** - Sentry, GitHub webhooks for automatic issue creation
5. **Real-time Board** - SSE-powered kanban board updates

## Quick Links

| Topic                 | Document                                                                         |
| --------------------- | -------------------------------------------------------------------------------- |
| GitHub PR tracking    | [github-webhook-integration.md](./github-webhook-integration.md)                 |
| Fix verification      | [github-webhook-integration.md](./github-webhook-integration.md#fix-verification-pipeline) |
| Sentry webhook setup  | [sentry-integration.md](./sentry-integration.md#setup)                           |
| Deduplication logic   | [external-issue-linking.md](./external-issue-linking.md#usage-pattern)           |
| Environment variables | [../.env.example](../.env.example)                                               |

## Environment Setup

See [.env.example](../.env.example) for required environment variables:

- `PG_DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - For generating embeddings
- `DISPATCH_PASSWORD` - Web UI authentication
- `SENTRY_CLIENT_SECRET` - Sentry webhook verification

## API Endpoints

### Core APIs

| Endpoint            | Method             | Description               |
| ------------------- | ------------------ | ------------------------- |
| `/api/issues`       | GET, POST          | List and create issues    |
| `/api/issues/[id]`  | GET, PATCH, DELETE | Single issue operations   |
| `/api/search`       | GET                | Semantic search           |
| `/api/board/stream` | GET                | SSE for real-time updates |

### Integration Webhooks

| Endpoint              | Method | Description                   |
| --------------------- | ------ | ----------------------------- |
| `/api/sentry/webhook` | POST   | Receive Sentry error webhooks |
| `/api/github/webhook` | POST   | Receive GitHub PR webhooks    |
| `/api/mcp/webhook`    | POST   | Receive MCP agent events      |

## Database Tables

| Table                     | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `dispatch_workspace`      | Multi-tenant workspace configuration            |
| `dispatch_issue`          | Core issue data                                 |
| `dispatch_status`         | Workflow statuses (columns)                     |
| `dispatch_label`          | Issue labels/tags                               |
| `dispatch_agent`          | AI agents that can be assigned                  |
| `dispatch_external_issue` | Links to external systems (Sentry, GitHub)      |
| `dispatch_agent_activity` | Agent investigation logs                        |
| `dispatch_issue_pr`       | Linked pull requests (from GitHub webhook)      |
| `dispatch_fix_attempt`    | Fix verification tracking (post-deploy monitor) |
| `dispatch_issue_history`  | Audit trail for status changes and PR links     |

## Contributing

When adding new features:

1. Add documentation in this folder
2. Update this README with new links
3. Include examples and troubleshooting sections
4. Document any new environment variables in `.env.example`
