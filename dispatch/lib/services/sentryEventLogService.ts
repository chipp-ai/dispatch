/**
 * Sentry Event Log Service
 *
 * Logs Sentry events for fix verification tracking.
 * Records event counts and timestamps to detect if errors reoccur after fixes.
 */

import { db } from "../db";
import { v4 as uuidv4 } from "uuid";

export interface SentryEventLog {
  id: string;
  external_issue_id: string;
  sentry_issue_id: string;
  sentry_short_id: string;
  event_count: number;
  user_count: number | null;
  release_sha: string | null;
  first_seen: Date;
  last_seen: Date;
  created_at: Date;
}

export interface LogSentryEventInput {
  externalIssueId: string;
  sentryIssueId: string;
  sentryShortId: string;
  eventCount: number;
  userCount?: number;
  releaseSha?: string;
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Log a Sentry event for tracking
 * Called when Sentry webhook reports an event for a tracked issue
 */
export async function logSentryEvent(
  input: LogSentryEventInput
): Promise<SentryEventLog> {
  const id = uuidv4();

  const result = await db.query<SentryEventLog>(
    `INSERT INTO chipp_sentry_event_log
     (id, external_issue_id, sentry_issue_id, sentry_short_id, event_count, user_count, release_sha, first_seen, last_seen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      input.externalIssueId,
      input.sentryIssueId,
      input.sentryShortId,
      input.eventCount,
      input.userCount || null,
      input.releaseSha || null,
      input.firstSeen,
      input.lastSeen,
    ]
  );

  console.log(
    `[Sentry Event Log] Logged event for ${input.sentryShortId}: ${input.eventCount} events`
  );

  return result[0];
}

/**
 * Get all event logs for an external issue
 */
export async function getEventLogsForExternalIssue(
  externalIssueId: string
): Promise<SentryEventLog[]> {
  return db.query<SentryEventLog>(
    `SELECT * FROM chipp_sentry_event_log
     WHERE external_issue_id = $1
     ORDER BY created_at DESC`,
    [externalIssueId]
  );
}

/**
 * Get event logs after a specific timestamp
 * Used to check for events that occurred after a fix was deployed
 */
export async function getEventLogsAfter(
  externalIssueId: string,
  after: Date
): Promise<SentryEventLog[]> {
  return db.query<SentryEventLog>(
    `SELECT * FROM chipp_sentry_event_log
     WHERE external_issue_id = $1
       AND created_at > $2
     ORDER BY created_at ASC`,
    [externalIssueId, after]
  );
}

/**
 * Get the latest event log for an external issue
 */
export async function getLatestEventLog(
  externalIssueId: string
): Promise<SentryEventLog | null> {
  return db.queryOne<SentryEventLog>(
    `SELECT * FROM chipp_sentry_event_log
     WHERE external_issue_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [externalIssueId]
  );
}

/**
 * Get event count increase since a timestamp
 * Returns the difference in event count between the latest log and
 * the first log after the given timestamp
 */
export async function getEventCountIncrease(
  externalIssueId: string,
  since: Date
): Promise<{ hasNewEvents: boolean; eventIncrease: number }> {
  const logsAfter = await getEventLogsAfter(externalIssueId, since);

  if (logsAfter.length === 0) {
    return { hasNewEvents: false, eventIncrease: 0 };
  }

  // Calculate increase based on the latest event count
  const latestLog = logsAfter[logsAfter.length - 1];
  const firstLog = logsAfter[0];

  // If we have logs after the deployment, errors have reoccurred
  return {
    hasNewEvents: true,
    eventIncrease: latestLog.event_count - firstLog.event_count + 1,
  };
}

/**
 * Check if there are any events logged after a fix deployment
 */
export async function hasEventsAfterDeploy(
  externalIssueId: string,
  deployedAt: Date
): Promise<boolean> {
  const result = await db.queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM chipp_sentry_event_log
      WHERE external_issue_id = $1
        AND created_at > $2
    ) as exists`,
    [externalIssueId, deployedAt]
  );

  return result?.exists || false;
}

/**
 * Get event logs by release SHA
 * Useful for correlating events with specific deployments
 */
export async function getEventLogsByRelease(
  releaseSha: string
): Promise<SentryEventLog[]> {
  return db.query<SentryEventLog>(
    `SELECT * FROM chipp_sentry_event_log
     WHERE release_sha = $1
     ORDER BY created_at DESC`,
    [releaseSha]
  );
}

/**
 * Clean up old event logs (optional maintenance function)
 * Keeps logs for the last N days
 */
export async function cleanupOldEventLogs(
  daysToKeep: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await db.query<{ count: number }>(
    `DELETE FROM chipp_sentry_event_log
     WHERE created_at < $1
     RETURNING id`,
    [cutoffDate]
  );

  const deletedCount = result.length;
  if (deletedCount > 0) {
    console.log(`[Sentry Event Log] Cleaned up ${deletedCount} old event logs`);
  }

  return deletedCount;
}
