/**
 * Spawn Service
 *
 * Manages dispatching autonomous Claude Code investigation sessions via
 * GitHub Actions workflow_dispatch. Implements safety controls: concurrency
 * limits, daily budgets, cooldowns, and a kill switch.
 */

import { db } from "../db";

// --- Configuration ---

const MAX_CONCURRENT_SPAWNS = parseInt(
  process.env.MAX_CONCURRENT_SPAWNS || "2",
  10
);
const DAILY_SPAWN_BUDGET = parseInt(
  process.env.DAILY_SPAWN_BUDGET || "10",
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
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "";
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || "chipp-deno";
const GITHUB_WORKFLOW_ID =
  process.env.GITHUB_WORKFLOW_ID || "auto-investigate.yml";

// --- Types ---

export interface SpawnableIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
}

// --- Safety Gates ---

/**
 * Check whether we can spawn a new investigation.
 * Returns true only if ALL conditions are met:
 * 1. Kill switch is not enabled
 * 2. Active investigations < MAX_CONCURRENT_SPAWNS
 * 3. Daily spawn count < DAILY_SPAWN_BUDGET
 */
export async function canSpawn(): Promise<boolean> {
  // Kill switch check
  if (process.env.SPAWN_KILL_SWITCH === "true") {
    console.log("[Spawn] Kill switch is enabled, blocking spawn");
    return false;
  }

  // Concurrency check
  const activeCount = await getActiveSpawnCount();
  if (activeCount >= MAX_CONCURRENT_SPAWNS) {
    console.log(
      `[Spawn] At concurrency limit: ${activeCount}/${MAX_CONCURRENT_SPAWNS}`
    );
    return false;
  }

  // Daily budget check
  const dailyCount = await getDailySpawnCount();
  if (dailyCount >= DAILY_SPAWN_BUDGET) {
    console.log(
      `[Spawn] Daily budget exhausted: ${dailyCount}/${DAILY_SPAWN_BUDGET}`
    );
    return false;
  }

  return true;
}

/**
 * Get the number of currently running investigations.
 */
export async function getActiveSpawnCount(): Promise<number> {
  const result = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM chipp_issue WHERE spawn_status = 'running'`
  );
  return parseInt(result?.count || "0", 10);
}

/**
 * Get the number of spawns today.
 */
async function getDailySpawnCount(): Promise<number> {
  const result = await db.queryOne<{ spawn_count: number }>(
    `SELECT spawn_count FROM chipp_spawn_budget WHERE date = CURRENT_DATE`
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
 * This lets events accumulate so the investigation has more context.
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
 * Dispatch a GitHub Actions workflow to investigate an issue.
 * Returns the dispatch status (GitHub does not return a run ID from workflow_dispatch).
 */
export async function dispatchInvestigation(
  issue: SpawnableIssue
): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error("[Spawn] GITHUB_TOKEN not configured");
  }
  if (!GITHUB_REPO_OWNER) {
    throw new Error("[Spawn] GITHUB_REPO_OWNER not configured");
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_WORKFLOW_ID}/dispatches`;

  // Truncate description to avoid exceeding GitHub input limits (65535 chars)
  const truncatedDescription = issue.description
    ? issue.description.slice(0, 5000)
    : "";

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
      inputs: {
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        issue_title: issue.title,
        issue_description: truncatedDescription,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[Spawn] GitHub dispatch failed: ${response.status} ${body}`
    );
  }

  // GitHub returns 204 No Content on success; there is no run ID in the response.
  // We use a synthetic dispatch ID based on timestamp for tracking.
  const dispatchId = `dispatch_${Date.now()}`;
  console.log(
    `[Spawn] Dispatched investigation for ${issue.identifier} (${dispatchId})`
  );

  return dispatchId;
}

// --- Recording ---

/**
 * Record that a spawn was initiated for an issue.
 * Updates the issue's spawn columns and increments the daily budget.
 */
export async function recordSpawn(
  issueId: string,
  runId: string
): Promise<void> {
  await db.query(
    `UPDATE chipp_issue
     SET spawn_status = 'running',
         spawn_run_id = $2,
         spawn_started_at = NOW()
     WHERE id = $1`,
    [issueId, runId]
  );

  await incrementDailyBudget();
}

/**
 * Increment the daily spawn count. Upsert into chipp_spawn_budget for today.
 */
export async function incrementDailyBudget(): Promise<void> {
  await db.query(
    `INSERT INTO chipp_spawn_budget (date, spawn_count, max_spawns)
     VALUES (CURRENT_DATE, 1, $1)
     ON CONFLICT (date)
     DO UPDATE SET spawn_count = chipp_spawn_budget.spawn_count + 1`,
    [DAILY_SPAWN_BUDGET]
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
 * Returns { allowed: boolean, reason?: string }.
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

  if (!(await canSpawn())) {
    return { allowed: false, reason: "budget_or_concurrency" };
  }

  return { allowed: true };
}
