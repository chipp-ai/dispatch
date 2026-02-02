/**
 * Migrate User Data Script
 *
 * Migrates a specific user's data from production to local PostgreSQL.
 * Usage: deno run --allow-net --allow-env --allow-read --allow-ffi scripts/migrate-user-data.ts
 */

import postgres from "postgres";

// Production connection configs from MCP (Cloud SQL proxies)
const PROD_MYSQL_MAIN = {
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: Deno.env.get("MCP_MYSQL_PASSWORD") || "",
  database: "chipp",
};

const PROD_MYSQL_CHAT = {
  host: "127.0.0.1",
  port: 33062,
  user: "root",
  password: Deno.env.get("MCP_MYSQL_CHAT_PASSWORD") || "",
  database: "message-history",
};

// Local target database - REQUIRED environment variable
const LOCAL_PG = Deno.env.get("PG_DATABASE_URL");
if (!LOCAL_PG) {
  throw new Error(
    "PG_DATABASE_URL environment variable is required. " +
      "Set it to your target PostgreSQL connection string."
  );
}

// Target user's data
const TARGET_ORG_ID = 5936;
const TARGET_WORKSPACE_ID = 8710;
const TARGET_DEV_ID = 6995;

interface MySQLConnection {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  end: () => Promise<void>;
}

async function createMySQLConnection(
  config: typeof PROD_MYSQL_MAIN
): Promise<MySQLConnection> {
  console.log(
    `[mysql] Connecting to ${config.host}:${config.port}/${config.database}`
  );
  const mysql = await import("npm:mysql2@3.6.0/promise");

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  return {
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    },
    end: async () => {
      await pool.end();
    },
  };
}

async function main() {
  console.log("\n========================================");
  console.log("USER DATA MIGRATION");
  console.log("========================================\n");

  // Connect to databases
  console.log("[1/8] Connecting to databases...\n");

  const mysqlMain = await createMySQLConnection(PROD_MYSQL_MAIN);
  console.log("  [mysql-main] Connected");

  const mysqlChat = await createMySQLConnection(PROD_MYSQL_CHAT);
  console.log("  [mysql-chat] Connected");

  const pgLocal = postgres(LOCAL_PG, { max: 5 });
  await pgLocal`SELECT 1`;
  console.log("  [pg-local] Connected\n");

  try {
    // 1. Migrate Organization
    console.log("[2/8] Migrating organization...");
    const orgs = await mysqlMain.query<{
      id: number;
      name: string;
      subscriptionTier: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      usageBasedBillingEnabled: boolean;
    }>(
      `SELECT id, name, subscriptionTier, stripeCustomerId, stripeSubscriptionId, usageBasedBillingEnabled
        FROM Organization WHERE id = ?`,
      [TARGET_ORG_ID]
    );

    if (orgs.length === 0) {
      throw new Error(`Organization ${TARGET_ORG_ID} not found`);
    }

    const org = orgs[0];
    const orgUuid = crypto.randomUUID();

    await pgLocal`
      INSERT INTO app.organizations (id, name, subscription_tier, stripe_customer_id,
        stripe_subscription_id, credits_balance)
      VALUES (${orgUuid}, ${org.name}, ${org.subscriptionTier}::subscription_tier,
        ${org.stripeCustomerId}, ${org.stripeSubscriptionId}, 0)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log(`  Migrated: ${org.name} -> ${orgUuid}`);

    // 2. Migrate User (Developer)
    console.log("\n[3/8] Migrating user...");
    const devs = await mysqlMain.query<{
      id: number;
      email: string;
      name: string;
      pictureUrl: string | null;
      emailHasBeenVerified: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id, email, name, pictureUrl, emailHasBeenVerified, createdAt, updatedAt
        FROM Developer WHERE id = ?`,
      [TARGET_DEV_ID]
    );

    if (devs.length === 0) {
      throw new Error(`Developer ${TARGET_DEV_ID} not found`);
    }

    const dev = devs[0];
    const userUuid = crypto.randomUUID();

    await pgLocal`
      INSERT INTO app.users (id, email, name, picture, role, organization_id,
        email_verified, created_at, updated_at)
      VALUES (${userUuid}, ${dev.email}, ${dev.name}, ${dev.pictureUrl}, 'owner'::user_role,
        ${orgUuid}, ${dev.emailHasBeenVerified}, ${dev.createdAt}, ${dev.updatedAt})
      ON CONFLICT (email) DO NOTHING
    `;
    console.log(`  Migrated: ${dev.email} -> ${userUuid}`);

    // 3. Migrate Workspace
    console.log("\n[4/8] Migrating workspace...");
    const workspaces = await mysqlMain.query<{
      id: number;
      name: string;
    }>(`SELECT id, name FROM Workspace WHERE id = ?`, [TARGET_WORKSPACE_ID]);

    if (workspaces.length === 0) {
      throw new Error(`Workspace ${TARGET_WORKSPACE_ID} not found`);
    }

    const ws = workspaces[0];
    const wsUuid = crypto.randomUUID();

    await pgLocal`
      INSERT INTO app.workspaces (id, name, organization_id)
      VALUES (${wsUuid}, ${ws.name}, ${orgUuid})
    `;
    console.log(`  Migrated: ${ws.name} -> ${wsUuid}`);

    // 4. Migrate Workspace Member
    console.log("\n[5/8] Migrating workspace membership...");
    await pgLocal`
      INSERT INTO app.workspace_members (workspace_id, user_id, role, joined_at)
      VALUES (${wsUuid}, ${userUuid}, 'OWNER'::workspace_role, NOW())
    `;
    console.log(`  Added ${dev.email} as OWNER`);

    // 5. Migrate Applications (simplified - just core fields)
    console.log("\n[6/8] Migrating applications...");
    const apps = await mysqlMain.query<{
      id: number;
      name: string;
      description: string | null;
      brandStyles: string | null;
      isDeleted: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id, name, description, brandStyles, isDeleted, createdAt, updatedAt
        FROM Application WHERE workspaceId = ? AND isDeleted = 0 LIMIT 20`,
      [TARGET_WORKSPACE_ID]
    );

    const appIdMap = new Map<number, string>();

    for (const app of apps) {
      const appUuid = crypto.randomUUID();
      const appNameId = `app-${app.id}-${Date.now()}`;
      appIdMap.set(app.id, appUuid);

      await pgLocal`
        INSERT INTO app.applications (id, name, app_name_id, description, developer_id,
          organization_id, workspace_id, model, temperature, brand_styles,
          is_active, is_deleted, is_public, created_at, updated_at)
        VALUES (${appUuid}, ${app.name}, ${appNameId}, ${app.description}, ${userUuid},
          ${orgUuid}, ${wsUuid}, 'gpt-4o', 0.7,
          ${app.brandStyles}::jsonb,
          true, ${app.isDeleted}, false, ${app.createdAt}, ${app.updatedAt})
      `;
      console.log(`  App: ${app.name} (${app.id}) -> ${appUuid}`);
    }
    console.log(`  Total: ${apps.length} applications`);

    // 6. Migrate Consumers
    console.log("\n[7/8] Migrating consumers...");
    let totalConsumers = 0;
    const consumerIdMap = new Map<number, string>();

    for (const [oldAppId, newAppId] of appIdMap) {
      const consumers = await mysqlMain.query<{
        id: number;
        identifier: string;
        email: string | null;
        name: string | null;
        credits: number;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT id, identifier, email, name, credits, createdAt, updatedAt
          FROM Consumer WHERE applicationId = ? AND isDeleted = 0 LIMIT 100`,
        [oldAppId]
      );

      for (const c of consumers) {
        const consumerUuid = crypto.randomUUID();
        consumerIdMap.set(c.id, consumerUuid);

        await pgLocal`
          INSERT INTO app.consumers (id, application_id, external_id, email, name,
            metadata, credits_balance, created_at, updated_at)
          VALUES (${consumerUuid}, ${newAppId}, ${c.identifier}, ${c.email}, ${c.name},
            NULL::jsonb, ${c.credits || 0},
            ${c.createdAt}, ${c.updatedAt})
        `;
        totalConsumers++;
      }
    }
    console.log(`  Total: ${totalConsumers} consumers`);

    // 7. Migrate Chat Sessions and Messages
    console.log("\n[8/8] Migrating chat sessions and messages...");
    let totalSessions = 0;
    let totalMessages = 0;

    for (const [oldAppId, newAppId] of appIdMap) {
      const sessions = await mysqlChat.query<{
        id: string;
        authorUserId: number | null;
        source: string;
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT id, authorUserId, source, title, createdAt, updatedAt
          FROM ChatSession WHERE applicationId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 50`,
        [oldAppId]
      );

      for (const s of sessions) {
        const sessionUuid = crypto.randomUUID();
        // Use null instead of undefined for postgres.js
        const newConsumerId = s.authorUserId
          ? (consumerIdMap.get(s.authorUserId) ?? null)
          : null;

        // Map source to valid enum (use uppercase as defined in PG)
        const sourceMap: Record<string, string> = {
          APP: "APP",
          API: "API",
          WHATSAPP: "WHATSAPP",
          SLACK: "SLACK",
          EMAIL: "EMAIL",
          VOICE: "VOICE",
          WIDGET: "WIDGET",
        };
        const mappedSource = sourceMap[s.source] || "APP";

        await pgLocal`
          INSERT INTO chat.sessions (id, application_id, consumer_id, source, title,
            is_bookmarked, started_at, ended_at)
          VALUES (${sessionUuid}, ${newAppId}, ${newConsumerId}, ${mappedSource}::chat_source,
            ${s.title}, false, ${s.createdAt}, ${s.updatedAt})
        `;
        totalSessions++;

        // Get messages for this session (table is 'Message' not 'ChatMessage')
        const messages = await mysqlChat.query<{
          id: string;
          senderType: string;
          content: string;
          modelUsed: string | null;
          metadata: string | null;
          tagsApplied: string | null;
          createdAt: Date;
        }>(
          `SELECT id, senderType, content, modelUsed, metadata, tagsApplied, createdAt
            FROM Message WHERE chatSessionId = ? ORDER BY createdAt LIMIT 100`,
          [s.id]
        );

        for (const m of messages) {
          // Map senderType to role: USER -> user, BOT -> assistant
          const roleMap: Record<string, string> = {
            USER: "user",
            BOT: "assistant",
          };
          const mappedRole = roleMap[m.senderType] || "user";

          await pgLocal`
            INSERT INTO chat.messages (session_id, role, content, tool_calls, model,
              token_count, latency_ms, tags, created_at)
            VALUES (${sessionUuid}, ${mappedRole}::message_role, ${m.content},
              ${m.metadata ? JSON.parse(m.metadata) : null}::jsonb, ${m.modelUsed},
              NULL, NULL, ${m.tagsApplied ? JSON.parse(m.tagsApplied) : null}::jsonb,
              ${m.createdAt})
          `;
          totalMessages++;
        }
      }
    }
    console.log(`  Sessions: ${totalSessions}`);
    console.log(`  Messages: ${totalMessages}`);

    console.log("\n========================================");
    console.log("MIGRATION COMPLETE");
    console.log("========================================");
    console.log(`Organization: ${org.name}`);
    console.log(`User: ${dev.email}`);
    console.log(`Workspace: ${ws.name}`);
    console.log(`Applications: ${apps.length}`);
    console.log(`Consumers: ${totalConsumers}`);
    console.log(`Sessions: ${totalSessions}`);
    console.log(`Messages: ${totalMessages}`);
    console.log("========================================\n");
  } finally {
    await mysqlMain.end();
    await mysqlChat.end();
    await pgLocal.end();
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
