import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import {
  createIssue,
  listIssues,
  getIssueForBoard,
  getIssue,
} from "@/lib/services/issueService";
import { broadcastBoardEvent } from "@/lib/services/boardBroadcast";
import { notifyIssueCreated } from "@/lib/services/notificationService";
import { getStatusByName } from "@/lib/services/statusService";

export async function GET() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const issues = await listIssues(workspace.id);
    return NextResponse.json(issues);
  } catch (error) {
    console.error("Error listing issues:", error);
    return NextResponse.json(
      { error: "Failed to list issues" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const body = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Resolve statusName to statusId if provided
    if (body.statusName && !body.statusId) {
      const status = await getStatusByName(workspace.id, body.statusName);
      if (status) {
        body.statusId = status.id;
      }
    }

    const issue = await createIssue(workspace.id, {
      title: body.title,
      description: body.description,
      statusId: body.statusId,
      priority: body.priority,
      assigneeName: body.assigneeName,
      labelIds: body.labelIds,
      customerId: body.customerId,
      reporterId: body.reporterId,
      slackChannelId: body.slackChannelId,
      slackThreadTs: body.slackThreadTs,
      actorType: "user",
      actorName: "User",
    });

    // Broadcast the new issue to connected clients
    const boardIssue = await getIssueForBoard(issue.identifier);
    if (boardIssue) {
      broadcastBoardEvent({
        type: "issue_created",
        issue: boardIssue,
        timestamp: new Date().toISOString(),
      });
    }

    // Notify via Slack if the issue has a Slack channel
    if (body.slackChannelId || body.customerId) {
      // Get status name for the notification
      const fullIssue = await getIssue(issue.id);
      const statusName = fullIssue?.status?.name || "Backlog";

      // Fire and forget - don't block the response
      notifyIssueCreated({
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description || null,
        priority: issue.priority,
        status: statusName,
        reporterName: null, // Could be looked up from reporterId
        slackChannelId: body.slackChannelId || null,
        slackThreadTs: body.slackThreadTs || null,
        customerId: body.customerId || null,
      }).catch((err) =>
        console.error("[Notification] Failed to notify issue creation:", err)
      );
    }

    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    console.error("Error creating issue:", error);
    return NextResponse.json(
      { error: "Failed to create issue" },
      { status: 500 }
    );
  }
}
