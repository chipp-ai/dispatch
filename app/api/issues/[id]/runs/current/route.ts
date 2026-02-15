import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  getRun,
  getLatestRun,
  getRunByGithubRunId,
  updateRun,
} from "@/lib/services/agentRunService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/issues/{id}/runs/current
 *
 * Return the latest agent run for an issue (full detail including transcript).
 * Used by the UI to load persisted terminal output on page refresh.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: issueId } = await params;
    const latestRun = await getLatestRun(issueId);
    if (!latestRun) {
      return NextResponse.json(
        { error: "No agent runs found for this issue" },
        { status: 404 }
      );
    }

    // getLatestRun returns a summary -- fetch full detail for transcript
    const fullRun = await getRun(latestRun.id);
    return NextResponse.json(fullRun);
  } catch (error) {
    console.error("Error fetching current agent run:", error);
    return NextResponse.json(
      { error: "Failed to fetch current agent run" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/issues/{id}/runs/current?github_run_id=X
 *
 * Find the agent run for an issue and update it.
 * When github_run_id is provided (preferred), matches the exact run record.
 * Otherwise falls back to the latest run by created_at (legacy behavior).
 *
 * Used by GH Actions workflows to persist investigation results
 * (report, transcript, outcome, cost) back to the agent run record.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: issueId } = await params;
    const body = await request.json();

    // Prefer matching by github_run_id to avoid race conditions when
    // multiple runs overlap (the "latest" run may not be the caller's run)
    const githubRunId = request.nextUrl.searchParams.get("github_run_id");
    const targetRun = githubRunId
      ? await getRunByGithubRunId(issueId, githubRunId)
      : await getLatestRun(issueId);

    if (!targetRun) {
      return NextResponse.json(
        { error: githubRunId
            ? `No agent run found with github_run_id=${githubRunId}`
            : "No agent runs found for this issue" },
        { status: 404 }
      );
    }

    const run = await updateRun(targetRun.id, {
      status: body.status,
      transcript: body.transcript,
      reportContent: body.report_content,
      outcome: body.outcome,
      outcomeSummary: body.outcome_summary,
      costUsd: body.cost_usd !== undefined ? Number(body.cost_usd) : undefined,
      numTurns:
        body.num_turns !== undefined ? Number(body.num_turns) : undefined,
      model: body.model,
      tokensUsed:
        body.tokens_used !== undefined
          ? Number(body.tokens_used)
          : undefined,
      prNumber:
        body.pr_number !== undefined ? Number(body.pr_number) : undefined,
      filesChanged: body.files_changed,
      completedAt: body.completed_at,
      followUps: body.follow_ups,
      githubRunId: body.github_run_id,
      githubRunUrl: body.github_run_url,
      promptText: body.prompt_text,
    });

    if (!run) {
      return NextResponse.json(
        { error: "Failed to update agent run" },
        { status: 500 }
      );
    }

    return NextResponse.json(run);
  } catch (error) {
    console.error("Error updating current agent run:", error);
    return NextResponse.json(
      { error: "Failed to update current agent run" },
      { status: 500 }
    );
  }
}
