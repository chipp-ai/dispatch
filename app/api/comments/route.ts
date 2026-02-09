import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { createComment, listComments } from "@/lib/services/commentService";
import { getOrCreateAgentByName } from "@/lib/services/agentService";
import { getIssue } from "@/lib/services/issueService";
import { notifyCommentAdded } from "@/lib/services/notificationService";

export async function GET(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const issueId = request.nextUrl.searchParams.get("issueId");

    if (!issueId) {
      return NextResponse.json(
        { error: "issueId is required" },
        { status: 400 }
      );
    }

    const comments = await listComments(issueId);

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Error listing comments:", error);
    return NextResponse.json(
      { error: "Failed to list comments" },
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
    const body = await request.json();

    if (!body.issueId) {
      return NextResponse.json(
        { error: "issueId is required" },
        { status: 400 }
      );
    }

    if (!body.body) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    // If author is provided as a name, get or create agent
    let authorId = body.authorId;
    if (body.authorName && !authorId) {
      const issue = await getIssue(body.issueId);
      if (issue) {
        const agent = await getOrCreateAgentByName(
          issue.workspace_id,
          body.authorName
        );
        authorId = agent.id;
      }
    }

    // Get issue details for the notification
    const issue = await getIssue(body.issueId);

    const comment = await createComment({
      issueId: body.issueId,
      body: body.body,
      authorId,
    });

    // Notify via Slack if the issue has Slack info
    if (issue) {
      const authorName = body.authorName || "Someone";

      // Fire and forget - don't block the response
      notifyCommentAdded({
        issueId: issue.id,
        identifier: issue.identifier,
        issueTitle: issue.title,
        commentBody: body.body,
        authorName,
        slackThreadTs: null, // Will be looked up in the notification service
      }).catch((err) =>
        console.error("[Notification] Failed to notify comment:", err)
      );
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
