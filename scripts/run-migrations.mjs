#!/usr/bin/env node

/**
 * Run all SQL migrations in order.
 * Connects using PG_DATABASE_URL env var.
 * All migrations are idempotent (IF NOT EXISTS, DO $$ BEGIN ... EXCEPTION WHEN),
 * so running them all every deploy is safe.
 */

import pg from "pg";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");

const connectionString = process.env.PG_DATABASE_URL;
if (!connectionString) {
  console.error("PG_DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  console.log("Connected to database");

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files`);

  for (const file of files) {
    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, "utf-8");
    console.log(`Running ${file}...`);
    await client.query(sql);
    console.log(`  Done`);
  }

  console.log("All migrations complete");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
