# Svelte Stores

Global client-side state using **classic Svelte stores** (`writable`/`derived`), NOT Svelte 5 runes.

## Key Stores

| Store | Purpose |
|-------|---------|
| `auth` | Developer auth. `user`, `isAuthenticated`, `checkAuth()` |
| `organization` | Org + subscription tier. Cached in localStorage (5min TTL) |
| `workspace` | Workspace selection. Cached in localStorage (5min TTL) |
| `consumerAuth` | Per-app end-user auth (separate from developer auth) |
| `consumerChat` | Chat session, messages, SSE streaming, credits tracking |
| `websocket` | Real-time events. Auto-reconnects with exponential backoff |
| `whitelabel` | White-label branding for custom domains |
| `appState` | Dev-only: pushes store snapshots to `/api/dev/app-state` |

## Sync Pattern

1. **Init on boot** - `initOrganization()`, `initWorkspace()`
2. **Fetch updates** - `fetchOrganization()` hits API, updates store + localStorage cache
3. **Derived stores** - Components subscribe to derived stores (`organization`, not `organizationStore`)

## Critical Gotchas

**Auth routes are NOT under /api:**
```typescript
fetch("/auth/me")      // CORRECT
fetch("/api/auth/me")  // WRONG
```

**Consumer vs Developer auth are separate systems:**
- `auth.ts` = developer/builder sessions
- `consumerAuth.ts` = chat end-user sessions (per-app cookies)

**WebSocket auto-connects:** Subscribes to `user` store, connects on login, disconnects on logout.

**modelOverride for dev testing:**
```typescript
headers: { ...modelOverride.getHeader() }  // Adds X-Dev-Model-Override
```
