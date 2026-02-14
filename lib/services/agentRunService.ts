/**
 * Agent Run Service
 *
 * First-class provenance records for every agent invocation. Each run captures
 * the prompt, full transcript, report, cost breakdown, and explicit PR linkage.
 */

import { db } from "../db";

export interface AgentRun {
  id: string;
  issue_id: string;
  github_run_id: string | null;
  github_run_url: string | null;
  workflow_type: string;
  status: string;
  prompt_text: string | null;
  transcript: string | null;
  report_content: string | null;
  outcome: string | null;
  outcome_summary: string | null;
  cost_usd: number;
  num_turns: number;
  model: string | null;
  tokens_used: number | null;
  pr_number: number | null;
  files_changed: string[] | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

export interface AgentRunSummary {
  id: string;
  issue_id: string;
  github_run_id: string | null;
  github_run_url: string | null;
  workflow_type: string;
  status: string;
  outcome: string | null;
  outcome_summary: string | null;
  cost_usd: number;
  num_turns: number;
  model: string | null;
  pr_number: number | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
  duration_seconds: number | null;
}

export interface CreateRunInput {
  issueId: string;
  workflowType: string;
  githubRunId?: string;
  githubRunUrl?: string;
  promptText?: string;
}

export interface UpdateRunInput {
  status?: string;
  transcript?: string;
  reportContent?: string;
  outcome?: string;
  outcomeSummary?: string;
  costUsd?: number;
  numTurns?: number;
  model?: string;
  tokensUsed?: number;
  prNumber?: number;
  filesChanged?: string[];
  completedAt?: string;
}

export async function createRun(input: CreateRunInput): Promise<AgentRun> {
  const result = await db.query<AgentRun>(
    `INSERT INTO dispatch_agent_runs
       (id, issue_id, workflow_type, github_run_id, github_run_url, prompt_text, started_at, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING *`,
    [
      input.issueId,
      input.workflowType,
      input.githubRunId || null,
      input.githubRunUrl || null,
      input.promptText || null,
    ]
  );
  return result[0];
}

export async function updateRun(
  runId: string,
  updates: UpdateRunInput
): Promise<AgentRun | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    params.push(updates.status);
    if (
      updates.status === "completed" ||
      updates.status === "failed" ||
      updates.status === "cancelled"
    ) {
      setClauses.push(`completed_at = COALESCE(completed_at, NOW())`);
    }
  }
  if (updates.transcript !== undefined) {
    setClauses.push(`transcript = $${paramIndex++}`);
    params.push(updates.transcript);
  }
  if (updates.reportContent !== undefined) {
    setClauses.push(`report_content = $${paramIndex++}`);
    params.push(updates.reportContent);
  }
  if (updates.outcome !== undefined) {
    setClauses.push(`outcome = $${paramIndex++}`);
    params.push(updates.outcome);
  }
  if (updates.outcomeSummary !== undefined) {
    setClauses.push(`outcome_summary = $${paramIndex++}`);
    params.push(updates.outcomeSummary);
  }
  if (updates.costUsd !== undefined) {
    setClauses.push(`cost_usd = $${paramIndex++}`);
    params.push(updates.costUsd);
  }
  if (updates.numTurns !== undefined) {
    setClauses.push(`num_turns = $${paramIndex++}`);
    params.push(updates.numTurns);
  }
  if (updates.model !== undefined) {
    setClauses.push(`model = $${paramIndex++}`);
    params.push(updates.model);
  }
  if (updates.tokensUsed !== undefined) {
    setClauses.push(`tokens_used = $${paramIndex++}`);
    params.push(updates.tokensUsed);
  }
  if (updates.prNumber !== undefined) {
    setClauses.push(`pr_number = $${paramIndex++}`);
    params.push(updates.prNumber);
  }
  if (updates.filesChanged !== undefined) {
    setClauses.push(`files_changed = $${paramIndex++}`);
    params.push(JSON.stringify(updates.filesChanged));
  }
  if (updates.completedAt !== undefined) {
    setClauses.push(`completed_at = $${paramIndex++}`);
    params.push(updates.completedAt);
  }

  if (setClauses.length === 0) return null;

  params.push(runId);
  const result = await db.query<AgentRun>(
    `UPDATE dispatch_agent_runs SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
  return result[0] || null;
}

export async function getRun(runId: string): Promise<AgentRun | null> {
  return db.queryOne<AgentRun>(
    `SELECT * FROM dispatch_agent_runs WHERE id = $1`,
    [runId]
  );
}

export async function listRunsForIssue(
  issueId: string
): Promise<AgentRunSummary[]> {
  return db.query<AgentRunSummary>(
    `SELECT
       id, issue_id, github_run_id, github_run_url, workflow_type, status,
       outcome, outcome_summary, cost_usd, num_turns, model, pr_number,
       started_at, completed_at, created_at,
       EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at))::integer AS duration_seconds
     FROM dispatch_agent_runs
     WHERE issue_id = $1
     ORDER BY created_at DESC`,
    [issueId]
  );
}

export async function getLatestRun(
  issueId: string
): Promise<AgentRunSummary | null> {
  return db.queryOne<AgentRunSummary>(
    `SELECT
       id, issue_id, github_run_id, github_run_url, workflow_type, status,
       outcome, outcome_summary, cost_usd, num_turns, model, pr_number,
       started_at, completed_at, created_at,
       EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at))::integer AS duration_seconds
     FROM dispatch_agent_runs
     WHERE issue_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [issueId]
  );
}

export interface InvestigationContextRun {
  run_number: number;
  date: string;
  outcome: string | null;
  outcome_summary: string | null;
  files_changed: string[];
  pr_number: number | null;
  pr_status: string | null;
  pr_merged: boolean;
  cost_usd: number;
  num_turns: number;
}

export interface InvestigationContext {
  previous_runs: InvestigationContextRun[];
  total_runs: number;
  total_cost_usd: number;
}

/**
 * Get compact investigation context for an issue, purpose-built for
 * injecting into an agent prompt. Joins with dispatch_issue_pr for
 * PR merge status.
 */
export async function getInvestigationContext(
  issueId: string
): Promise<InvestigationContext> {
  const rows = await db.query<{
    id: string;
    outcome: string | null;
    outcome_summary: string | null;
    files_changed: string | string[] | null;
    pr_number: number | null;
    cost_usd: string | number;
    num_turns: number;
    started_at: string;
    pr_status: string | null;
    merged_at: string | null;
  }>(
    `SELECT
       r.id, r.outcome, r.outcome_summary, r.files_changed,
       r.pr_number, r.cost_usd, r.num_turns, r.started_at,
       pr.pr_status, pr.merged_at
     FROM dispatch_agent_runs r
     LEFT JOIN dispatch_issue_pr pr
       ON pr.issue_id = r.issue_id AND pr.pr_number = r.pr_number
     WHERE r.issue_id = $1
       AND r.status IN ('completed', 'failed')
     ORDER BY r.created_at ASC`,
    [issueId]
  );

  let totalCost = 0;
  const previousRuns: InvestigationContextRun[] = rows.map((row, i) => {
    const cost = typeof row.cost_usd === "string" ? Number(row.cost_usd) : row.cost_usd;
    totalCost += cost || 0;

    // files_changed may be a string (JSONB returned as string) or array
    let filesChanged: string[] = [];
    if (row.files_changed) {
      filesChanged =
        typeof row.files_changed === "string"
          ? JSON.parse(row.files_changed)
          : row.files_changed;
    }

    return {
      run_number: i + 1,
      date: row.started_at,
      outcome: row.outcome,
      outcome_summary: row.outcome_summary,
      files_changed: filesChanged,
      pr_number: row.pr_number,
      pr_status: row.pr_status || null,
      pr_merged: row.pr_status === "merged" || row.merged_at !== null,
      cost_usd: cost || 0,
      num_turns: row.num_turns || 0,
    };
  });

  return {
    previous_runs: previousRuns,
    total_runs: previousRuns.length,
    total_cost_usd: totalCost,
  };
}
