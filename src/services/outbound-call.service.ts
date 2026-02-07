/**
 * Outbound Call Service
 *
 * Handles initiating outbound calls via LiveKit SIP.
 */

import { sql } from "../db/client.ts";
import { NotFoundError } from "../utils/errors.ts";
import { log } from "@/lib/logger.ts";

// LiveKit SIP client - dynamically imported for Deno
let SipClient: any = null;

async function getSipClient() {
  if (!SipClient) {
    const livekitSdk = await import("npm:livekit-server-sdk@^2.14.2");
    SipClient = livekitSdk.SipClient;
  }
  return SipClient;
}

export interface OutboundCallParams {
  applicationId: string;
  phoneNumber: string;
  metadata?: Record<string, unknown>;
  callerIdName?: string;
  maxDurationSeconds?: number;
}

export interface OutboundCampaignParams {
  applicationId: string;
  recipients: Array<{
    phoneNumber: string;
    metadata?: Record<string, unknown>;
  }>;
  callerIdName?: string;
  maxDurationSeconds?: number;
  callsPerMinute?: number; // Rate limit
}

export interface OutboundCallResult {
  success: boolean;
  callId?: string;
  roomName?: string;
  sipCallId?: string;
  error?: string;
}

export interface OutboundCampaign {
  id: string;
  application_id: string;
  name: string | null;
  status: "pending" | "running" | "paused" | "completed" | "cancelled";
  total_recipients: number;
  calls_completed: number;
  calls_failed: number;
  calls_pending: number;
  calls_per_minute: number;
  metadata: unknown | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  phone_number: string;
  status:
    | "pending"
    | "queued"
    | "calling"
    | "completed"
    | "failed"
    | "no-answer";
  call_id: string | null;
  metadata: unknown | null;
  scheduled_at: Date | null;
  attempted_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export const outboundCallService = {
  /**
   * Initiate a single outbound call
   */
  async initiateCall(params: OutboundCallParams): Promise<OutboundCallResult> {
    const {
      applicationId,
      phoneNumber,
      metadata,
      callerIdName,
      maxDurationSeconds = 600, // 10 min default
    } = params;

    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const sipTrunkId = Deno.env.get("SIP_OUTBOUND_TRUNK_ID");

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      return {
        success: false,
        error: "LiveKit credentials not configured",
      };
    }

    if (!sipTrunkId) {
      return {
        success: false,
        error: "Outbound SIP trunk not configured",
      };
    }

    try {
      // Normalize phone number
      const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
      if (!normalizedNumber) {
        return {
          success: false,
          error: "Invalid phone number format",
        };
      }

      // Generate unique room name
      const roomName = `outbound-${applicationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Create SIP client
      const SipClientClass = await getSipClient();
      const sipClient = new SipClientClass(
        livekitUrl,
        livekitApiKey,
        livekitApiSecret
      );

      // Build participant metadata
      const participantMetadata = JSON.stringify({
        applicationId,
        direction: "outbound",
        isOutbound: true,
        ...metadata,
      });

      // Create SIP participant (initiates the call)
      const participant = await sipClient.createSipParticipant({
        sipTrunkId,
        sipCallTo: normalizedNumber,
        roomName,
        participantIdentity: `customer-${normalizedNumber}`,
        participantName:
          metadata?.recipientName?.toString() || normalizedNumber,
        participantMetadata,
        participantAttributes: {
          "sip.callDirection": "outbound",
          applicationId,
        },
        waitUntilAnswered: true,
        playDialtone: true,
        krispEnabled: true,
        maxCallDuration: maxDurationSeconds,
        displayName: callerIdName || "Chipp AI",
      });

      // Generate a unique call ID
      const callId = crypto.randomUUID();

      // Record the outbound call
      await this.createCallRecord({
        callId,
        applicationId,
        phoneNumber: normalizedNumber,
        roomName,
        direction: "outbound-api",
        sipCallId: participant.sipCallId,
        metadata,
      });

      return {
        success: true,
        callId,
        roomName,
        sipCallId: participant.sipCallId,
      };
    } catch (error) {
      log.error("Failed to initiate outbound call", {
        source: "voice",
        feature: "outbound-call",
        applicationId,
        phoneNumber,
      }, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to initiate call",
      };
    }
  },

  /**
   * Initiate multiple outbound calls (batch)
   */
  async initiateBatchCalls(params: OutboundCampaignParams): Promise<{
    success: boolean;
    results: OutboundCallResult[];
    campaignId?: string;
  }> {
    const {
      applicationId,
      recipients,
      callerIdName,
      maxDurationSeconds,
      callsPerMinute = 5,
    } = params;

    const results: OutboundCallResult[] = [];

    // For small batches (<= 10), initiate directly
    if (recipients.length <= 10) {
      for (const recipient of recipients) {
        // Add a small delay between calls to avoid overwhelming the SIP trunk
        if (results.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const result = await this.initiateCall({
          applicationId,
          phoneNumber: recipient.phoneNumber,
          metadata: recipient.metadata,
          callerIdName,
          maxDurationSeconds,
        });
        results.push(result);
      }

      return { success: true, results };
    }

    // For larger batches, create a campaign for queued processing
    const campaign = await this.createCampaign({
      applicationId,
      recipients,
      callsPerMinute,
      metadata: { callerIdName, maxDurationSeconds },
    });

    return {
      success: true,
      results: [],
      campaignId: campaign.id,
    };
  },

  /**
   * Create an outbound campaign for queued processing
   */
  async createCampaign(params: {
    applicationId: string;
    recipients: Array<{
      phoneNumber: string;
      metadata?: Record<string, unknown>;
    }>;
    callsPerMinute: number;
    metadata?: Record<string, unknown>;
    name?: string;
  }): Promise<OutboundCampaign> {
    const { applicationId, recipients, callsPerMinute, metadata, name } =
      params;

    // Create campaign
    const campaignResult = await sql`
      INSERT INTO app.outbound_campaigns (
        application_id,
        name,
        status,
        total_recipients,
        calls_completed,
        calls_failed,
        calls_pending,
        calls_per_minute,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        ${applicationId}::uuid,
        ${name || null},
        'pending',
        ${recipients.length},
        0,
        0,
        ${recipients.length},
        ${callsPerMinute},
        ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const campaign = campaignResult[0] as OutboundCampaign;

    // Insert all recipients
    for (const recipient of recipients) {
      const normalizedNumber = this.normalizePhoneNumber(recipient.phoneNumber);
      if (normalizedNumber) {
        await sql`
          INSERT INTO app.campaign_recipients (
            campaign_id,
            phone_number,
            status,
            metadata,
            created_at
          )
          VALUES (
            ${campaign.id}::uuid,
            ${normalizedNumber},
            'pending',
            ${recipient.metadata ? JSON.stringify(recipient.metadata) : null}::jsonb,
            NOW()
          )
        `;
      }
    }

    return campaign;
  },

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId: string): Promise<OutboundCampaign | null> {
    const result = await sql`
      SELECT * FROM app.outbound_campaigns
      WHERE id = ${campaignId}::uuid
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0] as OutboundCampaign;
  },

  /**
   * List campaigns for an application
   */
  async listCampaigns(
    applicationId: string,
    limit = 50,
    offset = 0
  ): Promise<OutboundCampaign[]> {
    const result = await sql`
      SELECT * FROM app.outbound_campaigns
      WHERE application_id = ${applicationId}::uuid
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return result as unknown as OutboundCampaign[];
  },

  /**
   * Get campaign recipients
   */
  async getCampaignRecipients(
    campaignId: string,
    limit = 100,
    offset = 0
  ): Promise<CampaignRecipient[]> {
    const result = await sql`
      SELECT * FROM app.campaign_recipients
      WHERE campaign_id = ${campaignId}::uuid
      ORDER BY created_at ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return result as unknown as CampaignRecipient[];
  },

  /**
   * Update campaign status
   */
  async updateCampaignStatus(
    campaignId: string,
    status: OutboundCampaign["status"]
  ): Promise<void> {
    const startedAt: Date | null = status === "running" ? new Date() : null;
    const completedAt: Date | null =
      status === "completed" || status === "cancelled" ? new Date() : null;

    await sql`
      UPDATE app.outbound_campaigns
      SET status = ${status},
          started_at = COALESCE(started_at, ${startedAt}::timestamptz),
          completed_at = COALESCE(completed_at, ${completedAt}::timestamptz),
          updated_at = NOW()
      WHERE id = ${campaignId}::uuid
    `;
  },

  /**
   * Create a call record for outbound call
   */
  async createCallRecord(params: {
    callId: string;
    applicationId: string;
    phoneNumber: string;
    roomName: string;
    direction: "outbound-api" | "outbound-dial";
    sipCallId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const {
      callId,
      applicationId,
      phoneNumber,
      roomName,
      direction,
      sipCallId,
      metadata,
    } = params;

    await sql`
      INSERT INTO app.call_records (
        application_id,
        twilio_call_sid,
        from_number,
        to_number,
        direction,
        status,
        metadata,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        ${applicationId}::uuid,
        ${sipCallId || callId},
        'outbound',
        ${phoneNumber},
        ${direction},
        'initiated',
        ${JSON.stringify({ roomName, callId, ...metadata })}::jsonb,
        NOW(),
        NOW(),
        NOW()
      )
    `;
  },

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phoneNumber: string): string | null {
    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.replace(/[^\d+]/g, "");

    // Ensure it starts with +
    if (!normalized.startsWith("+")) {
      // Assume US number if no country code
      if (normalized.length === 10) {
        normalized = "+1" + normalized;
      } else if (normalized.length === 11 && normalized.startsWith("1")) {
        normalized = "+" + normalized;
      } else {
        // Can't determine country code
        return null;
      }
    }

    // Basic validation: must be between 10 and 15 digits (E.164 standard)
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return null;
    }

    return normalized;
  },

  /**
   * Parse CSV content for batch calling
   */
  parseCSV(
    csvContent: string
  ): Array<{ phoneNumber: string; metadata: Record<string, string> }> {
    const lines = csvContent.trim().split("\n");
    if (lines.length < 2) {
      return [];
    }

    // Parse header row
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const phoneNumberIndex = headers.findIndex(
      (h) =>
        h === "phone" ||
        h === "phonenumber" ||
        h === "phone_number" ||
        h === "number"
    );

    if (phoneNumberIndex === -1) {
      throw new Error(
        "CSV must have a phone number column (phone, phonenumber, phone_number, or number)"
      );
    }

    const results: Array<{
      phoneNumber: string;
      metadata: Record<string, string>;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const phoneNumber = values[phoneNumberIndex];

      if (!phoneNumber) continue;

      // Build metadata from other columns
      const metadata: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (index !== phoneNumberIndex && values[index]) {
          metadata[header] = values[index];
        }
      });

      results.push({ phoneNumber, metadata });
    }

    return results;
  },
};
