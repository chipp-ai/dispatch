/**
 * Phase 6: Migrate Chat Sessions
 *
 * Source: MySQL chat DB (ChatSession table)
 * Target: chat.sessions
 *
 * Note: Large table (~5.3M rows). Uses cursor-based pagination.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldChatSession {
  id: string; // UUID in old schema
  applicationId: number;
  authorUserId: number; // This maps to consumer
  source: string;
  title: string | null;
  isShared: boolean;
  phoneNumber: string | null;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const BATCH_SIZE = 2000;

export async function migrateChatSessions(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-6] Migrating chat sessions...\n");

  // Only migrate non-deleted sessions
  const countResult = await conns.mysqlChat.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM ChatSession WHERE deletedAt IS NULL"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-6] Found ${totalCount} chat sessions to migrate`);

  if (totalCount === 0) {
    console.log("[phase-6] No chat sessions to migrate");
    return;
  }

  await progress.start("chat_session", totalCount);

  const existingProgress = await progress.getProgress("chat_session");
  let lastId = existingProgress?.lastProcessedId ?? "";
  let migratedCount = existingProgress?.migratedCount ?? 0;

  if (lastId) {
    console.log(`[phase-6] Resuming after ID ${lastId}`);
  }

  let skippedCount = 0;
  let batchCount = 0;

  try {
    let hasMore = true;

    while (hasMore) {
      // UUID-based cursor pagination
      const batch = await conns.mysqlChat.query<OldChatSession>(
        `SELECT id, applicationId, authorUserId, source, title,
                isShared, phoneNumber, metadata, createdAt, updatedAt
         FROM ChatSession
         WHERE deletedAt IS NULL AND id > ?
         ORDER BY id
         LIMIT ?`,
        [lastId, BATCH_SIZE]
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const session of batch) {
        // Check if already migrated
        if (idMapper.get("chat_session", session.id)) {
          continue;
        }

        // Map application ID
        const appId = idMapper.get("application", session.applicationId);
        if (!appId) {
          skippedCount++;
          continue;
        }

        // Map consumer ID (authorUserId was the old consumer reference)
        // In the old system, authorUserId could be a developer or consumer ID
        const consumerId = idMapper.get("consumer", session.authorUserId);

        // Map source enum
        const sourceMap: Record<string, string> = {
          APP: "APP",
          API: "API",
          WHATSAPP: "WHATSAPP",
          SLACK: "SLACK",
          EMAIL: "EMAIL",
        };
        const source = sourceMap[session.source] ?? "APP";

        if (dryRun) {
          migratedCount++;
          continue;
        }

        const metadata = session.metadata ? JSON.parse(session.metadata) : null;

        const result = await conns.pgTarget`
          INSERT INTO chat.sessions (
            application_id, consumer_id, source, title,
            is_bookmarked, external_id, metadata, started_at
          ) VALUES (
            ${appId}::uuid,
            ${consumerId ? `${consumerId}::uuid` : null},
            ${source}::chat_source,
            ${session.title},
            ${session.isShared},
            ${session.phoneNumber},
            ${metadata ? JSON.stringify(metadata) : null}::jsonb,
            ${session.createdAt}
          )
          RETURNING id
        `;

        await idMapper.set("chat_session", session.id, result[0].id as string);
        migratedCount++;
      }

      lastId = batch[batch.length - 1].id;
      batchCount++;

      await progress.update("chat_session", lastId, migratedCount);

      if (batchCount % 20 === 0) {
        const percent = ((migratedCount / totalCount) * 100).toFixed(1);
        console.log(
          `[phase-6] Progress: ${migratedCount}/${totalCount} (${percent}%)`
        );
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    await progress.complete("chat_session");
    console.log(
      `[phase-6] Completed: ${migratedCount} sessions migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("chat_session", String(error));
    throw error;
  }
}
