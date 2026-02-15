import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getRun, updateRun } from "@/lib/services/agentRunService";

interface RouteParams {
  params: Promise<{ id: string; runId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { runId } = await params;
    const run = await getRun(runId);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    console.error("Error getting agent run:", error);
    return NextResponse.json(
      { error: "Failed to get agent run" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { runId } = await params;
    const body = await request.json();

    const run = await updateRun(runId, {
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
      completedAt: body.completed_at,
      githubRunId: body.github_run_id,
      githubRunUrl: body.github_run_url,
      promptText: body.prompt_text,
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    console.error("Error updating agent run:", error);
    return NextResponse.json(
      { error: "Failed to update agent run" },
      { status: 500 }
    );
  }
}
