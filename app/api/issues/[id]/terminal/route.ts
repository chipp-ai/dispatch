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
 * to all SSE subscribers on the issue page. Also persists chunks to the
 * agent run's transcript column for historical review.
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
      `SELECT id, identifier FROM dispatch_issue WHERE id = $1 OR identifier = $1`,
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

    // Persist chunk to the latest agent run's transcript (fire-and-forget).
    // This ensures the terminal output survives page refreshes and workflow failures.
    // The final workflow step will overwrite with the complete filtered log,
    // but incremental persistence covers the mid-run crash case.
    appendTranscriptChunk(issue.id, content).catch((err) => {
      console.error("Failed to persist terminal chunk:", err);
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

/**
 * Append a terminal output chunk to the latest running agent run's transcript.
 * Uses COALESCE + concat to append without read-modify-write races.
 */
async function appendTranscriptChunk(
  issueId: string,
  content: string
): Promise<void> {
  await db.query(
    `UPDATE dispatch_agent_runs
     SET transcript = COALESCE(transcript, '') || $1
     WHERE id = (
       SELECT id FROM dispatch_agent_runs
       WHERE issue_id = $2 AND status = 'running'
       ORDER BY created_at DESC
       LIMIT 1
     )`,
    [content + "\n", issueId]
  );
}
