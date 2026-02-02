/**
 * Phase 9: Migrate Text Chunks (Embeddings)
 *
 * Source: PostgreSQL embeddings DB (textchunk table)
 * Target: rag.text_chunks
 *
 * Note: Very large table (~97M rows) with vector embeddings.
 * Uses PostgreSQL-to-PostgreSQL COPY for efficiency.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldTextChunk {
  id: number;
  appid: number;
  knowledge_source_id: number | null;
  content: string;
  embedding: string; // vector as string
  sparse_embedding: unknown | null;
  token_count: number | null;
  chunk_index: number | null;
  metadata: unknown | null;
  created_at: Date;
}

const BATCH_SIZE = 1000; // Smaller batches due to large embeddings

export async function migrateTextChunks(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-9] Migrating text chunks (embeddings)...\n");

  // Get count from old embeddings DB
  const countResult = await conns.pgEmbeddings`
    SELECT COUNT(*)::int as count FROM textchunk
  `;
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-9] Found ${totalCount} text chunks to migrate`);
  console.log(
    `[phase-9] WARNING: This is a very large table. Migration will take hours.`
  );

  if (totalCount === 0) {
    console.log("[phase-9] No text chunks to migrate");
    return;
  }

  await progress.start("text_chunk", totalCount);

  const existingProgress = await progress.getProgress("text_chunk");
  let lastId = parseInt(existingProgress?.lastProcessedId ?? "0");
  let migratedCount = existingProgress?.migratedCount ?? 0;

  if (lastId > 0) {
    console.log(`[phase-9] Resuming after ID ${lastId}`);
  }

  let skippedCount = 0;
  let batchCount = 0;

  try {
    let hasMore = true;

    while (hasMore) {
      // Fetch batch from old embeddings DB
      const batch = await conns.pgEmbeddings<OldTextChunk[]>`
        SELECT id, appid, knowledge_source_id, content,
               embedding::text, sparse_embedding, token_count,
               chunk_index, metadata, created_at
        FROM textchunk
        WHERE id > ${lastId}
        ORDER BY id
        LIMIT ${BATCH_SIZE}
      `;

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const chunk of batch) {
        // Map application ID
        const appId = idMapper.get("application", chunk.appid);
        if (!appId) {
          skippedCount++;
          continue;
        }

        // Map knowledge source ID if present
        const ksId = chunk.knowledge_source_id
          ? idMapper.get("knowledge_source", chunk.knowledge_source_id)
          : null;

        if (dryRun) {
          migratedCount++;
          continue;
        }

        // Insert with vector embedding
        // The embedding is already in the correct format from source
        await conns.pgTarget`
          INSERT INTO rag.text_chunks (
            application_id, knowledge_source_id, content,
            embedding, sparse_embedding, token_count,
            chunk_index, metadata, created_at
          ) VALUES (
            ${appId}::uuid,
            ${ksId ? `${ksId}::uuid` : null},
            ${chunk.content},
            ${chunk.embedding}::vector,
            ${chunk.sparse_embedding ? JSON.stringify(chunk.sparse_embedding) : null}::jsonb,
            ${chunk.token_count},
            ${chunk.chunk_index},
            ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
            ${chunk.created_at}
          )
        `;

        migratedCount++;
      }

      lastId = batch[batch.length - 1].id;
      batchCount++;

      await progress.update("text_chunk", String(lastId), migratedCount);

      // Log progress every 100 batches
      if (batchCount % 100 === 0) {
        const percent = ((migratedCount / totalCount) * 100).toFixed(2);
        const rate = (migratedCount / (batchCount * BATCH_SIZE)) * 100;
        console.log(
          `[phase-9] Progress: ${migratedCount}/${totalCount} (${percent}%) - ${skippedCount} skipped`
        );
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    await progress.complete("text_chunk");
    console.log(
      `[phase-9] Completed: ${migratedCount} text chunks migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("text_chunk", String(error));
    throw error;
  }
}

/**
 * Alternative: Use PostgreSQL COPY for bulk transfer
 *
 * This is MUCH faster for large tables but requires:
 * 1. Direct database connectivity
 * 2. Temporary staging table
 * 3. Post-processing for ID mapping
 */
export async function migrateTextChunksBulk(
  conns: Connections,
  idMapper: IdMapper,
  _progress: ProgressTracker
): Promise<void> {
  console.log(
    "\n[phase-9-bulk] Bulk migrating text chunks using staging table...\n"
  );

  // Create staging table in target
  await conns.pgTarget`
    CREATE TEMP TABLE IF NOT EXISTS _staging_text_chunks (
      old_id BIGINT NOT NULL,
      old_app_id INTEGER NOT NULL,
      old_ks_id INTEGER,
      content TEXT NOT NULL,
      embedding vector(1536),
      sparse_embedding JSONB,
      token_count INTEGER,
      chunk_index INTEGER,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  console.log("[phase-9-bulk] Created staging table");

  // Note: Full COPY implementation would require pg_dump/pg_restore
  // or postgres.js's copy feature. This is a placeholder for the pattern.

  console.log(
    "[phase-9-bulk] For production, use pg_dump | pg_restore with transformation"
  );
}
