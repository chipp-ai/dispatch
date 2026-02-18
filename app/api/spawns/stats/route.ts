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
      `SELECT COUNT(*) as count FROM dispatch_issue WHERE spawn_status = 'running'`
    );
    const activeCount = parseInt(activeResult?.count || "0", 10);

    // Budget usage per type
    const budgets = await db.query<{
      spawn_type: string;
      spawn_count: number;
      max_spawns: number;
    }>(
      `SELECT spawn_type, spawn_count, max_spawns
       FROM dispatch_spawn_budget
       WHERE date = CURRENT_DATE`
    );

    const errorBudget = budgets.find((b) => b.spawn_type === "error_fix");
    const prdBudget = budgets.find((b) => b.spawn_type === "prd");

    // Today's total cost (sum from agent runs, not issues -- issue cost_usd
    // accumulates across all runs, so filtering by date would over-count)
    const costResult = await db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM dispatch_agent_runs
       WHERE started_at >= CURRENT_DATE`
    );
    const dailyCost = parseFloat(costResult?.total || "0");

    // Today's completed/failed counts (from agent runs for accurate per-run counting)
    const outcomesResult = await db.query<{
      run_outcome: string;
      count: string;
    }>(
      `SELECT outcome as run_outcome, COUNT(*) as count
       FROM dispatch_agent_runs
       WHERE started_at >= CURRENT_DATE
         AND outcome IS NOT NULL
       GROUP BY outcome`
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
      dailyCostLimit: parseFloat(process.env.DAILY_COST_LIMIT_USD || "200"),
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
