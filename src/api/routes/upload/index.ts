/**
 * File Upload Routes
 *
 * Handles file uploads for knowledge sources.
 * Supports multipart/form-data file uploads.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import * as Sentry from "@sentry/deno";
import type { AuthContext } from "../../middleware/auth.ts";
import { uploadService } from "../../../services/upload.service.ts";
import { zValidator } from "@hono/zod-validator";
import { uploadFileSchema } from "../../validators/upload.ts";
import { sql } from "../../../db/client.ts";
import type { SubscriptionTier } from "../../../db/schema.ts";

export const uploadRoutes = new Hono<AuthContext>();

// Allowed MIME types for document uploads (knowledge sources)
const ALLOWED_DOCUMENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/pdf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Maximum file size for document uploads (20MB)
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

/**
 * POST /upload/documents
 * Upload one or more document files
 * Query params: applicationId (required)
 */
uploadRoutes.post("/documents", async (c) => {
  const user = c.get("user");
  const applicationId = c.req.query("applicationId");
  const embeddingProvider = c.req.query("embeddingProvider") || "local";
  const customEndpoint = c.req.query("customEndpoint");
  const customApiKey = c.req.query("customApiKey");
  const customModel = c.req.query("customModel");

  if (!applicationId) {
    return c.json({ error: "applicationId query parameter required" }, 400);
  }

  // Validate custom endpoint is provided when using custom provider
  if (embeddingProvider === "custom" && !customEndpoint) {
    return c.json(
      { error: "customEndpoint is required when using custom provider" },
      400
    );
  }

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const files = formData.getAll("file") as File[];

    if (files.length === 0) {
      return c.json({ error: "No files uploaded" }, 400);
    }

    // Validate file types and sizes
    for (const file of files) {
      if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
        return c.json(
          {
            error: `Invalid file type: ${file.type}. Allowed types: PDF, TXT, Markdown, CSV, JSON, Word, Excel`,
          },
          400
        );
      }
      if (file.size > MAX_DOCUMENT_SIZE) {
        return c.json(
          {
            error: `File "${file.name}" exceeds maximum size of 20MB`,
          },
          400
        );
      }
    }

    // Verify user has access to the application
    const { applicationService } = await import(
      "../../../services/application.service.ts"
    );
    await applicationService.get(applicationId, user.id);

    // Upload files with embedding provider config
    const results = await uploadService.uploadDocuments({
      applicationId,
      userId: user.id,
      files,
      embeddingConfig: {
        provider: embeddingProvider as
          | "local"
          | "openai"
          | "predictionguard"
          | "custom",
        ...(embeddingProvider === "custom" && {
          baseUrl: customEndpoint,
          apiKey: customApiKey,
          model: customModel,
        }),
      },
    });

    // Check if all uploads failed
    const failedCount = results.filter((r) => r.status === "failed").length;
    const successCount = results.length - failedCount;

    if (failedCount === results.length) {
      // All uploads failed
      return c.json(
        {
          error: "All uploads failed",
          data: results,
        },
        500
      );
    }

    if (failedCount > 0) {
      // Partial success
      return c.json({
        warning: `${failedCount} of ${results.length} uploads failed`,
        data: results,
      });
    }

    return c.json({ data: results });
  } catch (error) {
    console.error("[upload] Error uploading documents:", error);
    Sentry.captureException(error, {
      tags: { source: "upload-api", feature: "document-upload" },
      extra: { applicationId, userId: user.id },
    });
    return c.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * POST /upload/logo
 * Upload a logo image
 * Query params: applicationId (required)
 */
uploadRoutes.post("/logo", async (c) => {
  const user = c.get("user");
  const applicationId = c.req.query("applicationId");

  if (!applicationId) {
    return c.json({ error: "applicationId query parameter required" }, 400);
  }

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return c.json({ error: "File must be an image" }, 400);
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return c.json({ error: "Image must be less than 2MB" }, 400);
    }

    // Verify user has access to the application
    const { applicationService } = await import(
      "../../../services/application.service.ts"
    );
    await applicationService.get(applicationId, user.id);

    // Generate unique file ID and storage path
    const fileId = crypto.randomUUID();
    const fileExt = file.name.split(".").pop() || "png";
    const storagePath = `logos/${applicationId}/${fileId}.${fileExt}`;

    // Upload to public images bucket (chipp-images is publicly accessible)
    const { uploadImageToPublicBucket } = await import(
      "../../../services/storage.service.ts"
    );
    const buffer = await file.arrayBuffer();
    const url = await uploadImageToPublicBucket(
      new Uint8Array(buffer),
      storagePath,
      file.type
    );

    return c.json({ data: { url } });
  } catch (error) {
    console.error("[upload] Error uploading logo:", error);
    Sentry.captureException(error, {
      tags: { source: "upload-api", feature: "logo-upload" },
      extra: { applicationId, userId: user.id },
    });
    return c.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * Sanitize subfolder path to prevent path traversal attacks
 * Only allows alphanumeric characters, dots, underscores, and hyphens
 */
function sanitizeSubfolder(
  rawSubfolder: string | undefined,
  defaultValue: string
): string {
  if (
    !rawSubfolder ||
    typeof rawSubfolder !== "string" ||
    rawSubfolder.length === 0
  ) {
    return defaultValue;
  }

  // Normalize backslashes to forward slashes
  const normalized = rawSubfolder.replace(/\\/g, "/");

  // Split into segments and validate each one
  const segments = normalized.split("/").filter((s) => s.length > 0);

  // Reject if no valid segments
  if (segments.length === 0) {
    return defaultValue;
  }

  // Validate each segment: reject ".", "..", and any characters outside safe set
  const isValid = segments.every(
    (seg) => seg !== "." && seg !== ".." && /^[A-Za-z0-9._-]+$/.test(seg)
  );

  if (!isValid) {
    return defaultValue;
  }

  return segments.join("/");
}

/**
 * POST /upload/image
 * Upload an image for chat
 * Query params: subfolder (optional, defaults to "chat-images")
 */
uploadRoutes.post("/image", async (c) => {
  const user = c.get("user");
  const subfolder = sanitizeSubfolder(c.req.query("subfolder"), "chat-images");

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return c.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, or WebP allowed" },
        400
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "Image must be less than 10MB" }, 400);
    }

    // Generate unique file ID and storage path
    const fileId = crypto.randomUUID();
    const fileExt = file.name.split(".").pop() || "png";
    const storagePath = `${subfolder}/${fileId}.${fileExt}`;

    // Upload to public images bucket (chipp-images is publicly accessible)
    const { uploadImageToPublicBucket } = await import(
      "../../../services/storage.service.ts"
    );
    const buffer = await file.arrayBuffer();
    const url = await uploadImageToPublicBucket(
      new Uint8Array(buffer),
      storagePath,
      file.type
    );

    return c.json({ url });
  } catch (error) {
    console.error("[upload] Error uploading image:", error);
    Sentry.captureException(error, {
      tags: { source: "upload-api", feature: "image-upload" },
      extra: { subfolder },
    });
    return c.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * POST /upload/video
 * Upload a video file for chat
 * Query params: subfolder (optional, defaults to "chat-videos")
 */
uploadRoutes.post("/video", async (c) => {
  const subfolder = sanitizeSubfolder(c.req.query("subfolder"), "chat-videos");

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Validate file type (strip codec params like "video/webm;codecs=vp8,opus")
    const allowedTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
      "video/mpeg",
    ];
    const baseType = file.type.split(";")[0].trim();
    if (!allowedTypes.includes(baseType)) {
      return c.json(
        {
          error:
            "Invalid file type. Only MP4, WebM, QuickTime, AVI, or MPEG allowed",
        },
        400
      );
    }

    // Validate file size (max 20MB)
    const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_VIDEO_SIZE) {
      return c.json({ error: "Video must be less than 20MB" }, 400);
    }

    // Generate unique file ID and storage path
    const fileId = crypto.randomUUID();
    const fileExt = file.name.split(".").pop() || "mp4";
    const storagePath = `${subfolder}/${fileId}.${fileExt}`;

    // Upload to public images bucket (chipp-images is publicly accessible)
    const { uploadImageToPublicBucket } = await import(
      "../../../services/storage.service.ts"
    );
    const buffer = await file.arrayBuffer();
    const url = await uploadImageToPublicBucket(
      new Uint8Array(buffer),
      storagePath,
      file.type
    );

    return c.json({ url });
  } catch (error) {
    console.error("[upload] Error uploading video:", error);
    Sentry.captureException(error, {
      tags: { source: "upload-api", feature: "video-upload" },
      extra: { subfolder },
    });
    return c.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * POST /upload/url
 * Upload a URL as a knowledge source with SSE progress
 * Query params: applicationId (required), url (required), crawlLinks (optional)
 */
uploadRoutes.get("/url", async (c) => {
  const user = c.get("user");
  const applicationId = c.req.query("applicationId");
  const url = c.req.query("url");
  const crawlLinks = c.req.query("crawlLinks") === "true";
  const embeddingProvider = c.req.query("embeddingProvider") || "local";
  const customEndpoint = c.req.query("customEndpoint");
  const customApiKey = c.req.query("customApiKey");
  const customModel = c.req.query("customModel");

  if (!applicationId || !url) {
    return c.json(
      { error: "applicationId and url query parameters required" },
      400
    );
  }

  // Validate custom endpoint is provided when using custom provider
  if (embeddingProvider === "custom" && !customEndpoint) {
    return c.json(
      { error: "customEndpoint is required when using custom provider" },
      400
    );
  }

  try {
    // Verify user has access
    const { applicationService } = await import(
      "../../../services/application.service.ts"
    );
    await applicationService.get(applicationId, user.id);

    // Look up tier-based crawl limits
    const { maxPages, maxDepth } = await getCrawlLimitsForApp(applicationId);

    // Stream progress via SSE
    return streamSSE(c, async (stream) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ phase: "starting", progress: 0 }),
        });

        const result = await uploadService.uploadUrl({
          applicationId,
          userId: user.id,
          url,
          crawlLinks,
          maxPages,
          maxDepth,
          embeddingConfig: {
            provider: embeddingProvider as
              | "local"
              | "openai"
              | "predictionguard"
              | "custom",
            ...(embeddingProvider === "custom" && {
              baseUrl: customEndpoint,
              apiKey: customApiKey,
              model: customModel,
            }),
          },
          onProgress: async (phase, progress, detail) => {
            await stream.writeSSE({
              data: JSON.stringify({ phase, progress, ...detail }),
            });
          },
        });

        await stream.writeSSE({
          data: JSON.stringify({
            phase: "completed",
            progress: 100,
            result,
          }),
        });
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({
            phase: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        });
      }
    });
  } catch (error) {
    console.error("[upload] Error uploading URL:", error);
    Sentry.captureException(error, {
      tags: { source: "upload-api", feature: "url-upload" },
      extra: { applicationId, url, crawlLinks },
    });
    return c.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Crawl limits per subscription tier (mirrors shared/utils-server/src/crawlAndUploadLimits.ts)
const CRAWL_LIMITS: Record<string, { maxPages: number; maxDepth: number }> = {
  FREE: { maxPages: 10, maxDepth: 1 },
  PRO: { maxPages: 50, maxDepth: 5 },
  TEAM: { maxPages: 100, maxDepth: 10 },
  BUSINESS: { maxPages: 1000, maxDepth: 10 },
  ENTERPRISE: { maxPages: 1000, maxDepth: 10 },
};

async function getCrawlLimitsForApp(
  applicationId: string
): Promise<{ maxPages: number; maxDepth: number }> {
  try {
    const result = await sql`
      SELECT o.subscription_tier
      FROM app.applications a
      JOIN app.workspaces w ON a.workspace_id = w.id
      JOIN app.organizations o ON w.organization_id = o.id
      WHERE a.id = ${applicationId}::uuid
    `;

    if (result.length === 0) {
      return CRAWL_LIMITS.FREE;
    }

    const tier = (result[0].subscription_tier as string) || "FREE";
    return CRAWL_LIMITS[tier] || CRAWL_LIMITS.FREE;
  } catch (error) {
    console.error("[upload] Failed to get crawl limits", {
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { source: "upload-api", feature: "crawl-limits" },
      extra: { applicationId },
    });
    return CRAWL_LIMITS.FREE;
  }
}
