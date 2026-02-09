/**
 * Seed test data for customer/watcher system
 * Run with: npx tsx scripts/seed-test-data.ts
 */

import "dotenv/config";
import { db } from "../lib/db";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

function generatePortalToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function seedTestData() {
  console.log("🌱 Seeding test data for customer/watcher system...\n");

  // Get default workspace
  const workspace = await db.queryOne<{
    id: string;
    issue_prefix: string;
    next_issue_number: number;
  }>(`SELECT id, issue_prefix, next_issue_number FROM dispatch_workspace LIMIT 1`);

  if (!workspace) {
    console.error("❌ No workspace found. Please create a workspace first.");
    process.exit(1);
  }

  console.log(
    `📁 Using workspace: ${workspace.id} (prefix: ${workspace.issue_prefix})\n`
  );

  // Get default status
  const defaultStatus = await db.queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM dispatch_status WHERE workspace_id = $1 ORDER BY position ASC LIMIT 1`,
    [workspace.id]
  );

  if (!defaultStatus) {
    console.error("❌ No status found. Please create statuses first.");
    process.exit(1);
  }

  console.log(`📊 Default status: ${defaultStatus.name}\n`);

  // Check if test data already exists
  const existingCustomer = await db.queryOne<{ id: string }>(
    `SELECT id FROM dispatch_customer WHERE slack_channel_id = 'C_ACME_TEST_001'`
  );

  if (existingCustomer) {
    console.log("⚠️  Test data already exists. Fetching existing data...\n");

    const customer1 = await db.queryOne<{
      slug: string;
      portal_token: string;
      name: string;
    }>(
      `SELECT slug, portal_token, name FROM dispatch_customer WHERE slack_channel_id = 'C_ACME_TEST_001'`
    );
    const customer2 = await db.queryOne<{
      slug: string;
      portal_token: string;
      name: string;
    }>(
      `SELECT slug, portal_token, name FROM dispatch_customer WHERE slack_channel_id = 'C_BETA_TEST_002'`
    );

    if (customer1 && customer2) {
      printTestUrls(customer1, customer2);
    }
    process.exit(0);
  }

  // Create Customer 1: Acme Corp
  console.log("Creating Customer 1: Acme Corp...");
  const customer1Id = uuidv4();
  const customer1Token = generatePortalToken();
  await db.query(
    `INSERT INTO dispatch_customer (id, workspace_id, name, slug, slack_channel_id, portal_token, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      customer1Id,
      workspace.id,
      "Acme Corp",
      "acme-corp",
      "C_ACME_TEST_001",
      customer1Token,
    ]
  );
  console.log(`  ✅ Created customer: Acme Corp (acme-corp)`);

  // Create Customer 2: Beta Inc
  console.log("Creating Customer 2: Beta Inc...");
  const customer2Id = uuidv4();
  const customer2Token = generatePortalToken();
  await db.query(
    `INSERT INTO dispatch_customer (id, workspace_id, name, slug, slack_channel_id, portal_token, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      customer2Id,
      workspace.id,
      "Beta Inc",
      "beta-inc",
      "C_BETA_TEST_002",
      customer2Token,
    ]
  );
  console.log(`  ✅ Created customer: Beta Inc (beta-inc)`);

  // Create users for Customer 1
  console.log("\nCreating users for Acme Corp...");
  const user1Id = uuidv4();
  await db.query(
    `INSERT INTO dispatch_customer_user (id, customer_id, slack_user_id, slack_display_name, email, email_notifications_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
    [user1Id, customer1Id, "U_ALICE_001", "Alice Smith", "alice@acme.test"]
  );
  console.log(`  ✅ User: Alice Smith <alice@acme.test>`);

  const user2Id = uuidv4();
  await db.query(
    `INSERT INTO dispatch_customer_user (id, customer_id, slack_user_id, slack_display_name, email, email_notifications_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
    [user2Id, customer1Id, "U_BOB_002", "Bob Jones", "bob@acme.test"]
  );
  console.log(`  ✅ User: Bob Jones <bob@acme.test>`);

  // Create users for Customer 2
  console.log("\nCreating users for Beta Inc...");
  const user3Id = uuidv4();
  await db.query(
    `INSERT INTO dispatch_customer_user (id, customer_id, slack_user_id, slack_display_name, email, email_notifications_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
    [
      user3Id,
      customer2Id,
      "U_CHARLIE_003",
      "Charlie Brown",
      "charlie@beta.test",
    ]
  );
  console.log(`  ✅ User: Charlie Brown <charlie@beta.test>`);

  // Create test issues
  console.log("\nCreating test issues...");
  let issueNum = workspace.next_issue_number;

  // Issue 1: Reported by Alice (Acme), watched by Acme only
  const issue1Id = uuidv4();
  const issue1Identifier = `${workspace.issue_prefix}-${issueNum++}`;
  await db.query(
    `INSERT INTO dispatch_issue (id, identifier, issue_number, workspace_id, title, description, status_id, priority, customer_id, reporter_id, slack_channel_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
    [
      issue1Id,
      issue1Identifier,
      issueNum - 1,
      workspace.id,
      "Login button not working on mobile",
      "Users report the login button is unresponsive on iOS Safari. Tested on iPhone 14 Pro.",
      defaultStatus.id,
      "P2",
      customer1Id,
      user1Id,
      "C_ACME_TEST_001",
    ]
  );
  await db.query(
    `INSERT INTO dispatch_issue_watcher (issue_id, customer_id, added_at) VALUES ($1, $2, NOW())`,
    [issue1Id, customer1Id]
  );
  console.log(
    `  ✅ Issue ${issue1Identifier}: "Login button not working on mobile" (watched by Acme)`
  );

  // Issue 2: Reported by Bob (Acme), watched by both Acme and Beta
  const issue2Id = uuidv4();
  const issue2Identifier = `${workspace.issue_prefix}-${issueNum++}`;
  await db.query(
    `INSERT INTO dispatch_issue (id, identifier, issue_number, workspace_id, title, description, status_id, priority, customer_id, reporter_id, slack_channel_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
    [
      issue2Id,
      issue2Identifier,
      issueNum - 1,
      workspace.id,
      "Dashboard loading slowly",
      "The main dashboard takes 10+ seconds to load. Multiple customers affected.",
      defaultStatus.id,
      "P1",
      customer1Id,
      user2Id,
      "C_ACME_TEST_001",
    ]
  );
  await db.query(
    `INSERT INTO dispatch_issue_watcher (issue_id, customer_id, added_at) VALUES ($1, $2, NOW())`,
    [issue2Id, customer1Id]
  );
  await db.query(
    `INSERT INTO dispatch_issue_watcher (issue_id, customer_id, added_at) VALUES ($1, $2, NOW())`,
    [issue2Id, customer2Id]
  );
  console.log(
    `  ✅ Issue ${issue2Identifier}: "Dashboard loading slowly" (watched by Acme + Beta)`
  );

  // Issue 3: Reported by Charlie (Beta), watched by Beta only
  const issue3Id = uuidv4();
  const issue3Identifier = `${workspace.issue_prefix}-${issueNum++}`;
  await db.query(
    `INSERT INTO dispatch_issue (id, identifier, issue_number, workspace_id, title, description, status_id, priority, customer_id, reporter_id, slack_channel_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
    [
      issue3Id,
      issue3Identifier,
      issueNum - 1,
      workspace.id,
      "Export to CSV generates corrupted file",
      "When exporting reports to CSV, the file has encoding issues with special characters.",
      defaultStatus.id,
      "P3",
      customer2Id,
      user3Id,
      "C_BETA_TEST_002",
    ]
  );
  await db.query(
    `INSERT INTO dispatch_issue_watcher (issue_id, customer_id, added_at) VALUES ($1, $2, NOW())`,
    [issue3Id, customer2Id]
  );
  console.log(
    `  ✅ Issue ${issue3Identifier}: "Export to CSV generates corrupted file" (watched by Beta)`
  );

  // Update workspace issue counter
  await db.query(
    `UPDATE dispatch_workspace SET next_issue_number = $1 WHERE id = $2`,
    [issueNum, workspace.id]
  );

  printTestUrls(
    { slug: "acme-corp", portal_token: customer1Token, name: "Acme Corp" },
    { slug: "beta-inc", portal_token: customer2Token, name: "Beta Inc" }
  );

  console.log("✅ Test data seeded successfully!\n");
  process.exit(0);
}

function printTestUrls(
  customer1: { slug: string; portal_token: string; name: string },
  customer2: { slug: string; portal_token: string; name: string }
) {
  console.log("\n" + "=".repeat(70));
  console.log("🔗 PORTAL URLs FOR TESTING");
  console.log("=".repeat(70));
  console.log(`\n${customer1.name} Portal (sees 2 issues):`);
  console.log(
    `  http://localhost:3002/portal/${customer1.slug}?token=${customer1.portal_token}`
  );
  console.log(`\n${customer2.name} Portal (sees 2 issues):`);
  console.log(
    `  http://localhost:3002/portal/${customer2.slug}?token=${customer2.portal_token}`
  );

  console.log("\n" + "=".repeat(70));
  console.log("🔑 LOGIN CREDENTIALS");
  console.log("=".repeat(70));
  console.log(`\nBoard URL: http://localhost:3002`);
  console.log(`Password: testpass123`);

  console.log("\n" + "=".repeat(70));
  console.log("📝 TEST SCENARIOS");
  console.log("=".repeat(70));
  console.log(`
1. Log into the board at http://localhost:3002 with password: testpass123
2. Open Acme portal - should see 2 issues (login + dashboard)
3. Open Beta portal - should see 2 issues (dashboard + CSV export)
4. The "Dashboard loading slowly" issue is shared (deduplication scenario)
5. Change status of an issue on the board to trigger notifications
6. Check terminal for [Notification] logs showing customers notified
`);
}

seedTestData().catch((err) => {
  console.error("❌ Error seeding test data:", err);
  process.exit(1);
});
