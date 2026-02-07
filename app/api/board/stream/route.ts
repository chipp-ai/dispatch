import { NextRequest } from "next/server";
import { getSession } from "@/lib/utils/auth";
import {
  addBoardConnection,
  removeBoardConnection,
} from "@/lib/services/boardBroadcast";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Validate session
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
      addBoardConnection(controller);

      // Send initial connection confirmation
      const connectMsg = `data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectMsg));
    },
    cancel() {
      if (controller) {
        removeBoardConnection(controller);
      }
    },
  });

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    if (controller) {
      try {
        controller.enqueue(new TextEncoder().encode(": ping\n\n"));
      } catch {
        clearInterval(pingInterval);
      }
    }
  }, 30000);

  // Clean up on abort
  request.signal.addEventListener("abort", () => {
    clearInterval(pingInterval);
    if (controller) {
      removeBoardConnection(controller);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
