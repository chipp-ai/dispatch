import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSession } from "@/lib/utils/auth";
import {
  getIssue,
  updateIssue,
  deleteIssue,
  getIssueForBoard,
} from "@/lib/services/issueService";
import { getExternalLinksForIssue } from "@/lib/services/externalIssueService";
import { broadcastBoardEvent } from "@/lib/services/boardBroadcast";
import {
  canMoveToCloseStatus,
  checkFixVerification,
} from "@/lib/services/fixTrackingService";
import { db } from "@/lib/db";
import { notifyStatusChange } from "@/lib/services/notificationService";
import { notifyInternalAgentCompleted } from "@/lib/services/internalSlackService";
import { getStatusByName } from "@/lib/services/statusService";
import type { HistoryActorType } from "@/lib/services/issueHistoryService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

    const externalLinks = await getExternalLinksForIssue(issue.id);
    return NextResponse.json({ ...issue, external_links: externalLinks });
  } catch (error) {
    console.error("Error getting issue:", error);
    return NextResponse.json({ error: "Failed to get issue" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Get the previous status for detecting moves
    const previousIssue = await getIssue(id);
    const previousStatusId = previousIssue?.status_id;

    // If changing status, check if moving to a closed status is allowed
    if (body.statusId && body.statusId !== previousStatusId) {
      // Check if the target status is a closed status
      const targetStatus = await db.queryOne<{ is_closed: boolean }>(
        `SELECT is_closed FROM dispatch_status WHERE id = $1`,
        [body.statusId]
      );

      if (targetStatus?.is_closed) {
        // Trigger lazy verification check first
        await checkFixVerification(id);

        // Then check if closing is allowed
        const canClose = await canMoveToCloseStatus(id);
        if (!canClose.allowed) {
          return NextResponse.json(
            {
              error: "Cannot close issue",
              reason: canClose.reason,
              code: "FIX_VERIFICATION_REQUIRED",
            },
            { status: 403 }
          );
        }
      }
    }

    // Auto-transition: move issue to correct column when agent status changes
    // Only applies when the caller didn't explicitly set statusId
    if (!body.statusId && previousIssue) {
      const currentStatusName = previousIssue.status?.name?.toLowerCase() || "";

      // spawn_status → completed/failed while Investigating → Needs Review
      if (
        body.spawn_status &&
        (body.spawn_status === "completed" || body.spawn_status === "failed") &&
        currentStatusName === "investigating"
      ) {
        const target = await getStatusByName(previousIssue.workspace_id, "Needs Review");
        if (target) {
          body.statusId = target.id;
        }
      }

      // plan_status → approved while Needs Review → In Progress
      if (
        body.plan_status === "approved" &&
        currentStatusName === "needs review"
      ) {
        const target = await getStatusByName(previousIssue.workspace_id, "In Progress");
        if (target) {
          body.statusId = target.id;
        }
      }
    }

    // Determine actor: session cookie = user, Bearer token = agent/system
    const session = await getSession();
    const actorType: HistoryActorType = session ? "user" : "agent";
    const actorName = session ? "User" : "GitHub Actions";

    const issue = await updateIssue(id, {
      title: body.title,
      description: body.description,
      statusId: body.statusId,
      priority: body.priority,
      assigneeName: body.assigneeName,
      labelIds: body.labelIds,
      // Agent fields
      agent_status: body.agent_status,
      agent_output: body.agent_output,
      agent_confidence: body.agent_confidence,
      agent_tokens_used: body.agent_tokens_used,
      // PRD workflow fields
      workflow_type: body.workflow_type,
      plan_status: body.plan_status,
      plan_content: body.plan_content,
      plan_feedback: body.plan_feedback,
      plan_approved_at: body.plan_approved_at,
      plan_approved_by: body.plan_approved_by,
      spawn_type: body.spawn_type,
      spawn_status: body.spawn_status,
      spawn_run_id: body.spawn_run_id,
      spawn_attempt_count: body.spawn_attempt_count,
      blocked_reason: body.blocked_reason,
      // Cost tracking fields
      cost_usd: body.cost_usd,
      model: body.model,
      num_turns: body.num_turns,
      // Run outcome tracking
      run_outcome: body.run_outcome,
      outcome_summary: body.outcome_summary,
      // Audit trail
      actorType,
      actorName,
    });

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Broadcast the update to connected clients
    const boardIssue = await getIssueForBoard(issue.identifier);
    if (boardIssue) {
      const eventType =
        body.statusId && previousStatusId !== body.statusId
          ? "issue_moved"
          : "issue_updated";

      broadcastBoardEvent({
        type: eventType,
        issue: boardIssue,
        previousStatusId:
          eventType === "issue_moved" ? previousStatusId : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    // Notify watchers if status changed
    if (body.statusId && previousStatusId !== body.statusId && previousIssue) {
      // Get the status names for the notification
      const updatedIssue = await getIssue(issue.id);
      const previousStatusName = previousIssue.status?.name || "Unknown";
      const newStatusName = updatedIssue?.status?.name || "Unknown";

      // Fire and forget - don't block the response
      notifyStatusChange({
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        previousStatus: previousStatusName,
        newStatus: newStatusName,
        slackThreadTs: null, // Will be looked up in the notification service
      }).catch((err) =>
        console.error("[Notification] Failed to notify status change:", err)
      );
    }

    // Notify internal Slack when agent completes or fails
    if (
      body.spawn_status &&
      (body.spawn_status === "completed" || body.spawn_status === "failed") &&
      previousIssue?.spawn_status === "running"
    ) {
      notifyInternalAgentCompleted(id).catch((err) =>
        console.error("[Internal Slack] notify agent completed:", err)
      );
    }

    return NextResponse.json(issue);
  } catch (error) {
    console.error("Error updating issue:", error);
    return NextResponse.json(
      { error: "Failed to update issue" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Get the issue before deleting for broadcast
    const boardIssue = await getIssueForBoard(id);

    await deleteIssue(id);

    // Broadcast the deletion to connected clients
    if (boardIssue) {
      broadcastBoardEvent({
        type: "issue_deleted",
        issueId: boardIssue.id,
        identifier: boardIssue.identifier,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting issue:", error);
    return NextResponse.json(
      { error: "Failed to delete issue" },
      { status: 500 }
    );
  }
}
