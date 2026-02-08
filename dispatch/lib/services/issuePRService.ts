import { db } from "../db";
import { v4 as uuidv4 } from "uuid";
import {
  recordPRLinked,
  recordPRStatusChange,
  HistoryActorType,
} from "./issueHistoryService";

export type PRStatus = "open" | "merged" | "closed";

export interface IssuePR {
  id: string;
  issue_id: string;
  pr_number: number;
  pr_url: string;
  pr_title: string;
  pr_status: PRStatus;
  branch_name: string | null;
  author: string | null;
  base_branch: string | null;
  head_branch: string | null;
  ai_summary: string | null;
  match_confidence: number | null;
  merged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateIssuePRInput {
  issueId: string;
  prNumber: number;
  prUrl: string;
  prTitle: string;
  prStatus?: PRStatus;
  branchName?: string | null;
  author?: string | null;
  baseBranch?: string | null;
  headBranch?: string | null;
  aiSummary?: string | null;
  matchConfidence?: number | null;
}

export interface UpdateIssuePRInput {
  prStatus?: PRStatus;
  prTitle?: string;
  aiSummary?: string | null;
  mergedAt?: Date | null;
}

/**
 * Link a PR to an issue
 */
export async function linkPRToIssue(
  input: CreateIssuePRInput,
  actorType: HistoryActorType = "system",
  actorName?: string
): Promise<IssuePR> {
  // Check if this PR is already linked
  const existing = await db.queryOne<IssuePR>(
    `SELECT * FROM chipp_issue_pr WHERE issue_id = $1 AND pr_number = $2`,
    [input.issueId, input.prNumber]
  );

  if (existing) {
    // Update existing record
    return updateIssuePR(existing.id, {
      prStatus: input.prStatus,
      prTitle: input.prTitle,
      aiSummary: input.aiSummary,
    });
  }

  const result = await db.query<IssuePR>(
    `INSERT INTO chipp_issue_pr (
      id, issue_id, pr_number, pr_url, pr_title, pr_status,
      branch_name, author, base_branch, head_branch,
      ai_summary, match_confidence, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
    ) RETURNING *`,
    [
      uuidv4(),
      input.issueId,
      input.prNumber,
      input.prUrl,
      input.prTitle,
      input.prStatus || "open",
      input.branchName || null,
      input.author || null,
      input.baseBranch || null,
      input.headBranch || null,
      input.aiSummary || null,
      input.matchConfidence || null,
    ]
  );

  // Record in history
  await recordPRLinked(
    input.issueId,
    input.prNumber,
    input.prTitle,
    input.prUrl,
    actorType,
    actorName
  );

  return result[0];
}

/**
 * Update a linked PR's information
 */
export async function updateIssuePR(
  prId: string,
  input: UpdateIssuePRInput,
  actorType: HistoryActorType = "system",
  actorName?: string
): Promise<IssuePR> {
  // Get existing PR
  const existing = await db.queryOne<IssuePR>(
    `SELECT * FROM chipp_issue_pr WHERE id = $1`,
    [prId]
  );

  if (!existing) {
    throw new Error(`PR with id ${prId} not found`);
  }

  const result = await db.query<IssuePR>(
    `UPDATE chipp_issue_pr SET
      pr_status = COALESCE($1, pr_status),
      pr_title = COALESCE($2, pr_title),
      ai_summary = COALESCE($3, ai_summary),
      merged_at = COALESCE($4, merged_at),
      updated_at = NOW()
    WHERE id = $5
    RETURNING *`,
    [input.prStatus, input.prTitle, input.aiSummary, input.mergedAt, prId]
  );

  // Record status change if applicable
  if (input.prStatus && input.prStatus !== existing.pr_status) {
    await recordPRStatusChange(
      existing.issue_id,
      existing.pr_number,
      existing.pr_status,
      input.prStatus,
      actorType,
      actorName
    );
  }

  return result[0];
}

/**
 * Get all PRs linked to an issue
 */
export async function getIssuePRs(
  issueIdOrIdentifier: string
): Promise<IssuePR[]> {
  // First resolve the issue ID if identifier was provided
  const issue = await db.queryOne<{ id: string }>(
    `SELECT id FROM chipp_issue WHERE id = $1 OR identifier = $1`,
    [issueIdOrIdentifier]
  );

  if (!issue) return [];

  return db.query<IssuePR>(
    `SELECT * FROM chipp_issue_pr
     WHERE issue_id = $1
     ORDER BY created_at DESC`,
    [issue.id]
  );
}

/**
 * Get a PR by its number (for webhook lookups)
 */
export async function getPRByNumber(prNumber: number): Promise<IssuePR | null> {
  return db.queryOne<IssuePR>(
    `SELECT * FROM chipp_issue_pr WHERE pr_number = $1`,
    [prNumber]
  );
}

/**
 * Get all PRs linked to issues in a specific status
 */
export async function getPRsByIssueStatus(
  statusName: string
): Promise<(IssuePR & { issue_identifier: string })[]> {
  return db.query(
    `SELECT pr.*, i.identifier as issue_identifier
     FROM chipp_issue_pr pr
     JOIN chipp_issue i ON pr.issue_id = i.id
     JOIN chipp_status s ON i.status_id = s.id
     WHERE LOWER(s.name) = LOWER($1)`,
    [statusName]
  );
}

/**
 * Unlink a PR from an issue
 */
export async function unlinkPR(
  prId: string,
  actorType: HistoryActorType = "system",
  actorName?: string
): Promise<boolean> {
  const pr = await db.queryOne<IssuePR>(
    `SELECT * FROM chipp_issue_pr WHERE id = $1`,
    [prId]
  );

  if (!pr) return false;

  await db.query(`DELETE FROM chipp_issue_pr WHERE id = $1`, [prId]);

  // Record in history
  await db.query(
    `INSERT INTO chipp_issue_history (
      id, issue_id, action, old_value, actor_type, actor_name, created_at
    ) VALUES (
      gen_random_uuid(), $1, 'pr_unlinked', $2, $3, $4, NOW()
    )`,
    [
      pr.issue_id,
      JSON.stringify({
        pr_number: pr.pr_number,
        pr_title: pr.pr_title,
        pr_url: pr.pr_url,
      }),
      actorType,
      actorName,
    ]
  );

  return true;
}

/**
 * Find issues that might be related to a PR based on branch name or title
 */
export async function findPotentialIssueMatches(
  prTitle: string,
  branchName: string | null
): Promise<{ id: string; identifier: string; title: string }[]> {
  // Extract potential issue identifiers from title and branch name
  const identifierPattern = /[A-Z]+-\d+/g;
  const titleMatches = prTitle.match(identifierPattern) || [];
  const branchMatches = branchName?.match(identifierPattern) || [];
  const allMatches = [...new Set([...titleMatches, ...branchMatches])];

  if (allMatches.length === 0) {
    return [];
  }

  // Look up issues by identifier
  const placeholders = allMatches.map((_, i) => `$${i + 1}`).join(", ");
  return db.query(
    `SELECT id, identifier, title FROM chipp_issue
     WHERE identifier IN (${placeholders})`,
    allMatches
  );
}
