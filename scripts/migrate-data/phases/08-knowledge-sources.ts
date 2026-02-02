/**
 * Phase 8: Migrate Knowledge Sources
 *
 * Source: MySQL main DB (KnowledgeSource table)
 * Target: rag.knowledge_sources
 *
 * Note: Knowledge sources metadata is in MySQL, but embeddings are in PostgreSQL.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldKnowledgeSource {
  id: number;
  applicationId: number;
  type: string;
  name: string;
  url: string | null;
  filePath: string | null;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const BATCH_SIZE = 1000;

export async function migrateKnowledgeSources(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-8] Migrating knowledge sources...\n");

  const countResult = await conns.mysqlMain.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM KnowledgeSource WHERE deletedAt IS NULL"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-8] Found ${totalCount} knowledge sources to migrate`);

  if (totalCount === 0) {
    console.log("[phase-8] No knowledge sources to migrate");
    return;
  }

  await progress.start("knowledge_source", totalCount);

  const existingProgress = await progress.getProgress("knowledge_source");
  let offset = existingProgress?.migratedCount ?? 0;

  if (offset > 0) {
    console.log(`[phase-8] Resuming from offset ${offset}`);
  }

  let migratedCount = offset;
  let skippedCount = 0;

  try {
    while (offset < totalCount) {
      const batch = await conns.mysqlMain.query<OldKnowledgeSource>(
        `SELECT id, applicationId, type, name, url, filePath,
                status, errorMessage, chunkCount, metadata, createdAt, updatedAt
         FROM KnowledgeSource
         WHERE deletedAt IS NULL
         ORDER BY id
         LIMIT ? OFFSET ?`,
        [BATCH_SIZE, offset]
      );

      if (batch.length === 0) break;

      for (const ks of batch) {
        if (idMapper.get("knowledge_source", ks.id)) {
          continue;
        }

        const appId = idMapper.get("application", ks.applicationId);
        if (!appId) {
          skippedCount++;
          continue;
        }

        // Map type enum
        const typeMap: Record<string, string> = {
          file: "file",
          url: "url",
          google_drive: "google_drive",
          notion: "notion",
          text: "text",
          qa: "qa",
          sitemap: "sitemap",
          youtube: "youtube",
          confluence: "confluence",
        };
        const type = typeMap[ks.type.toLowerCase()] ?? "file";

        // Map status enum
        const statusMap: Record<string, string> = {
          pending: "pending",
          processing: "processing",
          completed: "completed",
          failed: "failed",
          deleting: "deleting",
        };
        const status = statusMap[ks.status.toLowerCase()] ?? "pending";

        if (dryRun) {
          migratedCount++;
          continue;
        }

        const metadata = ks.metadata ? JSON.parse(ks.metadata) : null;

        const result = await conns.pgTarget`
          INSERT INTO rag.knowledge_sources (
            application_id, type, name, url, file_path,
            status, error_message, chunk_count, metadata,
            created_at, updated_at
          ) VALUES (
            ${appId}::uuid,
            ${type}::knowledge_source_type,
            ${ks.name},
            ${ks.url},
            ${ks.filePath},
            ${status}::knowledge_source_status,
            ${ks.errorMessage},
            ${ks.chunkCount ?? 0},
            ${metadata ? JSON.stringify(metadata) : null}::jsonb,
            ${ks.createdAt},
            ${ks.updatedAt}
          )
          RETURNING id
        `;

        await idMapper.set("knowledge_source", ks.id, result[0].id as string);
        migratedCount++;
      }

      offset += batch.length;
      await progress.update(
        "knowledge_source",
        String(batch[batch.length - 1].id),
        migratedCount
      );
      console.log(`[phase-8] Progress: ${migratedCount}/${totalCount}`);
    }

    await progress.complete("knowledge_source");
    console.log(
      `[phase-8] Completed: ${migratedCount} knowledge sources migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("knowledge_source", String(error));
    throw error;
  }
}
