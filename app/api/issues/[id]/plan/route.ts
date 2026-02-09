import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  getIssue,
  updateIssue,
  createAgentActivity,
} from "@/lib/services/issueService";
import { broadcastActivity } from "@/lib/services/activityBroadcast";
import {
  canSpawn,
  dispatchWorkflow,
  recordSpawn,
  type SpawnableIssue,
} from "@/lib/services/spawnService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/issues/{id}/plan
 * Agent posts a plan for review, or human approves/rejects.
 *
 * Body for plan submission (agent):
 *   { action: "submit", content: "## Plan\n..." }
 *
 * Body for approval (human):
 *   { action: "approve", approvedBy?: string }
 *
 * Body for rejection (human):
 *   { action: "reject", feedback: "Please also consider..." }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body as { action: string };

    const issue = await getIssue(id);
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    switch (action) {
      case "submit": {
        const { content } = body as { content: string };
        if (!content) {
          return NextResponse.json(
            { error: "Plan content is required" },
            { status: 400 }
          );
        }

        await updateIssue(id, {
          plan_status: "awaiting_review",
          plan_content: content,
          agent_status: "awaiting_review",
        });

        // Log activity
        const activity = await createAgentActivity(
          issue.id,
          "complete",
          "Plan submitted for review"
        );
        broadcastActivity(issue.id, {
          type: "activity",
          data: {
            id: activity.id,
            timestamp: activity.created_at.toISOString(),
            type: activity.type,
            content: activity.content,
            metadata: activity.metadata,
          },
        });

        return NextResponse.json({
          success: true,
          identifier: issue.identifier,
          plan_status: "awaiting_review",
        });
      }

      case "approve": {
        const { approvedBy = "human", auto_spawn = false } = body as {
          approvedBy?: string;
          auto_spawn?: boolean;
        };

        if (issue.plan_status !== "awaiting_review" && issue.plan_status !== "posted") {
          return NextResponse.json(
            { error: `Cannot approve plan in status: ${issue.plan_status}` },
            { status: 400 }
          );
        }

        await updateIssue(id, {
          plan_status: "approved",
          plan_approved_at: new Date(),
          plan_approved_by: approvedBy,
          plan_feedback: null,
        });

        // Log activity
        const activity = await createAgentActivity(
          issue.id,
          "complete",
          `Plan approved by ${approvedBy}`
        );
        broadcastActivity(issue.id, {
          type: "activity",
          data: {
            id: activity.id,
            timestamp: activity.created_at.toISOString(),
            type: activity.type,
            content: activity.content,
            metadata: activity.metadata,
          },
        });

        // Auto-spawn implementation if requested
        let spawnResult = null;
        if (auto_spawn) {
          try {
            const allowed = await canSpawn("prd_implement");
            if (allowed) {
              const spawnable: SpawnableIssue = {
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description,
                plan_content: issue.plan_content,
              };
              const dispatchId = await dispatchWorkflow(
                spawnable,
                "prd_implement"
              );
              await recordSpawn(issue.id, dispatchId, "implement");

              const spawnActivity = await createAgentActivity(
                issue.id,
                "action",
                "Auto-spawned implementation after plan approval"
              );
              broadcastActivity(issue.id, {
                type: "activity",
                data: {
                  id: spawnActivity.id,
                  timestamp: spawnActivity.created_at.toISOString(),
                  type: spawnActivity.type,
                  content: spawnActivity.content,
                  metadata: spawnActivity.metadata,
                },
              });

              spawnResult = { spawned: true, dispatchId };
            } else {
              spawnResult = {
                spawned: false,
                reason: "Budget or concurrency limit reached",
              };
            }
          } catch (spawnErr) {
            console.error("Auto-spawn failed:", spawnErr);
            spawnResult = {
              spawned: false,
              reason:
                spawnErr instanceof Error
                  ? spawnErr.message
                  : "Spawn failed",
            };
          }
        }

        return NextResponse.json({
          success: true,
          identifier: issue.identifier,
          plan_status: "approved",
          ...(spawnResult && { spawn: spawnResult }),
        });
      }

      case "reject": {
        const { feedback } = body as { feedback: string };
        if (!feedback) {
          return NextResponse.json(
            { error: "Feedback is required when rejecting a plan" },
            { status: 400 }
          );
        }

        if (issue.plan_status !== "awaiting_review" && issue.plan_status !== "posted") {
          return NextResponse.json(
            { error: `Cannot reject plan in status: ${issue.plan_status}` },
            { status: 400 }
          );
        }

        await updateIssue(id, {
          plan_status: "needs_revision",
          plan_feedback: feedback,
          agent_status: "idle",
        });

        // Log activity
        const activity = await createAgentActivity(
          issue.id,
          "observation",
          `Plan rejected: ${feedback}`
        );
        broadcastActivity(issue.id, {
          type: "activity",
          data: {
            id: activity.id,
            timestamp: activity.created_at.toISOString(),
            type: activity.type,
            content: activity.content,
            metadata: activity.metadata,
          },
        });

        return NextResponse.json({
          success: true,
          identifier: issue.identifier,
          plan_status: "needs_revision",
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use submit, approve, or reject.` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error handling plan:", error);
    return NextResponse.json(
      { error: "Failed to handle plan" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/issues/{id}/plan
 * Retrieve the current plan content and status.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const issue = await getIssue(id);
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    return NextResponse.json({
      identifier: issue.identifier,
      plan_status: issue.plan_status,
      plan_content: issue.plan_content,
      plan_feedback: issue.plan_feedback,
      plan_approved_at: issue.plan_approved_at,
      plan_approved_by: issue.plan_approved_by,
    });
  } catch (error) {
    console.error("Error getting plan:", error);
    return NextResponse.json(
      { error: "Failed to get plan" },
      { status: 500 }
    );
  }
}
