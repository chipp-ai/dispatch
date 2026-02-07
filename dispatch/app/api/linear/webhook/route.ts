import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";
import { getStatusByName, createStatus } from "@/lib/services/statusService";
import { getLabelByName, createLabel } from "@/lib/services/labelService";
import {
  findByExternalId,
  linkExternalIssue,
} from "@/lib/services/externalIssueService";
import { getIssueForBoard } from "@/lib/services/issueService";
import { broadcastBoardEvent } from "@/lib/services/boardBroadcast";
import {
  mapLinearPriority,
  mapLinearStatus,
} from "@/lib/services/linearService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinearWebhookPayload {
  action: "create" | "update" | "remove";
  type: "Issue" | "Comment" | "IssueLabel" | "Project";
  data: LinearIssuePayload | LinearCommentPayload;
  url: string;
  createdAt: string;
  organizationId: string;
  webhookId: string;
  webhookTimestamp: number;
}

interface LinearIssuePayload {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority: number;
  priorityLabel: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
  team: {
    id: string;
    key: string;
    name: string;
  };
  labels?: Array<{ id: string; name: string; color: string }>;
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface LinearCommentPayload {
  id: string;
  body: string;
  issueId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    console.warn("[Linear Webhook] Missing signature or secret");
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const expectedSignature = hmac.digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/linear/webhook
 *
 * Receives webhooks from Linear for issue sync.
 * Handles: Issue.create, Issue.update, Issue.remove
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

  // Get raw body for signature verification
  const rawBody = await request.text();

  // Verify signature if secret is configured
  if (webhookSecret) {
    const signature = request.headers.get("linear-signature");
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.error("[Linear Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.error(
      "[Linear Webhook] No webhook secret configured; rejecting webhook request"
    );
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    `[Linear Webhook] Received: type=${payload.type}, action=${payload.action}`
  );

  // Only process Issue webhooks for now
  if (payload.type !== "Issue") {
    return NextResponse.json({
      success: true,
      message: `Ignored non-Issue webhook: ${payload.type}`,
    });
  }

  const issueData = payload.data as LinearIssuePayload;

  try {
    switch (payload.action) {
      case "create":
        return await handleIssueCreate(issueData);
      case "update":
        return await handleIssueUpdate(issueData);
      case "remove":
        return await handleIssueRemove(issueData);
      default:
        return NextResponse.json({
          success: true,
          message: `Ignored action: ${payload.action}`,
        });
    }
  } catch (error) {
    console.error("[Linear Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Issue Handlers
// ---------------------------------------------------------------------------

async function handleIssueCreate(
  issueData: LinearIssuePayload
): Promise<NextResponse> {
  console.log(
    `[Linear Webhook] Creating issue from Linear: ${issueData.identifier}`
  );

  // Check if already exists
  const existingLink = await findByExternalId("linear", issueData.id);
  if (existingLink) {
    console.log(
      `[Linear Webhook] Issue ${issueData.identifier} already exists, skipping create`
    );
    return NextResponse.json({
      success: true,
      deduplicated: true,
      message: `Issue ${issueData.identifier} already exists`,
    });
  }

  const workspace = await getOrCreateDefaultWorkspace();

  // Get or create status
  const statusName = mapLinearStatus(issueData.state.name);
  let status = await getStatusByName(workspace.id, statusName);
  if (!status) {
    status = await createStatus(workspace.id, {
      name: statusName,
      color: "#5e6ad2",
    });
  }

  // Get or create labels
  const labelIds: string[] = [];
  if (issueData.labels) {
    for (const label of issueData.labels) {
      let existingLabel = await getLabelByName(workspace.id, label.name);
      if (!existingLabel) {
        existingLabel = await createLabel(workspace.id, {
          name: label.name,
          color: label.color,
        });
      }
      labelIds.push(existingLabel.id);
    }
  }

  // Get or create agent for assignee
  let assigneeId: string | null = null;
  if (issueData.assignee) {
    const existingAgent = await db.queryOne<{ id: string }>(
      `SELECT id FROM chipp_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
      [workspace.id, issueData.assignee.name]
    );
    if (existingAgent) {
      assigneeId = existingAgent.id;
    } else {
      assigneeId = uuidv4();
      await db.query(
        `INSERT INTO chipp_agent (id, workspace_id, name, description, is_active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          assigneeId,
          workspace.id,
          issueData.assignee.name,
          `Synced from Linear: ${issueData.assignee.email}`,
        ]
      );
    }
  }

  // Create issue
  const issueId = uuidv4();
  const issueNumber = parseInt(issueData.identifier.split("-")[1], 10);

  await db.query(
    `INSERT INTO chipp_issue (
      id, identifier, issue_number, title, description,
      status_id, priority, assignee_id, workspace_id,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      issueId,
      issueData.identifier,
      issueNumber,
      issueData.title,
      issueData.description || null,
      status.id,
      mapLinearPriority(issueData.priority),
      assigneeId,
      workspace.id,
      new Date(issueData.createdAt),
      new Date(issueData.updatedAt),
    ]
  );

  // Add labels
  for (const labelId of labelIds) {
    await db.query(
      `INSERT INTO chipp_issue_label (issue_id, label_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [issueId, labelId]
    );
  }

  // Link to Linear
  await linkExternalIssue({
    issueId,
    source: "linear",
    externalId: issueData.id,
    externalUrl: `https://linear.app/issue/${issueData.identifier}`,
    metadata: {
      identifier: issueData.identifier,
      state: issueData.state,
      team: issueData.team,
    },
  });

  // Update workspace issue counter
  await db.query(
    `UPDATE chipp_workspace SET next_issue_number = GREATEST(next_issue_number, $1 + 1) WHERE id = $2`,
    [issueNumber, workspace.id]
  );

  // Broadcast to connected clients
  const boardIssue = await getIssueForBoard(issueData.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_created",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  console.log(
    `[Linear Webhook] Created issue ${issueData.identifier} from Linear`
  );

  return NextResponse.json({
    success: true,
    action: "created",
    issue: { id: issueId, identifier: issueData.identifier },
  });
}

async function handleIssueUpdate(
  issueData: LinearIssuePayload
): Promise<NextResponse> {
  console.log(
    `[Linear Webhook] Updating issue from Linear: ${issueData.identifier}`
  );

  // Find existing linked issue
  const existingLink = await findByExternalId("linear", issueData.id);
  if (!existingLink) {
    // Issue doesn't exist locally - create it
    console.log(
      `[Linear Webhook] Issue ${issueData.identifier} not found, creating it`
    );
    return handleIssueCreate(issueData);
  }

  const workspace = await getOrCreateDefaultWorkspace();

  // Get current issue to check for status changes
  const currentIssue = await db.queryOne<{
    status_id: string;
    status_name: string;
  }>(
    `SELECT i.status_id, s.name as status_name
     FROM chipp_issue i
     JOIN chipp_status s ON i.status_id = s.id
     WHERE i.id = $1`,
    [existingLink.issue_id]
  );

  // Get or create status
  const statusName = mapLinearStatus(issueData.state.name);
  let status = await getStatusByName(workspace.id, statusName);
  if (!status) {
    status = await createStatus(workspace.id, {
      name: statusName,
      color: "#5e6ad2",
    });
  }

  // Get or create agent for assignee
  let assigneeId: string | null = null;
  if (issueData.assignee) {
    const existingAgent = await db.queryOne<{ id: string }>(
      `SELECT id FROM chipp_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
      [workspace.id, issueData.assignee.name]
    );
    if (existingAgent) {
      assigneeId = existingAgent.id;
    } else {
      assigneeId = uuidv4();
      await db.query(
        `INSERT INTO chipp_agent (id, workspace_id, name, description, is_active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [
          assigneeId,
          workspace.id,
          issueData.assignee.name,
          `Synced from Linear: ${issueData.assignee.email}`,
        ]
      );
    }
  }

  // Update issue
  await db.query(
    `UPDATE chipp_issue SET
      title = $1,
      description = $2,
      status_id = $3,
      priority = $4,
      assignee_id = $5,
      updated_at = NOW()
    WHERE id = $6`,
    [
      issueData.title,
      issueData.description || null,
      status.id,
      mapLinearPriority(issueData.priority),
      assigneeId,
      existingLink.issue_id,
    ]
  );

  // Update labels if provided
  if (issueData.labels) {
    await db.query(`DELETE FROM chipp_issue_label WHERE issue_id = $1`, [
      existingLink.issue_id,
    ]);

    for (const label of issueData.labels) {
      let existingLabel = await getLabelByName(workspace.id, label.name);
      if (!existingLabel) {
        existingLabel = await createLabel(workspace.id, {
          name: label.name,
          color: label.color,
        });
      }
      await db.query(
        `INSERT INTO chipp_issue_label (issue_id, label_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [existingLink.issue_id, existingLabel.id]
      );
    }
  }

  // Update external issue metadata
  await db.query(
    `UPDATE chipp_external_issue SET metadata = $1 WHERE id = $2`,
    [
      JSON.stringify({
        identifier: issueData.identifier,
        state: issueData.state,
        team: issueData.team,
        lastSyncedAt: new Date().toISOString(),
      }),
      existingLink.id,
    ]
  );

  // Broadcast to connected clients
  const boardIssue = await getIssueForBoard(issueData.identifier);
  if (boardIssue) {
    // Check if status changed
    const statusChanged = currentIssue?.status_id !== status.id;

    if (statusChanged) {
      broadcastBoardEvent({
        type: "issue_moved",
        issue: boardIssue,
        previousStatusId: currentIssue?.status_id,
        timestamp: new Date().toISOString(),
      });
    } else {
      broadcastBoardEvent({
        type: "issue_updated",
        issue: boardIssue,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log(
    `[Linear Webhook] Updated issue ${issueData.identifier} from Linear`
  );

  return NextResponse.json({
    success: true,
    action: "updated",
    issue: { id: existingLink.issue_id, identifier: issueData.identifier },
  });
}

async function handleIssueRemove(
  issueData: LinearIssuePayload
): Promise<NextResponse> {
  console.log(
    `[Linear Webhook] Removing issue from Linear: ${issueData.identifier}`
  );

  // Find existing linked issue
  const existingLink = await findByExternalId("linear", issueData.id);
  if (!existingLink) {
    console.log(
      `[Linear Webhook] Issue ${issueData.identifier} not found, nothing to remove`
    );
    return NextResponse.json({
      success: true,
      message: `Issue ${issueData.identifier} not found`,
    });
  }

  // Store issue ID before deletion for broadcast
  const issueId = existingLink.issue_id;

  // Delete the issue (cascades to labels, comments, external links)
  await db.query(`DELETE FROM chipp_issue WHERE id = $1`, [issueId]);

  // Broadcast deletion
  broadcastBoardEvent({
    type: "issue_deleted",
    issueId,
    identifier: issueData.identifier,
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[Linear Webhook] Deleted issue ${issueData.identifier} from Linear`
  );

  return NextResponse.json({
    success: true,
    action: "deleted",
    issue: { id: issueId, identifier: issueData.identifier },
  });
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * GET /api/linear/webhook
 *
 * Health check and webhook info.
 */
export async function GET() {
  const hasSecret = !!process.env.LINEAR_WEBHOOK_SECRET;
  const hasApiKey = !!process.env.LINEAR_API_KEY;

  return NextResponse.json({
    status: "ok",
    endpoint: "/api/linear/webhook",
    description: "Linear webhook endpoint for issue sync",
    configured: {
      webhookSecret: hasSecret,
      apiKey: hasApiKey,
    },
    supported_events: ["Issue.create", "Issue.update", "Issue.remove"],
    setup_instructions: {
      1: "Go to Linear > Settings > API > Webhooks",
      2: "Create a new webhook with URL: https://your-domain/api/linear/webhook",
      3: "Select events: Issues (Create, Update, Remove)",
      4: "Copy the signing secret and set LINEAR_WEBHOOK_SECRET env var",
    },
  });
}
