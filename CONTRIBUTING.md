# Contributing to Dispatch

## Development setup

1. Fork and clone the repo
2. `npm install`
3. `cp .env.example .env` and fill in required values
4. `docker-compose up -d db` (or use your own PostgreSQL + pgvector)
5. Run migrations (see README.md)
6. `npm run dev`

## Code style

- TypeScript strict mode
- React Server Components by default, `"use client"` only when needed
- Raw SQL via `pg` (no ORM) -- all queries in `lib/services/`
- Tailwind CSS for styling
- See `CLAUDE.md` for detailed architectural guidance

## PR process

1. Create a branch from `main`
2. Make your changes
3. `npm run build` -- ensure no TypeScript errors
4. `npm run test` -- ensure tests pass
5. Open a PR with a clear description

## Architecture overview

```
app/              -- Next.js pages and API routes
components/       -- React components (terminal, board, issue pages)
lib/
  services/       -- Business logic (raw SQL, no ORM)
  mcp/            -- MCP server implementation
  utils/          -- Auth, embeddings, helpers
  terminal/       -- WebSocket server for terminal streaming
scripts/
  migrations/     -- Database migrations (run manually)
.github/workflows/ -- Agent workflow definitions
charts/           -- Kubernetes deployment examples
```

## Key conventions

- All database tables use the `dispatch_` prefix
- SQL queries use `$1, $2` parameterized placeholders (never string interpolation)
- Agent workflows communicate back to Dispatch via the REST API
- Terminal output is streamed via WebSocket + SSE

## Upstream relationship

This repo is the canonical open-source home of Dispatch. The maintainers also run a copy inside a private monorepo, synced via `git subtree`. When your PR is merged here, it gets pulled into the internal codebase automatically.

This means:
- **Your PRs go here** -- open PRs against `main` on this repo
- Internal improvements flow back here too -- the maintainers push internal changes to this repo periodically
- You don't need to know or care about the monorepo -- just work against this repo normally
