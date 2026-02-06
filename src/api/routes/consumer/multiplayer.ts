/**
 * Consumer Multiplayer Routes
 *
 * Endpoints for creating, joining, and managing multiplayer chat sessions.
 * Uses consumer auth (optional for anonymous participants).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  optionalConsumerAuthMiddleware,
  type AppOnlyContext,
} from "../../middleware/consumerAuth.ts";
import { multiplayerService } from "../../../services/multiplayer.service.ts";
import { chatService } from "../../../services/chat.service.ts";
import { publishToSession } from "../../../websocket/pubsub.ts";

export const multiplayerRoutes = new Hono<AppOnlyContext>();
multiplayerRoutes.use("*", optionalConsumerAuthMiddleware);

// ========================================
// Validation Schemas
// ========================================

const createSchema = z.object({
  anonymousToken: z.string().uuid().optional(),
});

const joinSchema = z.object({
  shareToken: z.string().min(1).max(20),
  anonymousToken: z.string().uuid().optional(),
});

const leaveSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

// ========================================
// Routes
// ========================================

/**
 * POST /create
 * Create a new multiplayer session. Returns session info + share token.
 */
multiplayerRoutes.post(
  "/create",
  zValidator("json", createSchema),
  async (c) => {
    const app = c.get("app");
    const consumer = c.get("consumer");
    const body = c.req.valid("json");

    // Check if app has multiplayer enabled
    const settings = app.settings as Record<string, unknown> | null;
    if (!settings?.multiplayerEnabled) {
      return c.json({ error: "Multiplayer is not enabled for this app" }, 403);
    }

    const result = await multiplayerService.createMultiplayerSession(
      app.id,
      consumer?.id,
      body.anonymousToken
    );

    return c.json({
      data: {
        sessionId: result.sessionId,
        shareToken: result.shareToken,
        participant: {
          id: result.participant.id,
          displayName: result.participant.displayName,
          avatarColor: result.participant.avatarColor,
          isAnonymous: result.participant.isAnonymous,
        },
      },
    }, 201);
  }
);

/**
 * POST /join
 * Join an existing multiplayer session via share token.
 * Returns participant info, current participants, and message history.
 */
multiplayerRoutes.post(
  "/join",
  zValidator("json", joinSchema),
  async (c) => {
    const app = c.get("app");
    const consumer = c.get("consumer");
    const body = c.req.valid("json");

    try {
      const result = await multiplayerService.joinSession(
        body.shareToken,
        app.id,
        consumer?.id,
        body.anonymousToken
      );

      // Get message history
      const messages = await chatService.getSessionMessages(result.sessionId);

      // Broadcast join event to existing participants
      publishToSession(
        result.sessionId,
        {
          type: "multiplayer:participant_joined",
          sessionId: result.sessionId,
          participant: {
            id: result.participant.id,
            displayName: result.participant.displayName,
            avatarColor: result.participant.avatarColor,
            isAnonymous: result.participant.isAnonymous,
            isActive: true,
            joinedAt: result.participant.joinedAt.toISOString(),
          },
        },
        result.participant.id // exclude the joiner
      ).catch(() => {});

      return c.json({
        data: {
          sessionId: result.sessionId,
          participant: {
            id: result.participant.id,
            displayName: result.participant.displayName,
            avatarColor: result.participant.avatarColor,
            isAnonymous: result.participant.isAnonymous,
          },
          participants: result.participants.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            avatarColor: p.avatarColor,
            isAnonymous: p.isAnonymous,
            isActive: p.isActive,
            joinedAt: p.joinedAt.toISOString(),
          })),
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            senderParticipantId: m.senderParticipantId,
            createdAt: m.createdAt,
          })),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Session not found or expired" }, 404);
      }
      throw error;
    }
  }
);

/**
 * GET /participants/:sessionId
 * Get current participant list for a session.
 */
multiplayerRoutes.get("/participants/:sessionId", async (c) => {
  const { sessionId } = c.req.param();

  const participants = await multiplayerService.getSessionParticipants(sessionId);

  return c.json({
    data: participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatarColor: p.avatarColor,
      isAnonymous: p.isAnonymous,
      isActive: p.isActive,
      joinedAt: p.joinedAt.toISOString(),
    })),
  });
});

/**
 * POST /leave
 * Leave a multiplayer session.
 */
multiplayerRoutes.post(
  "/leave",
  zValidator("json", leaveSchema),
  async (c) => {
    const body = c.req.valid("json");

    await multiplayerService.leaveSession(body.sessionId, body.participantId);

    // Get participant info for the broadcast
    const participant = await multiplayerService.getParticipant(body.participantId);

    if (participant) {
      publishToSession(body.sessionId, {
        type: "multiplayer:participant_left",
        sessionId: body.sessionId,
        participantId: body.participantId,
        displayName: participant.displayName,
      }).catch(() => {});
    }

    return c.json({ success: true });
  }
);
