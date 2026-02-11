import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import {
  createRun,
  listRunsForIssue,
} from "@/lib/services/agentRunService";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const runs = await listRunsForIssue(id);
    return NextResponse.json(runs);
  } catch (error) {
    console.error("Error listing agent runs:", error);
    return NextResponse.json(
      { error: "Failed to list agent runs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const { workflow_type, github_run_id, github_run_url, prompt_text } =
      body as {
        workflow_type: string;
        github_run_id?: string;
        github_run_url?: string;
        prompt_text?: string;
      };

    if (!workflow_type) {
      return NextResponse.json(
        { error: "Missing required field: workflow_type" },
        { status: 400 }
      );
    }

    const run = await createRun({
      issueId: id,
      workflowType: workflow_type,
      githubRunId: github_run_id,
      githubRunUrl: github_run_url,
      promptText: prompt_text,
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error("Error creating agent run:", error);
    return NextResponse.json(
      { error: "Failed to create agent run" },
      { status: 500 }
    );
  }
}
