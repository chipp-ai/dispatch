import { db, PoolClient } from "../db";
import { v4 as uuidv4 } from "uuid";
import { getOrCreateDefaultWorkspace } from "./workspaceService";
import { getStatusByName } from "./statusService";
import {
  updateIssue,
  getIssue,
  listIssues,
  getIssueForBoard,
} from "./issueService";
import { linkPRToIssue, updateIssuePR, getIssuePRs } from "./issuePRService";
import { findMatchingIssues, analyzeReleasePR } from "./prMatchingService";
import {
  recordStatusChange,
  recordReconciliation,
} from "./issueHistoryService";
import {
  listPRs,
  getMergedPRs,
  getPRCommits,
  type GitHubPR,
} from "./githubService";
import { broadcastBoardEvent } from "./boardBroadcast";

export type ReconciliationStatus = "running" | "completed" | "failed";

export interface Reconciliation {
  id: string;
  workspace_id: string;
  started_at: Date;
  completed_at: Date | null;
  prs_processed: number;
  issues_updated: number;
  status: ReconciliationStatus;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ReconciliationResult {
  id: string;
  prsProcessed: number;
  issuesUpdated: number;
  duration: number;
  changes: Array<{
    issueIdentifier: string;
    action: string;
    details: string;
  }>;
}

// Default GitHub repo config - should be set via environment
// GITHUB_REPO can be "owner/repo" format or just "repo" with separate GITHUB_OWNER
function getGitHubConfig() {
  const repoEnv = process.env.GITHUB_REPO || "";
  if (repoEnv.includes("/")) {
    const [owner, repo] = repoEnv.split("/");
    return { owner, repo };
  }
  return {
    owner: process.env.GITHUB_OWNER || "",
    repo: repoEnv,
  };
}

const { owner: GITHUB_OWNER, repo: GITHUB_REPO } = getGitHubConfig();

/**
 * Get the last reconciliation for a workspace
 */
export async function getLastReconciliation(
  workspaceId: string
): Promise<Reconciliation | null> {
  return db.queryOne<Reconciliation>(
    `SELECT * FROM dispatch_reconciliation
     WHERE workspace_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [workspaceId]
  );
}

/**
 * Get the date to fetch PRs from
 */
async function getReconciliationStartDate(workspaceId: string): Promise<Date> {
  const lastRecon = await getLastReconciliation(workspaceId);

  if (lastRecon?.completed_at) {
    return new Date(lastRecon.completed_at);
  }

  // Default to 7 days ago if no previous reconciliation
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return sevenDaysAgo;
}

/**
 * Start a new reconciliation
 */
async function startReconciliation(workspaceId: string): Promise<string> {
  const id = uuidv4();

  await db.query(
    `INSERT INTO dispatch_reconciliation (id, workspace_id, started_at, status)
     VALUES ($1, $2, NOW(), 'running')`,
    [id, workspaceId]
  );

  return id;
}

/**
 * Complete a reconciliation
 */
async function completeReconciliation(
  id: string,
  prsProcessed: number,
  issuesUpdated: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.query(
    `UPDATE dispatch_reconciliation
     SET completed_at = NOW(),
         prs_processed = $2,
         issues_updated = $3,
         status = 'completed',
         metadata = $4
     WHERE id = $1`,
    [
      id,
      prsProcessed,
      issuesUpdated,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

/**
 * Fail a reconciliation
 */
async function failReconciliation(id: string, error: string): Promise<void> {
  await db.query(
    `UPDATE dispatch_reconciliation
     SET completed_at = NOW(),
         status = 'failed',
         error = $2
     WHERE id = $1`,
    [id, error]
  );
}

/**
 * Run a full reconciliation
 */
export async function runReconciliation(): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const workspace = await getOrCreateDefaultWorkspace();
  const reconciliationId = await startReconciliation(workspace.id);

  const changes: ReconciliationResult["changes"] = [];
  let prsProcessed = 0;
  let issuesUpdated = 0;

  try {
    // Get the start date for fetching PRs
    const sinceDate = await getReconciliationStartDate(workspace.id);
    console.log(
      `[Reconciliation] Starting reconciliation since ${sinceDate.toISOString()}`
    );

    // Fetch all PRs updated since last reconciliation
    const allPRs = await listPRs(GITHUB_OWNER, GITHUB_REPO, {
      state: "all",
      limit: 100,
      since: sinceDate,
    });

    console.log(`[Reconciliation] Found ${allPRs.length} PRs to process`);

    // Process each PR
    for (const pr of allPRs) {
      prsProcessed++;

      // Build PR data for matching
      const prData = {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        url: pr.url,
        branchName: pr.headRef,
        baseBranch: pr.baseRef,
        headBranch: pr.headRef,
        author: pr.author,
      };

      // Check if this is a release PR
      const isReleasePR = pr.baseRef === "main" && pr.headRef === "staging";

      if (isReleasePR && pr.state === "merged") {
        // Handle release PR - move issues to "In Production"
        const commits = await getPRCommits(
          GITHUB_OWNER,
          GITHUB_REPO,
          pr.number
        );
        const prDataWithCommits = {
          ...prData,
          commits: commits.map((c) => ({ message: c.message, sha: c.sha })),
        };

        const matches = await analyzeReleasePR(workspace.id, prDataWithCommits);

        for (const match of matches) {
          const result = await updateIssueForRelease(
            workspace.id,
            match.issueId,
            match.issueIdentifier,
            pr
          );

          if (result) {
            issuesUpdated++;
            changes.push(result);
          }
        }
      } else {
        // Regular PR processing
        const matches = await findMatchingIssues(workspace.id, prData);

        for (const match of matches) {
          const result = await processMatchedPR(
            workspace.id,
            match.issueId,
            match.issueIdentifier,
            pr,
            match.aiSummary,
            match.confidence
          );

          if (result) {
            issuesUpdated++;
            changes.push(result);
          }
        }
      }
    }

    // Complete the reconciliation
    await completeReconciliation(
      reconciliationId,
      prsProcessed,
      issuesUpdated,
      {
        since: sinceDate.toISOString(),
        changes,
      }
    );

    const duration = Date.now() - startTime;
    console.log(
      `[Reconciliation] Completed in ${duration}ms - ${prsProcessed} PRs, ${issuesUpdated} issues updated`
    );

    return {
      id: reconciliationId,
      prsProcessed,
      issuesUpdated,
      duration,
      changes,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await failReconciliation(reconciliationId, errorMessage);
    throw error;
  }
}

/**
 * Process a matched PR and update the issue accordingly
 */
async function processMatchedPR(
  workspaceId: string,
  issueId: string,
  issueIdentifier: string,
  pr: GitHubPR,
  aiSummary: string,
  confidence: number
): Promise<ReconciliationResult["changes"][0] | null> {
  const issue = await getIssue(issueId);
  if (!issue) return null;

  // Link PR to issue
  await linkPRToIssue(
    {
      issueId,
      prNumber: pr.number,
      prUrl: pr.url,
      prTitle: pr.title,
      prStatus:
        pr.state === "merged"
          ? "merged"
          : pr.state === "open"
            ? "open"
            : "closed",
      branchName: pr.headRef,
      author: pr.author,
      baseBranch: pr.baseRef,
      headBranch: pr.headRef,
      aiSummary,
      matchConfidence: confidence,
    },
    "reconciliation",
    "Reconciliation Bot"
  );

  // Determine target status based on PR state
  let targetStatusName: string | null = null;

  if (pr.state === "merged") {
    if (pr.baseRef === "staging") {
      targetStatusName = "In Staging";
    } else if (pr.baseRef === "main") {
      targetStatusName = "In Production";
    }
  } else if (pr.state === "open") {
    // Only move to "In Review" if issue is before that status
    const earlyStatuses = ["backlog", "triage", "todo", "in progress"];
    if (earlyStatuses.includes(issue.status.name.toLowerCase())) {
      targetStatusName = "In Review";
    }
  }

  if (
    targetStatusName &&
    issue.status.name.toLowerCase() !== targetStatusName.toLowerCase()
  ) {
    const targetStatus = await getStatusByName(workspaceId, targetStatusName);

    if (targetStatus) {
      await updateIssue(issueId, { statusId: targetStatus.id });

      await recordStatusChange(
        issueId,
        issue.status.name,
        targetStatusName,
        "reconciliation",
        "Reconciliation Bot"
      );

      await recordReconciliation(issueId, {
        pr_number: pr.number,
        old_status: issue.status.name,
        new_status: targetStatusName,
      });

      const boardIssue = await getIssueForBoard(issueId);
      if (boardIssue) {
        broadcastBoardEvent({
          type: "issue_moved",
          issue: boardIssue,
          previousStatusId: issue.status.id,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        issueIdentifier,
        action: "status_changed",
        details: `${issue.status.name} → ${targetStatusName} (PR #${pr.number})`,
      };
    }
  }

  // Even if status didn't change, we linked the PR
  return {
    issueIdentifier,
    action: "pr_linked",
    details: `Linked PR #${pr.number}`,
  };
}

/**
 * Update issue for a release PR (staging -> main merge)
 */
async function updateIssueForRelease(
  workspaceId: string,
  issueId: string,
  issueIdentifier: string,
  pr: GitHubPR
): Promise<ReconciliationResult["changes"][0] | null> {
  const issue = await getIssue(issueId);
  if (!issue) return null;

  // Move to "In Production"
  const inProductionStatus = await getStatusByName(
    workspaceId,
    "In Production"
  );
  if (!inProductionStatus) return null;

  if (issue.status.name.toLowerCase() === "in production") {
    return null; // Already in production
  }

  await updateIssue(issueId, { statusId: inProductionStatus.id });

  await recordStatusChange(
    issueId,
    issue.status.name,
    "In Production",
    "reconciliation",
    "Reconciliation Bot (Release)"
  );

  await recordReconciliation(issueId, {
    release_pr: pr.number,
    old_status: issue.status.name,
    new_status: "In Production",
  });

  const boardIssue = await getIssueForBoard(issueId);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_moved",
      issue: boardIssue,
      previousStatusId: issue.status.id,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    issueIdentifier,
    action: "deployed",
    details: `Deployed to production via release PR #${pr.number}`,
  };
}

/**
 * Get reconciliation history
 */
export async function getReconciliationHistory(
  workspaceId: string,
  limit: number = 10
): Promise<Reconciliation[]> {
  return db.query<Reconciliation>(
    `SELECT * FROM dispatch_reconciliation
     WHERE workspace_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );
}
