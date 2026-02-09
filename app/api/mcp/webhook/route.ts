import { NextRequest, NextResponse } from "next/server";
import { queueWebhookEvent } from "@/lib/mcp/server";

// POST /api/mcp/webhook - Receive webhooks from external sources (ngrok)
// This is the endpoint that AI agents register to receive issue assignments
export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    console.log(
      `[MCP Webhook] Received: ${event.type} for ${event.issue?.identifier}`
    );

    // Queue the event for the MCP poll_events tool
    queueWebhookEvent(event);

    return NextResponse.json({ success: true, message: "Event queued" });
  } catch (error) {
    console.error("[MCP Webhook] Error processing:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

// GET /api/mcp/webhook - Health check for webhook endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/mcp/webhook",
    description: "POST webhook events here to queue them for agents",
  });
}
