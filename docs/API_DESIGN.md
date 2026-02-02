# Chipp Deno API Design

## The Problem

The current chipp-admin architecture has two API patterns:

1. **API Routes** (~373 endpoints) - Traditional REST endpoints at `/api/*`
2. **Server Actions** (~25 files, 200+ functions) - Next.js `"use server"` functions called directly from components

Server actions are deeply embedded in the React component tree. A component like `WorkspaceCard` might call `moveApplication()` directly, which runs server-side. This tight coupling makes migration challenging.

## The Elegant Solution: Unified RPC Layer

Instead of fighting the server action pattern, we embrace it with a **typed RPC layer** that works in both contexts.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│                                                                   │
│   Component calls:  actions.workspace.create({ name: "..." })    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Unified Action Client                        │
│                                                                   │
│   if (USE_DENO_API) {                                            │
│     return fetch("/api/v2/workspace", { method: "POST", ... })   │
│   } else {                                                        │
│     return serverAction(createWorkspace, { name: "..." })        │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Next.js Server Action │     │    Deno Hono API        │
│   (legacy, being phased │     │    (new, target)        │
│    out gradually)       │     │                         │
└─────────────────────────┘     └─────────────────────────┘
                │                               │
                └───────────────┬───────────────┘
                                ▼
                ┌─────────────────────────┐
                │     Shared Services     │
                │   (business logic)      │
                └─────────────────────────┘
                                │
                                ▼
                ┌─────────────────────────┐
                │       PostgreSQL        │
                │   (consolidated DB)     │
                └─────────────────────────┘
```

### Key Design Principles

1. **Type-Safe Contract** - Shared TypeScript types define the API contract
2. **Gradual Migration** - Switch endpoints one-by-one via feature flags
3. **Zero Component Changes** - Components keep calling `actions.foo.bar()`
4. **Business Logic Extraction** - Move logic to shared services, not endpoints

---

## Implementation

### 1. Shared Types Package

Create `shared/api-types/` with all request/response types:

```typescript
// shared/api-types/src/workspace.ts
export interface CreateWorkspaceRequest {
  name: string;
  organizationId?: string;
}

export interface CreateWorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface WorkspaceActions {
  create: (req: CreateWorkspaceRequest) => Promise<CreateWorkspaceResponse>;
  get: (id: string) => Promise<Workspace>;
  update: (id: string, req: UpdateWorkspaceRequest) => Promise<Workspace>;
  delete: (id: string) => Promise<void>;
  list: () => Promise<Workspace[]>;
  addMember: (id: string, req: AddMemberRequest) => Promise<WorkspaceMember>;
  removeMember: (id: string, memberId: string) => Promise<void>;
}
```

### 2. Unified Action Client

```typescript
// shared/api-client/src/index.ts
import type { WorkspaceActions, ApplicationActions, ... } from "api-types";

export interface Actions {
  workspace: WorkspaceActions;
  application: ApplicationActions;
  organization: OrganizationActions;
  chat: ChatActions;
  // ... all action domains
}

// Feature flags for gradual migration
const DENO_ENDPOINTS: Record<string, boolean> = {
  "workspace.create": true,
  "workspace.get": true,
  "application.create": false,  // still using Next.js
  // ...
};

export function createActions(config: {
  denoApiUrl: string;
  getAuthToken: () => Promise<string>;
}): Actions {
  return {
    workspace: createWorkspaceActions(config),
    application: createApplicationActions(config),
    // ...
  };
}
```

### 3. Deno Hono API Structure

```
apps/chipp-deno/src/
├── api/
│   ├── index.ts              # Main Hono app
│   ├── middleware/
│   │   ├── auth.ts           # JWT validation
│   │   ├── rateLimit.ts      # Rate limiting
│   │   ├── errorHandler.ts   # Unified error handling
│   │   └── requestId.ts      # Request tracing
│   │
│   ├── routes/
│   │   ├── index.ts          # Route registration
│   │   │
│   │   ├── workspace/
│   │   │   ├── index.ts      # Route definitions
│   │   │   ├── create.ts     # POST /workspace
│   │   │   ├── get.ts        # GET /workspace/:id
│   │   │   ├── update.ts     # PATCH /workspace/:id
│   │   │   ├── delete.ts     # DELETE /workspace/:id
│   │   │   ├── list.ts       # GET /workspaces
│   │   │   └── members.ts    # Nested member routes
│   │   │
│   │   ├── application/
│   │   │   ├── index.ts
│   │   │   ├── crud.ts       # Basic CRUD
│   │   │   ├── tools.ts      # Tool management
│   │   │   ├── files.ts      # File attachments
│   │   │   └── settings.ts   # App settings
│   │   │
│   │   ├── chat/
│   │   │   ├── index.ts
│   │   │   ├── stream.ts     # SSE streaming endpoint
│   │   │   ├── history.ts    # Chat history
│   │   │   └── memory.ts     # Memory management
│   │   │
│   │   ├── billing/
│   │   │   ├── index.ts
│   │   │   ├── stripe-webhook.ts
│   │   │   ├── credits.ts
│   │   │   └── subscription.ts
│   │   │
│   │   ├── integrations/
│   │   │   ├── google/       # Drive, Sheets
│   │   │   ├── microsoft/    # OneDrive, SharePoint
│   │   │   ├── slack/
│   │   │   ├── notion/
│   │   │   └── zapier/
│   │   │
│   │   ├── voice/
│   │   │   ├── config.ts
│   │   │   ├── livekit.ts
│   │   │   └── twilio.ts
│   │   │
│   │   ├── admin/
│   │   │   └── ...
│   │   │
│   │   └── webhooks/
│   │       ├── stripe.ts
│   │       ├── twilio.ts
│   │       └── slack.ts
│   │
│   └── validators/           # Zod schemas
│       ├── workspace.ts
│       ├── application.ts
│       └── ...
│
├── services/                 # Business logic (shared with Next.js)
│   ├── workspace.service.ts
│   ├── application.service.ts
│   ├── billing.service.ts
│   └── ...
│
├── db/
│   ├── client.ts            # Kysely/Drizzle client
│   ├── schema.ts            # Type definitions
│   └── repositories/        # Data access layer
│       ├── workspace.repo.ts
│       ├── application.repo.ts
│       └── ...
│
└── utils/
    ├── errors.ts            # Custom error classes
    ├── auth.ts              # Auth utilities
    └── ...
```

---

## Route Examples

### Simple CRUD Route

```typescript
// src/api/routes/workspace/create.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.ts";
import { workspaceService } from "../../../services/workspace.service.ts";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  organizationId: z.string().uuid().optional(),
});

export const createWorkspace = new Hono()
  .use(authMiddleware)
  .post("/", zValidator("json", createSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const workspace = await workspaceService.create({
      name: body.name,
      organizationId: body.organizationId,
      creatorId: user.id,
    });

    return c.json(workspace, 201);
  });
```

### Streaming Chat Route

```typescript
// src/api/routes/chat/stream.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authMiddleware } from "../../middleware/auth.ts";
import { chatService } from "../../../services/chat.service.ts";

export const chatStream = new Hono()
  .use(authMiddleware)
  .post("/:appId/stream", async (c) => {
    const { appId } = c.req.param();
    const body = await c.req.json();
    const user = c.get("user");

    return streamSSE(c, async (stream) => {
      const response = chatService.streamChat({
        appId,
        messages: body.messages,
        userId: user.id,
      });

      for await (const chunk of response) {
        await stream.writeSSE({
          event: chunk.type,
          data: JSON.stringify(chunk.data),
        });
      }
    });
  });
```

### Webhook Route with Signature Verification

```typescript
// src/api/routes/webhooks/stripe.ts
import { Hono } from "hono";
import { stripeWebhookMiddleware } from "../../middleware/stripeWebhook.ts";
import { billingService } from "../../../services/billing.service.ts";

export const stripeWebhook = new Hono().post(
  "/stripe",
  stripeWebhookMiddleware,
  async (c) => {
    const event = c.get("stripeEvent");

    switch (event.type) {
      case "customer.subscription.created":
        await billingService.handleSubscriptionCreated(event.data.object);
        break;
      case "customer.subscription.updated":
        await billingService.handleSubscriptionUpdated(event.data.object);
        break;
      case "invoice.paid":
        await billingService.handleInvoicePaid(event.data.object);
        break;
      // ... other events
    }

    return c.json({ received: true });
  }
);
```

---

## Service Layer Pattern

Services contain all business logic, independent of HTTP:

```typescript
// src/services/workspace.service.ts
import { db } from "../db/client.ts";
import { workspaceRepo } from "../db/repositories/workspace.repo.ts";
import { organizationRepo } from "../db/repositories/organization.repo.ts";
import { generateVanitySlug } from "../utils/slug.ts";
import { WorkspaceNotFoundError, UnauthorizedError } from "../utils/errors.ts";

export const workspaceService = {
  async create(params: {
    name: string;
    organizationId?: string;
    creatorId: string;
  }) {
    const slug = generateVanitySlug(params.name);

    // If no org specified, create a new one
    let organizationId = params.organizationId;
    if (!organizationId) {
      const org = await organizationRepo.create({
        name: params.name,
        creatorId: params.creatorId,
      });
      organizationId = org.id;
    }

    const workspace = await workspaceRepo.create({
      name: params.name,
      slug,
      organizationId,
      creatorId: params.creatorId,
    });

    // Auto-add creator as owner
    await workspaceRepo.addMember({
      workspaceId: workspace.id,
      userId: params.creatorId,
      role: "owner",
    });

    return workspace;
  },

  async get(id: string, userId: string) {
    const workspace = await workspaceRepo.findById(id);
    if (!workspace) throw new WorkspaceNotFoundError(id);

    const isMember = await workspaceRepo.isMember(id, userId);
    if (!isMember) throw new UnauthorizedError();

    return workspace;
  },

  // ... other methods
};
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

- [x] PostgreSQL schema consolidated
- [x] Data migration infrastructure
- [ ] Hono app skeleton with middleware
- [ ] Auth middleware (JWT validation)
- [ ] Health check + basic routes

### Phase 2: Core APIs (Week 3-4)

- [ ] Workspace CRUD
- [ ] Application CRUD
- [ ] Organization + billing status
- [ ] Unified action client in Next.js

### Phase 3: Chat System (Week 5-6)

- [ ] Chat streaming endpoint (SSE)
- [ ] Chat history APIs
- [ ] Memory management
- [ ] RAG integration

### Phase 4: Integrations (Week 7-8)

- [ ] Stripe webhooks
- [ ] File upload to GCS
- [ ] Knowledge source OAuth flows

### Phase 5: Voice & Advanced (Week 9-10)

- [ ] Voice/LiveKit integration
- [ ] Twilio webhooks
- [ ] Admin APIs
- [ ] Full server action migration

---

## Key Files to Create

1. **`src/api/index.ts`** - Main Hono app with middleware
2. **`src/api/middleware/auth.ts`** - JWT auth middleware
3. **`src/services/*.ts`** - Business logic services
4. **`src/db/client.ts`** - Database client (Kysely)
5. **`shared/api-types/`** - Shared request/response types
6. **`shared/api-client/`** - Unified action client

---

## Benefits of This Approach

1. **Zero-Breaking Change Migration** - Components keep working, we just swap the backend
2. **Type Safety End-to-End** - Shared types catch errors at compile time
3. **Testable Business Logic** - Services are pure functions, easy to unit test
4. **Gradual Rollout** - Feature flags control which endpoints use Deno
5. **Performance Gains** - Deno's native perf + consolidated DB = faster
6. **Simpler Operations** - One database, one backend, fewer moving parts
