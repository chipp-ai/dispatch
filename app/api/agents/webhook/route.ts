import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { db } from "@/lib/db";
import {
  updateAgentWebhook,
  getAgentWebhook,
} from "@/lib/services/webhookService";

// POST /api/agents/webhook - Register a webhook URL for an agent
export async function POST(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agentName, webhookUrl } = body;

    if (!agentName || !webhookUrl) {
      return NextResponse.json(
        { error: "Missing required fields: agentName, webhookUrl" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(webhookUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid webhook URL" },
        { status: 400 }
      );
    }

    // Find the agent
    const agent = await db.queryOne<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM chipp_agent WHERE LOWER(name) = LOWER($1)`,
      [agentName]
    );

    if (!agent) {
      return NextResponse.json(
        { error: `Agent "${agentName}" not found` },
        { status: 404 }
      );
    }

    // Update the agent's webhook URL
    await updateAgentWebhook(agent.id, webhookUrl);

    return NextResponse.json({
      success: true,
      agentName,
      webhookUrl,
      message:
        "Webhook registered. You will receive POST requests when issues are assigned.",
    });
  } catch (error) {
    console.error("Error registering webhook:", error);
    return NextResponse.json(
      { error: "Failed to register webhook" },
      { status: 500 }
    );
  }
}

// GET /api/agents/webhook?agentName=xxx - Get agent's webhook config
export async function GET(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const agentName = url.searchParams.get("agentName");

    if (!agentName) {
      return NextResponse.json(
        { error: "Missing required parameter: agentName" },
        { status: 400 }
      );
    }

    // Find the agent
    const agent = await db.queryOne<{ id: string }>(
      `SELECT id FROM chipp_agent WHERE LOWER(name) = LOWER($1)`,
      [agentName]
    );

    if (!agent) {
      return NextResponse.json(
        { error: `Agent "${agentName}" not found` },
        { status: 404 }
      );
    }

    const webhook = await getAgentWebhook(agent.id);

    return NextResponse.json({
      agentName,
      hasWebhook: !!webhook,
      webhookUrl: webhook?.url || null,
    });
  } catch (error) {
    console.error("Error getting webhook:", error);
    return NextResponse.json(
      { error: "Failed to get webhook" },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/webhook - Remove agent's webhook
export async function DELETE(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { agentName } = body;

    if (!agentName) {
      return NextResponse.json(
        { error: "Missing required field: agentName" },
        { status: 400 }
      );
    }

    // Find the agent
    const agent = await db.queryOne<{ id: string }>(
      `SELECT id FROM chipp_agent WHERE LOWER(name) = LOWER($1)`,
      [agentName]
    );

    if (!agent) {
      return NextResponse.json(
        { error: `Agent "${agentName}" not found` },
        { status: 404 }
      );
    }

    // Clear webhook fields
    await db.query(
      `UPDATE chipp_agent SET webhook_url = NULL, webhook_secret = NULL, updated_at = NOW() WHERE id = $1`,
      [agent.id]
    );

    return NextResponse.json({
      success: true,
      agentName,
      message: "Webhook removed",
    });
  } catch (error) {
    console.error("Error removing webhook:", error);
    return NextResponse.json(
      { error: "Failed to remove webhook" },
      { status: 500 }
    );
  }
}
