# Testing Guide

## Running Tests

```bash
deno task test                    # All tests
deno task test:routes             # Route tests only
deno task test:scenarios          # E2E scenario tests
deno task test:watch              # Watch mode
deno task test:coverage           # With coverage report

# Run specific test file
deno test src/__tests__/routes/applications_test.ts --allow-net --allow-env --allow-read
```

## Test Structure

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

## app.request() Pattern

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

## Using Fixtures

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

## Feedback Loop Pyramid

**Faster feedback = more iterations.** Always verify your work using the pyramid - fastest checks first:

```
         /\
        /  \     Browser: ~5 sec (few)
       /----\
      /      \   Integration: ~100ms (some)
     /--------\
    /  Unit    \ ~1ms (many)
   /------------\
  / Type checks  \ ~seconds (always)
 /----------------\
```

| Level | Command | When | Speed |
|-------|---------|------|-------|
| 1. Type checks | `deno task check` | ALWAYS after writing code | ~seconds |
| 2. Unit tests | `deno task test:watch` | Business logic, utilities | ~1ms each |
| 3. Integration | `.scratch/test-*.ts` scripts | API endpoints, DB operations | ~100ms each |
| 4. Browser | `browser_take_screenshot` | UI changes only | ~5 sec |

**Key principle:** Don't skip to browser tests. Most bugs are caught by type checks and unit tests.
