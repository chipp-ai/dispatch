/**
 * Quick test script to verify database connectivity
 */

import { db } from "./src/db/client.ts";

console.log("Testing query...");

try {
  const result = await db
    .selectFrom("app.applications")
    .select(["id", "name", "appNameId", "isActive", "isDeleted"])
    .where("appNameId", "=", "test-chat-app")
    .executeTakeFirst();

  console.log("Result:", result);
} catch (error) {
  console.error("Error:", error);
}

Deno.exit(0);
