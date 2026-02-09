import { db } from "../db";

export type ExternalSource = "sentry" | "github" | "linear" | "loki";

export interface ExternalIssue {
  id: string;
  issue_id: string;
  source: ExternalSource;
  external_id: string;
  external_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface CreateExternalIssueInput {
  issueId: string;
  source: ExternalSource;
  externalId: string;
  externalUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Find an existing Dispatch issue linked to an external issue
 */
export async function findByExternalId(
  source: ExternalSource,
  externalId: string
): Promise<ExternalIssue | null> {
  return db.queryOne<ExternalIssue>(
    `SELECT * FROM dispatch_external_issue WHERE source = $1 AND external_id = $2`,
    [source, externalId]
  );
}

/**
 * Link an external issue to a Dispatch issue
 */
export async function linkExternalIssue(
  input: CreateExternalIssueInput
): Promise<ExternalIssue> {
  const result = await db.query<ExternalIssue>(
    `INSERT INTO dispatch_external_issue (issue_id, source, external_id, external_url, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.issueId,
      input.source,
      input.externalId,
      input.externalUrl || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );
  return result[0];
}

/**
 * Get all external links for a Dispatch issue
 */
export async function getExternalLinksForIssue(
  issueId: string
): Promise<ExternalIssue[]> {
  return db.query<ExternalIssue>(
    `SELECT * FROM dispatch_external_issue WHERE issue_id = $1 ORDER BY created_at ASC`,
    [issueId]
  );
}

/**
 * Check if an external issue is already linked to any Dispatch issue
 */
export async function isExternalIssueLinked(
  source: ExternalSource,
  externalId: string
): Promise<boolean> {
  const result = await findByExternalId(source, externalId);
  return result !== null;
}
