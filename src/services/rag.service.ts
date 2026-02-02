/**
 * RAG Service
 *
 * Retrieval-Augmented Generation using cosine similarity search.
 * Finds relevant text chunks from knowledge sources to include in chat context.
 *
 * Uses local embeddings (BGE-base-en-v1.5) for ~50ms latency vs ~1200ms with OpenAI.
 */

import { sql } from "../db/client.ts";
import {
  generateLocalEmbedding,
  formatEmbeddingForPg,
  padEmbedding,
} from "./local-embeddings.service.ts";
import * as Sentry from "@sentry/deno";

const RELEVANCE_THRESHOLD = 0.15;
const MAX_CHUNKS = 5;

export interface RelevantChunk {
  id: string;
  content: string;
  fileName: string | null;
  fileId: string | null;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Get relevant text chunks for a user message using cosine similarity
 */
export async function getRelevantChunks(
  applicationId: string,
  userMessage: string
): Promise<RelevantChunk[]> {
  try {
    // Fast check: skip expensive embedding generation if no chunks exist for this app
    const [countResult] = await sql`
      SELECT COUNT(*)::int as count
      FROM rag.text_chunks
      WHERE application_id = ${applicationId}::uuid
        AND embedding IS NOT NULL
      LIMIT 1
    `;

    if (!countResult?.count || countResult.count === 0) {
      return [];
    }

    // Generate embedding for user message (only if chunks exist)
    // Uses local BGE model (~50ms) instead of OpenAI API (~1200ms)
    // Pad to 3072 dimensions to match stored embeddings
    const { embedding } = await generateLocalEmbedding(userMessage);
    const paddedEmbedding = padEmbedding(embedding);
    const embeddingStr = formatEmbeddingForPg(paddedEmbedding);

    // Query for similar chunks using cosine similarity
    // Using <=> operator for cosine distance (1 - similarity)
    const chunks = await sql`
      SELECT
        tc.id,
        tc.content,
        tc.metadata,
        ks.name as file_name,
        ks.id as file_id,
        1 - (tc.embedding <=> ${embeddingStr}::vector) as similarity
      FROM rag.text_chunks tc
      LEFT JOIN rag.knowledge_sources ks ON tc.knowledge_source_id = ks.id
      WHERE tc.application_id = ${applicationId}::uuid
        AND tc.embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT ${MAX_CHUNKS}
    `;

    // Filter by relevance threshold
    const typedChunks = chunks as unknown as Array<{
      id: string;
      content: string;
      file_name: string | null;
      file_id: string | null;
      similarity: number;
      metadata: Record<string, unknown> | null;
    }>;
    const relevantChunks = typedChunks
      .filter((chunk) => chunk.similarity > RELEVANCE_THRESHOLD)
      .map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        fileName:
          (chunk.metadata?.displayName as string) ||
          (chunk.metadata?.originalFileName as string) ||
          chunk.file_name,
        fileId: chunk.file_id,
        similarity: chunk.similarity,
        metadata: chunk.metadata,
      }));

    return relevantChunks;
  } catch (error) {
    console.error("[rag] Error retrieving relevant chunks:", error);
    Sentry.captureException(error, {
      tags: { source: "rag-service", feature: "get-relevant-chunks" },
      extra: { applicationId },
    });
    return [];
  }
}

/**
 * Check if an application has any embedded knowledge sources.
 * Lightweight query to avoid registering tools for apps with no knowledge base.
 */
export async function hasKnowledgeSources(
  applicationId: string
): Promise<boolean> {
  try {
    const [countResult] = await sql`
      SELECT COUNT(*)::int as count
      FROM rag.text_chunks
      WHERE application_id = ${applicationId}::uuid
        AND embedding IS NOT NULL
      LIMIT 1
    `;
    return (countResult?.count ?? 0) > 0;
  } catch {
    return false;
  }
}
