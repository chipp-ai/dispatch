/**
 * Onboarding Service
 *
 * Handles user onboarding flow including profile updates,
 * persona selection, and onboarding progress tracking.
 */

import { db } from "../db/index.ts";
import type { UserOnboarding } from "../db/schema.ts";
import * as Sentry from "@sentry/deno";

export interface OnboardingQuestion {
  questionSlug: string;
  question: string;
  options?: string[];
  answer?: string[];
}

export interface ProfileUpdateData {
  name?: string;
  picture?: string;
}

class OnboardingService {
  /**
   * Update user profile during onboarding
   */
  async updateProfile(
    userId: string,
    data: ProfileUpdateData
  ): Promise<{ success: boolean }> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.picture !== undefined) {
      updateData.picture = data.picture;
    }

    await db
      .updateTable("app.users")
      .set(updateData)
      .where("id", "=", userId)
      .execute();

    return { success: true };
  }

  /**
   * Save onboarding question/answer
   */
  async saveOnboardingAnswer(
    userId: string,
    question: OnboardingQuestion,
    version = "1.0"
  ): Promise<UserOnboarding> {
    // Check if answer already exists for this question
    const existing = await db
      .selectFrom("app.user_onboarding")
      .selectAll()
      .where("userId", "=", userId)
      .where("questionSlug", "=", question.questionSlug)
      .executeTakeFirst();

    if (existing) {
      // Update existing answer
      await db
        .updateTable("app.user_onboarding")
        .set({
          answer: JSON.stringify(question.answer),
          updatedAt: new Date(),
        })
        .where("id", "=", existing.id)
        .execute();

      return {
        ...existing,
        answer: question.answer,
        updatedAt: new Date(),
      };
    }

    // Insert new answer
    const id = crypto.randomUUID();
    const now = new Date();

    await db
      .insertInto("app.user_onboarding")
      .values({
        id,
        userId,
        questionSlug: question.questionSlug,
        question: question.question,
        options: question.options ? JSON.stringify(question.options) : null,
        answer: question.answer ? JSON.stringify(question.answer) : null,
        version,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    return {
      id,
      userId,
      questionSlug: question.questionSlug,
      question: question.question,
      options: question.options || null,
      answer: question.answer || null,
      version,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get all onboarding answers for a user
   */
  async getOnboardingAnswers(userId: string): Promise<UserOnboarding[]> {
    return db
      .selectFrom("app.user_onboarding")
      .selectAll()
      .where("userId", "=", userId)
      .execute();
  }

  /**
   * Get specific onboarding answer by question slug
   */
  async getOnboardingAnswer(
    userId: string,
    questionSlug: string
  ): Promise<UserOnboarding | undefined> {
    return db
      .selectFrom("app.user_onboarding")
      .selectAll()
      .where("userId", "=", userId)
      .where("questionSlug", "=", questionSlug)
      .executeTakeFirst();
  }

  /**
   * Mark onboarding as complete
   * This could update a flag on the user or just check if all required questions are answered
   */
  async isOnboardingComplete(userId: string): Promise<boolean> {
    const requiredQuestions = ["persona"];
    const answers = await this.getOnboardingAnswers(userId);
    const answeredSlugs = answers
      .filter((a) => a.answer !== null)
      .map((a) => a.questionSlug);

    return requiredQuestions.every((slug) => answeredSlugs.includes(slug));
  }

  /**
   * Get the user's active workspace (most recently joined)
   */
  async getActiveWorkspace(
    userId: string
  ): Promise<{ workspaceId: string } | undefined> {
    // Get the most recently joined workspace for this user
    const membership = await db
      .selectFrom("app.workspace_members")
      .select(["workspaceId"])
      .where("userId", "=", userId)
      .orderBy("joinedAt", "desc")
      .executeTakeFirst();

    return membership;
  }

  /**
   * Send workspace invitations
   * Creates invite records and (TODO) sends emails
   */
  async sendWorkspaceInvites(
    workspaceId: string,
    emails: string[],
    inviterName: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const email of emails) {
      try {
        const id = crypto.randomUUID();
        const token = crypto.randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db
          .insertInto("app.workspace_invites")
          .values({
            id,
            workspaceId,
            email: email.toLowerCase().trim(),
            role: "VIEWER",
            status: "PENDING",
            token,
            tokenExpiresAt: expiresAt,
            tokenHasBeenUsed: false,
            acceptedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();

        // TODO: Send invite email via SendGrid or similar
        // For now, just create the invite record

        success++;
      } catch (error) {
        console.error(`Failed to create invite for ${email}:`, error);
        Sentry.captureException(error, {
          tags: { source: "onboarding-service", feature: "workspace-invite" },
          extra: { workspaceId, email },
        });
        failed++;
      }
    }

    return { success, failed };
  }
}

export const onboardingService = new OnboardingService();
