import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  getCustomerHealthMetrics,
  getCustomerIssuesWithHealth,
  getCustomerRecentActivity,
} from "@/lib/services/customerStatsService";

/**
 * GET /api/customers/[id]/stats
 *
 * Get health metrics, issues, and recent activity for a customer.
 *
 * Query params:
 * - include: comma-separated list of what to include (metrics, issues, activity). Default: all
 * - filter: issue filter (all, stale, unresponded, critical). Default: all
 * - limit: number of issues/activities to return. Default: 20
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
  const searchParams = request.nextUrl.searchParams;

  const includeParam = searchParams.get("include") || "metrics,issues,activity";
  const include = new Set(includeParam.split(",").map((s) => s.trim()));
  const filter = (searchParams.get("filter") || "all") as
    | "all"
    | "stale"
    | "unresponded"
    | "critical";
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    const result: {
      metrics?: Awaited<ReturnType<typeof getCustomerHealthMetrics>>;
      issues?: Awaited<ReturnType<typeof getCustomerIssuesWithHealth>>;
      activity?: Awaited<ReturnType<typeof getCustomerRecentActivity>>;
    } = {};

    // Fetch requested data in parallel
    const promises: Promise<void>[] = [];

    if (include.has("metrics")) {
      promises.push(
        getCustomerHealthMetrics(id).then((metrics) => {
          result.metrics = metrics;
        })
      );
    }

    if (include.has("issues")) {
      promises.push(
        getCustomerIssuesWithHealth(id, { filter, limit }).then((issues) => {
          result.issues = issues;
        })
      );
    }

    if (include.has("activity")) {
      promises.push(
        getCustomerRecentActivity(id, limit).then((activity) => {
          result.activity = activity;
        })
      );
    }

    await Promise.all(promises);

    if (include.has("metrics") && !result.metrics) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching customer stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer stats" },
      { status: 500 }
    );
  }
}
