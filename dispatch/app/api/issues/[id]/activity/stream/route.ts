import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { db } from "@/lib/db";
import { getConnections } from "@/lib/services/activityBroadcast";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  // Resolve issue ID
  const issue = await db.queryOne<{ id: string }>(
    `SELECT id FROM chipp_issue WHERE id = $1 OR identifier = $1`,
    [id]
  );

  if (!issue) {
    return new Response("Issue not found", { status: 404 });
  }

  const issueId = issue.id;
  const connections = getConnections();

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Add to connections
      if (!connections.has(issueId)) {
        connections.set(issueId, new Set());
      }
      connections.get(issueId)!.add(controller);

      // Send initial connection message
      const connectMsg = `data: ${JSON.stringify({ type: "connected", issueId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectMsg));

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          const ping = `data: ${JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(ping));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        const issueConnections = connections.get(issueId);
        if (issueConnections) {
          issueConnections.delete(controller);
          if (issueConnections.size === 0) {
            connections.delete(issueId);
          }
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
