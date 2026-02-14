import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import {
  listLabels,
  getLabelByName,
  createLabel,
} from "@/lib/services/labelService";

export async function GET(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const name = request.nextUrl.searchParams.get("name");

    if (name) {
      const label = await getLabelByName(workspace.id, name);
      return NextResponse.json(label ? [label] : []);
    }

    const labels = await listLabels(workspace.id);
    return NextResponse.json(labels);
  } catch (error) {
    console.error("Error listing labels:", error);
    return NextResponse.json(
      { error: "Failed to list labels" },
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

    const label = await createLabel(workspace.id, {
      name: body.name,
      color: body.color,
    });

    return NextResponse.json(label, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating label:", error);

    if (
      error instanceof Error &&
      error.message?.includes("Invalid color format")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to create label" },
      { status: 500 }
    );
  }
}
