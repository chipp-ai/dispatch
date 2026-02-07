/**
 * Email Webhook Routes
 *
 * Handles incoming Postmark inbound webhook events:
 * - GET: Health check
 * - POST: Incoming emails (per-app or global)
 *
 * Postmark sends emails to our webhook. We:
 * 1. Validate the token from query parameter
 * 2. Look up the config by applicationId or inbound email address
 * 3. Check whitelist if enabled
 * 4. Deduplicate by Message-ID
 * 5. Extract thread info and find/create chat session
 * 6. Fire-and-forget: process the message with AI
 * 7. Return 200 immediately
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { log } from "@/lib/logger.ts";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import { emailService } from "../../../services/email.service.ts";
import { handleEmailMessage } from "../../../services/email-chat.service.ts";

// ========================================
// Schemas
// ========================================

const postmarkInboundSchema = z.object({
  MessageID: z.string(),
  From: z.string(),
  FromName: z.string().optional().default(""),
  FromFull: z
    .object({
      Email: z.string(),
      Name: z.string().optional().default(""),
    })
    .optional(),
  To: z.string(),
  ToFull: z
    .array(
      z.object({
        Email: z.string(),
        Name: z.string().optional().default(""),
      })
    )
    .optional()
    .default([]),
  Cc: z.string().optional().default(""),
  CcFull: z
    .array(
      z.object({
        Email: z.string(),
        Name: z.string().optional().default(""),
      })
    )
    .optional()
    .default([]),
  Subject: z.string().optional().default(""),
  MessageStream: z.string().optional().default("inbound"),
  ReplyTo: z.string().optional().default(""),
  MailboxHash: z.string().optional().default(""),
  Date: z.string().optional().default(""),
  TextBody: z.string().optional().default(""),
  HtmlBody: z.string().optional().default(""),
  StrippedTextReply: z.string().optional().default(""),
  Headers: z
    .array(
      z.object({
        Name: z.string(),
        Value: z.string(),
      })
    )
    .optional()
    .default([]),
  Attachments: z
    .array(
      z.object({
        Name: z.string(),
        Content: z.string(),
        ContentType: z.string(),
        ContentLength: z.number(),
      })
    )
    .optional()
    .default([]),
});

// ========================================
// Routes
// ========================================

export const emailWebhookRoutes = new Hono<WebhookContext>()
  /**
   * GET /webhooks/email/:applicationId
   * Health check for per-app webhook
   */
  .get("/:applicationId", async (c) => {
    const applicationId = c.req.param("applicationId");

    const config = await emailService.getConfigByApplicationId(applicationId);

    if (!config) {
      return c.json({ error: "Config not found" }, 404);
    }

    return c.json({
      status: "ok",
      active: config.isActive,
      inboundEmail: config.inboundEmailAddress,
    });
  })

  /**
   * POST /webhooks/email/:applicationId?token=xxx
   * Per-app inbound email webhook
   */
  .post(
    "/:applicationId",
    zValidator("json", postmarkInboundSchema),
    async (c) => {
      const applicationId = c.req.param("applicationId");
      const token = c.req.query("token");

      if (!token) {
        log.info("Missing token", { source: "email-webhook", feature: "per-app", applicationId });
        return c.json({ error: "Missing token" }, 401);
      }

      // Validate token
      const isValid = await emailService.validateWebhookToken(
        applicationId,
        token
      );
      if (!isValid) {
        log.info("Invalid token", { source: "email-webhook", feature: "per-app", applicationId });
        return c.json({ error: "Invalid token" }, 403);
      }

      const email = c.req.valid("json");

      log.info("Received email", {
        source: "email-webhook",
        feature: "per-app",
        applicationId,
        messageId: email.MessageID,
        from: email.From,
        subject: email.Subject,
      });

      // Get config
      const config = await emailService.getConfigByApplicationId(applicationId);
      if (!config) {
        log.info("Config not found", { source: "email-webhook", feature: "per-app", applicationId });
        return c.json({ success: true }); // Acknowledge but don't process
      }

      if (!config.isActive) {
        log.info("Config is inactive", { source: "email-webhook", feature: "per-app", applicationId });
        return c.json({ success: true });
      }

      // Check whitelist if enabled
      if (config.enableWhitelist) {
        const senderEmail = email.FromFull?.Email || email.From;
        const isWhitelisted = await emailService.isEmailWhitelisted(
          applicationId,
          senderEmail
        );
        if (!isWhitelisted) {
          log.info("Sender not whitelisted", { source: "email-webhook", feature: "per-app", applicationId, senderEmail });
          return c.json({ success: true }); // Acknowledge but don't process
        }
      }

      // Check for duplicate
      if (emailService.isDuplicateMessage(email.MessageID, applicationId)) {
        log.debug("Duplicate message, skipping", { source: "email-webhook", feature: "per-app", applicationId, messageId: email.MessageID });
        return c.json({ success: true });
      }

      // Generate correlation ID
      const correlationId =
        c.req.header("X-Correlation-ID") || crypto.randomUUID();

      // Process message asynchronously (fire-and-forget)
      handleEmailMessage({
        applicationId,
        configId: config.id,
        email: {
          MessageID: email.MessageID,
          From: email.From,
          FromName: email.FromName,
          FromFull: email.FromFull || {
            Email: email.From,
            Name: email.FromName,
          },
          To: email.To,
          ToFull: email.ToFull,
          Cc: email.Cc,
          CcFull: email.CcFull,
          Subject: email.Subject,
          MessageStream: email.MessageStream,
          ReplyTo: email.ReplyTo,
          MailboxHash: email.MailboxHash,
          Date: email.Date,
          TextBody: email.TextBody,
          HtmlBody: email.HtmlBody,
          StrippedTextReply: email.StrippedTextReply,
          Headers: email.Headers,
          Attachments: email.Attachments,
        },
        correlationId,
      }).catch((err) => {
        log.error("Error processing email", {
          source: "email-webhook",
          feature: "per-app",
          correlationId,
          applicationId,
          messageId: email.MessageID,
        }, err);
      });

      // Acknowledge the webhook immediately
      return c.json({ success: true });
    }
  )

  /**
   * GET /webhooks/email
   * Global health check
   */
  .get("/", (c) => {
    return c.json({
      status: "ok",
      endpoint: "email",
      timestamp: new Date().toISOString(),
    });
  })

  /**
   * POST /webhooks/email?token=xxx
   * Global inbound email webhook (looks up config by To address)
   * Used when Postmark shared infrastructure routes all emails to one endpoint
   */
  .post("/", zValidator("json", postmarkInboundSchema), async (c) => {
    const token = c.req.query("token");

    if (!token) {
      log.info("Missing token for global webhook", { source: "email-webhook", feature: "global" });
      return c.json({ error: "Missing token" }, 401);
    }

    const email = c.req.valid("json");

    log.info("Global webhook received email", {
      source: "email-webhook",
      feature: "global",
      messageId: email.MessageID,
      from: email.From,
      to: email.To,
      subject: email.Subject,
    });

    // Find config by inbound email address
    // First, try the primary To address
    const toAddresses = email.ToFull.map((t) => t.Email.toLowerCase());
    let config = null;

    for (const toEmail of toAddresses) {
      config = await emailService.getConfigByInboundEmail(toEmail);
      if (config) break;
    }

    // Also try parsing the To field directly
    if (!config && email.To) {
      const directTo = email.To.toLowerCase().trim();
      config = await emailService.getConfigByInboundEmail(directTo);
    }

    if (!config) {
      log.info("No config found for recipient", { source: "email-webhook", feature: "global", to: email.To, toFull: toAddresses });
      return c.json({ success: true }); // Acknowledge but don't process
    }

    // Validate the token against this config
    const isValid = await emailService.validateWebhookToken(
      config.applicationId,
      token
    );
    if (!isValid) {
      // For global webhook, we use a shared token from env
      const sharedToken = Deno.env.get("POSTMARK_SHARED_WEBHOOK_TOKEN");
      if (!sharedToken || token !== sharedToken) {
        log.info("Invalid token for global webhook", { source: "email-webhook", feature: "global" });
        return c.json({ error: "Invalid token" }, 403);
      }
    }

    if (!config.isActive) {
      log.info("Config is inactive", { source: "email-webhook", feature: "global", applicationId: config.applicationId });
      return c.json({ success: true });
    }

    // Check whitelist if enabled
    if (config.enableWhitelist) {
      const senderEmail = email.FromFull?.Email || email.From;
      const isWhitelisted = await emailService.isEmailWhitelisted(
        config.applicationId,
        senderEmail
      );
      if (!isWhitelisted) {
        log.info("Sender not whitelisted", { source: "email-webhook", feature: "global", applicationId: config.applicationId, senderEmail });
        return c.json({ success: true });
      }
    }

    // Check for duplicate
    if (
      emailService.isDuplicateMessage(email.MessageID, config.applicationId)
    ) {
      log.debug("Duplicate message, skipping", { source: "email-webhook", feature: "global", applicationId: config.applicationId, messageId: email.MessageID });
      return c.json({ success: true });
    }

    // Generate correlation ID
    const correlationId =
      c.req.header("X-Correlation-ID") || crypto.randomUUID();

    // Process message asynchronously (fire-and-forget)
    handleEmailMessage({
      applicationId: config.applicationId,
      configId: config.id,
      email: {
        MessageID: email.MessageID,
        From: email.From,
        FromName: email.FromName,
        FromFull: email.FromFull || { Email: email.From, Name: email.FromName },
        To: email.To,
        ToFull: email.ToFull,
        Cc: email.Cc,
        CcFull: email.CcFull,
        Subject: email.Subject,
        MessageStream: email.MessageStream,
        ReplyTo: email.ReplyTo,
        MailboxHash: email.MailboxHash,
        Date: email.Date,
        TextBody: email.TextBody,
        HtmlBody: email.HtmlBody,
        StrippedTextReply: email.StrippedTextReply,
        Headers: email.Headers,
        Attachments: email.Attachments,
      },
      correlationId,
    }).catch((err) => {
      log.error("Error processing email", {
        source: "email-webhook",
        feature: "global",
        correlationId,
        applicationId: config.applicationId,
        messageId: email.MessageID,
      }, err);
    });

    // Acknowledge the webhook immediately
    return c.json({ success: true });
  });
