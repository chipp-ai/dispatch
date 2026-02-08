/**
 * Dashboard API Routes
 *
 * Provides dashboard metrics, search, and export functionality.
 * Uses PostgreSQL with schema prefixes (app., chat., etc.)
 */

import { Hono } from "hono";
import { sql } from "kysely";
import type { AppEnv } from "../../../../types.ts";
import { db } from "../../../db/client.ts";
import { subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { log } from "@/lib/logger.ts";

export const dashboardRoutes = new Hono<AppEnv>();

interface DateRange {
  startDate: Date;
  endDate: Date;
}

function getDateRange(rangeValue: string): DateRange {
  const now = new Date();

  switch (rangeValue) {
    case "7d":
      return { startDate: subDays(now, 7), endDate: now };
    case "30d":
      return { startDate: subDays(now, 30), endDate: now };
    case "90d":
      return { startDate: subDays(now, 90), endDate: now };
    case "thisMonth":
      return { startDate: startOfMonth(now), endDate: now };
    case "lastMonth":
      return {
        startDate: startOfMonth(subMonths(now, 1)),
        endDate: endOfMonth(subMonths(now, 1)),
      };
    case "all":
    default:
      return { startDate: new Date(0), endDate: now };
  }
}

/**
 * GET /api/dashboard/v2
 * Main dashboard data endpoint
 */
dashboardRoutes.get("/v2", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const dateRange = c.req.query("dateRange") || "30d";
  const applicationId = c.req.query("applicationId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const { startDate, endDate } = getDateRange(dateRange);

  try {
    // Get applications in the workspace
    const applications = await db
      .selectFrom("app.applications")
      .select(["id", "name", "appNameId"])
      .where("workspaceId", "=", workspaceId)
      .where("isDeleted", "=", false)
      .execute();

    const applicationIds = applications.map((a) => a.id);
    const filteredAppIds =
      applicationId && applicationId !== "all"
        ? [applicationId]
        : applicationIds;

    if (filteredAppIds.length === 0) {
      return c.json({
        totalChats: 0,
        totalLeads: 0,
        totalConversions: 0,
        topTopics: [],
        appSpecificData: [],
      });
    }

    // Get chat counts from chat.sessions
    let totalChats = 0;
    try {
      const chatResult = await db
        .selectFrom("chat.sessions")
        .select(sql<number>`COUNT(*)`.as("count"))
        .where("applicationId", "in", filteredAppIds)
        .where("startedAt", ">=", startDate)
        .where("startedAt", "<=", endDate)
        .executeTakeFirst();

      totalChats = Number(chatResult?.count || 0);
    } catch (err) {
      log.error("Error counting chats", { source: "dashboard-api", feature: "count-chats", workspaceId, dateRange, filteredAppIds }, err);
    }

    // Leads and conversions not yet migrated to new schema
    const totalLeads = 0;
    const totalConversions = 0;

    // Top topics not yet migrated (no tags column in new schema)
    const topTopics: {
      id: string;
      topic: string;
      count: number;
      percentage: number;
      sampleQuestions: string[];
      trend: "up" | "down" | "stable";
      trendValue: number;
      applicationId: string;
    }[] = [];

    // Get per-app data
    const appSpecificData = [];
    for (const app of applications) {
      let appChats = 0;

      try {
        const chatResult = await db
          .selectFrom("chat.sessions")
          .select(sql<number>`COUNT(*)`.as("count"))
          .where("applicationId", "=", app.id)
          .where("startedAt", ">=", startDate)
          .where("startedAt", "<=", endDate)
          .executeTakeFirst();

        appChats = Number(chatResult?.count || 0);
      } catch {
        // Ignore
      }

      appSpecificData.push({
        id: app.id,
        name: app.name,
        chats: appChats,
        leads: 0, // Not yet migrated
      });
    }

    return c.json({
      totalChats,
      totalLeads,
      totalConversions,
      topTopics,
      appSpecificData,
    });
  } catch (error) {
    log.error("Failed to fetch dashboard data", { source: "dashboard-api", feature: "dashboard-v2", workspaceId, dateRange, applicationId: applicationId ?? "" }, error);
    return c.json({ error: "Failed to fetch dashboard data" }, 500);
  }
});

/**
 * GET /api/dashboard/search-chats
 * Search through chat history
 */
dashboardRoutes.get("/search-chats", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const query = c.req.query("q");
  const applicationId = c.req.query("applicationId");
  const limit = parseInt(c.req.query("limit") || "20");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  if (!query || query.length < 2) {
    return c.json({ results: [], total: 0 });
  }

  try {
    // Get applications in the workspace
    const applications = await db
      .selectFrom("app.applications")
      .select(["id", "name"])
      .where("workspaceId", "=", workspaceId)
      .where("isDeleted", "=", false)
      .execute();

    const applicationIds =
      applicationId && applicationId !== "all"
        ? [applicationId]
        : applications.map((a) => a.id);

    if (applicationIds.length === 0) {
      return c.json({ results: [], total: 0 });
    }

    const appMap = new Map(applications.map((a) => [a.id, a.name]));

    // Search chat sessions
    const sessions = await db
      .selectFrom("chat.sessions")
      .select(["id", "applicationId", "title", "startedAt"])
      .where("applicationId", "in", applicationIds)
      .where((eb) =>
        eb.or([
          eb("title", "ilike", `%${query}%`),
          eb.exists(
            eb
              .selectFrom("chat.messages")
              .select(sql`1`.as("one"))
              .whereRef("chat.messages.sessionId", "=", "chat.sessions.id")
              .where("chat.messages.content", "ilike", `%${query}%`)
          ),
        ])
      )
      .orderBy("startedAt", "desc")
      .limit(limit)
      .execute();

    // Get message counts and previews
    const results = await Promise.all(
      sessions.map(async (session) => {
        const messageStats = await db
          .selectFrom("chat.messages")
          .select([
            sql<number>`COUNT(*)`.as("count"),
            sql<string>`SUBSTRING(content, 1, 200)`.as("preview"),
          ])
          .where("sessionId", "=", session.id)
          .where("role", "=", "user")
          .executeTakeFirst();

        return {
          id: session.id,
          title: session.title,
          applicationId: session.applicationId,
          applicationName: appMap.get(session.applicationId) || "Unknown",
          userEmail: null, // Consumer not yet migrated
          userName: null,
          createdAt: session.startedAt,
          updatedAt: session.startedAt, // sessions table uses startedAt, no separate updatedAt
          messagePreview: messageStats?.preview || null,
          messageCount: Number(messageStats?.count || 0),
        };
      })
    );

    // Get total count
    const totalResult = await db
      .selectFrom("chat.sessions")
      .select(sql<number>`COUNT(*)`.as("count"))
      .where("applicationId", "in", applicationIds)
      .where((eb) =>
        eb.or([
          eb("title", "ilike", `%${query}%`),
          eb.exists(
            eb
              .selectFrom("chat.messages")
              .select(sql`1`.as("one"))
              .whereRef("chat.messages.sessionId", "=", "chat.sessions.id")
              .where("chat.messages.content", "ilike", `%${query}%`)
          ),
        ])
      )
      .executeTakeFirst();

    return c.json({
      results,
      total: Number(totalResult?.count || 0),
    });
  } catch (error) {
    log.error("Failed to search chats", { source: "dashboard-api", feature: "search-chats", workspaceId, query: query ?? "", applicationId: applicationId ?? "" }, error);
    return c.json({ error: "Failed to search chats" }, 500);
  }
});

/**
 * GET /api/dashboard/workspace/applications
 * List applications in workspace
 */
dashboardRoutes.get("/workspace/applications", async (c) => {
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  try {
    const applications = await db
      .selectFrom("app.applications")
      .select(["id", "name"])
      .where("workspaceId", "=", workspaceId)
      .where("isDeleted", "=", false)
      .orderBy("name", "asc")
      .execute();

    return c.json({ applications });
  } catch (error) {
    log.error("Failed to list workspace applications", { source: "dashboard-api", feature: "workspace-applications", workspaceId: workspaceId ?? "" }, error);
    return c.json({ error: "Failed to fetch applications" }, 500);
  }
});
