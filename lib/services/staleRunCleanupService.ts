/**
 * Stale Run Cleanup Service
 *
 * Recovers from stuck agent runs that never received a callback.
 * When a GitHub Actions workflow crashes or its callback fails,
 * the run stays "running" forever, consuming concurrency slots
 * and blocking issue progression.
 *
 * Threshold: 45 minutes (longest workflow timeout is 30min + 15min buffer).
 */

import { db } from "../db";
import { getStatusByName } from "./statusService";
import { getIssueForBoard } from "./issueService";
import { broadcastBoardEvent } from "./boardBroadcast";
import { notifyInternalAgentCompleted } from "./internalSlackService";
import { createHistoryEntry } from "./issueHistoryService";

const STALE_THRESHOLD_MINUTES = 45;

interface StaleRun {
  id: string;
  issue_id: string;
}

interface StaleIssue {
  id: string;
  identifier: string;
  workspace_id: string;
  status_id: string;
  status_name: string;
}

/**
 * Find and clean up agent runs that have been "running" for too long
 * without receiving a callback. Marks runs as failed, resets issues
 * to idle/Backlog, and sends Slack notifications.
 *
 * Returns the count of cleaned up runs.
 */
export async function cleanupStaleRuns(): Promise<number> {
  // 1. Find stale agent runs
  const staleRuns = await db.query<StaleRun>(
    `SELECT id, issue_id
     FROM dispatch_agent_runs
     WHERE status = 'running'
       AND started_at < NOW() - INTERVAL '${STALE_THRESHOLD_MINUTES} minutes'`
  );

  if (staleRuns.length === 0) return 0;

  console.log(`[StaleCleanup] Found ${staleRuns.length} stale runs to clean up`);

  // 2. Mark all stale runs as failed
  const staleRunIds = staleRuns.map((r) => r.id);
  await db.query(
    `UPDATE dispatch_agent_runs
     SET status = 'failed',
         completed_at = NOW(),
         outcome = 'failed',
         outcome_summary = 'Run timed out (no callback received after ${STALE_THRESHOLD_MINUTES}m)'
     WHERE id = ANY($1)`,
    [staleRunIds]
  );

  // 3. Find and reset stuck issues
  const staleIssueIds = [...new Set(staleRuns.map((r) => r.issue_id))];
  const staleIssues = await db.query<StaleIssue>(
    `SELECT i.id, i.identifier, i.workspace_id, i.status_id, s.name as status_name
     FROM dispatch_issue i
     JOIN dispatch_status s ON i.status_id = s.id
     WHERE i.id = ANY($1)
       AND i.spawn_status = 'running'`,
    [staleIssueIds]
  );

  for (const issue of staleIssues) {
    // Reset spawn/agent status
    await db.query(
      `UPDATE dispatch_issue
       SET spawn_status = 'failed',
           agent_status = 'idle',
           agent_completed_at = NOW()
       WHERE id = $1`,
      [issue.id]
    );

    // Move back to Backlog if currently in Investigating
    if (issue.status_name.toLowerCase() === "investigating") {
      const backlogStatus = await getStatusByName(issue.workspace_id, "Backlog");
      if (backlogStatus) {
        await db.query(
          `UPDATE dispatch_issue SET status_id = $1 WHERE id = $2`,
          [backlogStatus.id, issue.id]
        );

        // Broadcast board move
        try {
          const boardIssue = await getIssueForBoard(issue.identifier);
          if (boardIssue) {
            broadcastBoardEvent({
              type: "issue_moved",
              issue: boardIssue,
              previousStatusId: issue.status_id,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error(`[StaleCleanup] Failed to broadcast move for ${issue.identifier}:`, e);
        }
      }
    }

    // Record in issue history
    try {
      await createHistoryEntry({
        issueId: issue.id,
        action: "agent_completed",
        newValue: {
          spawn_status: "failed",
          agent_status: "idle",
          outcome: "failed",
          outcome_summary: `Run timed out (no callback received after ${STALE_THRESHOLD_MINUTES}m)`,
        },
        actorType: "system",
        actorName: "Stale Run Cleanup",
      });
    } catch (e) {
      console.error(`[StaleCleanup] Failed to record history for ${issue.identifier}:`, e);
    }

    // Notify Slack (safe even without a thread -- it no-ops if no internal_slack_ts)
    notifyInternalAgentCompleted(issue.id).catch((err) =>
      console.error(`[StaleCleanup] Slack notify failed for ${issue.identifier}:`, err)
    );

    console.log(`[StaleCleanup] Cleaned up ${issue.identifier}`);
  }

  console.log(
    `[StaleCleanup] Done: ${staleRuns.length} runs failed, ${staleIssues.length} issues reset`
  );

  return staleRuns.length;
}

// --- Throttled cleanup for use in canSpawn() ---

let lastCleanupAt = 0;
const CLEANUP_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Run stale cleanup if enough time has passed since the last run.
 * Designed to be called from canSpawn() without blocking on every check.
 */
export async function cleanupStaleRunsThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_THROTTLE_MS) return;
  lastCleanupAt = now;

  try {
    const count = await cleanupStaleRuns();
    if (count > 0) {
      console.log(`[StaleCleanup] Throttled cleanup freed ${count} stale runs`);
    }
  } catch (e) {
    console.error("[StaleCleanup] Throttled cleanup failed:", e);
  }
}
