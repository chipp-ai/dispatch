/**
 * Fix Tracking Service
 *
 * Tracks PR fix attempts for issues (from Sentry or Loki) and verifies fixes
 * after deployment. Uses a hybrid event-driven approach:
 * - Sentry webhook detects failures immediately (via sentry_event_log)
 * - Loki webhook detects failures immediately (via external_issue.last_seen_at)
 * - Lazy verification when issue is accessed or status changed
 */

import { db } from "../db";
import { v4 as uuidv4 } from "uuid";
import { createComment } from "./commentService";
import { updateIssue, getIssue } from "./issueService";
import { getLabelByName, createLabel } from "./labelService";
import { getStatuses } from "./workspaceService";
import { findByExternalId } from "./externalIssueService";

// Verification window in hours (48 hours)
const VERIFICATION_WINDOW_HOURS = 48;

// Fix attempt verification statuses
export type FixVerificationStatus =
  | "awaiting_deploy"
  | "monitoring"
  | "verified"
  | "failed";

export interface FixAttempt {
  id: string;
  issue_id: string;
  pr_number: number;
  pr_url: string;
  pr_title: string;
  pr_body: string | null;
  merged_at: Date;
  merged_sha: string;
  deployed_sha: string | null;
  deployed_at: Date | null;
  verification_status: FixVerificationStatus;
  verification_deadline: Date | null;
  verification_checked_at: Date | null;
  failure_reason: string | null;
  sentry_events_post_deploy: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFixAttemptInput {
  issueId: string;
  prNumber: number;
  prUrl: string;
  prTitle: string;
  prBody?: string;
  mergedAt: Date;
  mergedSha: string;
}

export interface MarkDeployedInput {
  deployedSha: string;
  deployedAt: Date;
}

// ============================================
// Pattern Matching for Sentry Issue IDs
// ============================================

/**
 * Extract Sentry issue IDs from PR title and body
 * Matches patterns like: APPCHIPPAI-123, CHIPP-456, PROJECT-789
 */
export function extractSentryIdsFromPR(
  title: string,
  body: string | null
): string[] {
  const combined = `${title}\n${body || ""}`;

  // Pattern to match Sentry short IDs (PROJECT-NUMBER format)
  // Common patterns: APPCHIPPAI-123, CHIPP-ADMIN-456, etc.
  const patterns = [
    /\bAPPCHIPPAI-\d+\b/gi, // Our main Sentry project
    /\bCHIPP-[A-Z]+-\d+\b/gi, // Sub-projects like CHIPP-ADMIN-123
    /\bfixes?\s+(?:sentry\s+)?#?(\d+)\b/gi, // "fixes #123" or "fixes sentry #123"
    /\bresolves?\s+(?:sentry\s+)?#?(\d+)\b/gi, // "resolves #123"
  ];

  const ids = new Set<string>();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(combined)) !== null) {
      // For "fixes #123" patterns, we get the numeric ID
      if (match[1]) {
        ids.add(match[1]);
      } else {
        ids.add(match[0].toUpperCase());
      }
    }
  }

  return Array.from(ids);
}

/**
 * Extract Dispatch issue identifiers from PR title and body.
 * Matches patterns like: PREFIX-123, [PREFIX-456]
 * Used by auto-investigate PRs: "fix(source): title [DISPATCH-123]"
 *
 * Matches any UPPERCASE-DIGITS pattern to support any configured issue prefix.
 */
export function extractDispatchIssueIdsFromPR(
  title: string,
  body: string | null
): string[] {
  const combined = `${title}\n${body || ""}`;

  // Match any UPPERCASE_LETTERS-DIGITS identifier pattern
  // This handles any configured issue prefix (DISPATCH-123, MYPROJECT-123, etc.)
  const pattern = /\b([A-Z]+-\d+)\b/g;
  const ids = new Set<string>();

  let match;
  while ((match = pattern.exec(combined)) !== null) {
    ids.add(match[0].toUpperCase());
  }

  return Array.from(ids);
}

/**
 * Find dispatch issues by their identifier (PREFIX-123 format)
 */
export async function findIssuesForDispatchIds(
  dispatchIds: string[]
): Promise<Array<{ issueId: string; identifier: string }>> {
  if (dispatchIds.length === 0) return [];

  const results: Array<{ issueId: string; identifier: string }> = [];

  for (const identifier of dispatchIds) {
    const issue = await db.queryOne<{ id: string; identifier: string }>(
      `SELECT id, identifier FROM dispatch_issue WHERE identifier = $1`,
      [identifier]
    );

    if (issue) {
      results.push({ issueId: issue.id, identifier: issue.identifier });
    }
  }

  return results;
}

/**
 * Find Dispatch issues linked to the given Sentry IDs
 */
export async function findIssuesForSentryIds(
  sentryIds: string[]
): Promise<
  Array<{ issueId: string; sentryId: string; externalIssueId: string }>
> {
  if (sentryIds.length === 0) return [];

  const results: Array<{
    issueId: string;
    sentryId: string;
    externalIssueId: string;
  }> = [];

  for (const sentryId of sentryIds) {
    // Try to find by short ID (APPCHIPPAI-123 format)
    const byShortId = await db.query<{
      id: string;
      issue_id: string;
      metadata: { shortId?: string };
    }>(
      `SELECT id, issue_id, metadata FROM dispatch_external_issue
       WHERE source = 'sentry' AND metadata->>'shortId' = $1`,
      [sentryId]
    );

    if (byShortId.length > 0) {
      results.push({
        issueId: byShortId[0].issue_id,
        sentryId,
        externalIssueId: byShortId[0].id,
      });
      continue;
    }

    // Try to find by numeric Sentry ID
    const byNumericId = await findByExternalId("sentry", sentryId);
    if (byNumericId) {
      results.push({
        issueId: byNumericId.issue_id,
        sentryId,
        externalIssueId: byNumericId.id,
      });
    }
  }

  return results;
}

// ============================================
// Fix Attempt CRUD Operations
// ============================================

/**
 * Create a new fix attempt record
 */
export async function createFixAttempt(
  input: CreateFixAttemptInput
): Promise<FixAttempt> {
  const id = uuidv4();

  const result = await db.query<FixAttempt>(
    `INSERT INTO dispatch_fix_attempt
     (id, issue_id, pr_number, pr_url, pr_title, pr_body, merged_at, merged_sha, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'awaiting_deploy')
     RETURNING *`,
    [
      id,
      input.issueId,
      input.prNumber,
      input.prUrl,
      input.prTitle,
      input.prBody || null,
      input.mergedAt,
      input.mergedSha,
    ]
  );

  console.log(
    `[Fix Tracking] Created fix attempt for issue ${input.issueId} from PR #${input.prNumber}`
  );

  return result[0];
}

/**
 * Get all fix attempts for an issue
 */
export async function getFixAttemptsForIssue(
  issueId: string
): Promise<FixAttempt[]> {
  return db.query<FixAttempt>(
    `SELECT * FROM dispatch_fix_attempt WHERE issue_id = $1 ORDER BY created_at DESC`,
    [issueId]
  );
}

/**
 * Get the latest fix attempt for an issue
 */
export async function getLatestFixAttempt(
  issueId: string
): Promise<FixAttempt | null> {
  return db.queryOne<FixAttempt>(
    `SELECT * FROM dispatch_fix_attempt WHERE issue_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [issueId]
  );
}

/**
 * Get all fix attempts awaiting deployment
 */
export async function getFixAttemptsAwaitingDeploy(): Promise<FixAttempt[]> {
  return db.query<FixAttempt>(
    `SELECT * FROM dispatch_fix_attempt WHERE verification_status = 'awaiting_deploy'`
  );
}

/**
 * Get all fix attempts currently being monitored
 */
export async function getFixAttemptsInMonitoring(): Promise<FixAttempt[]> {
  return db.query<FixAttempt>(
    `SELECT * FROM dispatch_fix_attempt WHERE verification_status = 'monitoring'`
  );
}

// ============================================
// Deployment Tracking
// ============================================

/**
 * Mark fix attempts as deployed when we receive workflow completion
 * This is called when the deploy-prod workflow completes successfully
 */
export async function markFixAttemptsDeployed(
  deployedSha: string,
  deployedAt: Date
): Promise<number> {
  const verificationDeadline = new Date(
    deployedAt.getTime() + VERIFICATION_WINDOW_HOURS * 60 * 60 * 1000
  );

  // Find all fix attempts where the merged_sha is an ancestor of deployed_sha
  // For simplicity, we mark all awaiting_deploy attempts as deployed
  // In production, you might want to verify the SHA relationship via git
  const result = await db.query<{ count: number }>(
    `UPDATE dispatch_fix_attempt
     SET deployed_sha = $1,
         deployed_at = $2,
         verification_status = 'monitoring',
         verification_deadline = $3,
         updated_at = NOW()
     WHERE verification_status = 'awaiting_deploy'
     RETURNING id`,
    [deployedSha, deployedAt, verificationDeadline]
  );

  const count = result.length;
  if (count > 0) {
    console.log(
      `[Fix Tracking] Marked ${count} fix attempts as deployed (SHA: ${deployedSha.substring(0, 7)})`
    );
  }

  return count;
}

// ============================================
// Verification Logic (Lazy Evaluation)
// ============================================

/**
 * Check if a fix attempt should be verified
 * Called when an issue is accessed or when status is changed
 */
export async function checkFixVerification(
  issueId: string
): Promise<FixAttempt | null> {
  const fixAttempt = await getLatestFixAttempt(issueId);
  if (!fixAttempt) return null;

  // Only check if in monitoring status
  if (fixAttempt.verification_status !== "monitoring") {
    return fixAttempt;
  }

  // Check if we've passed the verification deadline
  if (
    fixAttempt.verification_deadline &&
    new Date() >= fixAttempt.verification_deadline
  ) {
    // Time's up - check for Sentry events
    const hasNewErrors = await checkForPostDeployErrors(
      issueId,
      fixAttempt.deployed_at!
    );

    if (hasNewErrors.hasErrors) {
      await markFixAsFailed(
        fixAttempt.id,
        `Error source reported ${hasNewErrors.eventCount} new events after deployment`,
        hasNewErrors.eventCount
      );
    } else {
      await markFixAsVerified(fixAttempt.id);
    }

    // Refresh and return updated record
    return getLatestFixAttempt(issueId);
  }

  // Update last checked timestamp
  await db.query(
    `UPDATE dispatch_fix_attempt SET verification_checked_at = NOW() WHERE id = $1`,
    [fixAttempt.id]
  );

  return fixAttempt;
}

/**
 * Check for errors that occurred after deployment.
 * Checks both Sentry event logs and Loki external issue activity.
 */
async function checkForPostDeployErrors(
  issueId: string,
  deployedAt: Date
): Promise<{ hasErrors: boolean; eventCount: number }> {
  // Check 1: Sentry event logs after deployment
  const sentryEventLogs = await db.query<{
    event_count: number;
    created_at: Date;
  }>(
    `SELECT sel.event_count, sel.created_at
     FROM dispatch_sentry_event_log sel
     JOIN dispatch_external_issue ei ON sel.external_issue_id = ei.id
     WHERE ei.issue_id = $1
       AND sel.created_at > $2
     ORDER BY sel.created_at DESC
     LIMIT 1`,
    [issueId, deployedAt]
  );

  if (sentryEventLogs.length > 0) {
    return { hasErrors: true, eventCount: sentryEventLogs[0].event_count };
  }

  // Check 2: Loki external issues with activity after deployment
  const lokiActivity = await db.queryOne<{
    event_count: number;
    last_seen_at: Date;
  }>(
    `SELECT event_count, last_seen_at
     FROM dispatch_external_issue
     WHERE issue_id = $1
       AND source = 'loki'
       AND last_seen_at > $2`,
    [issueId, deployedAt]
  );

  if (lokiActivity) {
    return { hasErrors: true, eventCount: lokiActivity.event_count };
  }

  return { hasErrors: false, eventCount: 0 };
}

/**
 * Mark a fix attempt as verified (successful)
 */
export async function markFixAsVerified(fixAttemptId: string): Promise<void> {
  await db.query(
    `UPDATE dispatch_fix_attempt
     SET verification_status = 'verified',
         verification_checked_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [fixAttemptId]
  );

  console.log(`[Fix Tracking] Fix attempt ${fixAttemptId} marked as VERIFIED`);
}

/**
 * Mark a fix attempt as failed and trigger failure workflow
 */
export async function markFixAsFailed(
  fixAttemptId: string,
  reason: string,
  eventCount: number
): Promise<void> {
  // Update the fix attempt record
  await db.query(
    `UPDATE dispatch_fix_attempt
     SET verification_status = 'failed',
         failure_reason = $2,
         sentry_events_post_deploy = $3,
         verification_checked_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [fixAttemptId, reason, eventCount]
  );

  // Get the fix attempt to find the issue
  const fixAttempt = await db.queryOne<FixAttempt>(
    `SELECT * FROM dispatch_fix_attempt WHERE id = $1`,
    [fixAttemptId]
  );

  if (fixAttempt) {
    await handleFailedFix(fixAttempt);
  }

  console.log(
    `[Fix Tracking] Fix attempt ${fixAttemptId} marked as FAILED: ${reason}`
  );
}

/**
 * Handle the workflow when a fix is detected as failed
 * 1. Add failure comment
 * 2. Move to Backlog
 * 3. Increase priority
 * 4. Add "Fix Failed" label
 */
async function handleFailedFix(fixAttempt: FixAttempt): Promise<void> {
  const issue = await getIssue(fixAttempt.issue_id);
  if (!issue) return;

  // 1. Add a comment explaining the failure
  await createComment({
    issueId: fixAttempt.issue_id,
    body: `## Fix Verification Failed

The fix attempt from PR #${fixAttempt.pr_number} did not resolve this issue.

**Details:**
- **PR:** [#${fixAttempt.pr_number}](${fixAttempt.pr_url}) - ${fixAttempt.pr_title}
- **Deployed:** ${fixAttempt.deployed_at?.toLocaleString()}
- **Reason:** ${fixAttempt.failure_reason}
- **Events after deploy:** ${fixAttempt.sentry_events_post_deploy}

This issue has been moved back to Backlog with increased priority. Please investigate and attempt another fix.`,
  });

  // 2. Get the Backlog status
  const statuses = await getStatuses(issue.workspace_id);
  const backlogStatus = statuses.find((s) => s.name === "Backlog");

  // 3. Get or create "Fix Failed" label
  let fixFailedLabel = await getLabelByName(issue.workspace_id, "Fix Failed");
  if (!fixFailedLabel) {
    fixFailedLabel = await createLabel(issue.workspace_id, {
      name: "Fix Failed",
      color: "#DC2626", // Red color
    });
  }

  // 4. Increase priority (P3 -> P2 -> P1, P4 -> P3)
  const priorityEscalation: Record<string, string> = {
    P4: "P3",
    P3: "P2",
    P2: "P1",
    P1: "P1", // Already highest
  };
  const newPriority = priorityEscalation[issue.priority] || "P2";

  // 5. Update the issue
  await updateIssue(fixAttempt.issue_id, {
    statusId: backlogStatus?.id,
    priority: newPriority as "P1" | "P2" | "P3" | "P4",
    // Note: Adding labels requires a separate operation
    // We'll handle this in the updateIssue function or separately
  });

  // 6. Add the label
  await db.query(
    `INSERT INTO dispatch_issue_label (issue_id, label_id)
     VALUES ($1, $2)
     ON CONFLICT (issue_id, label_id) DO NOTHING`,
    [fixAttempt.issue_id, fixFailedLabel.id]
  );

  console.log(
    `[Fix Tracking] Failed fix workflow completed for issue ${issue.identifier}`
  );
}

// ============================================
// Immediate Failure Detection (from Sentry webhook)
// ============================================

/**
 * Called when Sentry webhook reports a new event for a tracked issue
 * This provides immediate failure detection without waiting for the deadline
 */
export async function handleSentryEventForMonitoredFix(
  issueId: string,
  sentryEventCount: number,
  sentryShortId: string
): Promise<void> {
  const fixAttempt = await getLatestFixAttempt(issueId);
  if (!fixAttempt) return;

  // Only relevant for fixes in monitoring status
  if (fixAttempt.verification_status !== "monitoring") return;

  // If we received a Sentry event after deployment, the fix failed
  if (fixAttempt.deployed_at) {
    await markFixAsFailed(
      fixAttempt.id,
      `Sentry issue ${sentryShortId} reoccurred after deployment`,
      sentryEventCount
    );
  }
}

/**
 * Called when Loki webhook receives a deduplicated event for a tracked issue.
 * This provides immediate failure detection for Loki-sourced issues.
 */
export async function handleLokiEventForMonitoredFix(
  issueId: string,
  eventCount: number,
  fingerprint: string
): Promise<void> {
  const fixAttempt = await getLatestFixAttempt(issueId);
  if (!fixAttempt) return;

  // Only relevant for fixes in monitoring status
  if (fixAttempt.verification_status !== "monitoring") return;

  // If we received a Loki event after deployment, the fix failed
  if (fixAttempt.deployed_at) {
    await markFixAsFailed(
      fixAttempt.id,
      `Error fingerprint ${fingerprint.slice(0, 12)}... reoccurred after deployment`,
      eventCount
    );
  }
}

// ============================================
// Status Transition Validation
// ============================================

/**
 * Check if an issue can be moved to "Done" status
 * Returns true if allowed, or an error message if blocked
 */
export async function canMoveToCloseStatus(
  issueId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Check if issue has an error source link (Sentry or Loki)
  const errorLink = await db.queryOne<{ id: string; source: string }>(
    `SELECT id, source FROM dispatch_external_issue WHERE issue_id = $1 AND source IN ('sentry', 'loki')`,
    [issueId]
  );

  if (!errorLink) {
    // No error source link - allow closing
    return { allowed: true };
  }

  // Issue has error source link - check for verified fix
  const fixAttempt = await getLatestFixAttempt(issueId);

  if (!fixAttempt) {
    return {
      allowed: false,
      reason:
        "This issue is linked to an error source but has no fix attempt recorded. " +
        "Please link a PR that fixes this issue before closing.",
    };
  }

  switch (fixAttempt.verification_status) {
    case "verified":
      return { allowed: true };

    case "failed":
      return {
        allowed: false,
        reason:
          `The last fix attempt (PR #${fixAttempt.pr_number}) failed verification. ` +
          `${fixAttempt.failure_reason}. Please submit a new fix.`,
      };

    case "awaiting_deploy":
      return {
        allowed: false,
        reason:
          `The fix from PR #${fixAttempt.pr_number} has not been deployed yet. ` +
          "Please wait for deployment before closing this issue.",
      };

    case "monitoring":
      const deadline = fixAttempt.verification_deadline;
      const remaining = deadline
        ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60))
        : VERIFICATION_WINDOW_HOURS;
      return {
        allowed: false,
        reason:
          `The fix from PR #${fixAttempt.pr_number} is still being monitored. ` +
          `Verification completes in ~${remaining} hours. ` +
          "Please wait for verification before closing this issue.",
      };

    default:
      return { allowed: true };
  }
}

/**
 * Get human-readable status for a fix attempt
 */
export function getFixAttemptStatusDisplay(
  fixAttempt: FixAttempt | null
): { status: string; color: string; description: string } | null {
  if (!fixAttempt) return null;

  switch (fixAttempt.verification_status) {
    case "awaiting_deploy":
      return {
        status: "Awaiting Deploy",
        color: "#F59E0B", // Yellow
        description: `PR #${fixAttempt.pr_number} merged, waiting for production deployment`,
      };

    case "monitoring":
      const deadline = fixAttempt.verification_deadline;
      const remaining = deadline
        ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60))
        : VERIFICATION_WINDOW_HOURS;
      return {
        status: "Monitoring",
        color: "#3B82F6", // Blue
        description: `Deployed ${fixAttempt.deployed_sha?.substring(0, 7)}, monitoring for ~${remaining}h`,
      };

    case "verified":
      return {
        status: "Verified",
        color: "#22C55E", // Green
        description: `Fix verified - no errors after ${VERIFICATION_WINDOW_HOURS}h monitoring`,
      };

    case "failed":
      return {
        status: "Failed",
        color: "#EF4444", // Red
        description: fixAttempt.failure_reason || "Fix verification failed",
      };

    default:
      return null;
  }
}
