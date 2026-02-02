# Testing Guide

## Overview

This project follows the testing strategy outlined in `docs/deno-migration/testing.md`. Tests are organized as unit tests (services), integration tests (API routes), and E2E tests (browser).

## Running Tests

### All Tests
```bash
npm run test
# or
deno test --allow-net --allow-env --allow-read
```

### Watch Mode
```bash
npm run test:watch
# or
deno test --watch --allow-net --allow-env --allow-read
```

### Coverage
```bash
npm run test:coverage
# or
deno test --coverage=coverage/ --allow-net --allow-env --allow-read
```

### Specific Test File
```bash
deno test src/services/application.service_test.ts --allow-net --allow-env --allow-read
```

### Filter Tests
```bash
deno test --filter "create" --allow-net --allow-env --allow-read
```

## Test Organization

### Unit Tests (Services)
Located in `src/services/*_test.ts`:
- `application.service_test.ts` - Application CRUD operations
- `chat.service_test.ts` - Chat session and message management
- `custom-action.service_test.ts` - Custom tool management
- `rag.service_test.ts` - RAG and vector search
- `url-validation.service_test.ts` - SSRF prevention
- `tool-execution.service_test.ts` - Tool execution and variable resolution

### Integration Tests (API Routes)
Located in `src/api/routes/*/index_test.ts`:
- Test full request/response cycles using Hono's `app.request()`
- No actual HTTP server needed
- Fast execution (~5ms per test)

### Test Helpers
Located in `test/`:
- `setup.ts` - Database setup, test data factories
- `helpers.ts` - Request helpers, auth token creation

## Test Database Setup

Tests use a separate test database. Set `TEST_DATABASE_URL` environment variable:

```bash
export TEST_DATABASE_URL="postgres://postgres:test@localhost:5432/chipp_test"
```

The test setup automatically:
- Connects to test database
- Cleans up data between tests
- Provides factories for test data

## Writing Tests

### Basic Test Structure

```typescript
import { assertEquals } from "@std/assert";
import { describe, it, beforeAll, afterAll, beforeEach } from "jsr:@std/testing/bdd";
import { myService } from "./my.service.ts";

describe("My Service", () => {
  beforeAll(async () => {
    // Setup once before all tests
  });

  afterAll(async () => {
    // Cleanup after all tests
  });

  beforeEach(async () => {
    // Setup before each test
  });

  it("does something", async () => {
    const result = await myService.doSomething();
    assertEquals(result, expected);
  });
});
```

### Testing with Database

```typescript
import { setupTestDb, teardownTestDb, cleanupTestDb } from "../../test/setup.ts";

describe("Service with DB", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb(); // Clean between tests
  });

  it("creates record", async () => {
    const record = await service.create({ name: "Test" });
    assertEquals(record.name, "Test");
  });
});
```

### Testing API Routes

```typescript
import { app } from "../app.ts";
import { assertEquals } from "@std/assert";
import { createTestToken } from "../../test/helpers.ts";

Deno.test("GET /api/apps returns applications", async () => {
  const token = createTestToken({ id: "user-123", ... });
  
  const res = await app.request("/api/applications", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(Array.isArray(data.data), true);
});
```

## Test Coverage Goals

- **Services**: 80%+ coverage
- **API Routes**: Critical paths covered
- **Utils**: 100% coverage

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Pushes to main/staging
- Pre-commit hooks (optional)

See `.github/workflows/test.yml` for CI configuration.

## Best Practices

1. **Fast Tests**: Keep tests under 100ms each
2. **Isolated**: Each test should be independent
3. **Clear Names**: Test names should describe what they test
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Mock External Services**: Don't call real APIs in tests
6. **Test Edge Cases**: Include error cases, boundary conditions
7. **Clean Up**: Always clean up test data

## Troubleshooting

### Tests Fail with Database Connection Error
- Ensure test database is running
- Check `TEST_DATABASE_URL` is set correctly
- Verify migrations have been run on test database

### Tests Are Slow
- Check for unnecessary database queries
- Use transactions for test isolation
- Mock external API calls

### Import Errors
- Ensure `deno.json` has correct imports
- Use `jsr:` prefix for JSR packages
- Use `npm:` prefix for npm packages

