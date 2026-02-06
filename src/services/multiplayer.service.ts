/**
 * Multiplayer Chat Service
 *
 * Manages multiplayer session lifecycle: create, join, leave, participants.
 * Also provides active stream registry for stop/interrupt.
 */

import { db } from "../db/client.ts";
import {
  generateAnonymousName,
  getAvatarColor,
} from "../utils/anonymous-identity.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";

// ========================================
// Active Stream Registry (for stop/interrupt)
// ========================================

const activeStreams = new Map<string, AbortController>();

// ========================================
// Types
// ========================================

export interface Participant {
  id: string;
  sessionId: string;
  consumerId: string | null;
  displayName: string;
  avatarColor: string;
  isActive: boolean;
  isAnonymous: boolean;
  anonymousToken: string | null;
  joinedAt: Date;
}

export interface CreateMultiplayerResult {
  sessionId: string;
  shareToken: string;
  participant: Participant;
}

export interface JoinSessionResult {
  participant: Participant;
  participants: Participant[];
}

// ========================================
// Service
// ========================================

export const multiplayerService = {
  // ---- Stream registry ----

  registerActiveStream(sessionId: string, controller: AbortController): void {
    activeStreams.set(sessionId, controller);
  },

  unregisterActiveStream(sessionId: string): void {
    activeStreams.delete(sessionId);
  },

  abortActiveStream(sessionId: string): boolean {
    const controller = activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      activeStreams.delete(sessionId);
      return true;
    }
    return false;
  },

  isStreamActive(sessionId: string): boolean {
    return activeStreams.has(sessionId);
  },

  // ---- Session management ----

  /**
   * Create a new multiplayer session.
   * Creates the chat session with is_multiplayer=true, a share_token,
   * and adds the creator as the first participant.
   */
  async createMultiplayerSession(
    applicationId: string,
    consumerId?: string | null,
    anonymousToken?: string | null
  ): Promise<CreateMultiplayerResult> {
    const shareToken = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const session = await db
      .insertInto("chat.sessions")
      .values({
        applicationId,
        consumerId: consumerId || null,
        title: "Group Chat",
        source: "APP",
        mode: "ai",
        isBookmarked: false,
        isMultiplayer: true,
        shareToken,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Determine display name
    let displayName: string;
    let isAnonymous = false;

    if (consumerId) {
      const consumer = await db
        .selectFrom("app.consumers")
        .select(["name", "email"])
        .where("id", "=", consumerId)
        .executeTakeFirst();
      displayName = consumer?.name || consumer?.email || "User";
    } else {
      displayName = generateAnonymousName();
      isAnonymous = true;
    }

    const avatarColor = getAvatarColor(displayName);

    const participant = await db
      .insertInto("chat.session_participants")
      .values({
        sessionId: session.id,
        consumerId: consumerId || null,
        displayName,
        avatarColor,
        isActive: true,
        isAnonymous,
        anonymousToken: anonymousToken || null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      sessionId: session.id,
      shareToken,
      participant: {
        id: participant.id,
        sessionId: participant.sessionId,
        consumerId: participant.consumerId,
        displayName: participant.displayName,
        avatarColor: participant.avatarColor,
        isActive: participant.isActive,
        isAnonymous: participant.isAnonymous,
        anonymousToken: participant.anonymousToken,
        joinedAt: participant.joinedAt,
      },
    };
  },

  /**
   * Join an existing multiplayer session via share token.
   * Returns the new participant and current participant list.
   */
  async joinSession(
    shareToken: string,
    applicationId: string,
    consumerId?: string | null,
    anonymousToken?: string | null
  ): Promise<JoinSessionResult & { sessionId: string }> {
    // Find session by share token
    const session = await db
      .selectFrom("chat.sessions")
      .select(["id", "applicationId", "isMultiplayer"])
      .where("shareToken", "=", shareToken)
      .where("applicationId", "=", applicationId)
      .executeTakeFirst();

    if (!session || !session.isMultiplayer) {
      throw new NotFoundError("Multiplayer session", shareToken);
    }

    // Check max participants (default 10)
    const participantCount = await db
      .selectFrom("chat.session_participants")
      .select(db.fn.count<number>("id").as("count"))
      .where("sessionId", "=", session.id)
      .where("isActive", "=", true)
      .executeTakeFirst();

    if ((participantCount?.count ?? 0) >= 50) {
      throw new ForbiddenError("Session is full");
    }

    // Check if already a participant (consumer or anon)
    let existingParticipant = null;
    if (consumerId) {
      existingParticipant = await db
        .selectFrom("chat.session_participants")
        .selectAll()
        .where("sessionId", "=", session.id)
        .where("consumerId", "=", consumerId)
        .executeTakeFirst();
    } else if (anonymousToken) {
      existingParticipant = await db
        .selectFrom("chat.session_participants")
        .selectAll()
        .where("sessionId", "=", session.id)
        .where("anonymousToken", "=", anonymousToken)
        .executeTakeFirst();
    }

    let participant;
    if (existingParticipant) {
      // Re-activate if they left
      if (!existingParticipant.isActive) {
        await db
          .updateTable("chat.session_participants")
          .set({ isActive: true, leftAt: null, lastSeenAt: new Date() })
          .where("id", "=", existingParticipant.id)
          .execute();
      }
      participant = {
        ...existingParticipant,
        isActive: true,
      };
    } else {
      // Create new participant
      let displayName: string;
      let isAnonymous = false;

      if (consumerId) {
        const consumer = await db
          .selectFrom("app.consumers")
          .select(["name", "email"])
          .where("id", "=", consumerId)
          .executeTakeFirst();
        displayName = consumer?.name || consumer?.email || "User";
      } else {
        displayName = generateAnonymousName();
        isAnonymous = true;
      }

      const avatarColor = getAvatarColor(displayName);

      participant = await db
        .insertInto("chat.session_participants")
        .values({
          sessionId: session.id,
          consumerId: consumerId || null,
          displayName,
          avatarColor,
          isActive: true,
          isAnonymous,
          anonymousToken: anonymousToken || null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // Get all active participants
    const participants = await db
      .selectFrom("chat.session_participants")
      .selectAll()
      .where("sessionId", "=", session.id)
      .where("isActive", "=", true)
      .execute();

    return {
      sessionId: session.id,
      participant: {
        id: participant.id,
        sessionId: participant.sessionId,
        consumerId: participant.consumerId,
        displayName: participant.displayName,
        avatarColor: participant.avatarColor,
        isActive: true,
        isAnonymous: participant.isAnonymous,
        anonymousToken: participant.anonymousToken,
        joinedAt: participant.joinedAt,
      },
      participants: participants.map((p) => ({
        id: p.id,
        sessionId: p.sessionId,
        consumerId: p.consumerId,
        displayName: p.displayName,
        avatarColor: p.avatarColor,
        isActive: p.isActive,
        isAnonymous: p.isAnonymous,
        anonymousToken: p.anonymousToken,
        joinedAt: p.joinedAt,
      })),
    };
  },

  /**
   * Leave a multiplayer session.
   */
  async leaveSession(sessionId: string, participantId: string): Promise<void> {
    await db
      .updateTable("chat.session_participants")
      .set({ isActive: false, leftAt: new Date() })
      .where("id", "=", participantId)
      .where("sessionId", "=", sessionId)
      .execute();
  },

  /**
   * Check if a consumer/anon is a participant in a session.
   */
  async isSessionParticipant(
    sessionId: string,
    consumerId?: string | null,
    anonymousToken?: string | null
  ): Promise<Participant | null> {
    let query = db
      .selectFrom("chat.session_participants")
      .selectAll()
      .where("sessionId", "=", sessionId)
      .where("isActive", "=", true);

    if (consumerId) {
      query = query.where("consumerId", "=", consumerId);
    } else if (anonymousToken) {
      query = query.where("anonymousToken", "=", anonymousToken);
    } else {
      return null;
    }

    const result = await query.executeTakeFirst();
    if (!result) return null;

    return {
      id: result.id,
      sessionId: result.sessionId,
      consumerId: result.consumerId,
      displayName: result.displayName,
      avatarColor: result.avatarColor,
      isActive: result.isActive,
      isAnonymous: result.isAnonymous,
      anonymousToken: result.anonymousToken,
      joinedAt: result.joinedAt,
    };
  },

  /**
   * Get active participants for a session.
   */
  async getSessionParticipants(sessionId: string): Promise<Participant[]> {
    const participants = await db
      .selectFrom("chat.session_participants")
      .selectAll()
      .where("sessionId", "=", sessionId)
      .where("isActive", "=", true)
      .orderBy("joinedAt", "asc")
      .execute();

    return participants.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      consumerId: p.consumerId,
      displayName: p.displayName,
      avatarColor: p.avatarColor,
      isActive: p.isActive,
      isAnonymous: p.isAnonymous,
      anonymousToken: p.anonymousToken,
      joinedAt: p.joinedAt,
    }));
  },

  /**
   * Get participant by ID.
   */
  async getParticipant(participantId: string): Promise<Participant | null> {
    const result = await db
      .selectFrom("chat.session_participants")
      .selectAll()
      .where("id", "=", participantId)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      sessionId: result.sessionId,
      consumerId: result.consumerId,
      displayName: result.displayName,
      avatarColor: result.avatarColor,
      isActive: result.isActive,
      isAnonymous: result.isAnonymous,
      anonymousToken: result.anonymousToken,
      joinedAt: result.joinedAt,
    };
  },
};
