/**
 * Slack Webhook Routes
 *
 * Handles incoming Slack events:
 * - URL verification (initial setup)
 * - app_mention events (bot tagged)
 * - message events (DMs and thread replies)
 */

import { Hono } from "hono";
import { log } from "@/lib/logger.ts";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import {
  slackWebhookMiddleware,
  verifySlackSignature,
} from "../../middleware/webhookAuth.ts";
import { slackService } from "../../../services/slack.service.ts";
import { handleSlackMessage } from "../../../services/slack-chat.service.ts";
import { decrypt } from "../../../services/crypto.service.ts";

// ========================================
// Types
// ========================================

interface SlackEvent {
  type: string;
  subtype?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  message?: {
    user?: string;
    text?: string;
    thread_ts?: string;
  };
}

interface SlackEventPayload {
  type: string;
  challenge?: string;
  event?: SlackEvent;
  team_id?: string;
  api_app_id?: string;
  event_id?: string;
  authorizations?: Array<{ team_id?: string; app_id?: string }>;
}

// ========================================
// Event Deduplication
// ========================================

// Simple in-memory cache for deduping Slack event IDs
const processedEventIds = new Set<string>();

function isDuplicateEvent(eventId: string, appId: string): boolean {
  const dedupeKey = `${eventId}-${appId}`;
  if (processedEventIds.has(dedupeKey)) {
    return true;
  }

  processedEventIds.add(dedupeKey);

  // Auto-prune after 5 minutes to prevent unbounded memory growth
  setTimeout(() => processedEventIds.delete(dedupeKey), 5 * 60 * 1000);

  return false;
}

// ========================================
// Routes
// ========================================

export const slackWebhookRoutes = new Hono<WebhookContext>()
  .use(slackWebhookMiddleware)
  .post("/", async (c) => {
    const rawBody = c.get("rawBody");

    // Parse payload
    let payload: SlackEventPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    log.info("Received event", {
      source: "slack-webhook",
      feature: "routing",
      type: payload.type,
      eventType: payload.event?.type,
      teamId: payload.team_id,
      appId: payload.api_app_id,
    });

    // URL verification - return challenge immediately
    if (payload.type === "url_verification") {
      if (!payload.challenge) {
        return c.json({ error: "Missing challenge" }, 400);
      }
      return c.text(payload.challenge, 200, {
        "Content-Type": "text/plain",
      });
    }

    // For event callbacks, verify signature with installation-specific secret
    if (payload.type === "event_callback") {
      const teamId = payload.team_id || payload.authorizations?.[0]?.team_id;
      const slackAppId =
        payload.api_app_id || payload.authorizations?.[0]?.app_id;

      if (!teamId || !slackAppId) {
        log.info("Missing team_id or app_id", { source: "slack-webhook", feature: "routing" });
        return c.json({ ok: true }); // Ack but don't process
      }

      // Get installation
      const installation = await slackService.getInstallationByTeamAndApp(
        teamId,
        slackAppId
      );

      if (!installation) {
        log.info("No installation found", { source: "slack-webhook", feature: "routing", teamId, slackAppId });
        return c.json({ ok: true }); // Ack but don't process
      }

      // Verify signature if we have a signing secret
      if (installation.signingSecret) {
        const slackSignature = c.req.header("X-Slack-Signature") || "";
        const timestamp = c.req.header("X-Slack-Request-Timestamp") || "";

        let signingSecret: string;
        try {
          signingSecret = await decrypt(installation.signingSecret);
        } catch {
          signingSecret = installation.signingSecret;
        }

        const isValid = await verifySlackSignature(
          rawBody,
          timestamp,
          slackSignature,
          signingSecret
        );

        if (!isValid) {
          log.warn("Invalid signature", { source: "slack-webhook", feature: "verification", teamId, slackAppId });
          return c.json({ error: "Invalid signature" }, 401);
        }
      }

      // Deduplicate events
      if (
        payload.event_id &&
        payload.api_app_id &&
        isDuplicateEvent(payload.event_id, payload.api_app_id)
      ) {
        log.debug("Duplicate event, skipping", { source: "slack-webhook", feature: "routing", eventId: payload.event_id, appId: payload.api_app_id });
        return c.json({ ok: true });
      }

      // Process event asynchronously so we can ack quickly
      const event = payload.event;
      if (event) {
        // Fire-and-forget async processing
        processEvent(installation, event, teamId, slackAppId).catch((err) => {
          log.error("Error processing event", {
            source: "slack-webhook",
            feature: "event-processing",
            teamId,
            slackAppId,
            eventType: event.type,
            eventId: payload.event_id,
          }, err);
        });
      }
    }

    // Acknowledge the event
    return c.json({ ok: true });
  });

// ========================================
// Event Processing
// ========================================

async function processEvent(
  installation: Awaited<
    ReturnType<typeof slackService.getInstallationByTeamAndApp>
  >,
  event: SlackEvent,
  teamId: string,
  slackAppId: string
): Promise<void> {
  if (!installation) return;

  log.info("Processing event", {
    source: "slack-webhook",
    feature: "event-processing",
    type: event.type,
    subtype: event.subtype,
    channel: event.channel,
    user: event.user,
    teamId,
    slackAppId,
  });

  // Normalize message_replied events (Slack Connect channels)
  if (event.subtype === "message_replied" && event.message) {
    event.user = event.message.user;
    event.text = event.message.text;
    event.thread_ts = event.message.thread_ts;
  }

  // Determine event category
  const isAppMention = event.type === "app_mention";
  const isMessageEvent = event.type === "message";
  const isDirectMessage = isMessageEvent && event.channel_type === "im";
  const isThreadFollowup =
    isMessageEvent && Boolean(event.thread_ts) && !isDirectMessage;

  // Ignore bot messages to prevent loops (except app_mention which is explicit)
  if (
    !isAppMention &&
    (event.subtype === "bot_message" || event.bot_id || !event.user)
  ) {
    log.debug("Ignoring bot/self message", { source: "slack-webhook", feature: "event-processing", teamId, slackAppId, channel: event.channel });
    return;
  }

  // Only respond to explicit mentions or DMs
  if (!isAppMention && !isDirectMessage) {
    log.debug("Ignoring non-mention/non-DM message", { source: "slack-webhook", feature: "event-processing", teamId, slackAppId, channel: event.channel });
    return;
  }

  // Handle the message
  await handleSlackMessage({
    installation,
    event,
    teamId,
    slackAppId,
    isAppMention,
    isDirectMessage,
    isThreadFollowup,
  });
}
