import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  getIssueHistory,
  formatHistoryEntry,
} from "@/lib/services/issueHistoryService";

/**
 * GET /api/issues/[id]/history
 * Get the history/timeline for an issue
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const history = await getIssueHistory(id);

    // Format entries for display
    const formattedHistory = history.map((entry) => ({
      ...entry,
      formatted: formatHistoryEntry(entry),
    }));

    return NextResponse.json(formattedHistory);
  } catch (error) {
    console.error("Error fetching issue history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
