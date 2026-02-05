# Hono API Patterns

## Route Organization

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

## Basic Route Pattern

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

## Middleware Stack

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

## Authentication Architecture (Cookie Domains)

**CRITICAL**: There are TWO separate auth systems with different cookie strategies:

### 1. Developer Auth (`routes/auth.ts`)

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
- **OAuth URLs**: SPA must redirect directly to API domain (`https://dino-mullet.chipp.ai/auth/login/google`), NOT through Worker proxy

```typescript
// routes/auth.ts - production cookie settings
const COOKIE_DOMAIN =
  Deno.env.get("ENVIRONMENT") === "production" ? ".chipp.ai" : undefined;

setCookie(c, "session_id", session.id, {
  domain: COOKIE_DOMAIN, // .chipp.ai in prod, undefined in dev
  // ...
});
```

### 2. Consumer Auth (`src/api/routes/consumer/index.ts`)

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

## Streaming Responses (SSE)

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

## Service Layer Pattern

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
