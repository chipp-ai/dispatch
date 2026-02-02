/**
 * Developer Service
 *
 * Handles developer profile operations including reading and updating
 * user profile information.
 */

import { db } from "../db/client.ts";

interface UpdateProfileInput {
  name?: string;
  pictureUrl?: string | null;
}

interface DeveloperProfile {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  organizationId: string;
  activeWorkspaceId: string | null;
}

class DeveloperService {
  /**
   * Get developer profile by user ID
   */
  async getProfile(userId: string): Promise<DeveloperProfile | null> {
    const result = await db
      .selectFrom("app.users")
      .select([
        "id",
        "email",
        "name",
        "picture",
        "organizationId",
        "activeWorkspaceId",
      ])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      name: result.name,
      pictureUrl: result.picture,
      organizationId: result.organizationId,
      activeWorkspaceId: result.activeWorkspaceId,
    };
  }

  /**
   * Update developer profile
   */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput
  ): Promise<DeveloperProfile> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.pictureUrl !== undefined) {
      updateData.picture = input.pictureUrl;
    }

    await db
      .updateTable("app.users")
      .set(updateData)
      .where("id", "=", userId)
      .execute();

    const updated = await this.getProfile(userId);
    if (!updated) {
      throw new Error("Failed to retrieve updated profile");
    }

    return updated;
  }
}

export const developerService = new DeveloperService();
