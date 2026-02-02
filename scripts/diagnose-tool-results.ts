#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Diagnostic Script: Tool Results Accumulation
 *
 * This script helps diagnose tool result accumulation issues by:
 * 1. Querying the database for messages with excessive tool results
 * 2. Analyzing the structure of corrupted messages
 *
 * USAGE:
 *   # Set database connection
 *   export PG_DATABASE_URL="postgresql://..."
 *
 *   # Run diagnostic
 *   deno run --allow-net --allow-env --allow-read scripts/diagnose-tool-results.ts
 *
 *   # Or with specific session ID
 *   deno run --allow-net --allow-env --allow-read scripts/diagnose-tool-results.ts <session-id>
 */

import postgres from "postgres";

const connectionString =
  Deno.env.get("PG_DATABASE_URL") ||
  Deno.env.get("DATABASE_URL") ||
  Deno.env.get("DENO_DATABASE_URL");

if (!connectionString) {
  console.error("ERROR: No database connection string found.");
  console.error(
    "Set PG_DATABASE_URL, DATABASE_URL, or DENO_DATABASE_URL environment variable."
  );
  Deno.exit(1);
}

const sql = postgres(connectionString);

async function analyzeToolResults(sessionId?: string) {
  console.log("=== Tool Results Diagnostic ===\n");

  // Find messages with excessive tool results
  console.log("1. Finding messages with excessive tool results...\n");

  const query = sessionId
    ? sql`
        SELECT
          id,
          session_id,
          role,
          model,
          jsonb_array_length(tool_calls::jsonb) as tool_call_count,
          jsonb_array_length(tool_results::jsonb) as tool_result_count,
          created_at
        FROM chat.messages
        WHERE session_id = ${sessionId}
          AND (tool_calls IS NOT NULL OR tool_results IS NOT NULL)
        ORDER BY created_at ASC
      `
    : sql`
        SELECT
          id,
          session_id,
          role,
          model,
          jsonb_array_length(tool_calls::jsonb) as tool_call_count,
          jsonb_array_length(tool_results::jsonb) as tool_result_count,
          created_at
        FROM chat.messages
        WHERE tool_results IS NOT NULL
          AND jsonb_array_length(tool_results::jsonb) > 50
        ORDER BY jsonb_array_length(tool_results::jsonb) DESC
        LIMIT 20
      `;

  const results = await query;

  if (results.length === 0) {
    console.log("   No messages found with excessive tool results.");
    if (!sessionId) {
      console.log("   (Checked for messages with >50 tool results)");
    }
  } else {
    console.log(`   Found ${results.length} messages:\n`);

    for (const row of results) {
      console.log(`   Message ID: ${row.id}`);
      console.log(`   Session ID: ${row.session_id}`);
      console.log(`   Role: ${row.role}`);
      console.log(`   Model: ${row.model || "N/A"}`);
      console.log(`   Tool Calls: ${row.tool_call_count || 0}`);
      console.log(`   Tool Results: ${row.tool_result_count || 0}`);
      console.log(`   Created: ${row.created_at}`);

      // Check for imbalance
      const calls = row.tool_call_count || 0;
      const results_count = row.tool_result_count || 0;
      if (results_count > calls * 3) {
        console.log(
          `   ⚠️  SUSPICIOUS: ${results_count} results for ${calls} calls (ratio: ${(results_count / Math.max(calls, 1)).toFixed(1)}x)`
        );
      }
      console.log("");
    }
  }

  // If specific session, show message sequence
  if (sessionId) {
    console.log("\n2. Full message sequence for session...\n");

    const messages = await sql`
      SELECT
        id,
        role,
        LEFT(content, 100) as content_preview,
        jsonb_array_length(tool_calls::jsonb) as tool_call_count,
        jsonb_array_length(tool_results::jsonb) as tool_result_count,
        model,
        created_at
      FROM chat.messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `;

    for (const msg of messages) {
      const toolInfo =
        msg.tool_call_count || msg.tool_result_count
          ? ` [calls: ${msg.tool_call_count || 0}, results: ${msg.tool_result_count || 0}]`
          : "";
      console.log(
        `   [${msg.role}]${toolInfo} ${msg.content_preview || "(no content)"}...`
      );
    }
  }

  // Summary statistics
  console.log("\n3. Summary statistics...\n");

  const stats = await sql`
    SELECT
      COUNT(*) as total_messages,
      COUNT(*) FILTER (WHERE tool_results IS NOT NULL) as messages_with_results,
      MAX(jsonb_array_length(tool_results::jsonb)) as max_results_per_message,
      AVG(jsonb_array_length(tool_results::jsonb)) FILTER (WHERE tool_results IS NOT NULL) as avg_results_per_message
    FROM chat.messages
    WHERE created_at > NOW() - INTERVAL '7 days'
  `;

  const s = stats[0];
  console.log(`   Messages (last 7 days): ${s.total_messages}`);
  console.log(`   Messages with tool results: ${s.messages_with_results}`);
  console.log(
    `   Max tool results per message: ${s.max_results_per_message || 0}`
  );
  console.log(
    `   Avg tool results per message: ${parseFloat(s.avg_results_per_message || 0).toFixed(2)}`
  );

  if (parseInt(s.max_results_per_message || "0") > 100) {
    console.log(`\n   ⚠️  WARNING: Found messages with >100 tool results!`);
  }

  await sql.end();
  console.log("\n=== Diagnostic Complete ===");
}

// Run diagnostic
const sessionId = Deno.args[0];
if (sessionId) {
  console.log(`Analyzing session: ${sessionId}\n`);
}
await analyzeToolResults(sessionId);
