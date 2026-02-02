# Chipp Deno Application

Consumer-facing application for Chipp AI chatbots. Deno + Hono API, Svelte 5 SPA, Cloudflare Worker edge serving.

The most important rule of working in the Chipp codebase: **"when in doubt, do the cool thing"**.

## Critical Rules

- No emojis unless absolutely necessary
- Never make things up - ask if unsure
- All PRs target `staging` branch, not `main`
- Use `.scratch/` folder for all ephemeral files
- Be concise: 5-10 line responses, lead with answer, bullet points over paragraphs
- **ALWAYS use `./scripts/dev.sh` to start the dev server** - never run deno manually with nohup or redirect to /dev/null. Logs go to `.scratch/logs/chipp-deno-*.log` with a `chipp-deno-latest.log` symlink. Use `tail -f` on the latest log to debug errors.

## Common Pitfalls

### JSON Columns from Kysely Return as Strings

**CRITICAL**: When you store JSON in the database with `JSON.stringify()`, Kysely returns it as a **string**, not a parsed object. TypeScript type casting (`as Array<...>`) does NOT transform data - it's compile-time only.

```typescript
// ❌ WRONG - msg.toolCalls is a STRING like "[{...}]"
const toolCalls = msg.toolCalls as Array<{ id: string; name: string }>;
// Iterating over a string iterates over CHARACTERS, not array elements!

// ✅ CORRECT - Always parse JSON columns when reading
const toolCalls = msg.toolCalls
  ? typeof msg.toolCalls === "string"
    ? JSON.parse(msg.toolCalls)
    : msg.toolCalls
  : null;
```

### chipp-deno Has Its Own Database Schema

- chipp-deno uses `db/schema.ts` (Kysely) for database types
- Changes to `db/schema.ts` affect only chipp-deno

### Chat Sessions Reload from DB on Every Request

Even "fresh" conversations reload history from the database on each API call via `body.sessionId`. Bugs in how data is stored/retrieved affect ongoing conversations immediately, not just on page refresh.

## Quick Start

```bash
# Start all development services
./scripts/dev.sh

# Services:
#   http://localhost:8000  - Deno API
#   http://localhost:5173  - Vite (Svelte SPA, fast HMR)
#   http://localhost:8788  - Cloudflare Worker (brand injection)
```

### Development Modes

```bash
./scripts/dev.sh              # Full stack (API + Vite + Worker)
./scripts/dev.sh --no-worker  # Skip Worker (faster startup, use Vite directly)
./scripts/dev.sh --api-only   # Just the Deno API server
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                                    │
├─────────────────────────────────────────────────────────────────────┤
│   User Browser                                                       │
│        │                                                             │
│        ▼                                                             │
│   Cloudflare Worker (build.chipp.ai)                                │
│   ├── Serves SPA from R2 bucket                                     │
│   ├── Injects window.__APP_BRAND__ for instant branded splash       │
│   ├── Sets PWA manifest, icons, theme color per-app                 │
│   └── Proxies /api/*, /auth/*, /consumer/* to Deno API              │
│        │                                                             │
│        ▼                                                             │
│   Deno API (dino-mullet.chipp.ai)                                   │
│   ├── Authentication (OAuth, session management)                    │
│   ├── Application CRUD                                              │
│   ├── Chat/messaging                                                │
│   ├── PWA assets (manifest.json, icons, splash screens)             │
│   └── WebSocket for real-time updates                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
apps/chipp-deno/
├── main.ts                 # Deno API entry point
├── deno.json               # Deno configuration and tasks
├── src/
│   ├── api/               # API routes (Hono)
│   │   ├── routes/        # Route handlers
│   │   ├── middleware/    # Auth, error handling, logging
│   │   └── validators/    # Zod schemas
│   ├── services/          # Business logic
│   │   ├── brand-sync.service.ts  # Syncs brand configs to R2
│   │   ├── application.service.ts
│   │   ├── chat.service.ts
│   │   └── ...
│   ├── db/                # Kysely database client
│   ├── llm/               # LLM adapter and providers
│   └── __tests__/         # Test files
├── web/                   # Svelte SPA
│   ├── src/
│   │   ├── routes/        # Page components
│   │   ├── stores/        # Svelte stores
│   │   └── lib/           # Components, design system
│   └── dist/              # Built SPA (uploaded to R2)
├── cloudflare-worker/     # Edge worker for R2 serving + brand injection
│   ├── src/index.ts       # Worker entry
│   ├── src/brand-inject.ts # Brand injection logic
│   ├── wrangler.toml      # Worker configuration
│   └── scripts/           # Build/upload scripts
├── db/
│   └── migrations/        # SQL migration files
├── docs/                  # Local documentation
└── scripts/
    └── dev.sh             # Main development script
```

---

## Deno Development

### deno.json Tasks

```bash
deno task dev              # API with watch mode (port 8000)
deno task dev:all          # Full stack via ./scripts/dev.sh
deno task start            # Production start
deno task check            # Type check
deno task test             # Run all tests
deno task test:routes      # Route tests only
deno task test:scenarios   # E2E scenario tests
deno task test:watch       # Watch mode
deno task fmt              # Format code
deno task lint             # Lint code
deno task db:migrate       # Run database migrations
```

### Import Patterns

```typescript
// JSR packages (Deno's registry)
import { assertEquals } from "jsr:@std/assert";

// npm packages
import { Hono } from "npm:hono@^4.6.0";
import { z } from "npm:zod@^3.23.0";

// Project imports (via import map in deno.json)
import { db } from "@/src/db/client.ts";
import { authMiddleware } from "@/src/api/middleware/auth.ts";
```

### Permissions

Deno runs with explicit permissions:

```bash
--allow-net    # Network access
--allow-env    # Environment variables
--allow-read   # File system read
--allow-write  # File system write (for logs)
--allow-ffi    # Foreign function interface (for some npm packages)
```

### Type Checking

```bash
deno task check            # Check main.ts and all imports
deno check src/api/routes/apps.ts  # Check specific file
```

---

## Hono API Patterns

### Route Organization

Routes are in `src/api/routes/`, organized by domain:

```
src/api/routes/
├── application/           # App CRUD, settings
├── auth/                  # OAuth, sessions, logout
├── consumer/              # Consumer chat, PWA assets
├── billing/               # Stripe integration
├── upload/                # File uploads
├── voice/                 # Voice agent configuration
└── webhooks/              # Stripe, Twilio webhooks
```

### Basic Route Pattern

```typescript
// src/api/routes/application/index.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.ts";
import { applicationService } from "../../../services/application.service.ts";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const applicationRoutes = new Hono()
  .use(authMiddleware)
  .post("/", zValidator("json", createSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const app = await applicationService.create({
      name: body.name,
      description: body.description,
      creatorId: user.id,
    });

    return c.json({ data: app }, 201);
  })
  .get("/:id", async (c) => {
    const { id } = c.req.param();
    const app = await applicationService.getById(id);
    return c.json({ data: app });
  });
```

### Middleware Stack

```typescript
// src/api/middleware/auth.ts
import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

export async function authMiddleware(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(token);
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}
```

### Authentication Architecture (Cookie Domains)

**CRITICAL**: There are TWO separate auth systems with different cookie strategies:

#### 1. Developer Auth (`routes/auth.ts`)

For app builders logging into `build.chipp.ai`:

- **Cookie**: `session_id`
- **Domain**: `.chipp.ai` (in production)
- **Why**: OAuth flow crosses domains:
  1. User on `build.chipp.ai` clicks Google login
  2. Redirects to `dino-mullet.chipp.ai/auth/login/google` (API)
  3. API sets cookies, redirects to Google
  4. Google redirects back to `dino-mullet.chipp.ai/auth/callback/google`
  5. API creates session, redirects to `build.chipp.ai`
  6. SPA needs to read session cookie set by API
- **Solution**: Cookie domain `.chipp.ai` works across both subdomains
- **OAuth URLs**: SPA must redirect directly to API domain (`https://dino-mullet.chipp.ai/auth/login/google`), NOT through Worker proxy, to ensure cookies are set on the correct domain

```typescript
// routes/auth.ts - production cookie settings
const COOKIE_DOMAIN =
  Deno.env.get("ENVIRONMENT") === "production" ? ".chipp.ai" : undefined;

setCookie(c, "session_id", session.id, {
  domain: COOKIE_DOMAIN, // .chipp.ai in prod, undefined in dev
  // ...
});
```

#### 2. Consumer Auth (`src/api/routes/consumer/index.ts`)

For end-users chatting with Chipp apps:

- **Cookie**: `consumer_session_id`
- **Domain**: None (inherits request domain)
- **Why**: Must work with custom domains:
  - `build.chipp.ai/#/w/chat/app` → cookie on `build.chipp.ai`
  - `chat.customdomain.com` → cookie on `customdomain.com`
- **Solution**: No explicit domain = cookie bound to request origin

```typescript
// Consumer auth - NO domain setting (works with custom domains)
setCookie(c, "consumer_session_id", session.sessionId, {
  path: "/",
  // NO domain - inherits from request origin
});
```

| Auth Type | Cookie Name           | Domain           | Custom Domains?      |
| --------- | --------------------- | ---------------- | -------------------- |
| Developer | `session_id`          | `.chipp.ai`      | No (always chipp.ai) |
| Consumer  | `consumer_session_id` | (request origin) | Yes                  |

### Streaming Responses (SSE)

```typescript
import { streamSSE } from "hono/streaming";

app.post("/chat/stream", async (c) => {
  return streamSSE(c, async (stream) => {
    for await (const chunk of chatService.streamResponse(messages)) {
      await stream.writeSSE({
        event: chunk.type,
        data: JSON.stringify(chunk.data),
      });
    }
  });
});
```

### Service Layer Pattern

Business logic lives in `src/services/`, separate from routes:

```typescript
// src/services/application.service.ts
import { db } from "../db/client.ts";

export const applicationService = {
  async create(params: {
    name: string;
    description?: string;
    creatorId: string;
  }) {
    const slug = generateSlug(params.name);

    const [app] = await db
      .insertInto("applications")
      .values({
        name: params.name,
        slug,
        description: params.description,
        creator_id: params.creatorId,
      })
      .returning(["id", "name", "slug", "created_at"])
      .execute();

    return app;
  },

  async getById(id: string) {
    return await db
      .selectFrom("applications")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  },
};
```

---

## Svelte SPA Patterns

### Svelte 5 Runes

Svelte 5 uses runes for reactivity:

```svelte
<script lang="ts">
  // Reactive state
  let count = $state(0);

  // Derived values
  let doubled = $derived(count * 2);

  // Effects
  $effect(() => {
    console.log(`Count changed to ${count}`);
  });

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>
  Count: {count} (doubled: {doubled})
</button>
```

### SPA Routing (svelte-spa-router)

Hash-based routing for SPA:

```typescript
// web/src/routes.ts
import { wrap } from "svelte-spa-router/wrap";

export default {
  "/": Home,
  "/apps": wrap({ asyncComponent: () => import("./routes/Apps.svelte") }),
  "/apps/:id/*": wrap({
    asyncComponent: () => import("./routes/AppBuilderLayout.svelte"),
  }),
  "/settings/*": wrap({
    asyncComponent: () => import("./routes/SettingsLayout.svelte"),
  }),
  "/w/chat/:appNameId": wrap({
    asyncComponent: () => import("./routes/consumer/ConsumerLayout.svelte"),
  }),
  "*": NotFound,
};
```

### Nested Layout Pattern

**Problem:** SPA routing causes page flash when navigating between related pages because the entire component remounts.

**Solution:** Use a single layout component with wildcard routing that handles internal content switching.

**Pattern:**

```
routes.ts:
  "/feature/*": FeatureLayout.svelte    # Wildcard route

FeatureLayout.svelte:
  - Parses params.wild to determine active step/tab
  - Eagerly imports ALL content components (not lazy)
  - Renders shared UI (header, nav, card wrapper)
  - Conditionally renders content based on active step
  - Content components dispatch events for navigation

feature/
  ContentA.svelte                        # Just content, no layout
  ContentB.svelte
  ContentC.svelte
```

**Key requirements:**

1. **Eager imports** - Import all content at top of layout (prevents flash)
2. **Wildcard route** - Use `/path/*` so layout handles all sub-paths
3. **Event-driven navigation** - Content dispatches `next`/`select` events; layout calls `push()`
4. **Shared UI in layout** - Header, step indicator, wrapper card stay mounted

**Example:**

```svelte
<!-- routes/AppBuilderLayout.svelte -->
<script lang="ts">
  import { push } from "svelte-spa-router";
  import BuildContent from "./builder/BuilderBuildContent.svelte";
  import ShareContent from "./builder/BuilderShareContent.svelte";
  import SettingsContent from "./builder/BuilderSettingsContent.svelte";

  export let params: { wild?: string } = {};

  $: segments = (params.wild || "").split("/");
  $: activeTab = segments[0] || "build";

  function handleNavigate(event: CustomEvent<string>) {
    push(`/apps/${appId}/${event.detail}`);
  }
</script>

<div class="layout">
  <TabNav {activeTab} on:select={handleNavigate} />

  {#if activeTab === "build"}
    <BuildContent on:navigate={handleNavigate} />
  {:else if activeTab === "share"}
    <ShareContent on:navigate={handleNavigate} />
  {:else if activeTab === "settings"}
    <SettingsContent on:navigate={handleNavigate} />
  {/if}
</div>
```

**Deep nesting (3+ levels):**

For hierarchies like `/apps/:id/settings/notifications/email`, use nested sub-layouts:

```svelte
<!-- In FeatureLayout.svelte -->
$: segments = (params.wild || "").split("/");
$: activeTab = segments[0] || "default";
$: subPath = segments.slice(1).join("/");

{#if activeTab === "settings"}
  <SettingsSubLayout {subPath} on:navigate={handleNavigate} />
{/if}
```

**Examples in codebase:**

- `routes/AppBuilderLayout.svelte` - Tabs: build, share, embed, analytics, settings
- `routes/OnboardingLayout.svelte` - Steps: profile, persona, invite, templates
- `routes/SettingsLayout.svelte` - Nested settings sections

### Svelte Stores

```typescript
// web/src/stores/auth.ts
import { writable, derived } from "svelte/store";

export const user = writable<User | null>(null);
export const isAuthenticated = derived(user, ($user) => $user !== null);

function createAppsStore() {
  const { subscribe, set, update } = writable<App[]>([]);

  return {
    subscribe,
    load: async () => {
      const response = await fetch("/api/applications");
      const { data } = await response.json();
      set(data);
    },
    add: (app: App) => update((apps) => [...apps, app]),
    remove: (id: string) => update((apps) => apps.filter((a) => a.id !== id)),
  };
}

export const apps = createAppsStore();
```

### Portal Pattern for Modals/Dialogs

**Problem:** Modals rendered inside the component tree can be affected by parent stacking contexts (transforms, z-index, overflow). This causes dialogs to appear clipped, positioned wrong, or with backdrops on wrong elements.

**Solution:** Use a portal pattern to render modal content directly into `document.body`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  export let open = false;

  let portalContainer: HTMLDivElement;

  onMount(() => {
    portalContainer = document.createElement("div");
    portalContainer.className = "dialog-portal";
    document.body.appendChild(portalContainer);
  });

  onDestroy(() => {
    portalContainer?.remove();
  });

  function portal(node: HTMLElement) {
    portalContainer.appendChild(node);
    return {
      destroy() {
        node.parentNode?.removeChild(node);
      },
    };
  }

  // Lock body scroll when open
  $: if (typeof document !== "undefined") {
    document.body.style.overflow = open ? "hidden" : "";
  }
</script>

{#if open}
  <div use:portal class="dialog-wrapper">
    <div class="dialog-overlay" on:click={() => (open = false)}>
      <div class="dialog-content" on:click|stopPropagation role="dialog" aria-modal="true">
        <slot />
      </div>
    </div>
  </div>
{/if}
```

**Key points:**

- Create portal container in `onMount`, remove in `onDestroy`
- Use Svelte action (`use:portal`) to move rendered content
- Lock body scroll when modal is open
- Set high z-index (9999+) on overlay

### Click-Outside Detection for Dropdowns

**Problem:** Backdrop-based click detection can fail with automation tools and complex z-index hierarchies.

**Solution:** Use a window-level click listener in capture phase:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let open = false;
  let menuRef: HTMLElement;

  function handleClickOutside(event: MouseEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      open = false;
    }
  }

  // Add/remove listener when open state changes
  $: if (typeof window !== "undefined") {
    if (open) {
      // Use setTimeout to avoid the opening click immediately closing
      setTimeout(() => {
        window.addEventListener("click", handleClickOutside, { capture: true });
      }, 0);
    } else {
      window.removeEventListener("click", handleClickOutside, { capture: true });
    }
  }

  onDestroy(() => {
    window.removeEventListener("click", handleClickOutside, { capture: true });
  });
</script>

<div bind:this={menuRef}>
  <button on:click|stopPropagation={() => (open = !open)}>Toggle</button>
  {#if open}
    <div class="dropdown-menu">...</div>
  {/if}
</div>
```

**Key points:**

- Use `capture: true` to catch clicks before they bubble
- Use `setTimeout(..., 0)` when adding listener to skip the opening click
- Use `on:click|stopPropagation` on the trigger to prevent immediate close
- Clean up listener in `onDestroy`

### Reacting to Store Changes (Workspace Filtering)

**Problem:** Pages showing filtered data need to reload when the filter (e.g., workspace) changes.

**Solution:** Subscribe to the store and track the last value to avoid double-loading on mount:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { currentWorkspace, type Workspace } from "../stores/workspace";

  let items: Item[] = [];
  let unsubscribe: (() => void) | undefined;
  let lastWorkspaceId: string | null | undefined = undefined; // undefined = not yet loaded

  async function loadItems(workspaceId?: string) {
    let url = "/api/items";
    if (workspaceId) {
      url += `?workspaceId=${encodeURIComponent(workspaceId)}`;
    }
    const response = await fetch(url, { credentials: "include" });
    const result = await response.json();
    items = result.data || [];
  }

  onMount(() => {
    unsubscribe = currentWorkspace.subscribe((workspace: Workspace | null) => {
      const newWorkspaceId = workspace?.id ?? null;

      // Load if: first time (undefined), or workspace actually changed
      if (lastWorkspaceId === undefined || newWorkspaceId !== lastWorkspaceId) {
        lastWorkspaceId = newWorkspaceId;
        loadItems(newWorkspaceId ?? undefined);
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>
```

**Key points:**

- Use `undefined` as sentinel for "not yet loaded" vs `null` for "no workspace"
- Compare before loading to avoid double-fetch on mount
- Always clean up subscription in `onDestroy`

### Normalizing API Responses

**Problem:** Backend may not return all fields the frontend expects (e.g., `visibility` field missing).

**Solution:** Normalize/default missing fields after fetching:

```typescript
async function fetchWorkspaces() {
  const response = await fetch("/api/workspaces", { credentials: "include" });
  const data = await response.json();

  // Normalize: default missing fields
  const workspaces = (data.data || []).map((w: Partial<Workspace>) => ({
    ...w,
    visibility: w.visibility || "PRIVATE", // Default if not provided
    slug: w.slug || w.name?.toLowerCase().replace(/\s+/g, "-") || "",
  })) as Workspace[];

  return workspaces;
}
```

**When to normalize:**

- Backend doesn't include optional fields
- Schema mismatch between frontend expectations and API response
- Derived fields (like `slug` from `name`)

### Event Listeners vs svelte:window

**Problem:** `<svelte:window on:keydown={...}>` can have issues with HMR and lifecycle timing.

**Solution:** Use explicit `addEventListener` in `onMount`/`onDestroy` for more control:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  function handleEscape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      // close something
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleEscape);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleEscape);
  });
</script>

<!-- Instead of: <svelte:window on:keydown={handleEscape} /> -->
```

**When to use explicit listeners:**

- Need capture phase (`{ capture: true }`)
- Conditional listeners (add/remove based on state)
- Complex cleanup requirements
- HMR causing issues with `svelte:window`

### Design System

Components are in `web/src/lib/design-system/`:

```
web/src/lib/design-system/
├── components/
│   ├── Button.svelte
│   ├── Card.svelte
│   ├── Modal.svelte
│   ├── chat/              # Chat-specific components
│   ├── builder/           # App builder components
│   └── settings/          # Settings components
├── styles/
│   └── variables.css
└── index.ts               # Re-exports
```

---

## Database (Kysely)

### Connection

```typescript
// src/db/client.ts
import { Kysely } from "kysely";
import { PostgresDialect } from "kysely";
import postgres from "postgres";

const dialect = new PostgresDialect({
  pool: postgres(Deno.env.get("DATABASE_URL")!),
});

export const db = new Kysely<Database>({ dialect });
```

### Migrations

SQL migrations in `db/migrations/`:

```bash
deno task db:migrate       # Run pending migrations
```

Migration files are numbered: `001_create_users.sql`, `002_create_applications.sql`

### Query Patterns

```typescript
// Select with joins
const apps = await db
  .selectFrom("applications")
  .innerJoin(
    "organizations",
    "organizations.id",
    "applications.organization_id"
  )
  .select([
    "applications.id",
    "applications.name",
    "organizations.name as org_name",
  ])
  .where("applications.creator_id", "=", userId)
  .orderBy("applications.created_at", "desc")
  .execute();

// Insert returning
const [user] = await db
  .insertInto("users")
  .values({ email, name })
  .returning(["id", "email", "name", "created_at"])
  .execute();

// Update
await db
  .updateTable("applications")
  .set({ name: newName, updated_at: new Date() })
  .where("id", "=", appId)
  .execute();

// Transaction
await db.transaction().execute(async (trx) => {
  const [org] = await trx
    .insertInto("organizations")
    .values({ name })
    .returning("id")
    .execute();

  await trx
    .insertInto("organization_members")
    .values({ organization_id: org.id, user_id: userId, role: "owner" })
    .execute();
});
```

---

## Testing

### Running Tests

```bash
deno task test                    # All tests
deno task test:routes             # Route tests only
deno task test:scenarios          # E2E scenario tests
deno task test:watch              # Watch mode
deno task test:coverage           # With coverage report

# Run specific test file
deno test src/__tests__/routes/applications_test.ts --allow-net --allow-env --allow-read
```

### Test Structure

```
src/__tests__/
├── setup.ts                    # DB setup, auth helpers
├── fixtures/
│   ├── users.ts               # User fixtures (tiers, roles)
│   ├── applications.ts        # App fixtures
│   └── organizations.ts       # Org fixtures
├── routes/
│   ├── applications_test.ts   # /api/applications endpoints
│   ├── auth_test.ts           # /api/auth endpoints
│   └── billing_test.ts        # /api/billing endpoints
└── scenarios/
    ├── credit_exhaustion_test.ts
    └── rag_retrieval_test.ts
```

### app.request() Pattern

Test routes without network overhead:

```typescript
import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import app from "../../api/index.ts";
import { setupTests, teardownTests, createTestToken } from "../setup.ts";

describe("Applications API", () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  it("GET /api/applications returns user's apps", async () => {
    const token = createTestToken({
      id: "user-123",
      email: "test@example.com",
    });

    const res = await app.request("/api/applications", {
      headers: { Authorization: `Bearer ${token}` },
    });

    assertEquals(res.status, 200);
    const { data } = await res.json();
    assertExists(data);
    assertEquals(Array.isArray(data), true);
  });

  it("POST /api/applications creates new app", async () => {
    const token = createTestToken({ id: "user-123" });

    const res = await app.request("/api/applications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test App" }),
    });

    assertEquals(res.status, 201);
    const { data } = await res.json();
    assertEquals(data.name, "Test App");
    assertExists(data.slug);
  });
});
```

### Using Fixtures

```typescript
import {
  getFreeUser,
  getProUser,
  createIsolatedUser,
} from "../fixtures/users.ts";
import { createBasicApp, createAppWithRAG } from "../fixtures/applications.ts";

describe("Billing Scenarios", () => {
  it("free user hits credit limit", async () => {
    const user = await createIsolatedUser("FREE");
    const app = await createBasicApp(user);

    // ... test credit exhaustion
  });
});
```

---

## Cloudflare Worker & R2

### Architecture

```
Browser → Cloudflare Worker → R2 (static assets) OR GKE (API routes)
```

**What the Worker does:**

- Serves Svelte SPA from R2 bucket
- Injects `window.__APP_BRAND__` for instant branded splash screens
- Proxies API routes to Deno backend
- Serves PWA manifests and icons per-app

### Key Files

- `cloudflare-worker/src/index.ts` - Main worker entry
- `cloudflare-worker/src/brand-inject.ts` - Brand injection logic
- `cloudflare-worker/wrangler.toml` - Worker configuration
- `cloudflare-worker/scripts/dev.sh` - Development script
- `cloudflare-worker/scripts/upload-assets.sh` - Asset upload

### wrangler.toml

```toml
name = "chipp-deno-spa"
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "chipp-deno-spa"
preview_bucket_name = "chipp-deno-spa-dev"  # Dev bucket

[vars]
API_ORIGIN = "https://dino-mullet.chipp.ai"
```

### Routes Proxied to API

- `/api/*` - All API endpoints
- `/auth/*` - Authentication
- `/ws/*` - WebSocket connections
- `/consumer/*` - Consumer routes, PWA assets
- `/generate/*` - AI generation
- `/webhooks/*` - Stripe, Twilio
- `/health` - Health check

### Local Development

**Full Worker development (standalone):**

```bash
cd cloudflare-worker
./scripts/dev.sh                    # Full: build + upload + run
./scripts/dev.sh --skip-build       # Upload existing build
./scripts/dev.sh --worker-only      # Just start Worker (fastest)
```

**Integrated development (via main dev.sh):**

```bash
./scripts/dev.sh                    # Starts API + Vite + Worker together
./scripts/dev.sh --no-worker        # Skip Worker (use Vite directly at :5173)
```

**CRITICAL: The --remote flag:**

When running `wrangler dev`, use `--remote` to connect to real R2 bucket. Without it, Miniflare simulates an empty bucket and assets won't load.

### R2 Bucket Structure

```
chipp-deno-spa/
├── index.html
├── assets/
│   ├── *.js
│   ├── *.css
│   └── fonts/
└── brands/
    └── {app-slug}/
        ├── config.json    # Brand metadata
        ├── logo.png       # App logo
        └── og.png         # Social share image
```

### Brand Injection (window.**APP_BRAND**)

For consumer chat routes (`/w/chat/{slug}`), the Worker injects:

```javascript
window.__APP_BRAND__ = {
  slug: "my-app",
  name: "My App",
  color: "#FF5500",
  logo: "https://r2.chipp.ai/brands/my-app/logo.png",
};
```

This enables instant branded splash screens without waiting for API.

### Brand Sync Service

`src/services/brand-sync.service.ts` syncs app branding to R2:

- Called on app create/update
- Uses AWS Signature V4 for R2 auth (no SDK needed)
- Lazy-initialized, fails gracefully if R2 not configured

### Required Environment Variables

```bash
R2_ENDPOINT=https://{account}.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=chipp-deno-spa-dev
R2_PUBLIC_URL=https://r2.chipp.ai
```

### Updating SPA in R2

```bash
cd web && npm run build
cd ../cloudflare-worker
./scripts/upload-assets.sh
```

### Testing Brand Injection

1. Start full dev stack: `./scripts/dev.sh`
2. Navigate to `http://localhost:8788/#/w/chat/{app-slug}`
3. Splash should show app's logo and colors

### Debug Brand Config

```bash
npx wrangler r2 object get chipp-deno-spa-dev/brands/{slug}/config.json --pipe
```

---

## Automatic Context Loading

When working on specific features, load relevant documentation:

| User mentions                     | Auto-read docs                              |
| --------------------------------- | ------------------------------------------- |
| voice agent, livekit              | docs/voice/README.md                        |
| custom action, api integration    | docs/custom-actions/README.md               |
| action collection                 | docs/action-collections/README.md           |
| RAG, knowledge source, embeddings | docs/knowledge-sources-rag/                 |
| tool dependencies                 | docs/tool-dependencies/README.md            |
| chat architecture, streaming      | docs/chat-architecture/README.md            |
| streaming animation, markdown     | docs/streaming-animation/README.md          |
| newline collapse, content shift   | docs/streaming-animation/troubleshooting.md |
| stripe, billing, subscription     | docs/stripe-development.md                  |
| sentry, error tracking            | docs/sentry-error-handling.md               |
| memory extraction                 | docs/memory/                                |
| enterprise, whitelabel            | docs/enterprise-whitelabel/                 |
| PWA, manifest, icons              | docs/deno-migration/pwa.md                  |
| R2, brand injection               | docs/r2-app-branding/README.md              |

**Local documentation:**

- `docs/API_DESIGN.md` - API architecture and patterns
- `docs/WEBSOCKET_ARCHITECTURE.md` - WebSocket implementation
- `TESTING.md` - Testing guide

---

## MCP Database Tools

Use the unified `chipp-db` MCP server for database access during debugging:

```
# Connect to an environment
mcp__chipp-db__connect(environment: "production")  # or "staging", "local"

# Query databases
mcp__chipp-db__query(database: "main", sql: "SELECT * FROM applications WHERE id = 'xxx'")
mcp__chipp-db__query(database: "chat", sql: "SELECT * FROM chat_sessions LIMIT 5")
mcp__chipp-db__query(database: "embeddings", sql: "SELECT * FROM textchunk LIMIT 5")

# Schema discovery
mcp__chipp-db__findTable(pattern: "user")
mcp__chipp-db__findColumn(pattern: "email")
mcp__chipp-db__describeTable(database: "main", table: "applications")
```

**Environments:**

- **local**: Development (requires Docker: `docker compose up -d`)
- **staging**: Testing before production
- **production**: Real data (requires Cloud SQL proxy)

**Troubleshooting:**

- **"Not connected"**: Run `mcp__chipp-db__connect(environment: "production")` first
- **Connection refused**: Check proxy status
- **Auth failed**: Reconfigure credentials

---

## Stripe Billing

### Key Patterns

- **Always use sandboxes** (not test mode) - v2 APIs require sandboxes
- **API versions**: v1 `2025-09-30.clover`, v2 `2025-08-27.preview`
- **Webhook signature verification**: Always verify with `stripe.webhooks.constructEvent`

### Service Location

`src/services/stripe.client.ts` - Stripe client initialization
`src/services/billing.service.ts` - Billing business logic

### Verifying Webhook Signatures

```typescript
import Stripe from "stripe";

export async function handleWebhook(request: Request) {
  const signature = request.headers.get("stripe-signature")!;
  const body = await request.text();

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
    // Process event
  } catch (err) {
    return new Response("Webhook Error", { status: 400 });
  }
}
```

See `docs/stripe-development.md` for comprehensive Stripe patterns.

---

## Sentry Error Handling

### Automatic Capture

Errors are automatically captured via:

- `console.error()` calls
- Unhandled exceptions
- Hono error middleware

### Explicit Capture

For critical paths with rich context:

```typescript
import * as Sentry from "@sentry/deno";

try {
  // Critical operation
} catch (err) {
  Sentry.captureException(err, {
    tags: {
      source: "api-route-name",
      feature: "payment-processing",
    },
    extra: {
      userId,
      requestId,
    },
  });
  throw err;
}
```

### Linear Integration

Include Linear issue ID in commits:

```bash
git commit -m "fix: resolve chat streaming issue (ENG-1544)"
```

Include Sentry ID for auto-resolution:

```
fix: resolve null pointer in chat handler (ENG-1544)
Fixes APPCHIPPAI-123
```

---

## Code Standards

### SOLID Principles

- **Single Responsibility**: One thing per function/class
- **Open/Closed**: Extend via composition, not modification
- **Dependency Inversion**: Use behavior flags over source checks

### TypeScript

- Deno strict mode enabled in `deno.json`
- **NEVER cast to `unknown` or `any`** - fix type errors at the root
- Use proper type definitions for cross-runtime code

### Security

- Validate all inputs with Zod schemas
- Auth middleware on all protected routes
- URL validation: `src/services/url-validation.service.ts`
- No user-provided URLs in redirects
- Environment variables for secrets

```typescript
// URL validation
import { urlValidationService } from "../services/url-validation.service.ts";

const { isValid, error } = await urlValidationService.validate(userUrl);
if (!isValid) {
  return c.json({ error }, 400);
}
```

---

## Git Workflow

### Branch Creation

**Always branch from `origin/staging`, not local staging:**

```bash
git fetch origin staging
git checkout -b feature/my-feature origin/staging
```

### PR Creation

- Target `staging` branch (never `main`)
- No initial headings - start with content
- Be concise, include key technical details

```bash
gh pr create --base staging --title "feat: add voice agent configuration" --body "Brief summary..."
gh pr edit <number> --add-reviewer ValentinaValverde,scottdavidmeyer2377
```

### Commit Format

```bash
git commit -m "type: brief description

- Key change 1
- Key change 2

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Never Discard Uncommitted Changes

Before any destructive git command (`checkout --`, `reset --hard`):

1. Run `git status` to check for uncommitted changes
2. Commit them first (even as WIP) or use `git stash`
3. Only then proceed

---

## Quick Reference

### Common Commands

```bash
./scripts/dev.sh              # Full dev stack
./scripts/dev.sh --api-only   # API only
./scripts/dev.sh --no-worker  # Skip Cloudflare Worker
deno task test                # Run tests
deno task check               # Type check
deno task db:migrate          # Run migrations
deno task fmt                 # Format code
```

### Key File Locations

| What          | Where                        |
| ------------- | ---------------------------- |
| API routes    | `src/api/routes/`            |
| Services      | `src/services/`              |
| Middleware    | `src/api/middleware/`        |
| Svelte routes | `web/src/routes/`            |
| Svelte stores | `web/src/stores/`            |
| Design system | `web/src/lib/design-system/` |
| Tests         | `src/__tests__/`             |
| Migrations    | `db/migrations/`             |
| Worker        | `cloudflare-worker/src/`     |

### Environment Variables

See `.env.example` for all required variables. Key ones:

```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# R2 (brand sync)
R2_ENDPOINT=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# Stripe
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Sentry
SENTRY_DSN=...
```

### Service URLs (Development)

| Service           | URL                                   |
| ----------------- | ------------------------------------- |
| Deno API          | http://localhost:8000                 |
| Vite (Svelte)     | http://localhost:5173                 |
| Cloudflare Worker | http://localhost:8788                 |
| Consumer Chat     | http://localhost:8788/#/w/chat/{slug} |
