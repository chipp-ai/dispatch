/**
 * Twilio Webhook Handler
 *
 * Handles Twilio voice call webhooks and returns TwiML responses.
 * Routes incoming calls to the appropriate voice agent.
 */

import { Hono } from "hono";
import { log } from "@/lib/logger.ts";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import { twilioWebhookMiddleware } from "../../middleware/webhookAuth.ts";

// ========================================
// Types
// ========================================

interface TwilioVoiceParams {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Called: string;
  Caller: string;
  CallStatus:
    | "queued"
    | "ringing"
    | "in-progress"
    | "completed"
    | "busy"
    | "failed"
    | "no-answer";
  Direction: "inbound" | "outbound-api" | "outbound-dial";
  ApiVersion: string;
}

// ========================================
// TwiML Helpers
// ========================================

/**
 * Generate a simple TwiML response
 * TwiML is Twilio's XML-based language for call instructions
 */
function twimlResponse(content: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${content}
</Response>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

/**
 * Say something and hang up
 */
function twimlSay(message: string, voice = "alice"): string {
  return `  <Say voice="${voice}">${escapeXml(message)}</Say>
  <Hangup/>`;
}

/**
 * Dial a SIP endpoint
 */
function twimlDialSip(
  sipUri: string,
  options?: { username?: string; password?: string }
): string {
  const sipAttrs = options
    ? ` username="${options.username}" password="${options.password}"`
    : "";
  return `  <Dial>
    <Sip${sipAttrs}>${escapeXml(sipUri)}</Sip>
  </Dial>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ========================================
// Route Handler
// ========================================

export const twilioWebhookRoutes = new Hono<WebhookContext>();

// Note: In development, you may want to skip signature verification
// For production, always verify signatures
const skipVerification = Deno.env.get("SKIP_TWILIO_VERIFICATION") === "true";
if (!skipVerification) {
  twilioWebhookRoutes.use("*", twilioWebhookMiddleware);
}

/**
 * POST /webhooks/twilio
 *
 * Main Twilio voice webhook endpoint.
 * Called when an incoming call is received on a Twilio number.
 * Returns TwiML instructions for handling the call.
 */
twilioWebhookRoutes.post("/", async (c) => {
  const requestId = c.get("requestId") || "unknown";

  try {
    // Parse form data from Twilio
    let params: Partial<TwilioVoiceParams>;

    const rawBody = c.get("rawBody");
    if (rawBody) {
      // If we have raw body from middleware, parse it
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      // Otherwise, parse form data directly
      const formData = await c.req.formData();
      params = Object.fromEntries(formData) as Partial<TwilioVoiceParams>;
    }

    const calledNumber = params.Called || params.To;
    const callerNumber = params.From;
    const callSid = params.CallSid;

    log.info("Twilio voice webhook", {
      source: "twilio-webhook",
      feature: "voice",
      requestId,
      callSid,
      to: calledNumber,
      from: callerNumber ? callerNumber.substring(0, 6) + "****" : "unknown",
      status: params.CallStatus,
    });

    if (!calledNumber) {
      log.error("No destination number in webhook", { source: "twilio-webhook", feature: "voice", requestId, callSid, callStatus: params.CallStatus });
      return twimlResponse(
        twimlSay("We could not determine the destination number.")
      );
    }

    // Look up application by phone number
    const { phoneNumberService } = await import(
      "../../../services/phone-number.service.ts"
    );
    const { callRecordService } = await import(
      "../../../services/call-record.service.ts"
    );

    const phoneNumber = await phoneNumberService.findByNumber(calledNumber);

    if (!phoneNumber) {
      log.info("No application found for number", { source: "twilio-webhook", feature: "voice", requestId, calledNumber });
      return twimlResponse(
        twimlSay("This number is not currently configured. Please contact support.")
      );
    }

    // Create call record
    if (callSid) {
      try {
        await callRecordService.create({
          applicationId: phoneNumber.application_id,
          phoneNumberId: phoneNumber.id,
          twilioCallSid: callSid,
          twilioAccountSid: params.AccountSid,
          fromNumber: callerNumber || "unknown",
          toNumber: calledNumber,
          direction: (params.Direction as "inbound" | "outbound-api" | "outbound-dial") || "inbound",
          metadata: {
            callStatus: params.CallStatus,
            apiVersion: params.ApiVersion,
          },
        });
      } catch (error) {
        log.error("Failed to create call record", {
          source: "twilio-webhook",
          feature: "call-record-create",
          requestId,
          callSid,
          applicationId: phoneNumber.application_id,
        }, error);
        // Continue anyway - don't fail the webhook
      }
    }

    // For now, return a stub response
    // In production, this would route to LiveKit or another voice handler

    // Check for LiveKit SIP configuration
    const sipHost = Deno.env.get("LIVEKIT_SIP_HOST");
    const sipUsername = Deno.env.get("LIVEKIT_SIP_USERNAME") || "chipp";
    const sipPassword = Deno.env.get("LIVEKIT_SIP_PASSWORD");

    if (sipHost && sipPassword) {
      // Route call to LiveKit SIP
      log.info("Routing call to LiveKit SIP", { source: "twilio-webhook", feature: "voice", requestId, sipHost });
      return twimlResponse(
        twimlDialSip(`sip:${calledNumber}@${sipHost}`, {
          username: sipUsername,
          password: sipPassword,
        })
      );
    }

    // No SIP configuration - return a message
    log.info("No LiveKit SIP configured, returning message", { source: "twilio-webhook", feature: "voice", requestId });
    return twimlResponse(
      twimlSay(
        "Thank you for calling. Voice agents are being configured. Please try again later."
      )
    );
  } catch (error) {
    log.error("Error handling Twilio webhook", { source: "twilio-webhook", feature: "voice", requestId }, error);

    // Return error TwiML
    return twimlResponse(
      twimlSay(
        "An error occurred processing your call. Please try again later."
      )
    );
  }
});

/**
 * POST /webhooks/twilio/status
 *
 * Status callback for call status updates.
 * Called by Twilio when call status changes (e.g., completed, failed).
 */
twilioWebhookRoutes.post("/status", async (c) => {
  const requestId = c.get("requestId") || "unknown";

  try {
    let params: Record<string, string>;

    const rawBody = c.get("rawBody");
    if (rawBody) {
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      const formData = await c.req.formData();
      params = Object.fromEntries(formData) as Record<string, string>;
    }

    const callSid = params.CallSid;
    const callStatus = params.CallStatus;
    const callDuration = params.CallDuration;

    log.info("Twilio status callback", {
      source: "twilio-webhook",
      feature: "status-callback",
      requestId,
      callSid,
      status: callStatus,
      duration: callDuration,
    });

    // Update call record in database
    if (callSid) {
      try {
        const { callRecordService } = await import(
          "../../../services/call-record.service.ts"
        );

        const updateParams: {
          status: string;
          durationSeconds?: number;
          endedAt?: Date;
        } = {
          status: callStatus,
        };

        if (callDuration) {
          updateParams.durationSeconds = parseInt(callDuration, 10);
        }

        // If call is completed or failed, set ended_at
        if (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer") {
          updateParams.endedAt = new Date();
        }

        await callRecordService.update(callSid, updateParams);
      } catch (error) {
        log.error("Failed to update call record", {
          source: "twilio-webhook",
          feature: "call-record-update",
          requestId,
          callSid,
          callStatus,
        }, error);
        // Continue anyway - don't fail the callback
      }
    }

    return c.json({ received: true });
  } catch (error) {
    log.error("Error handling Twilio status callback", { source: "twilio-webhook", feature: "status-callback", requestId }, error);
    return c.json({ received: true, error: "Processing error" });
  }
});
