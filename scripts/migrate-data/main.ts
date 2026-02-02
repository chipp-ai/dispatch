/**
 * Production Data Migration Runner
 *
 * Orchestrates the migration of data from the 3 legacy databases
 * to the new consolidated PostgreSQL database.
 *
 * Usage:
 *   deno task migrate:data
 *   deno task migrate:data --dry-run
 *   deno task migrate:data --phase=4
 *   deno task migrate:data --resume
 */

import {
  initConnections,
  closeConnections,
  type Connections,
} from "./connections.ts";
import { IdMapper, ProgressTracker } from "./id-mapper.ts";
import { migrateOrganizations } from "./phases/01-organizations.ts";
import { migrateUsers } from "./phases/02-users.ts";
import { migrateWorkspaces } from "./phases/03-workspaces.ts";
import {
  migrateApplications,
  saveSlugMigrations,
} from "./phases/04-applications.ts";
import { migrateConsumers } from "./phases/05-consumers.ts";
import { migrateChatSessions } from "./phases/06-chat-sessions.ts";
import { migrateMessages } from "./phases/07-messages.ts";
import { migrateKnowledgeSources } from "./phases/08-knowledge-sources.ts";
import { migrateTextChunks } from "./phases/09-text-chunks.ts";

interface MigrationOptions {
  dryRun: boolean;
  resume: boolean;
  startPhase: number;
  endPhase: number;
  limit: number; // 0 = no limit
  testMode: boolean;
}

function parseArgs(): MigrationOptions {
  const args = Deno.args;
  const options: MigrationOptions = {
    dryRun: false,
    resume: false,
    startPhase: 1,
    endPhase: 9,
    limit: 0,
    testMode: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg === "--test") {
      // Quick test mode: 10 records per phase
      options.testMode = true;
      options.limit = 10;
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--phase=")) {
      const phase = parseInt(arg.split("=")[1]);
      options.startPhase = phase;
      options.endPhase = phase;
    } else if (arg.startsWith("--start-phase=")) {
      options.startPhase = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--end-phase=")) {
      options.endPhase = parseInt(arg.split("=")[1]);
    }
  }

  return options;
}

async function runMigration(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  options: MigrationOptions
): Promise<void> {
  const { dryRun, startPhase, endPhase, limit, testMode } = options;

  console.log("\n" + "=".repeat(60));
  console.log("PRODUCTION DATA MIGRATION");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`Phases: ${startPhase} to ${endPhase}`);
  if (testMode) {
    console.log(`Test Mode: ON (${limit} records per phase)`);
  } else if (limit > 0) {
    console.log(`Limit: ${limit} records per phase`);
  }
  console.log("=".repeat(60) + "\n");

  const phases = [
    { num: 1, name: "Organizations", fn: migrateOrganizations },
    { num: 2, name: "Users", fn: migrateUsers },
    { num: 3, name: "Workspaces", fn: migrateWorkspaces },
    { num: 4, name: "Applications", fn: migrateApplications },
    { num: 5, name: "Consumers", fn: migrateConsumers },
    { num: 6, name: "Chat Sessions", fn: migrateChatSessions },
    { num: 7, name: "Messages", fn: migrateMessages },
    { num: 8, name: "Knowledge Sources", fn: migrateKnowledgeSources },
    { num: 9, name: "Text Chunks", fn: migrateTextChunks },
  ];

  for (const phase of phases) {
    if (phase.num < startPhase || phase.num > endPhase) {
      continue;
    }

    console.log(`\n${"─".repeat(50)}`);
    console.log(`Phase ${phase.num}: ${phase.name}`);
    console.log("─".repeat(50));

    const startTime = Date.now();

    // Special handling for applications (returns slug migrations)
    if (phase.num === 4) {
      const result = await migrateApplications(
        conns,
        idMapper,
        progress,
        dryRun,
        limit
      );
      if (!dryRun && result.slugMigrations.length > 0) {
        await saveSlugMigrations(conns, result.slugMigrations);
      }
    } else {
      await phase.fn(conns, idMapper, progress, dryRun, limit);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Phase ${phase.num} completed in ${duration}s`);
  }
}

async function main(): Promise<void> {
  console.log("\n🚀 Starting production data migration...\n");

  const options = parseArgs();
  let conns: Connections | null = null;

  try {
    // Initialize connections
    conns = await initConnections();

    // Initialize ID mapper and progress tracker
    const idMapper = new IdMapper(conns.pgTarget);
    const progress = new ProgressTracker(conns.pgTarget);

    // Create migration tables
    await idMapper.initMigrationTables();

    // Load existing mappings if resuming
    if (options.resume) {
      await idMapper.loadFromDb();
    }

    // Run migration
    await runMigration(conns, idMapper, progress, options);

    // Print summary
    await progress.printSummary();

    console.log("\n✅ Migration completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    Deno.exit(1);
  } finally {
    if (conns) {
      await closeConnections(conns);
    }
  }
}

// Run if main module
if (import.meta.main) {
  main();
}
