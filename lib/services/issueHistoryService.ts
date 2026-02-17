import { db } from "../db";
import { v4 as uuidv4 } from "uuid";

export type HistoryActionType =
  | "created"
  | "status_changed"
  | "pr_linked"
  | "pr_unlinked"
  | "pr_status_changed"
  | "edited"
  | "priority_changed"
  | "assignee_changed"
  | "label_added"
  | "label_removed"
  | "agent_started"
  | "agent_completed"
  | "comment_added"
  | "reconciled";

export type HistoryActorType =
  | "user"
  | "system"
  | "agent"
  | "github_webhook"
  | "reconciliation";

export interface IssueHistoryEntry {
  id: string;
  issue_id: string;
  action: HistoryActionType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor_type: HistoryActorType;
  actor_name: string | null;
  created_at: Date;
}

export interface CreateHistoryInput {
  issueId: string;
  action: HistoryActionType;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  actorType: HistoryActorType;
  actorName?: string | null;
}

/**
 * Create a new history entry for an issue
 */
export async function createHistoryEntry(
  input: CreateHistoryInput
): Promise<IssueHistoryEntry> {
  const result = await db.query<IssueHistoryEntry>(
    `INSERT INTO dispatch_issue_history (
      id, issue_id, action, old_value, new_value, actor_type, actor_name, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, NOW()
    ) RETURNING *`,
    [
      uuidv4(),
      input.issueId,
      input.action,
      input.oldValue ? JSON.stringify(input.oldValue) : null,
      input.newValue ? JSON.stringify(input.newValue) : null,
      input.actorType,
      input.actorName || null,
    ]
  );

  return result[0];
}

/**
 * Get the history/timeline for an issue
 */
export async function getIssueHistory(
  issueIdOrIdentifier: string,
  limit: number = 50
): Promise<IssueHistoryEntry[]> {
  // First resolve the issue ID if identifier was provided
  const issue = await db.queryOne<{ id: string }>(
    `SELECT id FROM dispatch_issue WHERE id = $1 OR identifier = $1`,
    [issueIdOrIdentifier]
  );

  if (!issue) return [];

  return db.query<IssueHistoryEntry>(
    `SELECT * FROM dispatch_issue_history
     WHERE issue_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [issue.id, limit]
  );
}

/**
 * Record a status change in history
 */
export async function recordStatusChange(
  issueId: string,
  oldStatusName: string,
  newStatusName: string,
  actorType: HistoryActorType,
  actorName?: string
): Promise<IssueHistoryEntry> {
  return createHistoryEntry({
    issueId,
    action: "status_changed",
    oldValue: { status: oldStatusName },
    newValue: { status: newStatusName },
    actorType,
    actorName,
  });
}

/**
 * Record when a PR is linked to an issue
 */
export async function recordPRLinked(
  issueId: string,
  prNumber: number,
  prTitle: string,
  prUrl: string,
  actorType: HistoryActorType,
  actorName?: string
): Promise<IssueHistoryEntry> {
  return createHistoryEntry({
    issueId,
    action: "pr_linked",
    newValue: {
      pr_number: prNumber,
      pr_title: prTitle,
      pr_url: prUrl,
    },
    actorType,
    actorName,
  });
}

/**
 * Record when a PR status changes (merged, closed)
 */
export async function recordPRStatusChange(
  issueId: string,
  prNumber: number,
  oldStatus: string,
  newStatus: string,
  actorType: HistoryActorType,
  actorName?: string
): Promise<IssueHistoryEntry> {
  return createHistoryEntry({
    issueId,
    action: "pr_status_changed",
    oldValue: { pr_number: prNumber, status: oldStatus },
    newValue: { pr_number: prNumber, status: newStatus },
    actorType,
    actorName,
  });
}

/**
 * Format a history entry for display
 */
export function formatHistoryEntry(entry: IssueHistoryEntry): string {
  const actor = entry.actor_name || entry.actor_type;

  switch (entry.action) {
    case "created":
      return `${actor} created this issue`;

    case "status_changed":
      const oldStatus =
        (entry.old_value as { status?: string })?.status || "unknown";
      const newStatus =
        (entry.new_value as { status?: string })?.status || "unknown";
      return `${actor} changed status from ${oldStatus} to ${newStatus}`;

    case "pr_linked":
      const prNum = (entry.new_value as { pr_number?: number })?.pr_number;
      return `${actor} linked PR #${prNum}`;

    case "pr_unlinked":
      const unlinkedPr = (entry.old_value as { pr_number?: number })?.pr_number;
      return `${actor} unlinked PR #${unlinkedPr}`;

    case "pr_status_changed":
      const prStatusNew = (entry.new_value as { status?: string })?.status;
      const prStatusPrNum = (entry.new_value as { pr_number?: number })
        ?.pr_number;
      return `${actor} - PR #${prStatusPrNum} was ${prStatusNew}`;

    case "edited":
      return `${actor} edited the issue`;

    case "priority_changed":
      const oldPriority = (entry.old_value as { priority?: string })?.priority;
      const newPriority = (entry.new_value as { priority?: string })?.priority;
      return `${actor} changed priority from ${oldPriority} to ${newPriority}`;

    case "assignee_changed":
      const newAssignee = (entry.new_value as { assignee?: string })?.assignee;
      return newAssignee
        ? `${actor} assigned to ${newAssignee}`
        : `${actor} removed assignee`;

    case "label_added":
      const addedLabel = (entry.new_value as { label?: string })?.label;
      return `${actor} added label "${addedLabel}"`;

    case "label_removed":
      const removedLabel = (entry.old_value as { label?: string })?.label;
      return `${actor} removed label "${removedLabel}"`;

    case "agent_started":
      return `${actor} started working on this issue`;

    case "agent_completed":
      return `${actor} completed work on this issue`;

    case "comment_added":
      return `${actor} added a comment`;

    case "reconciled":
      const changes = entry.new_value as Record<string, unknown>;
      const changesList = Object.entries(changes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return `${actor} reconciled: ${changesList}`;

    default:
      return `${actor} performed action: ${entry.action}`;
  }
}
