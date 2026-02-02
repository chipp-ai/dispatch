# Chipp Deno API Tests

Comprehensive test suite for the Hono API using Deno's built-in test runner.

## Quick Start

```bash
# Run all tests
deno test src/__tests__/

# Run specific route tests
deno test src/__tests__/routes/

# Run specific scenario tests
deno test src/__tests__/scenarios/

# Run with watch mode
deno test --watch src/__tests__/
```

## Directory Structure

```
src/__tests__/
├── setup.ts                    # Core test utilities, DB helpers, auth
├── README.md                   # This file
├── fixtures/
│   ├── index.ts               # Re-exports all fixtures
│   ├── users.ts               # User fixtures (tiers, roles)
│   ├── applications.ts        # App fixtures (RAG, actions, etc.)
│   ├── organizations.ts       # Org fixtures (billing states)
│   └── knowledge_sources.ts   # RAG/knowledge fixtures
├── routes/
│   ├── applications_test.ts   # /api/applications endpoints
│   ├── organization_test.ts   # /api/organization endpoints
│   ├── billing_test.ts        # /api/billing, /api/stripe endpoints
│   ├── chat_test.ts           # /api/chat endpoints
│   ├── knowledge_sources_test.ts  # Knowledge source endpoints
│   ├── custom_actions_test.ts # Custom action endpoints
│   ├── workspace_test.ts      # /api/workspaces endpoints
│   ├── auth_test.ts           # /api/auth endpoints
│   └── consumers_test.ts      # Consumer management endpoints
└── scenarios/
    ├── free_tier_limits_test.ts     # Free tier experience
    ├── rag_retrieval_test.ts        # RAG knowledge retrieval
    ├── credit_exhaustion_test.ts    # Credit lifecycle
    ├── custom_action_execution_test.ts  # Tool use in chat
    ├── team_collaboration_test.ts   # Team features
    └── app_publishing_test.ts       # Publishing flow
```

## Testing Approach

### app.request() Pattern

We use Hono's `app.request()` method for zero-network-overhead testing:

```typescript
import app from "../../api/index.ts";

const res = await app.request("/api/applications", {
  method: "GET",
  headers: { Authorization: `Bearer ${token}` },
});
```

### Fixtures

Pre-defined test data for consistent testing:

```typescript
import { getFreeUser, createBasicApp } from "../fixtures/index.ts";

const user = await getFreeUser();
const app = await createBasicApp(user);
```

### Request Helpers

Simplified authenticated requests:

```typescript
import { get, post, expectSuccess } from "../setup.ts";

const res = await get("/api/applications", user);
const data = await expectSuccess(res);
```

## Test Categories

### Route Tests

Unit tests for individual API endpoints. Test:

- Authentication/authorization
- Request validation
- Response format
- Error handling
- Edge cases

### Scenario Tests

End-to-end tests for complete user journeys. Test:

- Multi-step workflows
- Feature interactions
- Business logic enforcement
- Real-world use cases

## Writing Tests

### Route Test Template

```typescript
import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import { setupTests, teardownTests, get, expectSuccess } from "../setup.ts";
import { getFreeUser } from "../fixtures/users.ts";

describe("My API", () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  describe("GET /api/my-endpoint", () => {
    it("should return expected data", async () => {
      const user = await getFreeUser();
      const res = await get("/api/my-endpoint", user);
      const data = await expectSuccess(res);
      assertExists(data.field);
    });
  });
});
```

### Scenario Test Template

```typescript
import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import {
  setupTests,
  teardownTests,
  post,
  expectSuccess,
  expectStatus,
} from "../setup.ts";
import { createIsolatedUser } from "../fixtures/users.ts";
import { createBasicApp } from "../fixtures/applications.ts";

describe("My Scenario", () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  describe("Complete Flow", () => {
    it("should complete the entire workflow", async () => {
      // Step 1: Setup
      const user = await createIsolatedUser("PRO");
      const app = await createBasicApp(user);

      // Step 2: Action
      const res = await post("/api/action", user, { appId: app.id });

      // Step 3: Verify
      const data = await expectSuccess(res);
      assertEquals(data.status, "success");
    });
  });
});
```

## Database Isolation

Tests use transactions for isolation:

```typescript
import { beginTransaction, rollbackTransaction } from "../setup.ts";

beforeEach(async () => {
  await beginTransaction();
});

afterEach(async () => {
  await rollbackTransaction();
});
```

## TODO

Many tests are currently stubs with TODO comments. Implementation priorities:

1. **Auth tests** - Foundation for all other tests
2. **Applications CRUD** - Core functionality
3. **Chat tests** - Main user interaction
4. **Credit enforcement** - Billing compliance
5. **RAG tests** - Knowledge feature
6. **Custom actions** - Tool use feature
7. **Team tests** - Collaboration features

## Environment

Tests require:

- Local MySQL database (docker-compose)
- Local PostgreSQL for embeddings (docker-compose)
- Environment variables (see .env.example)

```bash
# Start databases
docker compose up -d

# Verify connection
deno run --allow-net src/__tests__/setup.ts
```
