import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getInvestigationContext } from "@/lib/services/agentRunService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/issues/{id}/investigation-context
 *
 * Returns a compact summary of previous investigation runs for this issue,
 * purpose-built for injecting into an agent prompt. Includes PR merge status
 * so the agent knows whether previous fixes landed.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const context = await getInvestigationContext(id);
    return NextResponse.json(context);
  } catch (error) {
    console.error("Error fetching investigation context:", error);
    return NextResponse.json(
      { error: "Failed to fetch investigation context" },
      { status: 500 }
    );
  }
}
