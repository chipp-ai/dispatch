import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  findDuplicateClusters,
  reviewClusters,
  executeDedupDecisions,
} from "@/lib/services/deduplicationService";

export async function POST(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      statuses = ["Backlog", "Investigating"],
      threshold = 0.85,
      dry_run = true,
      max_clusters = 50,
    } = body as {
      statuses?: string[];
      threshold?: number;
      dry_run?: boolean;
      max_clusters?: number;
    };

    // Step 1: Find clusters
    const clusters = await findDuplicateClusters({
      statuses,
      threshold,
      maxClusters: max_clusters,
    });

    if (clusters.length === 0) {
      return NextResponse.json({
        clusters: [],
        message: "No duplicate clusters found",
      });
    }

    // Step 2: Review with LLM
    const reviewed = await reviewClusters(clusters);

    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        clusters_found: clusters.length,
        clusters_reviewed: reviewed.length,
        proposed_actions: reviewed.map((r) => ({
          canonical: {
            identifier: r.canonical.identifier,
            title: r.canonical.title,
          },
          duplicates_to_close: r.duplicates.map((d) => ({
            identifier: d.issue.identifier,
            title: d.issue.title,
            reason: d.reason,
          })),
          keep_separate: r.keep_separate.map((s) => ({
            identifier: s.identifier,
            title: s.title,
          })),
        })),
        total_to_close: reviewed.reduce(
          (sum, r) => sum + r.duplicates.length,
          0
        ),
      });
    }

    // Step 3: Execute
    const result = await executeDedupDecisions(reviewed);

    return NextResponse.json({
      dry_run: false,
      ...result,
    });
  } catch (error) {
    console.error("Deduplication error:", error);
    const message =
      error instanceof Error ? error.message : "Deduplication failed";
    return NextResponse.json(
      { error: "Deduplication failed", reason: message },
      { status: 500 }
    );
  }
}
