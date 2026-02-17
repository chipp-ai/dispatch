import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyGitHubWebhookSignature } from "@/lib/utils/webhookVerification";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import { getStatusByName } from "@/lib/services/statusService";
import {
  updateIssue,
  getIssue,
  getIssueForBoard,
} from "@/lib/services/issueService";
import {
  linkPRToIssue,
  updateIssuePR,
  getPRByNumber,
} from "@/lib/services/issuePRService";
import {
  findMatchingIssues,
  analyzeReleasePR,
  determineStatusOnMerge,
} from "@/lib/services/prMatchingService";
import { recordStatusChange } from "@/lib/services/issueHistoryService";
import { broadcastBoardEvent } from "@/lib/services/boardBroadcast";
import {
  extractSentryIdsFromPR,
  findIssuesForSentryIds,
  extractDispatchIssueIdsFromPR,
  findIssuesForDispatchIds,
  createFixAttempt,
  markFixAttemptsDeployed,
} from "@/lib/services/fixTrackingService";

// GitHub webhook event types
interface GitHubPREvent {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    merged: boolean;
    merged_at: string | null;
    merge_commit_sha: string | null;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
    user: {
      login: string;
    };
  };
  repository: {
    full_name: string;
    owner: {
      login: string;
    };
    name: string;
  };
}

interface GitHubWorkflowRunEvent {
  action: "completed" | "requested" | "in_progress";
  workflow_run: {
    id: number;
    name: string;
    head_sha: string;
    head_branch: string;
    status: "completed" | "in_progress" | "queued";
    conclusion:
      | "success"
      | "failure"
      | "cancelled"
      | "skipped"
      | "timed_out"
      | null;
    created_at: string;
    updated_at: string;
    html_url: string;
  };
  repository: {
    full_name: string;
  };
}

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  // Verify webhook signature
  if (!WEBHOOK_SECRET) {
    console.error("GITHUB_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("x-hub-signature-256");
  const payload = await request.text();

  if (!verifyGitHubWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
    console.error("Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the event
  let event: GitHubPREvent | GitHubWorkflowRunEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Check event type
  const eventType = request.headers.get("x-github-event");

  if (eventType === "ping") {
    return NextResponse.json({
      success: true,
      message: "Pong! GitHub webhook configured successfully.",
    });
  }

  if (eventType === "workflow_run") {
    return handleWorkflowRunEvent(event as GitHubWorkflowRunEvent);
  }

  if (eventType !== "pull_request") {
    // We only care about pull_request and workflow_run events for now
    return NextResponse.json({ message: "Event ignored" }, { status: 200 });
  }

  const prEvent = event as GitHubPREvent;
  console.log(
    `[GitHub Webhook] PR #${prEvent.number} - action: ${prEvent.action}`
  );

  try {
    const workspace = await getOrCreateDefaultWorkspace();

    // Build PR data for matching
    const prData = {
      number: prEvent.pull_request.number,
      title: prEvent.pull_request.title,
      body: prEvent.pull_request.body,
      url: prEvent.pull_request.html_url,
      branchName: prEvent.pull_request.head.ref,
      baseBranch: prEvent.pull_request.base.ref,
      headBranch: prEvent.pull_request.head.ref,
      author: prEvent.pull_request.user.login,
      mergeCommitSha: prEvent.pull_request.merge_commit_sha,
      mergedAt: prEvent.pull_request.merged_at,
    };

    // Handle different PR actions
    switch (prEvent.action) {
      case "opened":
      case "reopened":
        await handlePROpened(workspace.id, prData);
        break;

      case "closed":
        if (prEvent.pull_request.merged) {
          await handlePRMerged(
            workspace.id,
            prData,
            prEvent.pull_request.merged_at
          );
        } else {
          await handlePRClosed(workspace.id, prData);
        }
        break;

      case "edited":
        // Title or description changed, might affect matching
        await handlePREdited(workspace.id, prData);
        break;

      default:
        console.log(`[GitHub Webhook] Ignoring action: ${prEvent.action}`);
    }

    return NextResponse.json({ message: "Processed" }, { status: 200 });
  } catch (error) {
    console.error("[GitHub Webhook] Error processing event:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// Handle workflow run events - detect when production deployment completes
async function handleWorkflowRunEvent(
  payload: GitHubWorkflowRunEvent
): Promise<NextResponse> {
  const { action, workflow_run: run } = payload;

  console.log(
    `[GitHub Webhook] Workflow run: action=${action}, name="${run.name}", ` +
      `branch=${run.head_branch}, status=${run.status}, conclusion=${run.conclusion}`
  );

  // Only care about completed workflow runs
  if (action !== "completed") {
    return NextResponse.json({
      success: true,
      message: `Ignored workflow_run action: ${action}`,
    });
  }

  // Only care about successful completion
  if (run.conclusion !== "success") {
    console.log(
      `[GitHub Webhook] Workflow ${run.name} did not succeed: ${run.conclusion}`
    );
    return NextResponse.json({
      success: true,
      message: `Ignored: workflow conclusion was ${run.conclusion}`,
    });
  }

  // Only care about production deployment workflow on main branch
  const isProductionDeploy =
    run.name.toLowerCase().includes("production") ||
    run.name.toLowerCase().includes("deploy-prod");
  const isMainBranch =
    run.head_branch === "main" || run.head_branch === "master";

  if (!isProductionDeploy || !isMainBranch) {
    return NextResponse.json({
      success: true,
      message: `Ignored: not production deploy (name="${run.name}", branch=${run.head_branch})`,
    });
  }

  console.log(
    `[GitHub Webhook] Production deployment completed! SHA: ${run.head_sha}`
  );

  // Mark all awaiting fix attempts as deployed
  const deployedAt = new Date(run.updated_at);
  const markedCount = await markFixAttemptsDeployed(run.head_sha, deployedAt);

  return NextResponse.json({
    success: true,
    message: `Marked ${markedCount} fix attempt(s) as deployed`,
    deployment: {
      sha: run.head_sha,
      workflow: run.name,
      completedAt: deployedAt.toISOString(),
    },
  });
}

interface PRData {
  number: number;
  title: string;
  body: string | null;
  url: string;
  branchName: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  mergeCommitSha?: string | null;
  mergedAt?: string | null;
}

async function handlePROpened(workspaceId: string, pr: PRData) {
  console.log(`[GitHub Webhook] Processing PR opened: #${pr.number}`);

  // Find matching issues
  const matches = await findMatchingIssues(workspaceId, pr);

  if (matches.length === 0) {
    console.log(
      `[GitHub Webhook] No matching issues found for PR #${pr.number}`
    );
    return;
  }

  for (const match of matches) {
    console.log(
      `[GitHub Webhook] Matched PR #${pr.number} to ${match.issueIdentifier} (confidence: ${match.confidence})`
    );

    // Link PR to issue
    await linkPRToIssue(
      {
        issueId: match.issueId,
        prNumber: pr.number,
        prUrl: pr.url,
        prTitle: pr.title,
        prStatus: "open",
        branchName: pr.branchName,
        author: pr.author,
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
        aiSummary: match.aiSummary,
        matchConfidence: match.confidence,
      },
      "github_webhook",
      "GitHub Webhook"
    );

    // Update issue status to "In Review" if appropriate
    const issue = await getIssue(match.issueId);
    if (!issue) continue;

    // Only move to "In Review" if not already further along
    const statusOrder = ["backlog", "investigating", "needs review", "in progress"];

    if (statusOrder.includes(issue.status.name.toLowerCase())) {
      const inReviewStatus = await getStatusByName(workspaceId, "In Review");
      if (inReviewStatus) {
        await updateIssue(match.issueId, { statusId: inReviewStatus.id });

        // Record in history
        await recordStatusChange(
          match.issueId,
          issue.status.name,
          "In Review",
          "github_webhook",
          "GitHub Webhook"
        );

        // Broadcast update
        const boardIssue = await getIssueForBoard(match.issueId);
        if (boardIssue) {
          broadcastBoardEvent({
            type: "issue_moved",
            issue: boardIssue,
            previousStatusId: issue.status.id,
            timestamp: new Date().toISOString(),
          });
        }

        console.log(
          `[GitHub Webhook] Updated ${match.issueIdentifier} status to "In Review"`
        );
      }
    }
  }
}

async function handlePRMerged(
  workspaceId: string,
  pr: PRData,
  mergedAt: string | null
) {
  console.log(`[GitHub Webhook] Processing PR merged: #${pr.number}`);

  // Check if this is a release PR (staging -> main)
  if (pr.baseBranch === "main" && pr.headBranch === "staging") {
    await handleReleasePRMerged(workspaceId, pr);
    return;
  }

  // Handle fix tracking for PRs merged to staging with Sentry IDs
  if (pr.baseBranch === "staging") {
    await handleFixTrackingForMergedPR(pr);
  }

  // Regular PR merged to staging
  // First, check if we already have this PR linked
  const existingPR = await getPRByNumber(pr.number);

  if (existingPR) {
    // Update PR status
    await updateIssuePR(
      existingPR.id,
      {
        prStatus: "merged",
        mergedAt: mergedAt ? new Date(mergedAt) : new Date(),
      },
      "github_webhook",
      "GitHub Webhook"
    );

    // Move issue to "Done" when PR is merged
    const issue = await getIssue(existingPR.issue_id);
    if (issue) {
      const doneStatus = await getStatusByName(workspaceId, "Done");
      if (doneStatus && issue.status.name.toLowerCase() !== "done") {
        await updateIssue(existingPR.issue_id, {
          statusId: doneStatus.id,
        });

        await recordStatusChange(
          existingPR.issue_id,
          issue.status.name,
          "Done",
          "github_webhook",
          "GitHub Webhook"
        );

        const boardIssue = await getIssueForBoard(existingPR.issue_id);
        if (boardIssue) {
          broadcastBoardEvent({
            type: "issue_moved",
            issue: boardIssue,
            previousStatusId: issue.status.id,
            timestamp: new Date().toISOString(),
          });
        }

        console.log(
          `[GitHub Webhook] Updated ${issue.identifier} status to "Done"`
        );
      }
    }
  } else {
    // PR wasn't linked yet, try to find matches now
    const matches = await findMatchingIssues(workspaceId, pr);

    for (const match of matches) {
      // Link PR
      await linkPRToIssue(
        {
          issueId: match.issueId,
          prNumber: pr.number,
          prUrl: pr.url,
          prTitle: pr.title,
          prStatus: "merged",
          branchName: pr.branchName,
          author: pr.author,
          baseBranch: pr.baseBranch,
          headBranch: pr.headBranch,
          aiSummary: match.aiSummary,
          matchConfidence: match.confidence,
        },
        "github_webhook",
        "GitHub Webhook"
      );

      // Move to "Done" when PR is merged
      const issue = await getIssue(match.issueId);
      if (!issue) continue;

      const doneStatus = await getStatusByName(workspaceId, "Done");
      if (doneStatus && issue.status.name.toLowerCase() !== "done") {
        await updateIssue(match.issueId, { statusId: doneStatus.id });

        await recordStatusChange(
          match.issueId,
          issue.status.name,
          "Done",
          "github_webhook",
          "GitHub Webhook"
        );

        const boardIssue = await getIssueForBoard(match.issueId);
        if (boardIssue) {
          broadcastBoardEvent({
            type: "issue_moved",
            issue: boardIssue,
            previousStatusId: issue.status.id,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }
}

// Handle fix tracking for PRs that reference Sentry issue IDs or Dispatch issue identifiers
async function handleFixTrackingForMergedPR(pr: PRData) {
  const issueIdsToTrack: Array<{ issueId: string; label: string }> = [];

  // 1. Extract Sentry issue IDs from PR title and body
  const sentryIds = extractSentryIdsFromPR(pr.title, pr.body);
  if (sentryIds.length > 0) {
    console.log(
      `[GitHub Webhook] Found Sentry IDs in PR #${pr.number}: ${sentryIds.join(", ")}`
    );
    const sentryLinked = await findIssuesForSentryIds(sentryIds);
    for (const linked of sentryLinked) {
      issueIdsToTrack.push({
        issueId: linked.issueId,
        label: `Sentry ${linked.sentryId}`,
      });
    }
  }

  // 2. Extract issue identifiers (from auto-investigate PRs)
  const dispatchIds = extractDispatchIssueIdsFromPR(pr.title, pr.body);
  if (dispatchIds.length > 0) {
    console.log(
      `[GitHub Webhook] Found issue IDs in PR #${pr.number}: ${dispatchIds.join(", ")}`
    );
    const dispatchLinked = await findIssuesForDispatchIds(dispatchIds);
    for (const linked of dispatchLinked) {
      // Avoid duplicates if same issue found via both Sentry and issue ID
      if (!issueIdsToTrack.some((t) => t.issueId === linked.issueId)) {
        issueIdsToTrack.push({
          issueId: linked.issueId,
          label: linked.identifier,
        });
      }
    }
  }

  if (issueIdsToTrack.length === 0) {
    console.log(
      `[GitHub Webhook] No trackable issue IDs found in PR #${pr.number}: "${pr.title}"`
    );
    return;
  }

  // Create fix attempts for each linked issue
  for (const tracked of issueIdsToTrack) {
    try {
      if (!pr.mergeCommitSha || !pr.mergedAt) {
        console.log(`[GitHub Webhook] Missing merge info for PR #${pr.number}`);
        continue;
      }

      const fixAttempt = await createFixAttempt({
        issueId: tracked.issueId,
        prNumber: pr.number,
        prUrl: pr.url,
        prTitle: pr.title,
        prBody: pr.body || undefined,
        mergedAt: new Date(pr.mergedAt),
        mergedSha: pr.mergeCommitSha,
      });

      console.log(
        `[GitHub Webhook] Created fix attempt ${fixAttempt.id} for ${tracked.label} from PR #${pr.number}`
      );
    } catch (error) {
      console.error(
        `[GitHub Webhook] Error creating fix attempt for ${tracked.label}:`,
        error
      );
    }
  }
}

async function handleReleasePRMerged(workspaceId: string, pr: PRData) {
  console.log(`[GitHub Webhook] Processing release PR merged: #${pr.number}`);

  // Find all issues that should move to "Done"
  const matches = await analyzeReleasePR(workspaceId, pr);

  const doneStatus = await getStatusByName(workspaceId, "Done");
  if (!doneStatus) {
    console.error('[GitHub Webhook] "Done" status not found');
    return;
  }

  for (const match of matches) {
    const issue = await getIssue(match.issueId);
    if (!issue) continue;

    if (issue.status.name.toLowerCase() === "done") continue;

    // Move to "Done"
    await updateIssue(match.issueId, { statusId: doneStatus.id });

    await recordStatusChange(
      match.issueId,
      issue.status.name,
      "Done",
      "github_webhook",
      "GitHub Webhook (Release)"
    );

    const boardIssue = await getIssueForBoard(match.issueId);
    if (boardIssue) {
      broadcastBoardEvent({
        type: "issue_moved",
        issue: boardIssue,
        previousStatusId: issue.status.id,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(
      `[GitHub Webhook] Moved ${match.issueIdentifier} to "Done"`
    );
  }
}

async function handlePRClosed(workspaceId: string, pr: PRData) {
  console.log(
    `[GitHub Webhook] Processing PR closed (not merged): #${pr.number}`
  );

  // Just update the PR status, don't change issue status
  const existingPR = await getPRByNumber(pr.number);

  if (existingPR) {
    await updateIssuePR(
      existingPR.id,
      { prStatus: "closed" },
      "github_webhook",
      "GitHub Webhook"
    );
  }
}

async function handlePREdited(workspaceId: string, pr: PRData) {
  console.log(`[GitHub Webhook] Processing PR edited: #${pr.number}`);

  // Check if this PR is already linked
  const existingPR = await getPRByNumber(pr.number);

  if (existingPR) {
    // Update title
    await updateIssuePR(
      existingPR.id,
      { prTitle: pr.title },
      "github_webhook",
      "GitHub Webhook"
    );
  } else {
    // Try to find matches with the new title/body
    const matches = await findMatchingIssues(workspaceId, pr);

    for (const match of matches) {
      await linkPRToIssue(
        {
          issueId: match.issueId,
          prNumber: pr.number,
          prUrl: pr.url,
          prTitle: pr.title,
          prStatus: "open",
          branchName: pr.branchName,
          author: pr.author,
          baseBranch: pr.baseBranch,
          headBranch: pr.headBranch,
          aiSummary: match.aiSummary,
          matchConfidence: match.confidence,
        },
        "github_webhook",
        "GitHub Webhook"
      );
    }
  }
}

// GET /api/github/webhook - Health check / verification endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/github/webhook",
    description: "GitHub webhook endpoint for PR tracking and fix verification",
    supported_events: [
      "pull_request (opened, merged, closed, edited)",
      "workflow_run (production deployment completion)",
      "ping",
    ],
    env_configured: {
      GITHUB_WEBHOOK_SECRET: !!process.env.GITHUB_WEBHOOK_SECRET,
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      GITHUB_REPO: process.env.GITHUB_REPO || "(not set)",
    },
  });
}
