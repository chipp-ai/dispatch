import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import {
  listStatuses,
  createStatus,
  reorderStatuses,
} from "@/lib/services/statusService";

export async function GET() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const statuses = await listStatuses(workspace.id);

    return NextResponse.json(statuses);
  } catch (error) {
    console.error("Error listing statuses:", error);
    return NextResponse.json(
      { error: "Failed to list statuses" },
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

    if (!body.color) {
      return NextResponse.json({ error: "color is required" }, { status: 400 });
    }

    const status = await createStatus(workspace.id, {
      name: body.name,
      color: body.color,
      position: body.position,
      is_closed: body.isClosed,
    });

    return NextResponse.json(status, { status: 201 });
  } catch (error) {
    console.error("Error creating status:", error);
    return NextResponse.json(
      { error: "Failed to create status" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const body = await request.json();

    if (!body.statusIds || !Array.isArray(body.statusIds)) {
      return NextResponse.json(
        { error: "statusIds array is required" },
        { status: 400 }
      );
    }

    const statuses = await reorderStatuses(workspace.id, body.statusIds);

    return NextResponse.json(statuses);
  } catch (error) {
    console.error("Error reordering statuses:", error);
    return NextResponse.json(
      { error: "Failed to reorder statuses" },
      { status: 500 }
    );
  }
}
