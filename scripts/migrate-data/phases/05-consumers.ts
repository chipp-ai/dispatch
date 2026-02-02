/**
 * Phase 5: Migrate Consumers
 *
 * Source: MySQL main DB (Consumer table)
 * Target: app.consumers
 *
 * Note: Large table (~78M rows). Uses streaming/batching carefully.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldConsumer {
  id: number;
  applicationId: number;
  externalId: string | null;
  email: string | null;
  name: string | null;
  metadata: string | null;
  creditsBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

const BATCH_SIZE = 5000; // Larger batches for high-volume table

export async function migrateConsumers(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-5] Migrating consumers...\n");

  const countResult = await conns.mysqlMain.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM Consumer"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-5] Found ${totalCount} consumers to migrate`);
  console.log(
    `[phase-5] Note: This is a large table, migration will take time...`
  );

  if (totalCount === 0) {
    console.log("[phase-5] No consumers to migrate");
    return;
  }

  await progress.start("consumer", totalCount);

  const existingProgress = await progress.getProgress("consumer");
  let lastId = 0;
  let migratedCount = existingProgress?.migratedCount ?? 0;

  if (existingProgress?.lastProcessedId) {
    lastId = parseInt(existingProgress.lastProcessedId);
    console.log(`[phase-5] Resuming after ID ${lastId}`);
  }

  let skippedCount = 0;
  let batchCount = 0;

  try {
    // Use cursor-based pagination for large tables (more efficient than OFFSET)
    let hasMore = true;

    while (hasMore) {
      const batch = await conns.mysqlMain.query<OldConsumer>(
        `SELECT id, applicationId, externalId, email, name,
                metadata, creditsBalance, createdAt, updatedAt
         FROM Consumer
         WHERE id > ?
         ORDER BY id
         LIMIT ?`,
        [lastId, BATCH_SIZE]
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Batch insert for performance
      const inserts: Array<{
        appId: string;
        externalId: string | null;
        email: string | null;
        name: string | null;
        metadata: unknown;
        creditsBalance: number;
        createdAt: Date;
        updatedAt: Date;
        oldId: number;
      }> = [];

      for (const consumer of batch) {
        // Check if already migrated
        if (idMapper.get("consumer", consumer.id)) {
          continue;
        }

        // Map application ID
        const appId = idMapper.get("application", consumer.applicationId);
        if (!appId) {
          // Skip consumers for unmigrated/deleted apps
          skippedCount++;
          continue;
        }

        const metadata = consumer.metadata
          ? JSON.parse(consumer.metadata)
          : null;

        inserts.push({
          appId,
          externalId: consumer.externalId,
          email: consumer.email,
          name: consumer.name,
          metadata,
          creditsBalance: consumer.creditsBalance ?? 0,
          createdAt: consumer.createdAt,
          updatedAt: consumer.updatedAt,
          oldId: consumer.id,
        });
      }

      if (!dryRun && inserts.length > 0) {
        // Insert batch and get IDs
        for (const ins of inserts) {
          const result = await conns.pgTarget`
            INSERT INTO app.consumers (
              application_id, external_id, email, name,
              metadata, credits_balance, created_at, updated_at
            ) VALUES (
              ${ins.appId}::uuid,
              ${ins.externalId},
              ${ins.email},
              ${ins.name},
              ${ins.metadata ? JSON.stringify(ins.metadata) : null}::jsonb,
              ${ins.creditsBalance},
              ${ins.createdAt},
              ${ins.updatedAt}
            )
            RETURNING id
          `;

          await idMapper.set("consumer", ins.oldId, result[0].id as string);
          migratedCount++;
        }
      } else if (dryRun) {
        migratedCount += inserts.length;
      }

      lastId = batch[batch.length - 1].id;
      batchCount++;

      // Update progress every batch
      await progress.update("consumer", String(lastId), migratedCount);

      // Log progress every 10 batches
      if (batchCount % 10 === 0) {
        const percent = ((migratedCount / totalCount) * 100).toFixed(1);
        console.log(
          `[phase-5] Progress: ${migratedCount}/${totalCount} (${percent}%) - ${skippedCount} skipped`
        );
      }

      // Check if we've processed all
      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    await progress.complete("consumer");
    console.log(
      `[phase-5] Completed: ${migratedCount} consumers migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("consumer", String(error));
    throw error;
  }
}
