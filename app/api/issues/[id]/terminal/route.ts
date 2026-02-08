import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { db } from "@/lib/db";
import { broadcastActivity } from "@/lib/services/activityBroadcast";

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

    // Resolve issue ID (accept both UUID and identifier like CHIPP-123)
    const issue = await db.queryOne<{ id: string }>(
      `SELECT id FROM chipp_issue WHERE id = $1 OR identifier = $1`,
      [id]
    );

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Broadcast to all SSE subscribers - no DB persistence
    broadcastActivity(issue.id, {
      type: "terminal_output",
      data: {
        content,
        timestamp: new Date().toISOString(),
      },
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
