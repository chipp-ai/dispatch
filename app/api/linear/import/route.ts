import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/utils/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import { getStatusByName, createStatus } from "@/lib/services/statusService";
import { getLabelByName, createLabel } from "@/lib/services/labelService";
import {
  findByExternalId,
  linkExternalIssue,
} from "@/lib/services/externalIssueService";
import {
  fetchLinearIssues,
  mapLinearPriority,
  mapLinearStatus,
  type LinearIssueData,
} from "@/lib/services/linearService";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;

interface ImportStats {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * POST /api/linear/import
 *
 * Import issues from Linear via API.
 *
 * Query params:
 * - mode: "upsert" (default) | "replace" - upsert updates existing, replace deletes all first
 * - team: Linear team name or ID (default: "Product")
 * - dryRun: "true" to preview without making changes
 * - skipEmbeddings: "true" to skip generating embeddings
 */
export async function POST(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("mode") || "upsert";
  const team = searchParams.get("team") || undefined;
  const dryRun = searchParams.get("dryRun") === "true";
  const skipEmbeddings = searchParams.get("skipEmbeddings") === "true";

  if (mode !== "upsert" && mode !== "replace") {
    return NextResponse.json(
      { error: "Invalid mode. Use 'upsert' or 'replace'" },
      { status: 400 }
    );
  }

  try {
    console.log(
      `[Linear Import] Starting ${mode} import, dryRun=${dryRun}, team=${team || "default"}`
    );

    // Fetch issues from Linear
    const linearIssues = await fetchLinearIssues(team);

    if (linearIssues.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No issues found in Linear",
        stats: { total: 0, imported: 0, updated: 0, skipped: 0, errors: [] },
      });
    }

    console.log(`[Linear Import] Fetched ${linearIssues.length} issues`);

    // Get workspace
    const workspace = await getOrCreateDefaultWorkspace();

    // Preview mode - just return stats
    if (dryRun) {
      const existingLinks = await db.query<{ external_id: string }>(
        `SELECT external_id FROM chipp_external_issue WHERE source = 'linear'`
      );
      const existingIds = new Set(existingLinks.map((l) => l.external_id));

      const toImport = linearIssues.filter((i) => !existingIds.has(i.id));
      const toUpdate = linearIssues.filter((i) => existingIds.has(i.id));

      // Count by status for preview
      const statusCounts: Record<string, number> = {};
      linearIssues.forEach((issue) => {
        const status = mapLinearStatus(issue.state.name);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      return NextResponse.json({
        success: true,
        dryRun: true,
        mode,
        stats: {
          total: linearIssues.length,
          toImport: toImport.length,
          toUpdate: mode === "replace" ? 0 : toUpdate.length,
          toDelete: mode === "replace" ? existingLinks.length : 0,
          statusCounts,
        },
      });
    }

    // Full replace mode - delete all existing issues first
    if (mode === "replace") {
      console.log(
        "[Linear Import] Replace mode - deleting all existing issues"
      );

      // Delete all issues in this workspace
      await db.query(`DELETE FROM chipp_issue WHERE workspace_id = $1`, [
        workspace.id,
      ]);

      // Reset issue counter
      await db.query(
        `UPDATE chipp_workspace SET next_issue_number = 1 WHERE id = $1`,
        [workspace.id]
      );

      console.log("[Linear Import] Deleted all existing issues");
    }

    // Get or create statuses and labels
    const statusCache = new Map<string, string>();
    const labelCache = new Map<string, string>();

    // Pre-fetch existing statuses
    const existingStatuses = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM chipp_status WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingStatuses.forEach((s) =>
      statusCache.set(s.name.toLowerCase(), s.id)
    );

    // Pre-fetch existing labels
    const existingLabels = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM chipp_label WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingLabels.forEach((l) => labelCache.set(l.name.toLowerCase(), l.id));

    // Create agents for assignees
    const agentCache = new Map<string, string>();
    const existingAgents = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM chipp_agent WHERE workspace_id = $1`,
      [workspace.id]
    );
    existingAgents.forEach((a) => agentCache.set(a.name.toLowerCase(), a.id));

    // Generate embeddings
    let embeddings: (number[] | null)[] = [];
    if (!skipEmbeddings && process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const texts = linearIssues.map((issue) =>
        issue.description
          ? `${issue.title}\n\n${issue.description}`
          : issue.title
      );

      const batchSize = 50;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        try {
          const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: batch.map((t) => t.slice(0, 8000)),
            dimensions: EMBEDDING_DIMENSIONS,
          });
          embeddings.push(
            ...response.data
              .sort((a, b) => a.index - b.index)
              .map((d) => d.embedding)
          );
        } catch (error) {
          console.error("[Linear Import] Embedding error:", error);
          embeddings.push(...new Array(batch.length).fill(null));
        }
      }
    } else {
      embeddings = new Array(linearIssues.length).fill(null);
    }

    // Import issues
    const stats: ImportStats = {
      total: linearIssues.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    for (let i = 0; i < linearIssues.length; i++) {
      const linearIssue = linearIssues[i];
      const embedding = embeddings[i];

      try {
        // Get or create status
        const statusName = mapLinearStatus(linearIssue.state.name);
        let statusId = statusCache.get(statusName.toLowerCase());
        if (!statusId) {
          const status = await createStatus(workspace.id, {
            name: statusName,
            color: "#5e6ad2",
          });
          statusId = status.id;
          statusCache.set(statusName.toLowerCase(), statusId);
        }

        // Get or create labels
        const labelIds: string[] = [];
        for (const label of linearIssue.labels) {
          let labelId = labelCache.get(label.name.toLowerCase());
          if (!labelId) {
            const newLabel = await createLabel(workspace.id, {
              name: label.name,
              color: label.color,
            });
            labelId = newLabel.id;
            labelCache.set(label.name.toLowerCase(), labelId);
          }
          labelIds.push(labelId);
        }

        // Get or create agent for assignee
        let assigneeId: string | null = null;
        if (linearIssue.assignee) {
          const agentName = linearIssue.assignee.name;
          assigneeId = agentCache.get(agentName.toLowerCase()) || null;
          if (!assigneeId) {
            const agentId = uuidv4();
            await db.query(
              `INSERT INTO chipp_agent (id, workspace_id, name, description, is_active, created_at)
               VALUES ($1, $2, $3, $4, true, NOW())`,
              [
                agentId,
                workspace.id,
                agentName,
                `Imported from Linear: ${linearIssue.assignee.email}`,
              ]
            );
            assigneeId = agentId;
            agentCache.set(agentName.toLowerCase(), agentId);
          }
        }

        // Check if issue already exists (by Linear ID)
        const existingLink = await findByExternalId("linear", linearIssue.id);

        if (existingLink && mode === "upsert") {
          // Update existing issue
          await db.query(
            `UPDATE chipp_issue SET
              title = $1,
              description = $2,
              status_id = $3,
              priority = $4,
              assignee_id = $5,
              embedding = $6::vector,
              embedding_provider = $7,
              embedding_model = $8,
              updated_at = NOW()
            WHERE id = $9`,
            [
              linearIssue.title,
              linearIssue.description,
              statusId,
              mapLinearPriority(linearIssue.priority),
              assigneeId,
              embedding ? `[${embedding.join(",")}]` : null,
              embedding ? "openai" : null,
              embedding ? EMBEDDING_MODEL : null,
              existingLink.issue_id,
            ]
          );

          // Update labels
          await db.query(`DELETE FROM chipp_issue_label WHERE issue_id = $1`, [
            existingLink.issue_id,
          ]);
          for (const labelId of labelIds) {
            await db.query(
              `INSERT INTO chipp_issue_label (issue_id, label_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [existingLink.issue_id, labelId]
            );
          }

          stats.updated++;
        } else {
          // Create new issue
          const issueId = uuidv4();

          // Extract issue number from Linear identifier (e.g., "ENG-123" -> 123)
          const issueNumber = parseInt(
            linearIssue.identifier.split("-")[1],
            10
          );

          await db.query(
            `INSERT INTO chipp_issue (
              id, identifier, issue_number, title, description,
              status_id, priority, assignee_id, workspace_id,
              embedding, embedding_provider, embedding_model,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14)`,
            [
              issueId,
              linearIssue.identifier,
              issueNumber,
              linearIssue.title,
              linearIssue.description,
              statusId,
              mapLinearPriority(linearIssue.priority),
              assigneeId,
              workspace.id,
              embedding ? `[${embedding.join(",")}]` : null,
              embedding ? "openai" : null,
              embedding ? EMBEDDING_MODEL : null,
              linearIssue.createdAt,
              linearIssue.updatedAt,
            ]
          );

          // Add labels
          for (const labelId of labelIds) {
            await db.query(
              `INSERT INTO chipp_issue_label (issue_id, label_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [issueId, labelId]
            );
          }

          // Link to Linear for future sync
          await linkExternalIssue({
            issueId,
            source: "linear",
            externalId: linearIssue.id,
            externalUrl: `https://linear.app/issue/${linearIssue.identifier}`,
            metadata: {
              identifier: linearIssue.identifier,
              state: linearIssue.state,
              priority: linearIssue.priority,
            },
          });

          stats.imported++;
        }
      } catch (error) {
        const errorMsg = `Error importing ${linearIssue.identifier}: ${error}`;
        console.error(`[Linear Import] ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    // Update workspace issue counter to max issue number + 1
    const maxIssueNum = await db.queryOne<{ max_num: number }>(
      `SELECT COALESCE(MAX(issue_number), 0) as max_num FROM chipp_issue WHERE workspace_id = $1`,
      [workspace.id]
    );
    await db.query(
      `UPDATE chipp_workspace SET next_issue_number = $1 WHERE id = $2`,
      [(maxIssueNum?.max_num || 0) + 1, workspace.id]
    );

    console.log(
      `[Linear Import] Complete: ${stats.imported} imported, ${stats.updated} updated, ${stats.errors.length} errors`
    );

    return NextResponse.json({
      success: true,
      mode,
      stats,
    });
  } catch (error) {
    console.error("[Linear Import] Error:", error);
    return NextResponse.json(
      { error: "Import failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/linear/import
 *
 * Get import status and preview.
 */
export async function GET() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if Linear API key is configured
    const hasApiKey = !!process.env.LINEAR_API_KEY;

    // Count existing linked issues
    const linkedCount = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM chipp_external_issue WHERE source = 'linear'`
    );

    // Count total issues
    const totalCount = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM chipp_issue`
    );

    return NextResponse.json({
      configured: hasApiKey,
      linkedIssues: linkedCount?.count || 0,
      totalIssues: totalCount?.count || 0,
      endpoints: {
        import: "POST /api/linear/import?mode=upsert|replace&dryRun=true|false",
        preview: "POST /api/linear/import?dryRun=true",
      },
    });
  } catch (error) {
    console.error("[Linear Import] Error:", error);
    return NextResponse.json(
      { error: "Failed to get import status" },
      { status: 500 }
    );
  }
}
