import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/utils/auth";
import OpenAI from "openai";

// Helper to check auth and return response
async function checkAuth(): Promise<NextResponse | null> {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;

interface LinearIssue {
  ID: string;
  Team: string;
  Title: string;
  Description: string;
  Status: string;
  Priority: string;
  Labels: string;
  Assignee: string;
  Created: string;
  Updated: string;
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
  assignee_name: string | null;
  created_at: Date;
  updated_at: Date;
  embedding_text: string;
}

function mapPriority(linearPriority: string): "P1" | "P2" | "P3" | "P4" {
  switch (linearPriority?.toLowerCase()) {
    case "urgent":
      return "P1";
    case "high":
      return "P2";
    case "medium":
      return "P3";
    case "low":
      return "P4";
    default:
      return "P3";
  }
}

function mapStatus(linearStatus: string): string {
  switch (linearStatus?.toLowerCase()) {
    case "backlog":
    case "triage":
    case "todo":
    case "this week":
    case "ready for dev":
      return "Backlog";
    case "investigating":
      return "Investigating";
    case "needs review":
    case "waiting for agent":
      return "Needs Review";
    case "in progress":
    case "being developed":
      return "In Progress";
    case "in review":
    case "pr open":
      return "In Review";
    case "done":
    case "done - win":
    case "done - lost":
    case "verify in staging":
    case "verify in prod":
    case "ready for prod":
    case "in staging":
    case "in production":
      return "Done";
    case "canceled":
    case "cancelled":
    case "duplicate":
      return "Canceled";
    default:
      return "Backlog";
  }
}

function parseLabels(labelsStr: string): string[] {
  if (!labelsStr || labelsStr.trim() === "") return [];
  return labelsStr
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function extractIssueNumber(linearId: string): number {
  const match = linearId.match(/-(\d+)$/);
  return match ? parseInt(match[1]) : 0;
}

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
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function POST(request: NextRequest) {
  const authError = await checkAuth();
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const skipEmbeddings = formData.get("skipEmbeddings") === "true";
    const dryRun = formData.get("dryRun") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvContent = await file.text();

    let records: LinearIssue[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
      });
    } catch (parseError) {
      return NextResponse.json(
        { error: "Failed to parse CSV file", details: String(parseError) },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Process issues
    const processed: ProcessedIssue[] = [];
    const allLabels = new Set<string>();
    const assignees = new Set<string>();

    for (const record of records) {
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
        assignee_name: record.Assignee ? record.Assignee.split("@")[0] : null,
        created_at: parseDate(record.Created),
        updated_at: parseDate(record.Updated),
        embedding_text: embeddingText,
      });
    }

    // Count by status for preview
    const statusCounts: Record<string, number> = {};
    processed.forEach((p) => {
      statusCounts[p.status_name] = (statusCounts[p.status_name] || 0) + 1;
    });

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        summary: {
          totalIssues: processed.length,
          labels: Array.from(allLabels),
          assignees: Array.from(assignees),
          statusCounts,
        },
      });
    }

    // Get or create workspace
    let workspace = await db.queryOne<{ id: string; issue_prefix: string }>(
      `SELECT id, issue_prefix FROM dispatch_workspace LIMIT 1`
    );

    if (!workspace) {
      const wsId = uuidv4();
      await db.query(
        `INSERT INTO dispatch_workspace (id, name, issue_prefix, next_issue_number, created_at)
         VALUES ($1, process.env.DEFAULT_WORKSPACE_NAME || 'My Workspace', process.env.DEFAULT_ISSUE_PREFIX || 'DISPATCH', 1, NOW())`,
        [wsId]
      );
      workspace = { id: wsId, issue_prefix: process.env.DEFAULT_ISSUE_PREFIX || "DISPATCH" };
    }

    // Get status mapping
    const statusRows = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM dispatch_status WHERE workspace_id = $1`,
      [workspace.id]
    );
    const statusMap = new Map<string, string>();
    statusRows.forEach((r) => statusMap.set(r.name, r.id));

    // Create missing labels
    const labelMap = new Map<string, string>();
    const existingLabels = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM dispatch_label WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingLabels.forEach((r) => labelMap.set(r.name, r.id));

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
        await db.query(
          `INSERT INTO dispatch_label (id, workspace_id, name, color)
           VALUES ($1, $2, $3, $4)`,
          [labelId, workspace.id, label, colors[colorIdx % colors.length]]
        );
        labelMap.set(label, labelId);
        colorIdx++;
      }
    }

    // Create agents for assignees
    const agentMap = new Map<string, string>();
    const existingAgents = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM dispatch_agent WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingAgents.forEach((r) => agentMap.set(r.name, r.id));

    for (const email of assignees) {
      const name = email.split("@")[0];
      if (!agentMap.has(name)) {
        const agentId = uuidv4();
        await db.query(
          `INSERT INTO dispatch_agent (id, workspace_id, name, description, is_active, created_at)
           VALUES ($1, $2, $3, $4, true, NOW())`,
          [agentId, workspace.id, name, `Imported from Linear: ${email}`]
        );
        agentMap.set(name, agentId);
      }
    }

    // Generate embeddings
    let embeddings: (number[] | null)[] = [];

    if (!skipEmbeddings && process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const batchSize = 50;

      for (let i = 0; i < processed.length; i += batchSize) {
        const batch = processed.slice(i, i + batchSize);
        const texts = batch.map((p) => p.embedding_text);

        try {
          const batchEmbeddings = await generateBulkEmbeddings(openai, texts);
          embeddings.push(...batchEmbeddings);
        } catch {
          embeddings.push(...new Array(batch.length).fill(null));
        }
      }
    } else {
      embeddings = new Array(processed.length).fill(null);
    }

    // Insert issues
    let inserted = 0;
    let skipped = 0;
    let maxIssueNumber = 0;

    for (let i = 0; i < processed.length; i++) {
      const issue = processed[i];
      const embedding = embeddings[i];

      const statusId =
        statusMap.get(issue.status_name) || statusMap.get("Backlog")!;
      const assigneeId = issue.assignee_name
        ? agentMap.get(issue.assignee_name)
        : null;

      maxIssueNumber = Math.max(maxIssueNumber, issue.issue_number);

      try {
        // Check if issue already exists
        const existing = await db.queryOne(
          `SELECT id FROM dispatch_issue WHERE identifier = $1`,
          [issue.identifier]
        );

        if (existing) {
          skipped++;
          continue;
        }

        await db.query(
          `INSERT INTO dispatch_issue (
            id, identifier, issue_number, title, description,
            status_id, priority, assignee_id, workspace_id,
            embedding, embedding_provider, embedding_model,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14)`,
          [
            issue.id,
            issue.identifier,
            issue.issue_number,
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

        // Insert labels
        for (const labelName of issue.labels) {
          const labelId = labelMap.get(labelName);
          if (labelId) {
            await db.query(
              `INSERT INTO dispatch_issue_label (issue_id, label_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [issue.id, labelId]
            );
          }
        }

        inserted++;
      } catch (error) {
        console.error(`Error inserting issue ${issue.identifier}:`, error);
      }
    }

    // Update workspace next_issue_number
    await db.query(
      `UPDATE dispatch_workspace SET next_issue_number = $1 WHERE id = $2`,
      [maxIssueNumber + 1, workspace.id]
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalIssues: processed.length,
        imported: inserted,
        skipped,
        labelsCreated: colorIdx,
        agentsCreated: agentMap.size - existingAgents.length,
        embeddingsGenerated: embeddings.filter((e) => e !== null).length,
      },
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Import failed", details: String(error) },
      { status: 500 }
    );
  }
}
