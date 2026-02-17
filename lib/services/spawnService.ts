/**
 * Spawn Service
 *
 * Manages dispatching autonomous Claude Code sessions via GitHub Actions
 * workflow_dispatch. Supports multiple workflow types (error fix, PRD investigate,
 * PRD implement) with separate safety controls: concurrency limits, daily budgets,
 * cooldowns, and a kill switch.
 */

import { db } from "../db";
import { createRun } from "./agentRunService";
import { createHistoryEntry, recordStatusChange } from "./issueHistoryService";
import { getStatusByName } from "./statusService";
import { getIssueForBoard } from "./issueService";
import { broadcastBoardEvent } from "./boardBroadcast";
import { notifyInternalAgentStarted } from "./internalSlackService";

// --- Configuration ---

// Per-type concurrency and budget
const MAX_CONCURRENT_SPAWNS_ERROR = parseInt(
  process.env.MAX_CONCURRENT_SPAWNS_ERROR ||
    process.env.MAX_CONCURRENT_SPAWNS ||
    "100",
  10
);
const MAX_CONCURRENT_SPAWNS_PRD = parseInt(
  process.env.MAX_CONCURRENT_SPAWNS_PRD || "100",
  10
);
const DAILY_SPAWN_BUDGET_ERROR = parseInt(
  process.env.DAILY_SPAWN_BUDGET_ERROR ||
    process.env.DAILY_SPAWN_BUDGET ||
    "1000",
  10
);
const DAILY_SPAWN_BUDGET_PRD = parseInt(
  process.env.DAILY_SPAWN_BUDGET_PRD || "1000",
  10
);

const SPAWN_COOLDOWN_HOURS = parseInt(
  process.env.SPAWN_COOLDOWN_HOURS || "24",
  10
);
const MIN_EVENT_COUNT_TO_SPAWN = parseInt(
  process.env.MIN_EVENT_COUNT_TO_SPAWN || "1",
  10
);
const SPAWN_DELAY_MINUTES = parseInt(
  process.env.SPAWN_DELAY_MINUTES || "0",
  10
);

// --- Source-Aware Spawn Thresholds ---
// Infrastructure/deploy errors spawn immediately on first event.
// Runtime errors (user-facing bugs) accumulate before spawning.

const IMMEDIATE_SPAWN_SOURCES = new Set(
  (process.env.IMMEDIATE_SPAWN_SOURCES || "ci-deploy,migration,infrastructure").split(",")
);

const RUNTIME_EVENT_THRESHOLD = parseInt(
  process.env.RUNTIME_EVENT_THRESHOLD || "5",
  10
);
const RUNTIME_SPAWN_DELAY_MINUTES = parseInt(
  process.env.RUNTIME_SPAWN_DELAY_MINUTES || "5",
  10
);

/**
 * Get spawn thresholds based on the error source.
 * Infrastructure sources (ci-deploy, migration) get immediate dispatch.
 * Runtime sources (consumer-chat, builder-chat, etc.) wait for a pattern.
 */
export function getSpawnThresholds(source?: string): {
  eventThreshold: number;
  delayMinutes: number;
} {
  if (source && IMMEDIATE_SPAWN_SOURCES.has(source)) {
    return { eventThreshold: 1, delayMinutes: 0 };
  }
  // Runtime errors: use higher thresholds to avoid noise from one-off errors
  return {
    eventThreshold: RUNTIME_EVENT_THRESHOLD,
    delayMinutes: RUNTIME_SPAWN_DELAY_MINUTES,
  };
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
// Parse owner/name from GITHUB_REPO (e.g. "myorg/myrepo") as fallback
const [_repoOwner, _repoName] = (process.env.GITHUB_REPO || "").split("/");
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || _repoOwner || "";
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || _repoName || "";
const GITHUB_REF = process.env.GITHUB_REF || "main";

// Workflow IDs for each type
const WORKFLOW_IDS: Record<WorkflowType, string> = {
  error_fix: process.env.GITHUB_WORKFLOW_ID || "auto-investigate.yml",
  prd_investigate: "prd-investigate.yml",
  prd_implement: "prd-implement.yml",
  qa: "qa-test.yml",
  deep_research: "deep-research.yml",
  auto_triage: "auto-triage.yml",
};

// --- Types ---

export type WorkflowType = "error_fix" | "prd_investigate" | "prd_implement" | "qa" | "deep_research" | "auto_triage";

export interface SpawnableIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  source?: string | null;
  feature?: string | null;
  fingerprint?: string | null;
  error_message?: string | null;
  stack_trace?: string | null;
  plan_content?: string | null;
  plan_feedback?: string | null;
  additional_context?: string;
  test_instructions?: string | null;
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
  // qa and deep_research share the prd budget
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
      ? `SELECT COUNT(*) as count FROM dispatch_issue WHERE spawn_status = 'running' AND (spawn_type IS NULL OR spawn_type = 'error_fix')`
      : `SELECT COUNT(*) as count FROM dispatch_issue WHERE spawn_status = 'running' AND spawn_type IN ('investigate', 'implement', 'qa', 'research', 'triage')`;
    const result = await db.queryOne<{ count: string }>(sql);
    return parseInt(result?.count || "0", 10);
  }
  const result = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM dispatch_issue WHERE spawn_status = 'running'`
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
    `SELECT spawn_count FROM dispatch_spawn_budget WHERE date = CURRENT_DATE AND spawn_type = $1`,
    [budgetType]
  );
  return result?.spawn_count || 0;
}

/**
 * Check whether a fingerprint is in cooldown (too recently investigated).
 */
export async function isInCooldown(fp: string): Promise<boolean> {
  const result = await db.queryOne<{ cooldown_until: Date | null }>(
    `SELECT cooldown_until FROM dispatch_external_issue
     WHERE source = 'loki' AND external_id = $1
     AND cooldown_until IS NOT NULL AND cooldown_until > NOW()`,
    [fp]
  );
  return result !== null;
}

/**
 * Check whether the event count threshold has been met for spawning.
 * Accepts an optional threshold override for source-aware spawn behavior.
 */
export async function hasEnoughEvents(
  fp: string,
  threshold?: number
): Promise<boolean> {
  const minEvents = threshold ?? MIN_EVENT_COUNT_TO_SPAWN;
  const result = await db.queryOne<{ event_count: number }>(
    `SELECT event_count FROM dispatch_external_issue
     WHERE source = 'loki' AND external_id = $1`,
    [fp]
  );
  return (result?.event_count || 0) >= minEvents;
}

/**
 * Check whether enough time has passed since first seen (spawn delay).
 * Accepts an optional delay override for source-aware spawn behavior.
 */
export async function hasPassedSpawnDelay(
  fp: string,
  delayMinutes?: number
): Promise<boolean> {
  const delay = delayMinutes ?? SPAWN_DELAY_MINUTES;
  const result = await db.queryOne<{ created_at: Date }>(
    `SELECT created_at FROM dispatch_external_issue
     WHERE source = 'loki' AND external_id = $1`,
    [fp]
  );

  if (!result) return false;

  const createdAt = new Date(result.created_at);
  const now = new Date();
  const delayMs = delay * 60 * 1000;
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
    inputs.error_fingerprint = issue.fingerprint || "";
    inputs.error_message = (issue.error_message || "").slice(0, 1000);
    inputs.stack_trace = (issue.stack_trace || "").slice(0, 2000);
  } else if (workflowType === "prd_investigate") {
    inputs.plan_feedback = issue.plan_feedback || "";
  } else if (workflowType === "prd_implement") {
    inputs.plan_content = issue.plan_content
      ? issue.plan_content.slice(0, 5000)
      : "";
  } else if (workflowType === "qa") {
    inputs.plan_content = issue.plan_content
      ? issue.plan_content.slice(0, 5000)
      : "";
    if (issue.test_instructions) {
      inputs.test_instructions = issue.test_instructions.slice(0, 2000);
    }
  } else if (workflowType === "auto_triage") {
    // No extra inputs needed -- triage agent only needs base fields
  }

  // Pass additional context from retry dialog (all workflow types)
  if (issue.additional_context) {
    inputs.additional_context = issue.additional_context.slice(0, 2000);
  }

  // Note: GITHUB_REF is passed as the top-level `ref` field in the dispatch body
  // (line below), NOT as an input. GitHub rejects undeclared inputs with 422.

  // Pass tunnel URL for local dev so GH Actions streams back to localhost
  const callbackUrl = process.env.DISPATCH_CALLBACK_URL;
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
      ref: GITHUB_REF,
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
 * Map spawn types to workflow_type values for agent runs.
 */
const workflowTypeMap: Record<string, string> = {
  error_fix: "error_fix",
  investigate: "prd_investigate",
  implement: "prd_implement",
  qa: "qa",
  research: "deep_research",
  triage: "auto_triage",
};

/**
 * Record that a spawn was initiated for an issue.
 * Updates the issue's spawn columns, increments the type-specific daily budget,
 * and creates an agent run record for provenance tracking.
 * Returns the agent run ID.
 */
export async function recordSpawn(
  issueId: string,
  runId: string,
  spawnType: string = "error_fix"
): Promise<string> {
  const agentStatusMap: Record<string, string> = {
    implement: "implementing",
    investigate: "investigating",
    error_fix: "investigating",
    qa: "testing",
    research: "researching",
    triage: "triaging",
  };
  const agentStatus = agentStatusMap[spawnType] || "investigating";

  // Auto-transition: move issue to the correct board column based on spawn type
  const issue = await db.queryOne<{
    status_id: string;
    workspace_id: string;
    identifier: string;
  }>(
    `SELECT i.status_id, i.workspace_id, i.identifier
     FROM dispatch_issue i WHERE i.id = $1`,
    [issueId]
  );

  let newStatusId: string | null = null;
  let oldStatusName: string | null = null;
  let newStatusName: string | null = null;

  if (issue) {
    // Get current status name
    const currentStatus = await db.queryOne<{ name: string }>(
      `SELECT name FROM dispatch_status WHERE id = $1`,
      [issue.status_id]
    );
    const currentName = currentStatus?.name?.toLowerCase() || "";

    // Auto-transition to the correct board column based on spawn type
    if (
      (spawnType === "error_fix" || spawnType === "investigate" || spawnType === "triage") &&
      currentName === "backlog"
    ) {
      const target = await getStatusByName(issue.workspace_id, "Investigating");
      if (target) {
        newStatusId = target.id;
        oldStatusName = currentStatus?.name || "Unknown";
        newStatusName = target.name;
      }
    } else if (
      spawnType === "implement" &&
      (currentName === "backlog" ||
       currentName === "investigating" || currentName === "needs review")
    ) {
      const target = await getStatusByName(issue.workspace_id, "In Progress");
      if (target) {
        newStatusId = target.id;
        oldStatusName = currentStatus?.name || "Unknown";
        newStatusName = target.name;
      }
    }
  }

  // Build UPDATE query with optional status_id
  if (newStatusId) {
    await db.query(
      `UPDATE dispatch_issue
       SET spawn_status = 'running',
           spawn_run_id = $2,
           spawn_started_at = NOW(),
           spawn_type = $3,
           spawn_attempt_count = COALESCE(spawn_attempt_count, 0) + 1,
           agent_status = $4,
           blocked_reason = NULL,
           status_id = $5
       WHERE id = $1`,
      [issueId, runId, spawnType, agentStatus, newStatusId]
    );
  } else {
    await db.query(
      `UPDATE dispatch_issue
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
  }

  // Broadcast board move and record history if status changed
  if (newStatusId && issue) {
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
      await recordStatusChange(
        issueId,
        oldStatusName!,
        newStatusName!,
        "system",
        "Spawn Service"
      );
    } catch (e) {
      console.error("[Spawn] Failed to broadcast/record status change:", e);
    }
  }

  const budgetType = spawnType === "error_fix" ? "error_fix" : "prd";
  const maxBudget =
    budgetType === "error_fix"
      ? DAILY_SPAWN_BUDGET_ERROR
      : DAILY_SPAWN_BUDGET_PRD;
  await incrementDailyBudget(budgetType, maxBudget);

  const workflowType = workflowTypeMap[spawnType] || spawnType;
  const agentRun = await createRun({
    issueId,
    workflowType,
    githubRunId: runId,
  });

  // Record spawn in issue history
  try {
    await createHistoryEntry({
      issueId,
      action: "agent_started",
      newValue: {
        spawn_status: "running",
        spawn_type: spawnType,
        agent_status: agentStatus,
        workflow_type: workflowType,
        run_id: agentRun.id,
      },
      actorType: "system",
      actorName: "Spawn Service",
    });
  } catch (e) {
    console.error("[History] Failed to record spawn:", e);
  }

  // Notify internal Slack channel
  notifyInternalAgentStarted({
    issueId,
    identifier: issue?.identifier || "",
    spawnType,
  }).catch((err) =>
    console.error("[Internal Slack] notify agent started:", err)
  );

  return agentRun.id;
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
    `INSERT INTO dispatch_spawn_budget (date, spawn_count, max_spawns, spawn_type)
     VALUES (CURRENT_DATE, 1, $1, $2)
     ON CONFLICT (date, spawn_type)
     DO UPDATE SET spawn_count = dispatch_spawn_budget.spawn_count + 1`,
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
    `UPDATE dispatch_external_issue
     SET cooldown_until = $2
     WHERE source = 'loki' AND external_id = $1`,
    [fp, cooldownUntil]
  );
}

/**
 * Full spawn gate check: combines all safety checks and thresholds.
 * Source-aware: infrastructure sources (ci-deploy, migration) bypass
 * event count and delay thresholds for immediate dispatch.
 * Runtime sources wait for a pattern before spawning.
 */
export async function checkSpawnGate(
  fp: string,
  source?: string
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  if (process.env.SPAWN_KILL_SWITCH === "true") {
    return { allowed: false, reason: "kill_switch" };
  }

  if (await isInCooldown(fp)) {
    return { allowed: false, reason: "cooldown" };
  }

  const thresholds = getSpawnThresholds(source);

  if (!(await hasEnoughEvents(fp, thresholds.eventThreshold))) {
    return {
      allowed: false,
      reason: `below_event_threshold (need ${thresholds.eventThreshold}, source=${source || "unknown"})`,
    };
  }

  if (!(await hasPassedSpawnDelay(fp, thresholds.delayMinutes))) {
    return {
      allowed: false,
      reason: `spawn_delay (waiting ${thresholds.delayMinutes}m after first seen, source=${source || "unknown"})`,
    };
  }

  if (!(await canSpawn("error_fix"))) {
    return { allowed: false, reason: "budget_or_concurrency" };
  }

  console.log(
    `[Spawn] Gate passed for source=${source || "unknown"}: threshold=${thresholds.eventThreshold}, delay=${thresholds.delayMinutes}m`
  );
  return { allowed: true };
}

