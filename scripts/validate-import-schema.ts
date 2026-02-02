#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Validate Import Schema
 *
 * Connects to the source chipp-admin database and validates that all columns
 * used in import queries actually exist.
 *
 * Run with: deno run --allow-net --allow-env --allow-read scripts/validate-import-schema.ts
 */

// Load env from both locations
const loadEnv = async (path: string): Promise<Record<string, string>> => {
  const content = await Deno.readTextFile(path).catch(() => "");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      vars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return vars;
};

const localEnv = await loadEnv(".env");
const rootEnv = await loadEnv("../../.env");

// Source database (chipp-admin)
const CHIPP_ADMIN_DATABASE_URL =
  Deno.env.get("CHIPP_ADMIN_DATABASE_URL") ||
  localEnv["CHIPP_ADMIN_DATABASE_URL"];

if (!CHIPP_ADMIN_DATABASE_URL) {
  console.error("ERROR: CHIPP_ADMIN_DATABASE_URL not set");
  console.error("This should be in apps/chipp-deno/.env");
  Deno.exit(1);
}

// Create MySQL connection
const mysql = await import("npm:mysql2@3.6.0/promise");

const url = new URL(CHIPP_ADMIN_DATABASE_URL);
const pool = mysql.createPool({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  waitForConnections: true,
  connectionLimit: 2,
});

async function getTableColumns(tableName: string): Promise<string[]> {
  try {
    const [rows] = await pool.query(`DESCRIBE ${tableName}`);
    return (rows as Array<{ Field: string }>).map((r) => r.Field);
  } catch (e) {
    console.error(
      `  ERROR: Table ${tableName} not found or error: ${e.message}`
    );
    return [];
  }
}

async function validateQuery(
  description: string,
  tableName: string,
  columns: string[]
) {
  console.log(`\n${description}`);
  console.log(`  Table: ${tableName}`);

  const actualColumns = await getTableColumns(tableName);
  if (actualColumns.length === 0) {
    return;
  }

  const missing: string[] = [];
  const found: string[] = [];

  for (const col of columns) {
    if (actualColumns.includes(col)) {
      found.push(col);
    } else {
      missing.push(col);
    }
  }

  if (missing.length > 0) {
    console.log(`  MISSING columns: ${missing.join(", ")}`);
  }
  if (found.length > 0) {
    console.log(`  Found columns: ${found.join(", ")}`);
  }

  // Show all actual columns for reference
  console.log(`  Actual columns: ${actualColumns.join(", ")}`);
}

console.log("=== Validating Import Schema Against Source Database ===\n");
console.log(`Connected to: ${url.hostname}${url.pathname}`);

// Validate each query used in the import service

await validateQuery("Phase 1: Organizations", "Organization", [
  "id",
  "name",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "subscriptionTier",
  "usageBasedBillingEnabled",
  "isDeleted",
  "creatorId",
]);

await validateQuery("Phase 2: Workspaces", "Workspace", [
  "id",
  "name",
  "organizationId",
  "isDeleted",
]);

await validateQuery("Phase 2: WorkspaceMember", "WorkspaceMember", [
  "workspaceId",
  "developerId",
]);

await validateQuery("Phase 2: OrganizationMember", "OrganizationMember", [
  "organizationId",
  "developerId",
]);

await validateQuery("Phase 3: Applications", "Application", [
  "id",
  "name",
  "description",
  "systemPrompt",
  "model",
  "temperature",
  "brandStyles",
  "capabilities",
  "welcomeMessages",
  "suggestedMessages",
  "leadFormConfig",
  "settings",
  "isActive",
  "isPublic",
  "workspaceId",
  "createdAt",
  "updatedAt",
  "developerId",
  "isDeleted",
]);

await validateQuery(
  "Phase 4: Knowledge Sources (ApplicationAssistantFile)",
  "ApplicationAssistantFile",
  [
    "id",
    "applicationId",
    "name",
    "knowledgeSourceType",
    "status",
    "url",
    "createdAt",
    "updatedAt",
  ]
);

await validateQuery(
  "Phase 5: Custom Actions (UserDefinedTool)",
  "UserDefinedTool",
  [
    "id",
    "applicationId",
    "name",
    "slug",
    "description",
    "url",
    "method",
    "headers",
    "pathParams",
    "queryParams",
    "bodyParams",
    "variables",
    "presentTenseVerb",
    "pastTenseVerb",
    "isClientSideTool",
    "createdAt",
    "updatedAt",
  ]
);

await validateQuery("Phase 6: Consumers", "Consumer", [
  "id",
  "applicationId",
  "email",
  "name",
  "credits",
  "subscriptionActive",
  "stripeCustomerId",
  "createdAt",
  "updatedAt",
]);

await validateQuery("Developer lookup", "Developer", ["id", "email", "name"]);

// Test actual queries that the import service uses
console.log("\n=== Testing Actual Import Queries ===\n");

// Find a developer to test with
const [devRows] = await pool.query(
  "SELECT id, email, name FROM Developer WHERE email = ? LIMIT 1",
  [Deno.args[0] || "hunter@chipp.ai"]
);
const developers = devRows as Array<{
  id: number;
  email: string;
  name: string;
}>;

if (developers.length === 0) {
  console.log("No developer found to test with");
} else {
  const dev = developers[0];
  console.log(`Testing with developer: ${dev.email} (ID: ${dev.id})\n`);

  // Test Organization query
  try {
    const [orgRows] = await pool.query(
      `SELECT DISTINCT o.id, o.name, o.stripeCustomerId, o.stripeSubscriptionId,
              o.subscriptionTier, o.usageBasedBillingEnabled
       FROM Organization o
       LEFT JOIN OrganizationMember om ON o.id = om.organizationId
       WHERE (o.creatorId = ? OR om.developerId = ?) AND o.isDeleted = 0
       ORDER BY o.id`,
      [dev.id, dev.id]
    );
    console.log(
      `✓ Organizations query: found ${(orgRows as unknown[]).length} orgs`
    );
  } catch (e) {
    console.log(`✗ Organizations query FAILED: ${e.message}`);
  }

  // Test Workspace query
  try {
    const [wsRows] = await pool.query(
      `SELECT DISTINCT w.id, w.name, w.organizationId
       FROM Workspace w
       LEFT JOIN WorkspaceMember wm ON w.id = wm.workspaceId
       WHERE wm.developerId = ? AND w.isDeleted = 0
       ORDER BY w.id`,
      [dev.id]
    );
    console.log(
      `✓ Workspaces query: found ${(wsRows as unknown[]).length} workspaces`
    );
  } catch (e) {
    console.log(`✗ Workspaces query FAILED: ${e.message}`);
  }

  // Test Application query (the one that was failing)
  try {
    const [appRows] = await pool.query(
      `SELECT id, name, description, brandStyles, workspaceId, createdAt, updatedAt
       FROM Application
       WHERE developerId = ? AND isDeleted = 0
       ORDER BY id`,
      [dev.id]
    );
    console.log(
      `✓ Applications query: found ${(appRows as unknown[]).length} apps`
    );
  } catch (e) {
    console.log(`✗ Applications query FAILED: ${e.message}`);
  }

  // Test Knowledge Sources query
  try {
    const [appRows] = await pool.query(
      `SELECT id FROM Application WHERE developerId = ? AND isDeleted = 0`,
      [dev.id]
    );
    const appIds = (appRows as Array<{ id: number }>).map((a) => a.id);
    if (appIds.length > 0) {
      const [ksRows] = await pool.query(
        `SELECT id, applicationId, name, knowledgeSourceType, status, url, createdAt, updatedAt
         FROM ApplicationAssistantFile
         WHERE applicationId IN (?)`,
        [appIds]
      );
      console.log(
        `✓ Knowledge Sources query: found ${(ksRows as unknown[]).length} sources`
      );
    } else {
      console.log(`✓ Knowledge Sources query: skipped (no apps)`);
    }
  } catch (e) {
    console.log(`✗ Knowledge Sources query FAILED: ${e.message}`);
  }

  // Test Custom Actions query
  try {
    const [appRows] = await pool.query(
      `SELECT id FROM Application WHERE developerId = ? AND isDeleted = 0`,
      [dev.id]
    );
    const appIds = (appRows as Array<{ id: number }>).map((a) => a.id);
    if (appIds.length > 0) {
      const [toolRows] = await pool.query(
        `SELECT id, applicationId, name, slug, description, url, method,
                headers, pathParams, queryParams, bodyParams, variables,
                presentTenseVerb, pastTenseVerb, isClientSideTool, createdAt, updatedAt
         FROM UserDefinedTool
         WHERE applicationId IN (?)`,
        [appIds]
      );
      console.log(
        `✓ Custom Actions query: found ${(toolRows as unknown[]).length} tools`
      );
    } else {
      console.log(`✓ Custom Actions query: skipped (no apps)`);
    }
  } catch (e) {
    console.log(`✗ Custom Actions query FAILED: ${e.message}`);
  }

  // Test Consumer query
  try {
    const [appRows] = await pool.query(
      `SELECT id FROM Application WHERE developerId = ? AND isDeleted = 0`,
      [dev.id]
    );
    const appIds = (appRows as Array<{ id: number }>).map((a) => a.id);
    if (appIds.length > 0) {
      const [consumerRows] = await pool.query(
        `SELECT id, applicationId, email, name, credits, subscriptionActive,
                stripeCustomerId, createdAt, updatedAt
         FROM Consumer
         WHERE applicationId IN (?)`,
        [appIds]
      );
      console.log(
        `✓ Consumers query: found ${(consumerRows as unknown[]).length} consumers`
      );
    } else {
      console.log(`✓ Consumers query: skipped (no apps)`);
    }
  } catch (e) {
    console.log(`✗ Consumers query FAILED: ${e.message}`);
  }
}

console.log("\n=== All Query Tests Complete ===\n");

await pool.end();
