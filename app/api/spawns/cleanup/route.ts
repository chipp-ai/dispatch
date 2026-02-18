import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { cleanupStaleRuns } from "@/lib/services/staleRunCleanupService";

/**
 * POST /api/spawns/cleanup
 * Manually trigger stale run cleanup. Returns the count of cleaned up runs.
 */
export async function POST() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await cleanupStaleRuns();
    return NextResponse.json({ cleaned: count });
  } catch (error) {
    console.error("Error cleaning up stale runs:", error);
    return NextResponse.json(
      { error: "Failed to clean up stale runs" },
      { status: 500 }
    );
  }
}
