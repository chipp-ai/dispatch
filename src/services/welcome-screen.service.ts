/**
 * Welcome Screen Service
 *
 * Tracks whether a developer has seen the welcome back screen.
 * Uses email as the key since this check happens BEFORE the user
 * exists in chipp-deno (they only have a chipp-admin session).
 */

import { db } from "../db/client.ts";

export const welcomeScreenService = {
  /**
   * Check if an email has already seen the welcome screen.
   */
  async hasSeenWelcomeScreen(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();

    const record = await db
      .selectFrom("app.welcome_screen_views")
      .select(["id"])
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    return !!record;
  },

  /**
   * Mark an email as having seen the welcome screen.
   * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
   */
  async markWelcomeScreenSeen(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    await db
      .insertInto("app.welcome_screen_views")
      .values({
        email: normalizedEmail,
      })
      .onConflict((oc) => oc.column("email").doNothing())
      .execute();
  },

  /**
   * Link a welcome screen view record to a user after they log in.
   * This is optional - helps with data integrity but not required.
   */
  async linkToUser(email: string, userId: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    await db
      .updateTable("app.welcome_screen_views")
      .set({ userId })
      .where("email", "=", normalizedEmail)
      .execute();
  },
};
