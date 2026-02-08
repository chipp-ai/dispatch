import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { db } from "@/lib/db";
import { broadcastActivity } from "@/lib/services/activityBroadcast";
import { broadcastTerminalToViewers } from "@/lib/terminal/websocket-server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/issues/[id]/terminal
 *
 * Receives terminal output chunks from CI workflows and broadcasts them
 * to all SSE subscribers on the issue page. No DB persistence - this is
 * ephemeral live streaming. The full log is uploaded separately at the end.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body as { content: string };

    if (!content) {
      return NextResponse.json(
        { error: "Missing required field: content" },
        { status: 400 }
      );
    }

    // Resolve issue ID and identifier (accept both UUID and identifier like CHIPP-123)
    const issue = await db.queryOne<{ id: string; identifier: string }>(
      `SELECT id, identifier FROM chipp_issue WHERE id = $1 OR identifier = $1`,
      [id]
    );

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    const timestamp = new Date().toISOString();

    // Broadcast to SSE subscribers (IssuePageClient picks this up as sseLines)
    broadcastActivity(issue.id, {
      type: "terminal_output",
      data: {
        content,
        timestamp,
      },
    });

    // Also broadcast to WebSocket viewers (TerminalViewer's direct WS connection)
    broadcastTerminalToViewers(issue.identifier, {
      type: "output",
      issueIdentifier: issue.identifier,
      timestamp,
      data: content,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error broadcasting terminal output:", error);
    return NextResponse.json(
      { error: "Failed to broadcast terminal output" },
      { status: 500 }
    );
  }
}
