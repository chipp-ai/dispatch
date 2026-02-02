/**
 * Minimal test to diagnose Kysely type inference issue
 */
import { db } from "./src/db/client.ts";
import type { Database } from "./src/db/schema.ts";

// Test 1: Direct type check - what does Kysely think the schema is?
type UserTableType = Database["app.users"];

// Test 2: Query builder - does it accept camelCase?
async function testQueries() {
  // This should work if CamelCasePlugin is properly configured
  const user = await db
    .selectFrom("app.users")
    .select(["id", "email", "organizationId", "updatedAt"])
    .where("email", "=", "test@test.com")
    .executeTakeFirst();

  // Type check the result
  if (user) {
    const orgId: string = user.organizationId;
    const updated: Date = user.updatedAt;
    console.log(orgId, updated);
  }
}

// Test 3: Insert - does it accept camelCase?
async function testInsert() {
  await db
    .insertInto("app.sessions")
    .values({
      id: "test-id",
      userId: "user-id",
      expiresAt: new Date(),
      createdAt: new Date(),
    })
    .execute();
}

export { testQueries, testInsert };
