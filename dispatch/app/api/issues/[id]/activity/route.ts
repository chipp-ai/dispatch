import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  getAgentActivity,
  createAgentActivity,
  AgentActivityType,
  AgentActivityMetadata,
} from "@/lib/services/issueService";
import { broadcastActivity } from "@/lib/services/activityBroadcast";

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
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const activities = await getAgentActivity(id, limit);

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error getting agent activity:", error);
    return NextResponse.json(
      { error: "Failed to get agent activity" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const { type, content, metadata } = body as {
      type: AgentActivityType;
      content: string;
      metadata?: AgentActivityMetadata;
    };

    if (!type || !content) {
      return NextResponse.json(
        { error: "Missing required fields: type, content" },
        { status: 400 }
      );
    }

    const activity = await createAgentActivity(id, type, content, metadata);

    const activityData = {
      id: activity.id,
      timestamp: activity.created_at.toISOString(),
      type: activity.type,
      content: activity.content,
      metadata: activity.metadata,
    };

    // Broadcast to all connected clients via SSE
    broadcastActivity(id, { type: "activity", data: activityData });

    return NextResponse.json(activityData);
  } catch (error) {
    console.error("Error creating agent activity:", error);
    return NextResponse.json(
      { error: "Failed to create agent activity" },
      { status: 500 }
    );
  }
}
