import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  getIssue,
  updateIssue,
  deleteIssue,
  getIssueForBoard,
} from "@/lib/services/issueService";
import { broadcastBoardEvent } from "@/lib/services/boardBroadcast";
import {
  canMoveToCloseStatus,
  checkFixVerification,
} from "@/lib/services/fixTrackingService";
import { db } from "@/lib/db";
import { notifyStatusChange } from "@/lib/services/notificationService";

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

    return NextResponse.json(issue);
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
        `SELECT is_closed FROM chipp_status WHERE id = $1`,
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
