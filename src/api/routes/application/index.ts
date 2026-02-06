/**
 * Application Routes
 *
 * CRUD operations for applications.
 * Includes duplicate and move functionality.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as Sentry from "@sentry/deno";
import type { AuthContext } from "../../middleware/auth.ts";
import { applicationService } from "../../../services/application.service.ts";
import { knowledgeSourceService } from "../../../services/knowledge-source.service.ts";
import { customActionService } from "../../../services/custom-action.service.ts";
import { chatService } from "../../../services/chat.service.ts";
import { callRecordService } from "../../../services/call-record.service.ts";
import {
  createApplicationSchema,
  updateApplicationSchema,
  duplicateApplicationSchema,
  moveApplicationSchema,
  listApplicationsQuerySchema,
  searchApplicationsQuerySchema,
} from "../../validators/application.ts";
import { testActionRoutes } from "./test-action.ts";

// Validator for creating tags
const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

// Schema for voice tool execution
const toolExecuteSchema = z.object({
  toolName: z.string().min(1),
  parameters: z.record(z.any()).optional().default({}),
  userId: z.string().optional(),
});

export const applicationRoutes = new Hono<AuthContext>();

/**
 * GET /applications
 * List applications the user has access to
 * Query params: workspaceId, includeDeleted, limit, offset
 */
applicationRoutes.get(
  "/",
  zValidator("query", listApplicationsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");

    const applications = await applicationService.list({
      userId: user.id,
      workspaceId: query.workspaceId,
      includeDeleted: query.includeDeleted,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json({ data: applications });
  }
);

/**
 * GET /applications/search
 * Search applications by name/description across all user's workspaces
 * Query params: q (search query), limit
 */
applicationRoutes.get(
  "/search",
  zValidator("query", searchApplicationsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");

    const results = await applicationService.search({
      userId: user.id,
      query: query.q,
      limit: query.limit,
    });

    return c.json({ data: results });
  }
);

/**
 * POST /applications
 * Create a new application
 */
applicationRoutes.post(
  "/",
  zValidator("json", createApplicationSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const application = await applicationService.create({
      name: body.name,
      description: body.description,
      systemPrompt: body.systemPrompt,
      workspaceId: body.workspaceId,
      creatorId: user.id,
      organizationId: user.organizationId,
      modelId: body.modelId,
      isPublic: body.isPublic,
      brandStyles: body.brandStyles,
      suggestedMessages: body.suggestedMessages,
      welcomeMessages: body.welcomeMessages,
      creationSource: body.creationSource,
    });

    return c.json({ data: application }, 201);
  }
);

/**
 * GET /applications/:id
 * Get application by ID (includes knowledge sources and custom actions)
 */
applicationRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const application = await applicationService.get(id, user.id);

  // Fetch knowledge sources for the application
  const knowledgeSources = await knowledgeSourceService.list({
    applicationId: id,
    userId: user.id,
  });

  // Map to the expected format
  const mappedSources = knowledgeSources.map((ks) => ({
    id: ks.id,
    type: ks.type,
    name: ks.name,
    url: ks.url,
  }));

  // Fetch custom actions for the application
  const customActions = await customActionService.list(id, user.id);

  // Map to the expected format (snake_case to camelCase, url to endpoint)
  const mappedActions = customActions.map((action) => ({
    id: action.id,
    name: action.name,
    description: action.description,
    endpoint: action.url,
    method: action.method,
    headers: action.headers,
    queryParams: action.query_params,
    bodyParams: action.body_params,
    pathParams: action.path_params,
  }));

  return c.json({
    data: {
      ...application,
      knowledgeSources: mappedSources,
      custom_actions: mappedActions,
    },
  });
});

/**
 * PATCH /applications/:id
 * Update application (creates version history entry)
 */
applicationRoutes.patch(
  "/:id",
  zValidator("json", updateApplicationSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const { app, versionHistory } = await applicationService.update(
      id,
      user.id,
      body
    );
    return c.json({ data: app, versionHistory });
  }
);

/**
 * DELETE /applications/:id
 * Delete application (soft delete)
 */
applicationRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await applicationService.delete(id, user.id);
  return c.json({ success: true });
});

/**
 * POST /applications/:id/duplicate
 * Duplicate an application
 * Body: { name?: string, workspaceId?: string }
 */
applicationRoutes.post(
  "/:id/duplicate",
  zValidator("json", duplicateApplicationSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const application = await applicationService.duplicate(id, user.id, {
      name: body.name,
      workspaceId: body.workspaceId,
    });

    return c.json({ data: application }, 201);
  }
);

/**
 * POST /applications/:id/move
 * Move application to a different workspace
 * Body: { workspaceId: string }
 */
applicationRoutes.post(
  "/:id/move",
  zValidator("json", moveApplicationSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const application = await applicationService.move(
      id,
      user.id,
      body.workspaceId
    );
    return c.json({ data: application });
  }
);

/**
 * GET /applications/:id/versions
 * List version history for an application
 * Query params: limit, launchedOnly, since (ISO date string), authorId (filter by user)
 */
applicationRoutes.get("/:id/versions", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const launchedOnly = c.req.query("launchedOnly") === "true";
  const since = c.req.query("since"); // ISO date string
  const authorId = c.req.query("authorId"); // Filter by author

  const versions = await applicationService.listVersionHistory(id, user.id, {
    limit,
    launchedOnly,
    since: since ? new Date(since) : undefined,
    authorId,
  });
  return c.json({ data: versions });
});

/**
 * POST /applications/:id/versions/:versionId/restore
 * Restore an application to a previous version (applies changes to draft)
 */
applicationRoutes.post("/:id/versions/:versionId/restore", async (c) => {
  const user = c.get("user");
  const { id, versionId } = c.req.param();

  const { app, versionHistory } = await applicationService.restoreVersion(
    id,
    user.id,
    versionId
  );
  return c.json({ data: app, versionHistory });
});

/**
 * POST /applications/:id/launch
 * Launch (publish) the current application state
 * Creates a release snapshot like a git tag
 * Body: { tag?: string }
 */
applicationRoutes.post("/:id/launch", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  let tag: string | undefined;
  try {
    const body = await c.req.json();
    tag = body?.tag;
  } catch {
    // No body provided, that's okay
  }

  const { app, versionHistory, alreadyPublished } =
    await applicationService.launchVersion(id, user.id, { tag });
  return c.json({ data: app, versionHistory, alreadyPublished });
});

/**
 * GET /applications/:id/launched
 * Get the currently launched (live) version
 */
applicationRoutes.get("/:id/launched", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const launchedVersion = await applicationService.getLaunchedVersion(
    id,
    user.id
  );
  return c.json({ data: launchedVersion });
});

/**
 * GET /applications/:id/releases
 * List all launched versions (releases) for an application
 */
applicationRoutes.get("/:id/releases", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const limit = parseInt(c.req.query("limit") || "20", 10);

  const releases = await applicationService.listLaunchedVersions(
    id,
    user.id,
    limit
  );
  return c.json({ data: releases });
});

/**
 * POST /applications/:id/rollback/:versionId
 * Rollback to a previously launched version
 */
applicationRoutes.post("/:id/rollback/:versionId", async (c) => {
  const user = c.get("user");
  const { id, versionId } = c.req.param();

  const { app, versionHistory } = await applicationService.rollbackToVersion(
    id,
    user.id,
    versionId
  );
  return c.json({ data: app, versionHistory });
});

// ========================================
// Tags Routes
// ========================================

/**
 * GET /applications/:id/tags
 * List all tags for an application
 */
applicationRoutes.get("/:id/tags", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  // Verify user has access to application
  await applicationService.get(id, user.id);

  const tags = await chatService.getApplicationTags(id);
  return c.json({ data: tags });
});

/**
 * POST /applications/:id/tags
 * Create a new tag for an application
 */
applicationRoutes.post(
  "/:id/tags",
  zValidator("json", createTagSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    // Verify user has access to application
    await applicationService.get(id, user.id);

    const tag = await chatService.createTag(id, body.name, body.color);
    return c.json({ data: tag }, 201);
  }
);

/**
 * DELETE /applications/:id/tags/:tagId
 * Delete a tag
 */
applicationRoutes.delete("/:id/tags/:tagId", async (c) => {
  const user = c.get("user");
  const { id, tagId } = c.req.param();

  // Verify user has access to application
  await applicationService.get(id, user.id);

  await chatService.deleteTag(tagId);
  return c.json({ success: true });
});

// ========================================
// Calls Routes
// ========================================

/**
 * GET /applications/:id/calls
 * List call records for an application
 * Query params: limit, offset
 */
applicationRoutes.get("/:id/calls", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  // Verify user has access to application
  await applicationService.get(id, user.id);

  const calls = await callRecordService.list(id, limit, offset);

  // Transform to camelCase for frontend consistency
  const transformedCalls = calls.map((call) => ({
    id: call.id,
    applicationId: call.application_id,
    phoneNumberId: call.phone_number_id,
    twilioCallSid: call.twilio_call_sid,
    twilioAccountSid: call.twilio_account_sid,
    fromNumber: call.from_number,
    toNumber: call.to_number,
    direction: call.direction,
    status: call.status,
    durationSeconds: call.duration_seconds,
    openaiCallId: call.openai_call_id,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    recordingUrl: call.recording_url,
    transcriptionText: call.transcription_text,
    metadata: call.metadata,
    createdAt: call.created_at,
    updatedAt: call.updated_at,
  }));

  return c.json({ data: transformedCalls });
});

/**
 * GET /applications/:id/calls/:callId
 * Get a specific call record
 */
applicationRoutes.get("/:id/calls/:callId", async (c) => {
  const user = c.get("user");
  const { id, callId } = c.req.param();

  // Verify user has access to application
  await applicationService.get(id, user.id);

  // Get all calls and find the specific one (could optimize with getById later)
  const calls = await callRecordService.list(id, 1000, 0);
  const call = calls.find((c) => c.id === callId);

  if (!call) {
    return c.json({ error: "Call not found" }, 404);
  }

  return c.json({
    data: {
      id: call.id,
      applicationId: call.application_id,
      phoneNumberId: call.phone_number_id,
      twilioCallSid: call.twilio_call_sid,
      twilioAccountSid: call.twilio_account_sid,
      fromNumber: call.from_number,
      toNumber: call.to_number,
      direction: call.direction,
      status: call.status,
      durationSeconds: call.duration_seconds,
      openaiCallId: call.openai_call_id,
      startedAt: call.started_at,
      endedAt: call.ended_at,
      recordingUrl: call.recording_url,
      transcriptionText: call.transcription_text,
      metadata: call.metadata,
      createdAt: call.created_at,
      updatedAt: call.updated_at,
    },
  });
});

/**
 * GET /applications/:id/calls/:callId/recording
 * Download recording for a call
 * Returns audio stream or redirects to recording URL
 */
applicationRoutes.get("/:id/calls/:callId/recording", async (c) => {
  const user = c.get("user");
  const { id, callId } = c.req.param();

  // Verify user has access to application
  await applicationService.get(id, user.id);

  // Get the call record
  const calls = await callRecordService.list(id, 1000, 0);
  const call = calls.find((cr) => cr.id === callId);

  if (!call) {
    return c.json({ error: "Call not found" }, 404);
  }

  // If we have a stored recording URL, use it
  if (call.recording_url) {
    // The recording_url might be a direct URL we can redirect to
    // or we might need to fetch and proxy it
    const recordingResponse = await fetch(call.recording_url);

    if (!recordingResponse.ok) {
      return c.json({ error: "Failed to fetch recording" }, 500);
    }

    const blob = await recordingResponse.blob();
    const buffer = await blob.arrayBuffer();

    const filename = `call-${call.twilio_call_sid}-${new Date(call.started_at).toISOString().replace(/[:.]/g, "-")}.mp3`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  }

  // If no stored URL, fetch from Twilio API
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!accountSid || !authToken) {
    return c.json({ error: "Twilio credentials not configured" }, 500);
  }

  // Fetch recordings for this call from Twilio
  const recordingsUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings.json?CallSid=${call.twilio_call_sid}`;
  const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;

  const recordingsResponse = await fetch(recordingsUrl, {
    headers: { Authorization: authHeader },
  });

  if (!recordingsResponse.ok) {
    return c.json({ error: "Failed to fetch recordings from Twilio" }, 500);
  }

  const recordingsData = await recordingsResponse.json();

  if (!recordingsData.recordings || recordingsData.recordings.length === 0) {
    return c.json({ error: "No recording found for this call" }, 404);
  }

  const recording = recordingsData.recordings[0];
  const recordingUrl = `https://api.twilio.com${recording.uri.replace(".json", ".mp3")}`;

  // Fetch the actual recording
  const recordingResponse = await fetch(recordingUrl, {
    headers: { Authorization: authHeader },
  });

  if (!recordingResponse.ok) {
    return c.json({ error: "Failed to fetch recording from Twilio" }, 500);
  }

  const blob = await recordingResponse.blob();
  const buffer = await blob.arrayBuffer();

  const filename = `call-${call.twilio_call_sid}-${new Date(call.started_at).toISOString().replace(/[:.]/g, "-")}.mp3`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
});

// ========================================
// Voice Routes
// ========================================

/**
 * GET /applications/:id/voice/config
 * Get voice configuration for an application
 */
applicationRoutes.get("/:id/voice/config", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  try {
    const app = await applicationService.get(id, user.id);

    // Get voice config from capabilities
    const capabilities = app.capabilities as Record<string, unknown> | null;
    const voiceConfig = capabilities?.voiceAgent as
      | {
          enabled?: boolean;
          provider?: string;
          voice?: { voiceId?: string; language?: string };
          stt?: { provider?: string };
          greeting?: string;
          systemPrompt?: string;
          maxDuration?: number;
          interruption?: { enabled?: boolean; threshold?: number };
        }
      | undefined;

    if (!voiceConfig?.enabled) {
      return c.json(
        { error: "Voice agent not enabled for this application" },
        403
      );
    }

    // Return voice config
    return c.json({
      systemPrompt: app.systemPrompt || "You are a helpful voice assistant.",
      voiceConfig,
      tools: [], // TODO: Load tools when implementing tool execution
    });
  } catch (error) {
    console.error("[Voice Config] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "application-api", feature: "voice-config" },
      extra: { appId: id, userId: user.id },
    });
    return c.json({ error: "Failed to fetch voice config" }, 500);
  }
});

/**
 * POST /applications/:id/voice/tool-execute
 * Execute a tool during a voice session
 */
applicationRoutes.post(
  "/:id/voice/tool-execute",
  zValidator("json", toolExecuteSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const { toolName, parameters } = c.req.valid("json");

    try {
      // Verify application exists and user has access
      const app = await applicationService.get(id, user.id);

      // Verify voice is enabled
      const capabilities = app.capabilities as Record<string, unknown> | null;
      const voiceConfig = capabilities?.voiceAgent as
        | { enabled?: boolean }
        | undefined;

      if (!voiceConfig?.enabled) {
        return c.json({ error: "Voice not enabled for this application" }, 403);
      }

      console.log("[Voice Tool Execute] Executing tool:", {
        toolName,
        parameters,
        applicationId: id,
      });

      // TODO: Implement tool loading and execution
      // For now, return a placeholder response
      return c.json({
        message: `Tool ${toolName} execution not yet implemented in chipp-deno`,
        success: false,
      });
    } catch (error) {
      console.error("[Voice Tool Execute] Error:", error);
      Sentry.captureException(error, {
        tags: { source: "application-api", feature: "voice-tool-execute" },
        extra: { appId: id, userId: user.id, toolName, parameters },
      });
      return c.json(
        {
          error: "Failed to execute tool",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

// ========================================
// Outbound Calling Routes
// ========================================

// Lazy import outbound call service to avoid startup issues
let outboundCallService:
  | typeof import("../../../services/outbound-call.service.ts").outboundCallService
  | null = null;

async function getOutboundCallService() {
  if (!outboundCallService) {
    const module = await import("../../../services/outbound-call.service.ts");
    outboundCallService = module.outboundCallService;
  }
  return outboundCallService;
}

// Schema for single outbound call
const outboundCallSchema = z.object({
  phoneNumber: z.string().min(1, "Phone number is required"),
  metadata: z.record(z.unknown()).optional(),
  callerIdName: z.string().optional(),
  maxDurationSeconds: z.number().min(60).max(3600).optional(),
});

// Schema for batch outbound calls
const batchOutboundCallSchema = z.object({
  recipients: z
    .array(
      z.object({
        phoneNumber: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .min(1)
    .max(1000),
  callerIdName: z.string().optional(),
  maxDurationSeconds: z.number().min(60).max(3600).optional(),
  callsPerMinute: z.number().min(1).max(60).optional(),
});

// Schema for CSV upload
const csvOutboundCallSchema = z.object({
  csvContent: z.string().min(1),
  callerIdName: z.string().optional(),
  maxDurationSeconds: z.number().min(60).max(3600).optional(),
  callsPerMinute: z.number().min(1).max(60).optional(),
});

/**
 * POST /applications/:id/voice/outbound-call
 * Initiate a single outbound call
 */
applicationRoutes.post(
  "/:id/voice/outbound-call",
  zValidator("json", outboundCallSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    try {
      // Verify application exists and user has access
      const app = await applicationService.get(id, user.id);

      // Verify voice is enabled
      const capabilities = app.capabilities as Record<string, unknown> | null;
      const voiceConfig = capabilities?.voiceAgent as
        | { enabled?: boolean; outboundEnabled?: boolean }
        | undefined;

      if (!voiceConfig?.enabled) {
        return c.json({ error: "Voice not enabled for this application" }, 403);
      }

      console.log("[Outbound Call] Initiating call:", {
        applicationId: id,
        phoneNumber: body.phoneNumber,
      });

      const service = await getOutboundCallService();
      const result = await service.initiateCall({
        applicationId: id,
        phoneNumber: body.phoneNumber,
        metadata: body.metadata,
        callerIdName: body.callerIdName,
        maxDurationSeconds: body.maxDurationSeconds,
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      return c.json({
        success: true,
        data: {
          callId: result.callId,
          roomName: result.roomName,
          sipCallId: result.sipCallId,
        },
      });
    } catch (error) {
      console.error("[Outbound Call] Error:", error);
      Sentry.captureException(error, {
        tags: { source: "application-api", feature: "outbound-call" },
        extra: { appId: id, userId: user.id },
      });
      return c.json(
        {
          error: "Failed to initiate call",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * POST /applications/:id/voice/outbound-batch
 * Initiate multiple outbound calls
 */
applicationRoutes.post(
  "/:id/voice/outbound-batch",
  zValidator("json", batchOutboundCallSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    try {
      // Verify application exists and user has access
      const app = await applicationService.get(id, user.id);

      // Verify voice is enabled
      const capabilities = app.capabilities as Record<string, unknown> | null;
      const voiceConfig = capabilities?.voiceAgent as
        | { enabled?: boolean }
        | undefined;

      if (!voiceConfig?.enabled) {
        return c.json({ error: "Voice not enabled for this application" }, 403);
      }

      console.log("[Outbound Batch] Initiating batch calls:", {
        applicationId: id,
        recipientCount: body.recipients.length,
      });

      const service = await getOutboundCallService();
      const result = await service.initiateBatchCalls({
        applicationId: id,
        recipients: body.recipients,
        callerIdName: body.callerIdName,
        maxDurationSeconds: body.maxDurationSeconds,
        callsPerMinute: body.callsPerMinute,
      });

      return c.json({
        success: true,
        data: {
          campaignId: result.campaignId,
          results: result.results.map((r) => ({
            success: r.success,
            callId: r.callId,
            error: r.error,
          })),
        },
      });
    } catch (error) {
      console.error("[Outbound Batch] Error:", error);
      Sentry.captureException(error, {
        tags: { source: "application-api", feature: "outbound-batch" },
        extra: { appId: id, userId: user.id },
      });
      return c.json(
        {
          error: "Failed to initiate batch calls",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * POST /applications/:id/voice/outbound-campaign
 * Create an outbound campaign from CSV
 */
applicationRoutes.post(
  "/:id/voice/outbound-campaign",
  zValidator("json", csvOutboundCallSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    try {
      // Verify application exists and user has access
      const app = await applicationService.get(id, user.id);

      // Verify voice is enabled
      const capabilities = app.capabilities as Record<string, unknown> | null;
      const voiceConfig = capabilities?.voiceAgent as
        | { enabled?: boolean }
        | undefined;

      if (!voiceConfig?.enabled) {
        return c.json({ error: "Voice not enabled for this application" }, 403);
      }

      const service = await getOutboundCallService();

      // Parse CSV
      let recipients;
      try {
        recipients = service.parseCSV(body.csvContent);
      } catch (parseError) {
        return c.json(
          {
            error:
              parseError instanceof Error
                ? parseError.message
                : "Failed to parse CSV",
          },
          400
        );
      }

      if (recipients.length === 0) {
        return c.json({ error: "No valid recipients found in CSV" }, 400);
      }

      console.log("[Outbound Campaign] Creating campaign:", {
        applicationId: id,
        recipientCount: recipients.length,
      });

      const result = await service.initiateBatchCalls({
        applicationId: id,
        recipients,
        callerIdName: body.callerIdName,
        maxDurationSeconds: body.maxDurationSeconds,
        callsPerMinute: body.callsPerMinute,
      });

      return c.json({
        success: true,
        data: {
          campaignId: result.campaignId,
          recipientCount: recipients.length,
          results: result.results,
        },
      });
    } catch (error) {
      console.error("[Outbound Campaign] Error:", error);
      Sentry.captureException(error, {
        tags: { source: "application-api", feature: "outbound-campaign" },
        extra: { appId: id, userId: user.id },
      });
      return c.json(
        {
          error: "Failed to create campaign",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * GET /applications/:id/voice/campaigns
 * List outbound campaigns for an application
 */
applicationRoutes.get("/:id/voice/campaigns", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  try {
    // Verify application exists and user has access
    await applicationService.get(id, user.id);

    const service = await getOutboundCallService();
    const campaigns = await service.listCampaigns(id, limit, offset);

    return c.json({
      data: campaigns.map((c) => ({
        id: c.id,
        applicationId: c.application_id,
        name: c.name,
        status: c.status,
        totalRecipients: c.total_recipients,
        callsCompleted: c.calls_completed,
        callsFailed: c.calls_failed,
        callsPending: c.calls_pending,
        callsPerMinute: c.calls_per_minute,
        metadata: c.metadata,
        startedAt: c.started_at,
        completedAt: c.completed_at,
        createdAt: c.created_at,
      })),
    });
  } catch (error) {
    console.error("[Campaigns List] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "application-api", feature: "campaigns-list" },
      extra: { appId: id, userId: user.id },
    });
    return c.json({ error: "Failed to list campaigns" }, 500);
  }
});

/**
 * GET /applications/:id/voice/campaigns/:campaignId
 * Get campaign details with recipients
 */
applicationRoutes.get("/:id/voice/campaigns/:campaignId", async (c) => {
  const user = c.get("user");
  const { id, campaignId } = c.req.param();
  const limit = parseInt(c.req.query("limit") || "100", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  try {
    // Verify application exists and user has access
    await applicationService.get(id, user.id);

    const service = await getOutboundCallService();
    const campaign = await service.getCampaign(campaignId);

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const recipients = await service.getCampaignRecipients(
      campaignId,
      limit,
      offset
    );

    return c.json({
      data: {
        id: campaign.id,
        applicationId: campaign.application_id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.total_recipients,
        callsCompleted: campaign.calls_completed,
        callsFailed: campaign.calls_failed,
        callsPending: campaign.calls_pending,
        callsPerMinute: campaign.calls_per_minute,
        metadata: campaign.metadata,
        startedAt: campaign.started_at,
        completedAt: campaign.completed_at,
        createdAt: campaign.created_at,
        recipients: recipients.map((r) => ({
          id: r.id,
          phoneNumber: r.phone_number,
          status: r.status,
          callId: r.call_id,
          metadata: r.metadata,
          scheduledAt: r.scheduled_at,
          attemptedAt: r.attempted_at,
          completedAt: r.completed_at,
          errorMessage: r.error_message,
        })),
      },
    });
  } catch (error) {
    console.error("[Campaign Details] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "application-api", feature: "campaign-details" },
      extra: { appId: id, userId: user.id, campaignId },
    });
    return c.json({ error: "Failed to get campaign" }, 500);
  }
});

/**
 * POST /applications/:id/voice/campaigns/:campaignId/start
 * Start a paused/pending campaign
 */
applicationRoutes.post("/:id/voice/campaigns/:campaignId/start", async (c) => {
  const user = c.get("user");
  const { id, campaignId } = c.req.param();

  try {
    await applicationService.get(id, user.id);

    const service = await getOutboundCallService();
    await service.updateCampaignStatus(campaignId, "running");

    return c.json({ success: true });
  } catch (error) {
    console.error("[Campaign Start] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "application-api", feature: "campaign-start" },
      extra: { appId: id, userId: user.id, campaignId },
    });
    return c.json({ error: "Failed to start campaign" }, 500);
  }
});

/**
 * POST /applications/:id/voice/campaigns/:campaignId/pause
 * Pause a running campaign
 */
applicationRoutes.post("/:id/voice/campaigns/:campaignId/pause", async (c) => {
  const user = c.get("user");
  const { id, campaignId } = c.req.param();

  try {
    await applicationService.get(id, user.id);

    const service = await getOutboundCallService();
    await service.updateCampaignStatus(campaignId, "paused");

    return c.json({ success: true });
  } catch (error) {
    console.error("[Campaign Pause] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "application-api", feature: "campaign-pause" },
      extra: { appId: id, userId: user.id, campaignId },
    });
    return c.json({ error: "Failed to pause campaign" }, 500);
  }
});

/**
 * POST /applications/:id/voice/campaigns/:campaignId/cancel
 * Cancel a campaign
 */
applicationRoutes.post("/:id/voice/campaigns/:campaignId/cancel", async (c) => {
  const user = c.get("user");
  const { id, campaignId } = c.req.param();

  try {
    await applicationService.get(id, user.id);

    const service = await getOutboundCallService();
    await service.updateCampaignStatus(campaignId, "cancelled");

    return c.json({ success: true });
  } catch (error) {
    console.error("[Campaign Cancel] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "application-api", feature: "campaign-cancel" },
      extra: { appId: id, userId: user.id, campaignId },
    });
    return c.json({ error: "Failed to cancel campaign" }, 500);
  }
});

// Mount test action routes
applicationRoutes.route("/", testActionRoutes);
