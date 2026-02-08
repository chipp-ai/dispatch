import { db } from "../db";

export interface IssueWatcher {
  issueId: string;
  customerId: string;
  addedAt: Date;
}

export interface WatchingCustomer {
  id: string;
  name: string;
  slackChannelId: string | null;
}

/**
 * Add a customer as a watcher to an issue.
 * Idempotent - does nothing if already watching.
 */
export async function addWatcher(
  issueId: string,
  customerId: string
): Promise<void> {
  await db.query(
    `INSERT INTO chipp_issue_watcher (issue_id, customer_id, added_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (issue_id, customer_id) DO NOTHING`,
    [issueId, customerId]
  );
}

/**
 * Remove a customer as a watcher from an issue.
 */
export async function removeWatcher(
  issueId: string,
  customerId: string
): Promise<void> {
  await db.query(
    `DELETE FROM chipp_issue_watcher
     WHERE issue_id = $1 AND customer_id = $2`,
    [issueId, customerId]
  );
}

/**
 * Get all customers watching an issue.
 * Returns customer info needed for notifications.
 */
export async function getWatchingCustomers(
  issueId: string
): Promise<WatchingCustomer[]> {
  const result = await db.query<{
    id: string;
    name: string;
    slack_channel_id: string | null;
  }>(
    `SELECT c.id, c.name, c.slack_channel_id
     FROM chipp_issue_watcher w
     JOIN chipp_customer c ON w.customer_id = c.id
     WHERE w.issue_id = $1
     ORDER BY w.added_at ASC`,
    [issueId]
  );

  return result.map((r) => ({
    id: r.id,
    name: r.name,
    slackChannelId: r.slack_channel_id,
  }));
}

/**
 * Check if a customer is watching an issue.
 */
export async function isCustomerWatching(
  issueId: string,
  customerId: string
): Promise<boolean> {
  const result = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM chipp_issue_watcher
     WHERE issue_id = $1 AND customer_id = $2`,
    [issueId, customerId]
  );
  return result !== null && parseInt(result.count, 10) > 0;
}

/**
 * Get all issues a customer is watching.
 * Returns issue IDs for portal queries.
 */
export async function getWatchedIssueIds(
  customerId: string
): Promise<string[]> {
  const result = await db.query<{ issue_id: string }>(
    `SELECT issue_id FROM chipp_issue_watcher WHERE customer_id = $1`,
    [customerId]
  );
  return result.map((r) => r.issue_id);
}

/**
 * Get count of watchers for an issue.
 */
export async function getWatcherCount(issueId: string): Promise<number> {
  const result = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM chipp_issue_watcher WHERE issue_id = $1`,
    [issueId]
  );
  return result ? parseInt(result.count, 10) : 0;
}

/**
 * List all watchers for an issue with their info.
 */
export async function listWatchers(issueId: string): Promise<IssueWatcher[]> {
  const result = await db.query<{
    issue_id: string;
    customer_id: string;
    added_at: Date;
  }>(
    `SELECT issue_id, customer_id, added_at
     FROM chipp_issue_watcher
     WHERE issue_id = $1
     ORDER BY added_at ASC`,
    [issueId]
  );

  return result.map((r) => ({
    issueId: r.issue_id,
    customerId: r.customer_id,
    addedAt: r.added_at,
  }));
}
