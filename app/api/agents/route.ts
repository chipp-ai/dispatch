import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import { listAgents, createAgent } from "@/lib/services/agentService";

export async function GET(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "true";

    const agents = await listAgents(workspace.id, includeInactive);

    return NextResponse.json(agents);
  } catch (error) {
    console.error("Error listing agents:", error);
    return NextResponse.json(
      { error: "Failed to list agents" },
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

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const agent = await createAgent(workspace.id, {
      name: body.name,
      description: body.description,
      webhookUrl: body.webhookUrl,
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error("Error creating agent:", error);
    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
