/**
 * Import Linear CSV Export into Chipp Issues
 *
 * Usage:
 *   npx tsx scripts/import-linear-csv.ts /path/to/export.csv
 *
 * Options:
 *   --dry-run       Parse and validate only, don't import
 *   --skip-embeddings   Skip embedding generation (faster for testing)
 *   --batch-size N  Number of embeddings per API request (default: 100)
 */

import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import pg from "pg";
import OpenAI from "openai";

const { Pool } = pg;

// Configuration
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;
const BATCH_SIZE = 100; // Items per embedding API call (max 2048, but use smaller for reliability)
const DB_BATCH_SIZE = 500; // Items per database insert

interface LinearIssue {
  ID: string;
  Team: string;
  Title: string;
  Description: string;
  Status: string;
  Estimate: string;
  Priority: string;
  "Project ID": string;
  Project: string;
  Creator: string;
  Assignee: string;
  Labels: string;
  "Cycle Number": string;
  "Cycle Name": string;
  "Cycle Start": string;
  "Cycle End": string;
  Created: string;
  Updated: string;
  Started: string;
  Triaged: string;
  Completed: string;
  Canceled: string;
  Archived: string;
  "Due Date": string;
  "Parent issue": string;
  Initiatives: string;
  "Project Milestone ID": string;
  "Project Milestone": string;
  "SLA Status": string;
  UUID: string;
}

interface ProcessedIssue {
  id: string;
  identifier: string;
  issue_number: number;
  title: string;
  description: string | null;
  status_name: string;
  priority: "P1" | "P2" | "P3" | "P4";
  labels: string[];
  assignee_email: string | null;
  created_at: Date;
  updated_at: Date;
  linear_uuid: string;
  embedding_text: string;
}

// Parse command line args
const args = process.argv.slice(2);
const csvPathArg = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skipEmbeddings = args.includes("--skip-embeddings");
const batchSizeArg = args.find((a) => a.startsWith("--batch-size="));
const embeddingBatchSize = batchSizeArg
  ? parseInt(batchSizeArg.split("=")[1])
  : BATCH_SIZE;

if (!csvPathArg) {
  console.error(
    "Usage: npx tsx scripts/import-linear-csv.ts <csv-file> [--dry-run] [--skip-embeddings]"
  );
  process.exit(1);
}

const csvPath: string = csvPathArg;

// Map Linear priority to our priority enum
function mapPriority(linearPriority: string): "P1" | "P2" | "P3" | "P4" {
  switch (linearPriority.toLowerCase()) {
    case "urgent":
      return "P1";
    case "high":
      return "P2";
    case "medium":
      return "P3";
    case "low":
      return "P4";
    case "no priority":
      return "P3";
    default:
      return "P3";
  }
}

// Map Linear status to our status names
function mapStatus(linearStatus: string): string {
  switch (linearStatus.toLowerCase()) {
    case "backlog":
      return "Backlog";
    case "triage":
      return "Triage";
    case "todo":
    case "this week":
    case "ready for dev":
      return "Todo";
    case "in progress":
    case "being developed":
    case "waiting for agent":
      return "In Progress";
    case "in review":
    case "pr open":
    case "verify in staging":
    case "verify in prod":
    case "ready for prod":
    case "ready to post":
      return "In Review";
    case "done":
    case "done - win":
    case "done - lost":
      return "Done";
    case "canceled":
    case "cancelled":
    case "duplicate":
      return "Canceled";
    default:
      return "Backlog";
  }
}

// Parse labels from Linear format (comma-separated in quotes)
function parseLabels(labelsStr: string): string[] {
  if (!labelsStr || labelsStr.trim() === "") return [];
  return labelsStr
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Extract issue number from Linear ID (e.g., "ENG-123" -> 123)
function extractIssueNumber(linearId: string): number {
  const match = linearId.match(/-(\d+)$/);
  return match ? parseInt(match[1]) : 0;
}

// Parse date from Linear format
function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  try {
    return new Date(dateStr);
  } catch {
    return new Date();
  }
}

async function generateBulkEmbeddings(
  openai: OpenAI,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)), // Limit input length
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // Return embeddings in same order as input
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

async function main() {
  console.log(`\n📥 Chipp Issues - Linear CSV Import\n`);
  console.log(`CSV File: ${csvPath}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Skip Embeddings: ${skipEmbeddings}`);
  console.log(`Embedding Batch Size: ${embeddingBatchSize}\n`);

  // Read and parse CSV
  const csvContent = fs.readFileSync(path.resolve(csvPath), "utf-8");
  const records: LinearIssue[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  console.log(`📊 Found ${records.length} issues in CSV\n`);

  // Process issues
  const processed: ProcessedIssue[] = [];
  const teams = new Set<string>();
  const statuses = new Set<string>();
  const allLabels = new Set<string>();
  const assignees = new Set<string>();

  for (const record of records) {
    teams.add(record.Team);
    statuses.add(record.Status);
    parseLabels(record.Labels).forEach((l) => allLabels.add(l));
    if (record.Assignee) assignees.add(record.Assignee);

    const title = record.Title || "(No title)";
    const description = record.Description || null;
    const embeddingText = description ? `${title}\n\n${description}` : title;

    processed.push({
      id: uuidv4(),
      identifier: record.ID,
      issue_number: extractIssueNumber(record.ID),
      title,
      description,
      status_name: mapStatus(record.Status),
      priority: mapPriority(record.Priority),
      labels: parseLabels(record.Labels),
      assignee_email: record.Assignee || null,
      created_at: parseDate(record.Created),
      updated_at: parseDate(record.Updated),
      linear_uuid: record.UUID,
      embedding_text: embeddingText,
    });
  }

  // Print summary
  console.log(`📋 Summary:`);
  console.log(`   Teams: ${Array.from(teams).join(", ")}`);
  console.log(`   Statuses: ${Array.from(statuses).join(", ")}`);
  console.log(`   Labels: ${allLabels.size} unique`);
  console.log(`   Assignees: ${assignees.size} unique`);
  console.log();

  // Count by status
  const statusCounts = new Map<string, number>();
  processed.forEach((p) => {
    statusCounts.set(p.status_name, (statusCounts.get(p.status_name) || 0) + 1);
  });
  console.log(`📊 Issues by Status:`);
  for (const [status, count] of statusCounts) {
    console.log(`   ${status}: ${count}`);
  }
  console.log();

  if (dryRun) {
    console.log(`✅ Dry run complete. No data was imported.\n`);
    return;
  }

  // Initialize connections
  const pool = new Pool({
    connectionString: process.env.PG_DATABASE_URL,
  });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    // Get or create workspace
    let workspace = await pool
      .query(`SELECT * FROM chipp_workspace LIMIT 1`)
      .then((r) => r.rows[0]);

    if (!workspace) {
      const wsId = uuidv4();
      await pool.query(
        `INSERT INTO chipp_workspace (id, name, issue_prefix, next_issue_number)
         VALUES ($1, 'Chipp', 'CHIPP', 1)`,
        [wsId]
      );
      workspace = { id: wsId, issue_prefix: "CHIPP" };
      console.log(`✅ Created workspace\n`);
    }

    // Get status mapping
    const statusRows = await pool.query(
      `SELECT id, name FROM chipp_status WHERE workspace_id = $1`,
      [workspace.id]
    );
    const statusMap = new Map<string, string>();
    statusRows.rows.forEach((r: { id: string; name: string }) => {
      statusMap.set(r.name, r.id);
    });

    // Create missing labels
    console.log(`🏷️  Creating labels...`);
    const labelMap = new Map<string, string>();
    const existingLabels = await pool.query(
      `SELECT id, name FROM chipp_label WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingLabels.rows.forEach((r: { id: string; name: string }) => {
      labelMap.set(r.name, r.id);
    });

    const colors = [
      "#EF4444",
      "#F59E0B",
      "#10B981",
      "#3B82F6",
      "#8B5CF6",
      "#EC4899",
      "#6B7280",
    ];
    let colorIdx = 0;
    for (const label of allLabels) {
      if (!labelMap.has(label)) {
        const labelId = uuidv4();
        await pool.query(
          `INSERT INTO chipp_label (id, workspace_id, name, color)
           VALUES ($1, $2, $3, $4)`,
          [labelId, workspace.id, label, colors[colorIdx % colors.length]]
        );
        labelMap.set(label, labelId);
        colorIdx++;
      }
    }
    console.log(`   Created ${colorIdx} new labels\n`);

    // Create agents for assignees
    console.log(`👤 Creating agents for assignees...`);
    const agentMap = new Map<string, string>();
    const existingAgents = await pool.query(
      `SELECT id, name FROM chipp_agent WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingAgents.rows.forEach((r: { id: string; name: string }) => {
      agentMap.set(r.name, r.id);
    });

    for (const email of assignees) {
      const name = email.split("@")[0];
      if (!agentMap.has(name)) {
        const agentId = uuidv4();
        await pool.query(
          `INSERT INTO chipp_agent (id, workspace_id, name, description)
           VALUES ($1, $2, $3, $4)`,
          [agentId, workspace.id, name, `Imported from Linear: ${email}`]
        );
        agentMap.set(name, agentId);
        // Also map by email for lookup
        agentMap.set(email, agentId);
      }
    }
    console.log(`   Created ${agentMap.size} agents\n`);

    // Generate embeddings in batches
    let embeddings: (number[] | null)[] = [];

    if (!skipEmbeddings) {
      console.log(`🧠 Generating embeddings (${processed.length} issues)...`);
      const startTime = Date.now();

      for (let i = 0; i < processed.length; i += embeddingBatchSize) {
        const batch = processed.slice(i, i + embeddingBatchSize);
        const texts = batch.map((p) => p.embedding_text);

        try {
          const batchEmbeddings = await generateBulkEmbeddings(openai, texts);
          embeddings.push(...batchEmbeddings);

          const progress = Math.min(
            100,
            Math.round(((i + batch.length) / processed.length) * 100)
          );
          process.stdout.write(
            `\r   Progress: ${progress}% (${i + batch.length}/${processed.length})`
          );
        } catch (error) {
          console.error(
            `\n   Error generating embeddings for batch starting at ${i}:`,
            error
          );
          // Fill with nulls for failed batch
          embeddings.push(...new Array(batch.length).fill(null));
        }

        // Small delay between batches to avoid rate limits
        await new Promise((r) => setTimeout(r, 100));
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `\n   ✅ Generated ${embeddings.filter((e) => e !== null).length} embeddings in ${duration}s\n`
      );
    } else {
      embeddings = new Array(processed.length).fill(null);
      console.log(`⏭️  Skipping embedding generation\n`);
    }

    // Insert issues in batches
    console.log(`💾 Inserting issues into database...`);
    let inserted = 0;
    let maxIssueNumber = 0;

    for (let i = 0; i < processed.length; i += DB_BATCH_SIZE) {
      const batch = processed.slice(i, i + DB_BATCH_SIZE);
      const batchEmbeddings = embeddings.slice(i, i + DB_BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const issue = batch[j];
        const embedding = batchEmbeddings[j];

        // Get status ID (default to Backlog if not found)
        const statusId =
          statusMap.get(issue.status_name) || statusMap.get("Backlog")!;

        // Get assignee ID
        let assigneeId: string | null = null;
        if (issue.assignee_email) {
          assigneeId =
            agentMap.get(issue.assignee_email) ||
            agentMap.get(issue.assignee_email.split("@")[0]) ||
            null;
        }

        // Use original Linear identifier as our identifier
        const identifier = issue.identifier;
        const issueNumber = issue.issue_number;
        maxIssueNumber = Math.max(maxIssueNumber, issueNumber);

        try {
          // Insert issue
          await pool.query(
            `INSERT INTO chipp_issue (
              id, identifier, issue_number, title, description,
              status_id, priority, assignee_id, workspace_id,
              embedding, embedding_provider, embedding_model,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14)
            ON CONFLICT (identifier) DO NOTHING`,
            [
              issue.id,
              identifier,
              issueNumber,
              issue.title,
              issue.description,
              statusId,
              issue.priority,
              assigneeId,
              workspace.id,
              embedding ? `[${embedding.join(",")}]` : null,
              embedding ? "openai" : null,
              embedding ? EMBEDDING_MODEL : null,
              issue.created_at,
              issue.updated_at,
            ]
          );

          // Insert issue-label relationships
          for (const labelName of issue.labels) {
            const labelId = labelMap.get(labelName);
            if (labelId) {
              await pool.query(
                `INSERT INTO chipp_issue_label (issue_id, label_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [issue.id, labelId]
              );
            }
          }

          inserted++;
        } catch (error) {
          console.error(`\n   Error inserting issue ${identifier}:`, error);
        }
      }

      const progress = Math.min(
        100,
        Math.round(((i + batch.length) / processed.length) * 100)
      );
      process.stdout.write(
        `\r   Progress: ${progress}% (${inserted}/${processed.length})`
      );
    }

    // Update workspace next_issue_number
    await pool.query(
      `UPDATE chipp_workspace SET next_issue_number = $1 WHERE id = $2`,
      [maxIssueNumber + 1, workspace.id]
    );

    console.log(`\n\n✅ Import complete!`);
    console.log(`   Imported: ${inserted} issues`);
    console.log(`   Next issue number: ${maxIssueNumber + 1}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
