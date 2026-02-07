import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import { searchIssuesSemantic } from "@/lib/services/issueService";

export async function GET(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const query = request.nextUrl.searchParams.get("q");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam) : 10;

    if (!query) {
      return NextResponse.json(
        { error: "query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const results = await searchIssuesSemantic(workspace.id, query, limit);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error searching issues:", error);
    return NextResponse.json(
      { error: "Failed to search issues" },
      { status: 500 }
    );
  }
}
