import { NextRequest, NextResponse } from "next/server";
import {
  createIssue,
  getIssueForBoard,
} from "@/lib/services/issueService";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import { getLabelByName, createLabel } from "@/lib/services/labelService";
import { broadcastBoardEvent } from "@/lib/services/boardBroadcast";
import {
  findByExternalId,
  linkExternalIssue,
} from "@/lib/services/externalIssueService";
import {
  extractContextFromGrafanaAlert,
  buildIssueDescription,
  GrafanaWebhookPayload,
  GrafanaAlert,
  LokiErrorContext,
} from "@/lib/services/lokiService";
import {
  checkSpawnGate,
  dispatchInvestigation,
  recordSpawn,
} from "@/lib/services/spawnService";
import { handleLokiEventForMonitoredFix } from "@/lib/services/fixTrackingService";
import { db } from "@/lib/db";

// --- Auth ---

/**
 * Verify the webhook request is authentic.
 * Accepts either:
 * 1. Bearer token in Authorization header matching LOKI_WEBHOOK_SECRET
 * 2. Presence of X-Grafana-Alertmanager header (trusted internal network)
 */
function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.LOKI_WEBHOOK_SECRET;

  // If no secret configured, allow (dev mode)
  if (!secret) {
    console.warn("[Loki Webhook] No LOKI_WEBHOOK_SECRET configured, allowing request");
    return true;
  }

  // Check Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === secret) {
      return true;
    }
  }

  // Check for Grafana-specific header as fallback
  if (request.headers.get("x-grafana-alertmanager")) {
    // In production, you'd also verify the source IP or use mTLS
    console.log("[Loki Webhook] Accepted via X-Grafana-Alertmanager header");
    return true;
  }

  return false;
}

// --- Priority Mapping ---

/**
 * Map event count to issue priority.
 * Higher event counts indicate more impactful errors.
 */
function mapEventCountToPriority(
  eventCount: number,
  level: string
): "P1" | "P2" | "P3" | "P4" {
  // Critical/fatal always gets high priority
  if (level === "fatal" || level === "critical") {
    return "P1";
  }

  if (eventCount >= 100) return "P1";
  if (eventCount >= 20) return "P2";
  if (eventCount >= 5) return "P3";
  return "P4";
}

// --- Webhook Handler ---

export async function POST(request: NextRequest) {
  // Auth check
  if (!verifyAuth(request)) {
    console.error("[Loki Webhook] Authentication failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: GrafanaWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    `[Loki Webhook] Received: status=${payload.status}, alerts=${payload.alerts?.length || 0}, ` +
      `title=${payload.title}`
  );

  // Only process firing alerts (not resolved)
  const firingAlerts = (payload.alerts || []).filter(
    (a) => a.status === "firing"
  );

  if (firingAlerts.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No firing alerts to process",
    });
  }

  const results: Array<{
    fingerprint: string;
    action: string;
    issueIdentifier?: string;
    spawnStatus?: string;
  }> = [];

  for (const alert of firingAlerts) {
    try {
      const result = await processAlert(alert);
      results.push(result);
    } catch (error) {
      console.error("[Loki Webhook] Error processing alert:", error);
      results.push({
        fingerprint: alert.fingerprint || "unknown",
        action: "error",
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}

/**
 * Process a single Grafana alert.
 */
async function processAlert(alert: GrafanaAlert): Promise<{
  fingerprint: string;
  action: string;
  issueIdentifier?: string;
  spawnStatus?: string;
}> {
  // Extract context
  const context = extractContextFromGrafanaAlert(alert);

  console.log(
    `[Loki Webhook] Processing: source=${context.source}, feature=${context.feature}, ` +
      `fingerprint=${context.fingerprint.slice(0, 12)}..., events=${context.eventCount}`
  );

  // Check for existing linked issue (dedup by fingerprint)
  const existingLink = await findByExternalId("loki", context.fingerprint);

  if (existingLink) {
    // Known error: increment event count and update last_seen
    await db.query(
      `UPDATE chipp_external_issue
       SET event_count = event_count + $1,
           last_seen_at = NOW()
       WHERE id = $2`,
      [context.eventCount, existingLink.id]
    );

    console.log(
      `[Loki Webhook] Deduplicated: fingerprint=${context.fingerprint.slice(0, 12)}... ` +
        `linked to issue ${existingLink.issue_id}`
    );

    // Check if this issue has a fix being monitored - trigger immediate failure
    try {
      await handleLokiEventForMonitoredFix(
        existingLink.issue_id,
        context.eventCount,
        context.fingerprint
      );
    } catch (fixTrackingError) {
      console.error(
        "[Loki Webhook] Failed to check fix tracking:",
        fixTrackingError
      );
    }

    // Even for existing issues, check if we should now spawn
    // (event count may have crossed threshold since last check)
    const spawnResult = await maybeSpawnForExistingIssue(
      existingLink.issue_id,
      context.fingerprint
    );

    return {
      fingerprint: context.fingerprint,
      action: "deduplicated",
      spawnStatus: spawnResult,
    };
  }

  // New error: create an issue
  const issue = await createIssueFromLokiContext(context);

  // Link external issue for dedup
  await linkExternalIssue({
    issueId: issue.id,
    source: "loki",
    externalId: context.fingerprint,
    externalUrl: context.generatorURL || undefined,
    metadata: {
      source: context.source,
      feature: context.feature,
      normalizedMsg: context.normalizedMsg,
      level: context.level,
      labels: context.labels,
      eventCount: context.eventCount,
    },
  });

  // Update event_count on the newly created external issue link
  // (linkExternalIssue sets event_count=1 by default, we may need more)
  if (context.eventCount > 1) {
    await db.query(
      `UPDATE chipp_external_issue
       SET event_count = $1
       WHERE source = 'loki' AND external_id = $2`,
      [context.eventCount, context.fingerprint]
    );
  }

  console.log(
    `[Loki Webhook] Created issue ${issue.identifier} from Loki alert ` +
      `(source=${context.source}, feature=${context.feature})`
  );

  // Broadcast to connected board clients
  const boardIssue = await getIssueForBoard(issue.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_created",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  // Check spawn gate for the new issue
  const spawnResult = await maybeSpawn(issue, context.fingerprint);

  return {
    fingerprint: context.fingerprint,
    action: "created",
    issueIdentifier: issue.identifier,
    spawnStatus: spawnResult,
  };
}

/**
 * Create a Chipp Issue from Loki error context.
 */
async function createIssueFromLokiContext(
  context: LokiErrorContext
): Promise<{ id: string; identifier: string }> {
  const workspace = await getOrCreateDefaultWorkspace();

  // Get or create "Loki" label
  let lokiLabel = await getLabelByName(workspace.id, "Loki");
  if (!lokiLabel) {
    lokiLabel = await createLabel(workspace.id, {
      name: "Loki",
      color: "#E6522C", // Grafana/Loki brand color
    });
  }

  // Build title: [source/feature] message (truncated)
  const titleMsg =
    context.msg.length > 100
      ? context.msg.slice(0, 97) + "..."
      : context.msg;
  const title = `[${context.source}/${context.feature}] ${titleMsg}`;

  const description = buildIssueDescription(context);
  const priority = mapEventCountToPriority(context.eventCount, context.level);

  return createIssue(workspace.id, {
    title,
    description,
    priority,
    labelIds: [lokiLabel.id],
  });
}

/**
 * Attempt to spawn an autonomous investigation for a newly created issue.
 */
async function maybeSpawn(
  issue: { id: string; identifier: string; title?: string; description?: string | null },
  fp: string
): Promise<string> {
  const gate = await checkSpawnGate(fp);

  if (!gate.allowed) {
    console.log(
      `[Loki Webhook] Spawn blocked for ${issue.identifier}: ${gate.reason}`
    );
    return `blocked: ${gate.reason}`;
  }

  try {
    const runId = await dispatchInvestigation({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title || "",
      description: issue.description || null,
    });

    await recordSpawn(issue.id, runId);

    console.log(
      `[Loki Webhook] Spawned investigation for ${issue.identifier}: ${runId}`
    );
    return `spawned: ${runId}`;
  } catch (error) {
    console.error(
      `[Loki Webhook] Failed to spawn investigation for ${issue.identifier}:`,
      error
    );
    return `spawn_failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
}

/**
 * For existing (deduplicated) issues, check whether we should now spawn
 * an investigation. This covers the case where event count has crossed
 * the threshold since the issue was first created.
 */
async function maybeSpawnForExistingIssue(
  issueId: string,
  fp: string
): Promise<string> {
  // Check if this issue already has a running or completed spawn
  const issue = await db.queryOne<{
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    spawn_status: string | null;
  }>(
    `SELECT id, identifier, title, description, spawn_status FROM chipp_issue WHERE id = $1`,
    [issueId]
  );

  if (!issue) return "issue_not_found";

  // Don't re-spawn if already running or completed
  if (issue.spawn_status === "running" || issue.spawn_status === "completed") {
    return `already_${issue.spawn_status}`;
  }

  return maybeSpawn(issue, fp);
}

// --- Health Check ---

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/loki/webhook",
    description: "Grafana/Loki alert webhook for automatic issue creation and autonomous investigation",
    supported_events: ["Grafana unified alerting webhooks (firing alerts)"],
  });
}
