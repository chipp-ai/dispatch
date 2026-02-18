/**
 * Internal Slack Notification Service
 *
 * Posts error alerts and agent lifecycle updates to an internal team channel.
 * Reuses the same SLACK_BOT_TOKEN as customer notifications but targets a
 * separate channel (INTERNAL_SLACK_CHANNEL_ID).
 *
 * Threading: the initial error message is top-level. Agent started/completed
 * updates are posted as thread replies under that message.
 */

import { WebClient } from "@slack/web-api";
import { db } from "../db";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const INTERNAL_SLACK_CHANNEL_ID = process.env.INTERNAL_SLACK_CHANNEL_ID;

function areNotificationsEnabled(): boolean {
  const enabled = process.env.NOTIFICATIONS_ENABLED;
  return enabled?.toLowerCase() !== "false";
}

// Cache client instance
let cachedClient: WebClient | null = null;

function getSlackClient(): WebClient | null {
  if (!SLACK_BOT_TOKEN) return null;
  if (!cachedClient) {
    cachedClient = new WebClient(SLACK_BOT_TOKEN);
  }
  return cachedClient;
}

function canNotify(): boolean {
  if (!areNotificationsEnabled()) return false;
  if (!INTERNAL_SLACK_CHANNEL_ID) return false;
  if (!getSlackClient()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// URL Helper
// ---------------------------------------------------------------------------

function buildIssueUrl(identifier: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${baseUrl}/issue/${identifier}`;
}

// ---------------------------------------------------------------------------
// Priority Emoji
// ---------------------------------------------------------------------------

function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case "P1":
      return ":rotating_light:";
    case "P2":
      return ":warning:";
    case "P3":
      return ":large_blue_circle:";
    case "P4":
      return ":white_circle:";
    default:
      return ":grey_question:";
  }
}

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

export interface InternalNewErrorParams {
  issueId: string;
  identifier: string;
  title: string;
  priority: string;
  source: string;
  feature: string;
  eventCount: number;
}

/**
 * Post a top-level message to the internal Slack channel when a new Loki error
 * creates a Dispatch issue. Stores the message timestamp on the issue for
 * threading subsequent agent lifecycle replies.
 */
export async function notifyInternalNewError(
  params: InternalNewErrorParams
): Promise<void> {
  if (!canNotify()) return;

  const client = getSlackClient()!;
  const url = buildIssueUrl(params.identifier);
  const emoji = getPriorityEmoji(params.priority);

  const text =
    `${emoji} *${params.identifier}*: [${params.source}/${params.feature}] ${params.title}\n` +
    `${params.priority} | ${params.eventCount} event${params.eventCount !== 1 ? "s" : ""}\n` +
    `<${url}|View in Dispatch>`;

  const result = await client.chat.postMessage({
    channel: INTERNAL_SLACK_CHANNEL_ID!,
    text,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (result.ts) {
    await db.query(
      `UPDATE dispatch_issue SET internal_slack_ts = $1 WHERE id = $2`,
      [result.ts, params.issueId]
    );
  }
}

export interface InternalAgentStartedParams {
  issueId: string;
  identifier: string;
  spawnType: string;
}

/**
 * Post a thread reply when an agent is spawned for an issue.
 */
export async function notifyInternalAgentStarted(
  params: InternalAgentStartedParams
): Promise<void> {
  if (!canNotify()) return;

  const threadTs = await getInternalSlackTs(params.issueId);
  if (!threadTs) return;

  const client = getSlackClient()!;
  const text = `:robot_face: Agent started (${params.spawnType})`;

  await client.chat.postMessage({
    channel: INTERNAL_SLACK_CHANNEL_ID!,
    text,
    thread_ts: threadTs,
    unfurl_links: false,
    unfurl_media: false,
  });
}

/**
 * Post a thread reply when an agent completes or fails.
 * Pulls outcome details from the issue record.
 */
export async function notifyInternalAgentCompleted(
  issueId: string
): Promise<void> {
  if (!canNotify()) return;

  const issue = await db.queryOne<{
    internal_slack_ts: string | null;
    identifier: string;
    spawn_status: string | null;
    outcome_summary: string | null;
    cost_usd: number | null;
    run_outcome: string | null;
  }>(
    `SELECT internal_slack_ts, identifier, spawn_status, outcome_summary, cost_usd, run_outcome
     FROM dispatch_issue WHERE id = $1`,
    [issueId]
  );

  if (!issue?.internal_slack_ts) return;

  const client = getSlackClient()!;

  // Determine emoji and label based on outcome
  const failed =
    issue.spawn_status === "failed" || issue.run_outcome === "failed";
  const emoji = failed ? ":x:" : ":white_check_mark:";
  const label = failed ? "Investigation failed" : "Investigation complete";

  let text = `${emoji} ${label}`;

  if (issue.outcome_summary) {
    text += `\n> ${issue.outcome_summary.replace(/\n/g, "\n> ")}`;
  }

  // Look for a PR link in the agent output
  const prLink = await getPrLink(issueId);
  if (prLink) {
    text += `\nPR: ${prLink}`;
  }

  if (issue.cost_usd != null && issue.cost_usd > 0) {
    const maxCost = parseFloat(process.env.MAX_AGENT_COST_PER_RUN || "25");
    const hitLimit = issue.cost_usd >= maxCost * 0.9;
    text += `\nCost: $${issue.cost_usd.toFixed(2)}${hitLimit ? " :warning: hit budget limit" : ""}`;
  }

  await client.chat.postMessage({
    channel: INTERNAL_SLACK_CHANNEL_ID!,
    text,
    thread_ts: issue.internal_slack_ts,
    unfurl_links: false,
    unfurl_media: false,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getInternalSlackTs(issueId: string): Promise<string | null> {
  const row = await db.queryOne<{ internal_slack_ts: string | null }>(
    `SELECT internal_slack_ts FROM dispatch_issue WHERE id = $1`,
    [issueId]
  );
  return row?.internal_slack_ts || null;
}

/**
 * Try to find a PR URL from the most recent PR linked to this issue.
 */
async function getPrLink(issueId: string): Promise<string | null> {
  const pr = await db.queryOne<{ pr_url: string | null }>(
    `SELECT pr_url FROM dispatch_issue_pr
     WHERE issue_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [issueId]
  );
  return pr?.pr_url || null;
}
