import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  createIssue,
  getIssue,
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
  fetchSentryIssueDetails,
  extractStackTrace,
  extractTags,
  extractRequestInfo,
  extractUserInfo,
  extractContexts,
  SentryIssueDetails,
} from "@/lib/services/sentryService";
import {
  findSuspectedCommits,
  extractFilesFromStackTrace,
  formatCorrelationResults,
  CorrelationResult,
} from "@/lib/services/githubCorrelationService";
import { logSentryEvent } from "@/lib/services/sentryEventLogService";
import { handleSentryEventForMonitoredFix } from "@/lib/services/fixTrackingService";

// Sentry webhook payload types
interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  logger: string | null;
  level: string;
  status: "resolved" | "unresolved" | "ignored";
  substatus: "new" | "regressed" | "escalating" | "ongoing" | string;
  statusDetails: Record<string, unknown>;
  isPublic: boolean;
  platform: string;
  project: {
    id: string;
    name: string;
    slug: string;
    platform: string;
  };
  type: string;
  metadata: {
    value?: string;
    type?: string;
    filename?: string;
    function?: string;
  };
  numComments: number;
  assignedTo: unknown | null;
  isBookmarked: boolean;
  isSubscribed: boolean;
  subscriptionDetails: unknown | null;
  hasSeen: boolean;
  annotations: unknown[];
  issueType: string;
  issueCategory: string;
  priority: string;
  priorityLockedAt: string | null;
  isUnhandled: boolean;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface SentryWebhookPayload {
  action: "created" | "resolved" | "unresolved" | "assigned" | "archived";
  data: {
    issue: SentryIssue;
  };
  installation?: {
    uuid: string;
  };
  actor?: {
    type: string;
    id: string;
    name: string;
  };
}

// Verify Sentry webhook signature
function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    console.warn("[Sentry Webhook] Missing signature or secret");
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(digest, "hex"),
    Buffer.from(signature, "hex")
  );
}

// Map Sentry priority to Dispatch priority
function mapSentryPriority(sentryPriority: string): "P1" | "P2" | "P3" | "P4" {
  switch (sentryPriority.toLowerCase()) {
    case "high":
      return "P1";
    case "medium":
      return "P2";
    case "low":
      return "P4";
    default:
      return "P3";
  }
}

// Determine if we should create an issue for this event
function shouldCreateIssue(payload: SentryWebhookPayload): boolean {
  const { action, data } = payload;
  const { issue } = data;

  // Create issue for:
  // 1. New issues (action=created, substatus=new)
  // 2. Regressed issues (action=unresolved, substatus=regressed)
  // 3. Escalating issues (action=unresolved, substatus=escalating)
  if (action === "created" && issue.substatus === "new") {
    return true;
  }

  if (
    action === "unresolved" &&
    (issue.substatus === "regressed" || issue.substatus === "escalating")
  ) {
    return true;
  }

  return false;
}

// POST /api/sentry/webhook - Receive webhooks from Sentry
export async function POST(request: NextRequest) {
  const clientSecret = process.env.SENTRY_CLIENT_SECRET;

  // Get the raw body for signature verification
  const rawBody = await request.text();

  // Verify signature if secret is configured
  if (clientSecret) {
    const signature = request.headers.get("sentry-hook-signature");
    if (!verifySignature(rawBody, signature, clientSecret)) {
      console.error("[Sentry Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: SentryWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resource = request.headers.get("sentry-hook-resource");
  console.log(
    `[Sentry Webhook] Received: resource=${resource}, action=${payload.action}, ` +
      `substatus=${payload.data?.issue?.substatus}, issue=${payload.data?.issue?.shortId}`
  );

  // Only process issue webhooks
  if (resource !== "issue") {
    return NextResponse.json({
      success: true,
      message: `Ignored non-issue resource: ${resource}`,
    });
  }

  // Check if we should create an issue
  if (!shouldCreateIssue(payload)) {
    console.log(
      `[Sentry Webhook] Skipping: action=${payload.action}, substatus=${payload.data.issue.substatus}`
    );
    return NextResponse.json({
      success: true,
      message: `Skipped: ${payload.action}/${payload.data.issue.substatus}`,
    });
  }

  try {
    const workspace = await getOrCreateDefaultWorkspace();
    const sentryIssue = payload.data.issue;

    // Check for existing linked issue (deduplication)
    const existingLink = await findByExternalId("sentry", sentryIssue.id);
    if (existingLink) {
      // For regressed/escalating, we might want to reopen or add a comment
      // For now, just return the existing issue
      const existingIssue = await getIssue(existingLink.issue_id);
      console.log(
        `[Sentry Webhook] Issue already exists: ${existingIssue?.identifier} for Sentry ${sentryIssue.shortId}`
      );

      // Log this event for fix verification tracking
      try {
        // Extract release SHA from tags if available
        const fullDetails = await fetchSentryIssueDetails(sentryIssue.id);
        const tags = fullDetails?.latestEvent
          ? extractTags(fullDetails.latestEvent)
          : {};
        const releaseSha = tags.release || undefined;

        await logSentryEvent({
          externalIssueId: existingLink.id,
          sentryIssueId: sentryIssue.id,
          sentryShortId: sentryIssue.shortId,
          eventCount: parseInt(sentryIssue.count, 10),
          userCount: sentryIssue.userCount,
          releaseSha,
          firstSeen: new Date(sentryIssue.firstSeen),
          lastSeen: new Date(sentryIssue.lastSeen),
        });

        // Check if this issue has a fix being monitored - trigger immediate failure
        await handleSentryEventForMonitoredFix(
          existingLink.issue_id,
          parseInt(sentryIssue.count, 10),
          sentryIssue.shortId
        );
      } catch (logError) {
        // Don't fail the webhook if logging fails
        console.error(
          "[Sentry Webhook] Failed to log event for fix verification:",
          logError
        );
      }

      return NextResponse.json({
        success: true,
        deduplicated: true,
        issue: existingIssue
          ? {
              id: existingIssue.id,
              identifier: existingIssue.identifier,
            }
          : null,
        sentry: {
          id: sentryIssue.id,
          shortId: sentryIssue.shortId,
        },
        message: `Issue already tracked as ${existingIssue?.identifier}`,
      });
    }

    // Fetch full issue details from Sentry API (includes stack trace)
    const fullDetails = await fetchSentryIssueDetails(sentryIssue.id);

    // Find suspected commits that may have caused this error
    let correlationResult: CorrelationResult | null = null;
    if (fullDetails?.latestEvent) {
      const stackTrace = extractStackTrace(fullDetails.latestEvent);
      const stackTraceFiles = stackTrace
        ? extractFilesFromStackTrace(stackTrace)
        : [];
      correlationResult = await findSuspectedCommits(
        sentryIssue.firstSeen,
        stackTraceFiles
      );
    }

    // Build description with Sentry details and correlation
    const description = buildIssueDescription(
      sentryIssue,
      payload,
      fullDetails,
      correlationResult
    );

    // Get or create "Sentry" label
    let sentryLabel = await getLabelByName(workspace.id, "Sentry");
    if (!sentryLabel) {
      sentryLabel = await createLabel(workspace.id, {
        name: "Sentry",
        color: "#362D59", // Sentry brand color
      });
    }

    // Create the issue
    const issue = await createIssue(workspace.id, {
      title: `[${sentryIssue.project.slug}] ${sentryIssue.title}`,
      description,
      priority: mapSentryPriority(sentryIssue.priority),
      labelIds: [sentryLabel.id],
    });

    // Link the external issue for deduplication
    await linkExternalIssue({
      issueId: issue.id,
      source: "sentry",
      externalId: sentryIssue.id,
      externalUrl: sentryIssue.permalink,
      metadata: {
        shortId: sentryIssue.shortId,
        project: sentryIssue.project,
        substatus: sentryIssue.substatus,
        priority: sentryIssue.priority,
        level: sentryIssue.level,
        platform: sentryIssue.platform,
      },
    });

    console.log(
      `[Sentry Webhook] Created issue ${issue.identifier} from Sentry ${sentryIssue.shortId}`
    );

    // Broadcast to connected clients
    const boardIssue = await getIssueForBoard(issue.identifier);
    if (boardIssue) {
      broadcastBoardEvent({
        type: "issue_created",
        issue: boardIssue,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      issue: {
        id: issue.id,
        identifier: issue.identifier,
      },
      sentry: {
        id: sentryIssue.id,
        shortId: sentryIssue.shortId,
      },
    });
  } catch (error) {
    console.error("[Sentry Webhook] Error creating issue:", error);
    return NextResponse.json(
      { error: "Failed to create issue" },
      { status: 500 }
    );
  }
}

// Build rich description from Sentry issue data
function buildIssueDescription(
  issue: SentryIssue,
  payload: SentryWebhookPayload,
  fullDetails: SentryIssueDetails | null,
  correlationResult: CorrelationResult | null
): string {
  const lines: string[] = [];

  // Header based on substatus
  if (issue.substatus === "regressed") {
    lines.push(
      "**This error has regressed after being marked as resolved.**\n"
    );
  } else if (issue.substatus === "escalating") {
    lines.push(
      "**This error is escalating - event frequency is increasing.**\n"
    );
  }

  // Error details
  lines.push("## Error");
  if (issue.metadata.type) {
    lines.push(`**Type:** \`${issue.metadata.type}\``);
  }
  if (issue.metadata.value) {
    lines.push(`**Message:** ${issue.metadata.value}`);
  }
  if (issue.culprit) {
    lines.push(`**Culprit:** \`${issue.culprit}\``);
  }
  lines.push("");

  // Stack trace (from full details)
  if (fullDetails?.latestEvent) {
    const stackTrace = extractStackTrace(fullDetails.latestEvent);
    if (stackTrace) {
      lines.push("## Stack Trace");
      lines.push(stackTrace);
      lines.push("");
    }
  }

  // Suspected cause (GitHub correlation)
  if (correlationResult) {
    const correlationSection = formatCorrelationResults(correlationResult);
    if (correlationSection) {
      lines.push(correlationSection);
    }
  }

  // HTTP Request info
  if (fullDetails?.latestEvent) {
    const requestInfo = extractRequestInfo(fullDetails.latestEvent);
    if (requestInfo && (requestInfo.method || requestInfo.url)) {
      lines.push("## HTTP Request");
      if (requestInfo.method) {
        lines.push(`**Method:** ${requestInfo.method}`);
      }
      if (requestInfo.url) {
        lines.push(`**URL:** ${requestInfo.url}`);
      }
      lines.push("");
    }
  }

  // User info
  if (fullDetails?.latestEvent) {
    const userInfo = extractUserInfo(fullDetails.latestEvent);
    if (userInfo && (userInfo.id || userInfo.email || userInfo.ip_address)) {
      lines.push("## Affected User");
      if (userInfo.id) {
        lines.push(`- **User ID:** ${userInfo.id}`);
      }
      if (userInfo.email) {
        lines.push(`- **Email:** ${userInfo.email}`);
      }
      if (userInfo.username) {
        lines.push(`- **Username:** ${userInfo.username}`);
      }
      if (userInfo.ip_address) {
        lines.push(`- **IP:** ${userInfo.ip_address}`);
      }
      lines.push("");
    }
  }

  // Impact stats
  lines.push("## Impact");
  lines.push(`- **Total events:** ${issue.count}`);
  lines.push(`- **Users affected:** ${issue.userCount}`);
  lines.push(`- **First seen:** ${new Date(issue.firstSeen).toLocaleString()}`);
  lines.push(`- **Last seen:** ${new Date(issue.lastSeen).toLocaleString()}`);
  lines.push("");

  // Tags (environment, runtime, server, etc.)
  if (fullDetails?.latestEvent) {
    const tags = extractTags(fullDetails.latestEvent);
    const importantTags = [
      "environment",
      "runtime",
      "runtime.name",
      "server_name",
      "transaction",
      "browser",
      "browser.name",
      "os",
      "os.name",
      "device",
      "release",
      "handled",
      "level",
      "mechanism",
    ];
    const relevantTags = Object.entries(tags).filter(([key]) =>
      importantTags.some((t) => key.toLowerCase().includes(t.toLowerCase()))
    );

    if (relevantTags.length > 0) {
      lines.push("## Environment");
      for (const [key, value] of relevantTags) {
        lines.push(`- **${key}:** ${value}`);
      }
      lines.push("");
    }
  }

  // Runtime/Device context
  if (fullDetails?.latestEvent) {
    const contexts = extractContexts(fullDetails.latestEvent);
    const contextLines: string[] = [];

    if (contexts.runtime) {
      const rt = contexts.runtime;
      if (rt.name || rt.version) {
        contextLines.push(
          `- **Runtime:** ${rt.name || ""} ${rt.version || ""}`.trim()
        );
      }
    }

    if (contexts.os) {
      const os = contexts.os;
      if (os.name || os.version) {
        contextLines.push(
          `- **OS:** ${os.name || ""} ${os.version || ""}`.trim()
        );
      }
    }

    if (contexts.device) {
      const dev = contexts.device;
      if (dev.arch) {
        contextLines.push(`- **Architecture:** ${dev.arch}`);
      }
    }

    if (contextLines.length > 0) {
      lines.push("## System Context");
      lines.push(...contextLines);
      lines.push("");
    }
  }

  // Project info
  lines.push("## Project");
  lines.push(`- **Name:** ${issue.project.name}`);
  lines.push(`- **Slug:** ${issue.project.slug}`);
  lines.push(`- **Platform:** ${issue.platform}`);
  lines.push(`- **Level:** ${issue.level}`);
  if (issue.isUnhandled) {
    lines.push(`- **Unhandled:** Yes`);
  }
  lines.push("");

  // Link to Sentry
  lines.push("## Links");
  lines.push(`- [View in Sentry](${issue.permalink})`);
  lines.push(`- Sentry ID: \`${issue.shortId}\``);
  if (fullDetails?.latestEvent?.eventID) {
    lines.push(`- Event ID: \`${fullDetails.latestEvent.eventID}\``);
  }

  return lines.join("\n");
}

// GET /api/sentry/webhook - Health check / verification endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/sentry/webhook",
    description: "Sentry webhook endpoint for automatic issue creation",
    supported_events: [
      "issue.created (substatus=new)",
      "issue.unresolved (substatus=regressed)",
      "issue.unresolved (substatus=escalating)",
    ],
  });
}
