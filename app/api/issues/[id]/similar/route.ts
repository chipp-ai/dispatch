import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getSimilarIssues } from "@/lib/services/issueService";

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
    const limit = parseInt(url.searchParams.get("limit") || "5");

    const similarIssues = await getSimilarIssues(id, limit);

    return NextResponse.json(similarIssues);
  } catch (error) {
    console.error("Error getting similar issues:", error);
    return NextResponse.json(
      { error: "Failed to get similar issues" },
      { status: 500 }
    );
  }
}
