import { db } from "../db";
import { randomUUID } from "crypto";
import crypto from "crypto";

// Types matching Prisma schema
export type WebhookEventType =
  | "ISSUE_CREATED"
  | "ISSUE_UPDATED"
  | "ISSUE_DELETED"
  | "ISSUE_ASSIGNED"
  | "COMMENT_CREATED"
  | "STATUS_CHANGED";

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  enabled: boolean;
  workspace_id: string;
  created_at: Date;
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    assignee: string | null;
  };
  metadata?: Record<string, unknown>;
}

// Get all enabled webhooks for a workspace
export async function getWorkspaceWebhooks(
  workspaceId: string
): Promise<Webhook[]> {
  return db.query<Webhook>(
    `SELECT * FROM chipp_webhook WHERE workspace_id = $1 AND enabled = true`,
    [workspaceId]
  );
}

// Get webhooks subscribed to a specific event type
export async function getWebhooksForEvent(
  workspaceId: string,
  eventType: WebhookEventType
): Promise<Webhook[]> {
  return db.query<Webhook>(
    `SELECT * FROM chipp_webhook
     WHERE workspace_id = $1
       AND enabled = true
       AND $2 = ANY(events)`,
    [workspaceId, eventType]
  );
}

// Register a new webhook
export async function registerWebhook(
  workspaceId: string,
  url: string,
  events: WebhookEventType[]
): Promise<Webhook> {
  const id = randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");

  await db.query(
    `INSERT INTO chipp_webhook (id, workspace_id, url, secret, events, enabled, created_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW())`,
    [id, workspaceId, url, secret, events]
  );

  const webhook = await db.queryOne<Webhook>(
    `SELECT * FROM chipp_webhook WHERE id = $1`,
    [id]
  );
  return webhook!;
}

// Update agent's webhook URL (simpler per-agent webhook)
export async function updateAgentWebhook(
  agentId: string,
  webhookUrl: string
): Promise<void> {
  const secret = crypto.randomBytes(32).toString("hex");
  await db.query(
    `UPDATE chipp_agent SET webhook_url = $1, webhook_secret = $2, updated_at = NOW() WHERE id = $3`,
    [webhookUrl, secret, agentId]
  );
}

// Get agent's webhook config
export async function getAgentWebhook(
  agentId: string
): Promise<{ url: string; secret: string } | null> {
  const agent = await db.queryOne<{
    webhook_url: string | null;
    webhook_secret: string | null;
  }>(`SELECT webhook_url, webhook_secret FROM chipp_agent WHERE id = $1`, [
    agentId,
  ]);
  if (!agent?.webhook_url) return null;
  return { url: agent.webhook_url, secret: agent.webhook_secret || "" };
}

// Deactivate a webhook
export async function deactivateWebhook(webhookId: string): Promise<void> {
  await db.query(`UPDATE chipp_webhook SET enabled = false WHERE id = $1`, [
    webhookId,
  ]);
}

// Generate HMAC signature for webhook payload
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Record webhook delivery
async function recordDelivery(
  webhookId: string,
  event: WebhookEventType,
  payload: WebhookPayload,
  statusCode: number | null,
  responseBody: string | null,
  successful: boolean
): Promise<void> {
  await db.query(
    `INSERT INTO chipp_webhook_delivery (id, webhook_id, event, payload, status_code, response_body, successful, delivered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      randomUUID(),
      webhookId,
      event,
      JSON.stringify(payload),
      statusCode,
      responseBody,
      successful,
    ]
  );
}

// Dispatch webhook to all subscribed endpoints
export async function dispatchWebhook(
  workspaceId: string,
  payload: WebhookPayload
): Promise<{ success: number; failed: number }> {
  const webhooks = await getWebhooksForEvent(workspaceId, payload.event);

  let success = 0;
  let failed = 0;

  await Promise.all(
    webhooks.map(async (webhook) => {
      const payloadString = JSON.stringify(payload);
      const signature = signPayload(payloadString, webhook.secret);

      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": payload.event,
            "X-Webhook-Timestamp": payload.timestamp,
            "X-Webhook-Signature": `sha256=${signature}`,
          },
          body: payloadString,
        });

        const responseBody = await response.text().catch(() => null);

        await recordDelivery(
          webhook.id,
          payload.event,
          payload,
          response.status,
          responseBody,
          response.ok
        );

        if (response.ok) {
          success++;
          console.log(
            `[Webhook] Dispatched ${payload.event} to ${webhook.url}`
          );
        } else {
          failed++;
          console.error(
            `[Webhook] Failed to dispatch to ${webhook.url}: ${response.status}`
          );
        }
      } catch (error) {
        failed++;
        console.error(`[Webhook] Error dispatching to ${webhook.url}:`, error);
        await recordDelivery(
          webhook.id,
          payload.event,
          payload,
          null,
          String(error),
          false
        );
      }
    })
  );

  return { success, failed };
}

// Dispatch to a specific agent's webhook
export async function dispatchToAgent(
  agentId: string,
  payload: WebhookPayload
): Promise<boolean> {
  const webhook = await getAgentWebhook(agentId);
  if (!webhook) return false;

  const payloadString = JSON.stringify(payload);
  const signature = signPayload(payloadString, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": payload.event,
        "X-Webhook-Timestamp": payload.timestamp,
        "X-Webhook-Signature": `sha256=${signature}`,
      },
      body: payloadString,
    });

    if (response.ok) {
      console.log(`[Webhook] Dispatched ${payload.event} to agent ${agentId}`);
      return true;
    } else {
      console.error(
        `[Webhook] Failed to dispatch to agent ${agentId}: ${response.status}`
      );
      return false;
    }
  } catch (error) {
    console.error(`[Webhook] Error dispatching to agent ${agentId}:`, error);
    return false;
  }
}

// Build webhook payload from issue data
export function buildWebhookPayload(
  event: WebhookEventType,
  issue: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    priority: string;
    status_name: string;
    assignee_name: string | null;
  },
  metadata?: Record<string, unknown>
): WebhookPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: issue.status_name,
      assignee: issue.assignee_name,
    },
    metadata,
  };
}
