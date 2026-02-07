# Chipp Issues Documentation

This folder contains documentation for the chipp-issues application - an issue tracking system designed for AI agent workflows.

## Table of Contents

### Integrations

- [Sentry Integration](./sentry-integration.md) - Automatic issue creation from production errors
- [External Issue Linking](./external-issue-linking.md) - Connecting chipp-issues with external tracking systems

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

| Topic                 | Document                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| Sentry webhook setup  | [sentry-integration.md](./sentry-integration.md#setup)                 |
| Deduplication logic   | [external-issue-linking.md](./external-issue-linking.md#usage-pattern) |
| Environment variables | [../.env.example](../.env.example)                                     |

## Environment Setup

See [.env.example](../.env.example) for required environment variables:

- `PG_DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - For generating embeddings
- `CHIPP_ISSUES_PASSWORD` - Web UI authentication
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

| Table                  | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `chipp_workspace`      | Multi-tenant workspace configuration       |
| `chipp_issue`          | Core issue data                            |
| `chipp_status`         | Workflow statuses (columns)                |
| `chipp_label`          | Issue labels/tags                          |
| `chipp_agent`          | AI agents that can be assigned             |
| `chipp_external_issue` | Links to external systems (Sentry, GitHub) |
| `chipp_agent_activity` | Agent investigation logs                   |

## Contributing

When adding new features:

1. Add documentation in this folder
2. Update this README with new links
3. Include examples and troubleshooting sections
4. Document any new environment variables in `.env.example`
