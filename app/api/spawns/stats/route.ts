import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { db } from "@/lib/db";

/**
 * GET /api/spawns/stats
 * Returns fleet statistics: budget usage, daily cost, active count.
 */
export async function GET() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Active spawn count
    const activeResult = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM chipp_issue WHERE spawn_status = 'running'`
    );
    const activeCount = parseInt(activeResult?.count || "0", 10);

    // Budget usage per type
    const budgets = await db.query<{
      spawn_type: string;
      spawn_count: number;
      max_spawns: number;
    }>(
      `SELECT spawn_type, spawn_count, max_spawns
       FROM chipp_spawn_budget
       WHERE date = CURRENT_DATE`
    );

    const errorBudget = budgets.find((b) => b.spawn_type === "error_fix");
    const prdBudget = budgets.find((b) => b.spawn_type === "prd");

    // Today's total cost (sum cost_usd for issues spawned today)
    const costResult = await db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM chipp_issue
       WHERE spawn_started_at >= CURRENT_DATE`
    );
    const dailyCost = parseFloat(costResult?.total || "0");

    // Today's completed/failed counts
    const outcomesResult = await db.query<{
      run_outcome: string;
      count: string;
    }>(
      `SELECT run_outcome, COUNT(*) as count
       FROM chipp_issue
       WHERE spawn_started_at >= CURRENT_DATE
         AND run_outcome IS NOT NULL
       GROUP BY run_outcome`
    );

    const outcomes: Record<string, number> = {};
    for (const row of outcomesResult) {
      outcomes[row.run_outcome] = parseInt(row.count, 10);
    }

    return NextResponse.json({
      active: activeCount,
      budget: {
        error_fix: {
          used: errorBudget?.spawn_count || 0,
          max: errorBudget?.max_spawns || 10,
        },
        prd: {
          used: prdBudget?.spawn_count || 0,
          max: prdBudget?.max_spawns || 5,
        },
      },
      dailyCost,
      outcomes,
    });
  } catch (error) {
    console.error("Error fetching spawn stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch spawn stats" },
      { status: 500 }
    );
  }
}
