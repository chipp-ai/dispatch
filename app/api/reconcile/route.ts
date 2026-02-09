import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  runReconciliation,
  getReconciliationHistory,
} from "@/lib/services/reconciliationService";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";

/**
 * POST /api/reconcile
 * Run a reconciliation to sync GitHub PR data with issues
 */
export async function POST(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Reconciliation API] Starting reconciliation...");

    const result = await runReconciliation();

    return NextResponse.json({
      success: true,
      id: result.id,
      prsProcessed: result.prsProcessed,
      issuesUpdated: result.issuesUpdated,
      duration: result.duration,
      changes: result.changes,
    });
  } catch (error) {
    console.error("[Reconciliation API] Error:", error);
    return NextResponse.json(
      {
        error: "Reconciliation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reconcile
 * Get reconciliation history
 */
export async function GET(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const history = await getReconciliationHistory(workspace.id);

    return NextResponse.json(history);
  } catch (error) {
    console.error("[Reconciliation API] Error fetching history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
