/**
 * Phase 7: Migrate Messages
 *
 * Source: MySQL chat DB (Message table)
 * Target: chat.messages
 *
 * Note: Very large table (~32M rows). Requires careful batching.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldMessage {
  id: string; // UUID
  chatSessionId: string;
  senderType: string; // USER or BOT
  content: string;
  type: string; // TEXT, IMAGE, FILE
  modelUsed: string | null;
  metadata: string | null;
  tagIds: string | null;
  createdAt: Date;
}

const BATCH_SIZE = 5000;

export async function migrateMessages(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-7] Migrating messages...\n");

  const countResult = await conns.mysqlChat.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM Message"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-7] Found ${totalCount} messages to migrate`);
  console.log(`[phase-7] Note: Large table, this will take time...`);

  if (totalCount === 0) {
    console.log("[phase-7] No messages to migrate");
    return;
  }

  await progress.start("message", totalCount);

  const existingProgress = await progress.getProgress("message");
  let lastId = existingProgress?.lastProcessedId ?? "";
  let migratedCount = existingProgress?.migratedCount ?? 0;

  if (lastId) {
    console.log(`[phase-7] Resuming after ID ${lastId}`);
  }

  let skippedCount = 0;
  let batchCount = 0;

  try {
    let hasMore = true;

    while (hasMore) {
      const batch = await conns.mysqlChat.query<OldMessage>(
        `SELECT id, chatSessionId, senderType, content, type,
                modelUsed, metadata, tagIds, createdAt
         FROM Message
         WHERE id > ?
         ORDER BY id
         LIMIT ?`,
        [lastId, BATCH_SIZE]
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const msg of batch) {
        // Check if already migrated
        if (idMapper.get("message", msg.id)) {
          continue;
        }

        // Map session ID
        const sessionId = idMapper.get("chat_session", msg.chatSessionId);
        if (!sessionId) {
          skippedCount++;
          continue;
        }

        // Map sender type to role
        const roleMap: Record<string, string> = {
          USER: "user",
          BOT: "assistant",
        };
        const role = roleMap[msg.senderType] ?? "user";

        if (dryRun) {
          migratedCount++;
          continue;
        }

        // Parse metadata and tags
        const metadata = msg.metadata ? JSON.parse(msg.metadata) : null;
        const tags = msg.tagIds ? JSON.parse(msg.tagIds) : null;

        const result = await conns.pgTarget`
          INSERT INTO chat.messages (
            session_id, role, content, model, tags, created_at
          ) VALUES (
            ${sessionId}::uuid,
            ${role}::message_role,
            ${msg.content},
            ${msg.modelUsed},
            ${tags ? JSON.stringify(tags) : null}::jsonb,
            ${msg.createdAt}
          )
          RETURNING id
        `;

        await idMapper.set("message", msg.id, result[0].id as string);
        migratedCount++;
      }

      lastId = batch[batch.length - 1].id;
      batchCount++;

      await progress.update("message", lastId, migratedCount);

      // Log progress every 50 batches (~250k rows)
      if (batchCount % 50 === 0) {
        const percent = ((migratedCount / totalCount) * 100).toFixed(1);
        console.log(
          `[phase-7] Progress: ${migratedCount}/${totalCount} (${percent}%)`
        );
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    await progress.complete("message");
    console.log(
      `[phase-7] Completed: ${migratedCount} messages migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("message", String(error));
    throw error;
  }
}
