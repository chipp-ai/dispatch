import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { getIssue, updateIssue, createAgentActivity } from "@/lib/services/issueService";
import { broadcastActivity } from "@/lib/services/activityBroadcast";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const [_repoOwner, _repoName] = (process.env.GITHUB_REPO || "").split("/");
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || _repoOwner || "";
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || _repoName || "chipp-deno";

/**
 * POST /api/issues/{id}/spawn/cancel
 * Cancel a running GitHub Actions workflow for this issue.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const issue = await getIssue(id);
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    if (issue.spawn_status !== "running") {
      return NextResponse.json(
        { error: "No running spawn to cancel" },
        { status: 400 }
      );
    }

    // Try to cancel the GitHub Actions run if we have a run ID
    let ghCancelled = false;
    if (issue.spawn_run_id && GITHUB_TOKEN) {
      // The spawn_run_id might be a dispatch ID (dispatch_xxx) or actual run ID
      // Try to find the actual run via the GitHub API
      const runId = await resolveRunId(issue.spawn_run_id, issue.identifier);
      if (runId) {
        const cancelRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/runs/${runId}/cancel`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );
        ghCancelled = cancelRes.status === 202;
        if (!ghCancelled) {
          console.log(
            `[Cancel] GitHub cancel returned ${cancelRes.status} for run ${runId}`
          );
        }
      }
    }

    // Update issue state regardless of GitHub cancel success
    await updateIssue(id, {
      spawn_status: "failed",
      agent_status: "idle",
      run_outcome: "failed",
      outcome_summary: "Cancelled by user",
    });

    // Log activity
    const activity = await createAgentActivity(
      issue.id,
      "action",
      "Agent cancelled by user",
      { cancelled_run_id: issue.spawn_run_id, gh_cancelled: ghCancelled }
    );
    broadcastActivity(issue.id, {
      type: "activity",
      data: {
        id: activity.id,
        timestamp: activity.created_at.toISOString(),
        type: activity.type,
        content: activity.content,
        metadata: activity.metadata,
      },
    });

    return NextResponse.json({
      success: true,
      identifier: issue.identifier,
      ghCancelled,
      message: `Cancelled spawn for ${issue.identifier}`,
    });
  } catch (error) {
    console.error("Error cancelling spawn:", error);
    return NextResponse.json(
      { error: "Failed to cancel spawn" },
      { status: 500 }
    );
  }
}

/**
 * Resolve a dispatch ID or run ID to an actual GitHub Actions run ID.
 * If it's already numeric, return as-is. Otherwise search recent runs.
 */
async function resolveRunId(
  spawnRunId: string,
  identifier: string
): Promise<string | null> {
  // If it looks like a numeric run ID, use directly
  if (/^\d+$/.test(spawnRunId)) {
    return spawnRunId;
  }

  // Otherwise search recent workflow runs for this issue's identifier
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/runs?per_page=10&status=in_progress`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    // Find a run whose name contains the issue identifier
    const run = data.workflow_runs?.find(
      (r: { name: string }) =>
        r.name?.includes(identifier)
    );
    return run?.id?.toString() || null;
  } catch {
    return null;
  }
}
