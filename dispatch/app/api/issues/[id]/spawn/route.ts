import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getIssue } from "@/lib/services/issueService";
import {
  canSpawn,
  dispatchWorkflow,
  recordSpawn,
  type SpawnableIssue,
  type WorkflowType,
} from "@/lib/services/spawnService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { type = "investigate", force = false } = body as {
      type?: "investigate" | "implement";
      force?: boolean;
    };

    const issue = await getIssue(id);
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Map request type to workflow type
    const workflowType: WorkflowType =
      type === "implement" ? "prd_implement" : "prd_investigate";

    // For implement, require an approved plan
    if (type === "implement" && !issue.plan_content) {
      return NextResponse.json(
        { error: "Cannot implement without an approved plan" },
        { status: 400 }
      );
    }

    // Check safety gates (concurrency + budget) unless force override
    if (!force) {
      const allowed = await canSpawn(workflowType);
      if (!allowed) {
        return NextResponse.json(
          {
            error: "Spawn blocked",
            reason:
              "Budget or concurrency limit reached. Use force=true to bypass.",
          },
          { status: 429 }
        );
      }
    }

    // Build spawnable issue
    const spawnable: SpawnableIssue = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      source: extractField(issue.description, "source"),
      feature: extractField(issue.description, "feature"),
      plan_content: issue.plan_content,
      plan_feedback: issue.plan_feedback,
    };

    const spawnType = type === "implement" ? "implement" : "investigate";
    const dispatchId = await dispatchWorkflow(spawnable, workflowType);
    await recordSpawn(issue.id, dispatchId, spawnType);

    return NextResponse.json({
      success: true,
      identifier: issue.identifier,
      type,
      dispatchId,
      message: `Spawned ${type} for ${issue.identifier}`,
    });
  } catch (error) {
    console.error("Error spawning:", error);
    const message =
      error instanceof Error ? error.message : "Failed to spawn";
    return NextResponse.json(
      { error: "Failed to spawn", reason: message },
      { status: 500 }
    );
  }
}

/**
 * Extract a field value from issue description markdown.
 * Looks for patterns like "**Source:** `billing`" or "Source: billing"
 */
function extractField(
  description: string | null,
  field: string
): string | undefined {
  if (!description) return undefined;
  // Match "**Field:** `value`" or "**Field:** value" or "Field: value"
  const backtick = "`";
  const patterns = [
    new RegExp(`\\*\\*${field}:\\*\\*\\s*${backtick}([^${backtick}]+)${backtick}`, "i"),
    new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+?)(?:\\n|$)`, "i"),
    new RegExp(`${field}:\\s*(.+?)(?:\\n|$)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}
