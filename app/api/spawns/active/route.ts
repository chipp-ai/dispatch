import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { db } from "@/lib/db";

/**
 * GET /api/spawns/active
 * Returns currently running agent spawns with issue info.
 */
export async function GET() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const active = await db.query<{
      id: string;
      identifier: string;
      title: string;
      spawn_type: string | null;
      spawn_status: string;
      spawn_started_at: string | null;
      spawn_run_id: string | null;
      agent_status: string | null;
      cost_usd: number | null;
    }>(
      `SELECT id, identifier, title, spawn_type, spawn_status,
              spawn_started_at, spawn_run_id, agent_status, cost_usd
       FROM chipp_issue
       WHERE spawn_status = 'running'
       ORDER BY spawn_started_at ASC`
    );

    return NextResponse.json(active);
  } catch (error) {
    console.error("Error fetching active spawns:", error);
    return NextResponse.json(
      { error: "Failed to fetch active spawns" },
      { status: 500 }
    );
  }
}
