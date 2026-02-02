/**
 * Marketplace Service
 *
 * Business logic for marketplace operations.
 * Lists public applications for the marketplace.
 */

import { db } from "../db/client.ts";

// ========================================
// Types
// ========================================

export interface MarketplaceApp {
  id: string;
  appNameId: string; // The app's slug/vanity URL
  name: string;
  description: string | null;
  creatorName: string | null;
  creatorPictureUrl: string | null;
  createdAt: Date;
}

export interface ListPublicAppsParams {
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

// ========================================
// Service
// ========================================

export const marketplaceService = {
  /**
   * List public applications for the marketplace
   */
  async listPublicApps(params: ListPublicAppsParams = {}): Promise<{
    apps: MarketplaceApp[];
    total: number;
  }> {
    const { searchQuery, limit = 20, offset = 0 } = params;

    // Build the query using correct column names from schema
    let query = db
      .selectFrom("app.applications as a")
      .leftJoin("app.users as u", "u.id", "a.developerId")
      .select([
        "a.id",
        "a.appNameId",
        "a.name",
        "a.description",
        "a.createdAt",
        "u.name as creatorName",
        "u.picture as creatorPictureUrl",
      ])
      .where("a.isPublic", "=", true)
      .where("a.isDeleted", "=", false);

    // Apply search filter
    if (searchQuery) {
      const searchPattern = `%${searchQuery.toLowerCase()}%`;
      query = query.where((eb) =>
        eb.or([
          eb("a.name", "ilike", searchPattern),
          eb("a.description", "ilike", searchPattern),
        ])
      );
    }

    // Get total count (before pagination)
    const countResult = await db
      .selectFrom("app.applications")
      .select(db.fn.countAll().as("count"))
      .where("isPublic", "=", true)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    const total = Number(countResult?.count ?? 0);

    // Apply pagination
    const results = await query
      .orderBy("a.createdAt", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const apps: MarketplaceApp[] = results.map((row) => ({
      id: row.id,
      appNameId: row.appNameId,
      name: row.name,
      description: row.description,
      creatorName: row.creatorName,
      creatorPictureUrl: row.creatorPictureUrl,
      createdAt: row.createdAt,
    }));

    return { apps, total };
  },

  /**
   * Get recent public apps for the marketplace hero section
   * (Featured functionality would require adding a column to the schema)
   */
  async getRecentApps(limit = 6): Promise<MarketplaceApp[]> {
    const result = await this.listPublicApps({ limit });
    return result.apps;
  },

  /**
   * Get a single public app by its appNameId (vanity slug)
   */
  async getPublicApp(appNameId: string): Promise<MarketplaceApp | null> {
    const row = await db
      .selectFrom("app.applications as a")
      .leftJoin("app.users as u", "u.id", "a.developerId")
      .select([
        "a.id",
        "a.appNameId",
        "a.name",
        "a.description",
        "a.createdAt",
        "u.name as creatorName",
        "u.picture as creatorPictureUrl",
      ])
      .where("a.appNameId", "=", appNameId)
      .where("a.isPublic", "=", true)
      .where("a.isDeleted", "=", false)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      appNameId: row.appNameId,
      name: row.name,
      description: row.description,
      creatorName: row.creatorName,
      creatorPictureUrl: row.creatorPictureUrl,
      createdAt: row.createdAt,
    };
  },

  /**
   * Get count of public apps
   */
  async getPublicAppCount(): Promise<number> {
    const result = await db
      .selectFrom("app.applications")
      .select(db.fn.countAll().as("count"))
      .where("isPublic", "=", true)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  },
};
