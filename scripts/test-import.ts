#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test Import Script
 *
 * Cleans up previous import attempts and tests the import flow.
 * Run with: deno run --allow-net --allow-env --allow-read scripts/test-import.ts
 */

import postgres from "npm:postgres@3.4.4";

// Load env from both chipp-deno and monorepo root
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

// DENO_DATABASE_URL is for the local chipp-deno postgres database
const DATABASE_URL =
  Deno.env.get("DENO_DATABASE_URL") || localEnv["DENO_DATABASE_URL"];

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  Deno.exit(1);
}

const sql = postgres(DATABASE_URL);

async function cleanupImportData() {
  console.log("Cleaning up previous import data...\n");

  // Get import sessions for context
  const sessions = await sql`
    SELECT id, user_id, source_developer_id, status, error_message, created_at
    FROM app.import_sessions
    ORDER BY created_at DESC
    LIMIT 5
  `;

  if (sessions.length > 0) {
    console.log("Recent import sessions:");
    for (const s of sessions) {
      console.log(
        `  - ${s.id} | status: ${s.status} | error: ${s.error_message?.slice(0, 50) || "none"}`
      );
    }
    console.log();
  }

  // Delete in order to respect foreign keys
  const progressDeleted =
    await sql`DELETE FROM app.import_progress RETURNING id`;
  console.log(`Deleted ${progressDeleted.length} import_progress records`);

  const mappingsDeleted =
    await sql`DELETE FROM app.import_id_mappings RETURNING id`;
  console.log(`Deleted ${mappingsDeleted.length} import_id_mappings records`);

  const sessionsDeleted =
    await sql`DELETE FROM app.import_sessions RETURNING id`;
  console.log(`Deleted ${sessionsDeleted.length} import_sessions records`);

  // Also clean up any imported data that might cause conflicts
  const messagesDeleted = await sql`DELETE FROM chat.messages RETURNING id`;
  console.log(`Deleted ${messagesDeleted.length} chat messages`);

  const chatSessionsDeleted = await sql`DELETE FROM chat.sessions RETURNING id`;
  console.log(`Deleted ${chatSessionsDeleted.length} chat sessions`);

  const consumersDeleted = await sql`DELETE FROM app.consumers RETURNING id`;
  console.log(`Deleted ${consumersDeleted.length} consumers`);

  const toolsDeleted =
    await sql`DELETE FROM app.user_defined_tools RETURNING id`;
  console.log(`Deleted ${toolsDeleted.length} user_defined_tools`);

  const ksDeleted = await sql`DELETE FROM rag.knowledge_sources RETURNING id`;
  console.log(`Deleted ${ksDeleted.length} knowledge_sources`);

  const appsDeleted = await sql`DELETE FROM app.applications RETURNING id`;
  console.log(`Deleted ${appsDeleted.length} applications`);

  const workspaceMembersDeleted =
    await sql`DELETE FROM app.workspace_members RETURNING id`;
  console.log(`Deleted ${workspaceMembersDeleted.length} workspace_members`);

  const workspacesDeleted = await sql`DELETE FROM app.workspaces RETURNING id`;
  console.log(`Deleted ${workspacesDeleted.length} workspaces`);

  // Fix any bad slugs in existing organizations
  const orgs = await sql`SELECT id, name, slug FROM app.organizations`;
  console.log(`\nExisting organizations (${orgs.length}):`);
  for (const org of orgs) {
    console.log(`  - ${org.id} | ${org.name} | slug: ${org.slug}`);

    // Fix bad slugs (containing spaces, apostrophes, or null)
    if (!org.slug || /[^a-z0-9-]/.test(org.slug)) {
      const newSlug =
        org.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) +
        "-" +
        Math.random().toString(36).slice(2, 6);

      await sql`UPDATE app.organizations SET slug = ${newSlug} WHERE id = ${org.id}`;
      console.log(`    -> Fixed slug to: ${newSlug}`);
    }
  }

  console.log("\nCleanup complete!\n");
}

async function showCurrentState() {
  console.log("=== Current Database State ===\n");

  const users =
    await sql`SELECT id, email, organization_id FROM app.users LIMIT 5`;
  console.log(`Users (${users.length}):`);
  for (const u of users) {
    console.log(
      `  - ${u.id.slice(0, 8)}... | ${u.email} | org: ${u.organization_id || "none"}`
    );
  }

  const orgs = await sql`SELECT id, name, slug FROM app.organizations`;
  console.log(`\nOrganizations (${orgs.length}):`);
  for (const org of orgs) {
    console.log(
      `  - ${org.id.slice(0, 8)}... | ${org.name} | slug: ${org.slug}`
    );
  }

  const apps =
    await sql`SELECT id, name, app_name_id FROM app.applications LIMIT 5`;
  console.log(`\nApplications (${apps.length}):`);
  for (const app of apps) {
    console.log(
      `  - ${app.id.slice(0, 8)}... | ${app.name} | slug: ${app.app_name_id}`
    );
  }

  console.log();
}

// Main
const command = Deno.args[0] || "status";

try {
  if (command === "cleanup") {
    await cleanupImportData();
  } else if (command === "status") {
    await showCurrentState();
  } else {
    console.log(
      "Usage: deno run --allow-net --allow-env --allow-read scripts/test-import.ts [command]"
    );
    console.log("Commands:");
    console.log("  status  - Show current database state (default)");
    console.log("  cleanup - Clean up all import data for fresh retry");
  }
} finally {
  await sql.end();
}
