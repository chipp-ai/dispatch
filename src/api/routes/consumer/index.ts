/**
 * Consumer Routes
 *
 * Public endpoints for end-users (consumers) of chat applications.
 * These routes are NOT protected by developer auth - they have their own
 * consumer auth flow via session cookies or bearer tokens.
 *
 * Routes:
 * - /consumer/:appNameId/auth/* - Authentication (signup, login, verify, etc.)
 * - /consumer/:appNameId/chat/* - Chat sessions and streaming
 * - /consumer/:appNameId/manifest - PWA manifest
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";

import {
  appMiddleware,
  consumerAuthMiddleware,
  optionalConsumerAuthMiddleware,
  type AppOnlyContext,
  type ConsumerAuthContext,
} from "../../middleware/consumerAuth.ts";
import { consumerAuthService } from "../../../services/consumer-auth.service.ts";
import { modelSupportsVideoInput } from "../../../llm/utils/video-capabilities.ts";

// ========================================
// Validation Schemas
// ========================================

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  name: z.string().min(1).max(255).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otpCode: z.string().length(6),
});

const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});

const magicLinkVerifySchema = z.object({
  token: z.string().min(1),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  pictureUrl: z.string().url().optional(),
});

// ========================================
// Router Setup
// ========================================

export const consumerRoutes = new Hono<AppOnlyContext>();

// Apply app resolution middleware to all consumer routes
consumerRoutes.use("/:appNameId/*", appMiddleware);

// ========================================
// Auth Routes (no consumer auth required)
// ========================================

/**
 * POST /:appNameId/auth/signup
 * Register a new consumer account
 *
 * Features:
 * - Domain restriction check (if app has signupsRestrictedToDomain)
 * - Blocks '+' in email addresses
 * - If user exists but unverified, updates password and allows retry
 * - Sets starting credits from app settings
 */
consumerRoutes.post(
  "/:appNameId/auth/signup",
  zValidator("json", signupSchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    // Extract app settings for signup validation
    // Settings may contain: signupsRestrictedToDomain, startingFreeTrialTokens, language, emailGatingEnabled
    const appSettings = (app.settings as Record<string, unknown>) ?? {};

    try {
      const { consumer, otp } = await consumerAuthService.signup({
        applicationId: app.id,
        email: body.email,
        password: body.password,
        name: body.name,
        appSettings: {
          signupsRestrictedToDomain: appSettings.signupsRestrictedToDomain as
            | string
            | undefined,
          startingFreeTrialTokens: appSettings.startingFreeTrialTokens as
            | number
            | undefined,
          language: appSettings.language as string | undefined,
          emailGatingEnabled: appSettings.emailGatingEnabled as
            | boolean
            | undefined,
          redirectAfterSignupUrl: appSettings.redirectAfterSignupUrl as
            | string
            | undefined,
        },
      });

      // In production, send OTP via email
      // For now, return success (OTP would be sent by email service)
      console.log(`[consumer] OTP for ${body.email}: ${otp}`);

      return c.json(
        {
          success: true,
          message: "Account created. Please verify your email.",
          consumerId: consumer.id,
          requiresVerification: true,
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup failed";
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * POST /:appNameId/auth/verify
 * Verify email with OTP
 */
consumerRoutes.post(
  "/:appNameId/auth/verify",
  zValidator("json", verifyOtpSchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const consumer = await consumerAuthService.verifyOtp({
        applicationId: app.id,
        email: body.email,
        otpCode: body.otpCode,
      });

      // Create session after verification
      const session = await consumerAuthService.createSession(consumer);

      // Set session cookie
      setCookie(c, "consumer_session_id", session.sessionId, {
        path: "/",
        httpOnly: true,
        secure: Deno.env.get("ENVIRONMENT") === "production",
        sameSite: "Lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      return c.json({
        success: true,
        consumer: session.consumer,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification failed";
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * POST /:appNameId/auth/login
 * Login with email and password
 */
consumerRoutes.post(
  "/:appNameId/auth/login",
  zValidator("json", loginSchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const session = await consumerAuthService.login({
        applicationId: app.id,
        email: body.email,
        password: body.password,
      });

      // Set session cookie
      setCookie(c, "consumer_session_id", session.sessionId, {
        path: "/",
        httpOnly: true,
        secure: Deno.env.get("ENVIRONMENT") === "production",
        sameSite: "Lax",
        maxAge: 30 * 24 * 60 * 60,
      });

      return c.json({
        success: true,
        consumer: session.consumer,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      return c.json({ error: message }, 401);
    }
  }
);

/**
 * POST /:appNameId/auth/magic-link
 * Request a magic link for passwordless login
 */
consumerRoutes.post(
  "/:appNameId/auth/magic-link",
  zValidator("json", magicLinkRequestSchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const token = await consumerAuthService.createMagicLink(
        app.id,
        body.email
      );

      // In production, send magic link via email
      console.log(`[consumer] Magic link token for ${body.email}: ${token}`);

      return c.json({
        success: true,
        message: "Magic link sent to your email.",
      });
    } catch (error) {
      // Don't reveal if email exists
      return c.json({
        success: true,
        message: "If an account exists, a magic link has been sent.",
      });
    }
  }
);

/**
 * POST /:appNameId/auth/magic-link/verify
 * Verify a magic link token
 */
consumerRoutes.post(
  "/:appNameId/auth/magic-link/verify",
  zValidator("json", magicLinkVerifySchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const session = await consumerAuthService.verifyMagicLink({
        applicationId: app.id,
        token: body.token,
      });

      // Set session cookie
      setCookie(c, "consumer_session_id", session.sessionId, {
        path: "/",
        httpOnly: true,
        secure: Deno.env.get("ENVIRONMENT") === "production",
        sameSite: "Lax",
        maxAge: 30 * 24 * 60 * 60,
      });

      return c.json({
        success: true,
        consumer: session.consumer,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid magic link";
      return c.json({ error: message }, 401);
    }
  }
);

/**
 * POST /:appNameId/auth/password-reset
 * Request a password reset
 */
consumerRoutes.post(
  "/:appNameId/auth/password-reset",
  zValidator("json", passwordResetRequestSchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const token = await consumerAuthService.requestPasswordReset(
        app.id,
        body.email
      );

      // In production, send reset link via email
      console.log(
        `[consumer] Password reset token for ${body.email}: ${token}`
      );

      return c.json({
        success: true,
        message: "If an account exists, a password reset link has been sent.",
      });
    } catch {
      // Don't reveal if email exists
      return c.json({
        success: true,
        message: "If an account exists, a password reset link has been sent.",
      });
    }
  }
);

/**
 * POST /:appNameId/auth/password-reset/confirm
 * Reset password with token
 */
consumerRoutes.post(
  "/:appNameId/auth/password-reset/confirm",
  zValidator("json", passwordResetSchema),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      await consumerAuthService.resetPassword(
        app.id,
        body.token,
        body.password
      );

      return c.json({
        success: true,
        message: "Password reset successfully. You can now log in.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Password reset failed";
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * POST /:appNameId/auth/logout
 * Logout and invalidate session
 */
consumerRoutes.post("/:appNameId/auth/logout", async (c) => {
  const sessionId = getCookie(c, "consumer_session_id");

  if (sessionId) {
    await consumerAuthService.logout(sessionId);
    deleteCookie(c, "consumer_session_id", { path: "/" });
  }

  return c.json({ success: true });
});

/**
 * POST /:appNameId/auth/resend-otp
 * Resend OTP for email verification
 */
consumerRoutes.post(
  "/:appNameId/auth/resend-otp",
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const otp = await consumerAuthService.createOtp(app.id, body.email);

      // In production, send OTP via email
      console.log(`[consumer] OTP for ${body.email}: ${otp}`);

      return c.json({
        success: true,
        message: "OTP sent to your email.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send OTP";
      return c.json({ error: message }, 400);
    }
  }
);

// ========================================
// Protected Routes (consumer auth required)
// ========================================

// Group for authenticated routes
const authenticatedRoutes = new Hono<ConsumerAuthContext>();
authenticatedRoutes.use("*", consumerAuthMiddleware);

/**
 * GET /me
 * Get current consumer profile
 */
authenticatedRoutes.get("/me", async (c) => {
  const consumer = c.get("consumer");

  return c.json({
    id: consumer.id,
    email: consumer.email,
    name: consumer.name,
    identifier: consumer.identifier,
    credits: consumer.credits,
    subscriptionActive: consumer.subscriptionActive,
  });
});

/**
 * PATCH /me
 * Update consumer profile
 */
authenticatedRoutes.patch(
  "/me",
  zValidator("json", profileUpdateSchema),
  async (c) => {
    const consumer = c.get("consumer");
    const body = c.req.valid("json");

    const updated = await consumerAuthService.updateProfile(consumer.id, body);

    return c.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      identifier: updated.identifier,
      credits: updated.credits,
      subscriptionActive: updated.subscriptionActive,
    });
  }
);

// Mount authenticated routes
consumerRoutes.route("/:appNameId/user", authenticatedRoutes);

// ========================================
// App Info Routes (public)
// ========================================

/**
 * GET /:appNameId/app
 * Get public app information
 */
consumerRoutes.get(
  "/:appNameId/app",
  optionalConsumerAuthMiddleware,
  async (c) => {
    const app = c.get("app");
    const consumer = c.get("consumer");

    // Extract only the settings relevant for consumers (don't expose internal settings).
    // - requireAuth: Controlled by "User signup" toggle in app builder UI.
    //   When true, consumer must authenticate to chat. When false, anonymous chat allowed.
    //   Frontend uses this to decide whether to show login button and redirect.
    // - redirectAfterSignupUrl: Custom URL to redirect to after successful signup
    // - signupsRestrictedToDomain: If set, shows domain hint in signup form
    const settings = app.settings as Record<string, unknown> | null;
    const publicSettings = {
      requireAuth: settings?.requireAuth ?? false,
      redirectAfterSignupUrl: settings?.redirectAfterSignupUrl as
        | string
        | undefined,
      signupsRestrictedToDomain: settings?.signupsRestrictedToDomain as
        | string
        | undefined,
      fileUploadEnabled: settings?.fileUploadEnabled ?? false,
      imageUploadEnabled: settings?.imageUploadEnabled ?? false,
      videoInputEnabled: modelSupportsVideoInput(app.model ?? ""),
      disclaimerText: settings?.disclaimerText as string | undefined,
      inputPlaceholder: settings?.inputPlaceholder as string | undefined,
      customInstructionsEnabled: settings?.customInstructionsEnabled ?? true,
    };

    // Get pictureUrl from brandStyles (logoUrl field)
    const brandStyles = app.brandStyles as Record<string, unknown> | null;
    const pictureUrl = brandStyles?.logoUrl as string | undefined;

    return c.json({
      id: app.id,
      name: app.name,
      brandStyles: app.brandStyles,
      pictureUrl,
      settings: publicSettings,
      isAuthenticated: !!consumer,
      consumer: consumer
        ? {
            id: consumer.id,
            email: consumer.email,
            name: consumer.name,
          }
        : null,
    });
  }
);

// ========================================
// PWA Routes (manifest, icons, splash screens)
// ========================================

import pwaRoutes from "./pwa.ts";
consumerRoutes.route("/", pwaRoutes);

// ========================================
// Chat Routes (mounted separately)
// ========================================

import { consumerChatRoutes } from "./chat.ts";
consumerRoutes.route("/:appNameId/chat", consumerChatRoutes);

// ========================================
// Upload Routes (video for chat)
// ========================================

consumerRoutes.post("/:appNameId/upload/video", async (c) => {
  const subfolder = c.req.query("subfolder") || "chat-videos";
  // Sanitize subfolder
  const sanitized =
    subfolder.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || "chat-videos";

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

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

    const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_VIDEO_SIZE) {
      return c.json({ error: "Video must be less than 20MB" }, 400);
    }

    const fileId = crypto.randomUUID();
    const fileExt = file.name.split(".").pop() || "mp4";
    const storagePath = `${sanitized}/${fileId}.${fileExt}`;

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
    console.error("[consumer-upload] Error uploading video:", error);
    return c.json(
      {
        error: "Upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
