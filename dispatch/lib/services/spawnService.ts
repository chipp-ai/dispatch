/**
 * Spawn Service
 *
 * Manages dispatching autonomous Claude Code sessions via GitHub Actions
 * workflow_dispatch. Supports multiple workflow types (error fix, PRD investigate,
 * PRD implement) with separate safety controls: concurrency limits, daily budgets,
 * cooldowns, and a kill switch.
 */

import { db } from "../db";

// --- Configuration ---

// Per-type concurrency and budget
const MAX_CONCURRENT_SPAWNS_ERROR = parseInt(
  process.env.MAX_CONCURRENT_SPAWNS_ERROR ||
    process.env.MAX_CONCURRENT_SPAWNS ||
    "2",
  10
);
const MAX_CONCURRENT_SPAWNS_PRD = parseInt(
  process.env.MAX_CONCURRENT_SPAWNS_PRD || "1",
  10
);
const DAILY_SPAWN_BUDGET_ERROR = parseInt(
  process.env.DAILY_SPAWN_BUDGET_ERROR ||
    process.env.DAILY_SPAWN_BUDGET ||
    "10",
  10
);
const DAILY_SPAWN_BUDGET_PRD = parseInt(
  process.env.DAILY_SPAWN_BUDGET_PRD || "5",
  10
);

const SPAWN_COOLDOWN_HOURS = parseInt(
  process.env.SPAWN_COOLDOWN_HOURS || "24",
  10
);
const MIN_EVENT_COUNT_TO_SPAWN = parseInt(
  process.env.MIN_EVENT_COUNT_TO_SPAWN || "3",
  10
);
const SPAWN_DELAY_MINUTES = parseInt(
  process.env.SPAWN_DELAY_MINUTES || "5",
  10
);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
// Parse owner/name from GITHUB_REPO (e.g. "BenchmarkAI/chipp-deno") as fallback
const [_repoOwner, _repoName] = (process.env.GITHUB_REPO || "").split("/");
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || _repoOwner || "";
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || _repoName || "chipp-deno";

// Workflow IDs for each type
const WORKFLOW_IDS: Record<WorkflowType, string> = {
  error_fix: process.env.GITHUB_WORKFLOW_ID || "auto-investigate.yml",
  prd_investigate: "prd-investigate.yml",
  prd_implement: "prd-implement.yml",
};

// --- Types ---

export type WorkflowType = "error_fix" | "prd_investigate" | "prd_implement";

export interface SpawnableIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  source?: string | null;
  feature?: string | null;
  plan_content?: string | null;
  plan_feedback?: string | null;
  additional_context?: string;
}

// --- Safety Gates ---

/**
 * Check whether we can spawn for a given workflow type.
 * Returns true only if ALL conditions are met:
 * 1. Kill switch is not enabled
 * 2. Active spawns < type-specific concurrency limit
 * 3. Daily spawn count < type-specific budget
 */
export async function canSpawn(
  workflowType: WorkflowType = "error_fix"
): Promise<boolean> {
  if (process.env.SPAWN_KILL_SWITCH === "true") {
    console.log("[Spawn] Kill switch is enabled, blocking spawn");
    return false;
  }

  const isErrorType = workflowType === "error_fix";
  const maxConcurrent = isErrorType
    ? MAX_CONCURRENT_SPAWNS_ERROR
    : MAX_CONCURRENT_SPAWNS_PRD;
  const maxBudget = isErrorType
    ? DAILY_SPAWN_BUDGET_ERROR
    : DAILY_SPAWN_BUDGET_PRD;
  const budgetType = isErrorType ? "error_fix" : "prd";

  const activeCount = await getActiveSpawnCount(workflowType);
  if (activeCount >= maxConcurrent) {
    console.log(
      `[Spawn] At concurrency limit for ${workflowType}: ${activeCount}/${maxConcurrent}`
    );
    return false;
  }

  const dailyCount = await getDailySpawnCount(budgetType);
  if (dailyCount >= maxBudget) {
    console.log(
      `[Spawn] Daily budget exhausted for ${budgetType}: ${dailyCount}/${maxBudget}`
    );
    return false;
  }

  return true;
}

/**
 * Get the number of currently running spawns, optionally filtered by type.
 */
export async function getActiveSpawnCount(
  workflowType?: WorkflowType
): Promise<number> {
  if (workflowType) {
    const isErrorType = workflowType === "error_fix";
    const sql = isErrorType
      ? `SELECT COUNT(*) as count FROM chipp_issue WHERE spawn_status = 'running' AND (spawn_type IS NULL OR spawn_type = 'error_fix')`
      : `SELECT COUNT(*) as count FROM chipp_issue WHERE spawn_status = 'running' AND spawn_type IN ('investigate', 'implement')`;
    const result = await db.queryOne<{ count: string }>(sql);
    return parseInt(result?.count || "0", 10);
  }
  const result = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM chipp_issue WHERE spawn_status = 'running'`
  );
  return parseInt(result?.count || "0", 10);
}

/**
 * Get the number of spawns today for a budget type.
 */
async function getDailySpawnCount(
  budgetType: string = "error_fix"
): Promise<number> {
  const result = await db.queryOne<{ spawn_count: number }>(
    `SELECT spawn_count FROM chipp_spawn_budget WHERE date = CURRENT_DATE AND spawn_type = $1`,
    [budgetType]
  );
  return result?.spawn_count || 0;
}

/**
 * Check whether a fingerprint is in cooldown (too recently investigated).
 */
export async function isInCooldown(fp: string): Promise<boolean> {
  const result = await db.queryOne<{ cooldown_until: Date | null }>(
    `SELECT cooldown_until FROM chipp_external_issue
     WHERE source = 'loki' AND external_id = $1
     AND cooldown_until IS NOT NULL AND cooldown_until > NOW()`,
    [fp]
  );
  return result !== null;
}

/**
 * Check whether the event count threshold has been met for spawning.
 */
export async function hasEnoughEvents(fp: string): Promise<boolean> {
  const result = await db.queryOne<{ event_count: number }>(
    `SELECT event_count FROM chipp_external_issue
     WHERE source = 'loki' AND external_id = $1`,
    [fp]
  );
  return (result?.event_count || 0) >= MIN_EVENT_COUNT_TO_SPAWN;
}

/**
 * Check whether enough time has passed since first seen (spawn delay).
 */
export async function hasPassedSpawnDelay(fp: string): Promise<boolean> {
  const result = await db.queryOne<{ created_at: Date }>(
    `SELECT created_at FROM chipp_external_issue
     WHERE source = 'loki' AND external_id = $1`,
    [fp]
  );

  if (!result) return false;

  const createdAt = new Date(result.created_at);
  const now = new Date();
  const delayMs = SPAWN_DELAY_MINUTES * 60 * 1000;
  return now.getTime() - createdAt.getTime() >= delayMs;
}

// --- Dispatch ---

/**
 * Dispatch a GitHub Actions workflow.
 * Routes to the correct .yml file based on workflow type.
 */
export async function dispatchWorkflow(
  issue: SpawnableIssue,
  workflowType: WorkflowType = "error_fix"
): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error("[Spawn] GITHUB_TOKEN not configured");
  }
  if (!GITHUB_REPO_OWNER) {
    throw new Error("[Spawn] GITHUB_REPO_OWNER not configured");
  }

  const workflowId = WORKFLOW_IDS[workflowType];
  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${workflowId}/dispatches`;

  const truncatedDescription = issue.description
    ? issue.description.slice(0, 5000)
    : "";

  // Build inputs based on workflow type
  const inputs: Record<string, string> = {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    title: issue.title,
    description: truncatedDescription,
  };

  if (workflowType === "error_fix") {
    inputs.source = issue.source || "";
    inputs.feature = issue.feature || "";
  } else if (workflowType === "prd_investigate") {
    inputs.plan_feedback = issue.plan_feedback || "";
  } else if (workflowType === "prd_implement") {
    inputs.plan_content = issue.plan_content
      ? issue.plan_content.slice(0, 5000)
      : "";
  }

  // Pass additional context from retry dialog (all workflow types)
  if (issue.additional_context) {
    inputs.additional_context = issue.additional_context.slice(0, 2000);
  }

  // Pass tunnel URL for local dev so GH Actions streams back to localhost
  const callbackUrl = process.env.CHIPP_ISSUES_CALLBACK_URL;
  if (callbackUrl) {
    inputs.callback_url = callbackUrl;
    console.log(`[Spawn] Using callback URL: ${callbackUrl}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: "staging",
      inputs,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[Spawn] GitHub dispatch failed: ${response.status} ${body}`
    );
  }

  const dispatchId = `dispatch_${Date.now()}`;
  console.log(
    `[Spawn] Dispatched ${workflowType} for ${issue.identifier} (${dispatchId})`
  );

  return dispatchId;
}

/**
 * Backwards-compatible wrapper for error fix dispatching.
 */
export async function dispatchInvestigation(
  issue: SpawnableIssue
): Promise<string> {
  return dispatchWorkflow(issue, "error_fix");
}

// --- Recording ---

/**
 * Record that a spawn was initiated for an issue.
 * Updates the issue's spawn columns and increments the type-specific daily budget.
 */
export async function recordSpawn(
  issueId: string,
  runId: string,
  spawnType: string = "error_fix"
): Promise<void> {
  const agentStatus =
    spawnType === "implement" ? "implementing" : "investigating";
  await db.query(
    `UPDATE chipp_issue
     SET spawn_status = 'running',
         spawn_run_id = $2,
         spawn_started_at = NOW(),
         spawn_type = $3,
         spawn_attempt_count = COALESCE(spawn_attempt_count, 0) + 1,
         agent_status = $4,
         blocked_reason = NULL
     WHERE id = $1`,
    [issueId, runId, spawnType, agentStatus]
  );

  const budgetType = spawnType === "error_fix" ? "error_fix" : "prd";
  const maxBudget =
    budgetType === "error_fix"
      ? DAILY_SPAWN_BUDGET_ERROR
      : DAILY_SPAWN_BUDGET_PRD;
  await incrementDailyBudget(budgetType, maxBudget);
}

/**
 * Increment the daily spawn count for a budget type.
 */
export async function incrementDailyBudget(
  budgetType: string = "error_fix",
  maxBudget?: number
): Promise<void> {
  const max =
    maxBudget ??
    (budgetType === "error_fix"
      ? DAILY_SPAWN_BUDGET_ERROR
      : DAILY_SPAWN_BUDGET_PRD);
  await db.query(
    `INSERT INTO chipp_spawn_budget (date, spawn_count, max_spawns, spawn_type)
     VALUES (CURRENT_DATE, 1, $1, $2)
     ON CONFLICT (date, spawn_type)
     DO UPDATE SET spawn_count = chipp_spawn_budget.spawn_count + 1`,
    [max, budgetType]
  );
}

/**
 * Set a cooldown on a fingerprint after investigation completes.
 */
export async function setCooldown(fp: string): Promise<void> {
  const cooldownUntil = new Date(
    Date.now() + SPAWN_COOLDOWN_HOURS * 60 * 60 * 1000
  );

  await db.query(
    `UPDATE chipp_external_issue
     SET cooldown_until = $2
     WHERE source = 'loki' AND external_id = $1`,
    [fp, cooldownUntil]
  );
}

/**
 * Full spawn gate check: combines all safety checks and thresholds.
 */
export async function checkSpawnGate(fp: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  if (process.env.SPAWN_KILL_SWITCH === "true") {
    return { allowed: false, reason: "kill_switch" };
  }

  if (await isInCooldown(fp)) {
    return { allowed: false, reason: "cooldown" };
  }

  if (!(await hasEnoughEvents(fp))) {
    return {
      allowed: false,
      reason: `below_event_threshold (need ${MIN_EVENT_COUNT_TO_SPAWN})`,
    };
  }

  if (!(await canSpawn("error_fix"))) {
    return { allowed: false, reason: "budget_or_concurrency" };
  }

  return { allowed: true };
}

