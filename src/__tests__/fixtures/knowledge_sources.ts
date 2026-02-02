/**
 * Knowledge Source Test Fixtures
 *
 * Pre-defined test knowledge sources for RAG testing.
 * Used to test document uploads, URL scraping, embeddings, and retrieval.
 *
 * FIXTURE CATEGORIES:
 * - Text sources: Plain text content with embeddings
 * - URL sources: Scraped web pages with embeddings
 * - Document sources: PDF, DOCX, etc. uploads with embeddings
 * - Mixed sources: Apps with multiple source types
 * - Edge cases: Empty sources, large sources, failed sources
 *
 * USAGE:
 *   import { createTextSource, createUrlSource } from "../fixtures/knowledge_sources.ts";
 *   const source = await createTextSource(app, "Sample content for testing");
 *   const res = await post("/api/chat", user, { applicationId: app.id, message: "What do you know?" });
 */

import type { TestApplication } from "../setup.ts";
import { sql } from "../setup.ts";
import { generateId } from "../../utils/id.ts";

// ========================================
// Types
// ========================================

export type KnowledgeSourceType =
  | "file"
  | "url"
  | "google_drive"
  | "notion"
  | "text"
  | "qa"
  | "sitemap"
  | "youtube"
  | "confluence";

export type KnowledgeSourceStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "deleting";

export interface TestKnowledgeSource {
  id: string;
  applicationId: string;
  type: KnowledgeSourceType;
  name: string;
  status: KnowledgeSourceStatus;
  url?: string;
  filePath?: string;
  chunkCount: number;
  errorMessage?: string;
}

export interface TestTextChunk {
  id: string;
  sourceId: string;
  content: string;
  embedding?: number[];
}

// ========================================
// Core Database Operations
// ========================================

/**
 * Create a knowledge source directly in the database.
 * Bypasses the API for faster test setup.
 */
async function createSourceInDb(
  applicationId: string,
  options: {
    type: KnowledgeSourceType;
    name: string;
    status?: KnowledgeSourceStatus;
    url?: string;
    filePath?: string;
    metadata?: Record<string, unknown>;
    errorMessage?: string;
  }
): Promise<TestKnowledgeSource> {
  const sourceId = generateId();
  const status = options.status || "pending";

  await sql`
    INSERT INTO rag.knowledge_sources (
      id,
      application_id,
      type,
      name,
      url,
      file_path,
      status,
      error_message,
      metadata,
      chunk_count,
      created_at,
      updated_at
    )
    VALUES (
      ${sourceId}::uuid,
      ${applicationId}::uuid,
      ${options.type},
      ${options.name},
      ${options.url || null},
      ${options.filePath || null},
      ${status},
      ${options.errorMessage || null},
      ${options.metadata ? JSON.stringify(options.metadata) : null}::jsonb,
      0,
      NOW(),
      NOW()
    )
  `;

  return {
    id: sourceId,
    applicationId,
    type: options.type,
    name: options.name,
    status,
    url: options.url,
    filePath: options.filePath,
    chunkCount: 0,
    errorMessage: options.errorMessage,
  };
}

/**
 * Create a text chunk for a knowledge source.
 */
async function createChunkInDb(
  sourceId: string,
  content: string,
  embedding?: number[],
  options: {
    chunkIndex?: number;
    metadata?: Record<string, unknown>;
    applicationId?: string;
  } = {}
): Promise<TestTextChunk> {
  const chunkIndex = options.chunkIndex ?? 0;

  // Insert into text_chunks table - id is BIGSERIAL (auto-generated)
  // Need to get application_id from the knowledge_source
  const [result] = await sql`
    INSERT INTO rag.text_chunks (
      application_id,
      knowledge_source_id,
      content,
      chunk_index,
      metadata,
      created_at
    )
    SELECT
      ks.application_id,
      ${sourceId}::uuid,
      ${content},
      ${chunkIndex},
      ${options.metadata ? JSON.stringify(options.metadata) : null}::jsonb,
      NOW()
    FROM rag.knowledge_sources ks
    WHERE ks.id = ${sourceId}::uuid
    RETURNING id
  `;

  // Update chunk count on knowledge source
  await sql`
    UPDATE rag.knowledge_sources
    SET chunk_count = chunk_count + 1
    WHERE id = ${sourceId}::uuid
  `;

  return {
    id: String(result.id),
    sourceId,
    content,
    embedding,
  };
}

// ========================================
// Text Source Fixtures
// ========================================

/**
 * Create a text knowledge source with embedded content.
 * The text is chunked and embeddings are generated.
 */
export async function createTextSource(
  applicationId: string,
  name: string,
  content: string = "This is sample knowledge content for testing RAG retrieval."
): Promise<TestKnowledgeSource> {
  const source = await createSourceInDb(applicationId, {
    type: "text",
    name,
    status: "completed",
  });

  // Create a single chunk with the content
  await createChunkInDb(source.id, content);

  source.chunkCount = 1;
  return source;
}

/**
 * Create a text source with specific chunks for retrieval testing.
 * Allows precise control over what should be retrieved.
 */
export async function createTextSourceWithChunks(
  applicationId: string,
  name: string,
  content: string
): Promise<TestKnowledgeSource> {
  const source = await createSourceInDb(applicationId, {
    type: "text",
    name,
    status: "completed",
  });

  // Split content into paragraphs/sentences for chunks
  const chunks = content.split(/\n\n+/).filter((c) => c.trim().length > 0);
  const chunksToCreate = chunks.length > 0 ? chunks : [content];

  // Create individual chunks
  for (let i = 0; i < chunksToCreate.length; i++) {
    await createChunkInDb(source.id, chunksToCreate[i], undefined, {
      chunkIndex: i,
    });
  }

  source.chunkCount = chunksToCreate.length;
  return source;
}

// ========================================
// URL Source Fixtures
// ========================================

/**
 * Create a URL knowledge source with mock scraped content.
 * Simulates a successfully crawled web page.
 */
export async function createUrlSource(
  applicationId: string,
  name: string,
  url: string,
  content: string = "Mock scraped content from the URL."
): Promise<TestKnowledgeSource> {
  const source = await createSourceInDb(applicationId, {
    type: "url",
    name,
    url,
    status: "completed",
    metadata: { scrapedAt: new Date().toISOString() },
  });

  // Create a chunk with the scraped content
  await createChunkInDb(source.id, content);

  source.chunkCount = 1;
  return source;
}

/**
 * Create a URL source that failed to scrape.
 * Used for testing error handling in RAG.
 */
export async function createFailedUrlSource(
  applicationId: string,
  name: string,
  url: string
): Promise<TestKnowledgeSource> {
  return await createSourceInDb(applicationId, {
    type: "url",
    name,
    url,
    status: "failed",
    errorMessage: "Failed to fetch URL: 404 Not Found",
  });
}

// ========================================
// Document Source Fixtures
// ========================================

/**
 * Create a document knowledge source (PDF, DOCX, etc.).
 * Simulates a successfully processed document upload.
 */
export async function createDocumentSource(
  applicationId: string,
  name: string,
  mimeType: string = "application/pdf",
  content: string = "Extracted text content from the document."
): Promise<TestKnowledgeSource> {
  const source = await createSourceInDb(applicationId, {
    type: "file",
    name,
    filePath: `/uploads/test/${name}`,
    status: "completed",
    metadata: { mimeType, fileSize: 1024 },
  });

  // Create a chunk with the extracted content
  await createChunkInDb(source.id, content);

  source.chunkCount = 1;
  return source;
}

/**
 * Create a document source still being processed.
 * Used for testing async processing status.
 */
export async function createProcessingDocumentSource(
  applicationId: string,
  name: string
): Promise<TestKnowledgeSource> {
  return await createSourceInDb(applicationId, {
    type: "file",
    name,
    filePath: `/uploads/test/${name}`,
    status: "processing",
    metadata: { mimeType: "application/pdf", fileSize: 10485760 },
  });
}

// ========================================
// Large/Edge Case Fixtures
// ========================================

/**
 * Create a large knowledge source with many chunks.
 * Used for testing pagination and performance.
 */
export async function createLargeSource(
  applicationId: string,
  name: string,
  chunkCount: number = 100
): Promise<TestKnowledgeSource> {
  const source = await createSourceInDb(applicationId, {
    type: "text",
    name,
    status: "completed",
    metadata: { isLarge: true },
  });

  // Create many chunks
  for (let i = 0; i < chunkCount; i++) {
    await createChunkInDb(
      source.id,
      `This is chunk ${i + 1} of ${chunkCount}. Lorem ipsum dolor sit amet.`,
      undefined,
      { chunkIndex: i }
    );
  }

  source.chunkCount = chunkCount;
  return source;
}

/**
 * Create an empty knowledge source (no content).
 * Used for testing edge cases.
 */
export async function createEmptySource(
  applicationId: string,
  name: string
): Promise<TestKnowledgeSource> {
  return await createSourceInDb(applicationId, {
    type: "text",
    name,
    status: "completed",
  });
}

/**
 * Create a pending knowledge source (not yet processed).
 */
export async function createPendingSource(
  applicationId: string,
  name: string,
  type: KnowledgeSourceType = "text"
): Promise<TestKnowledgeSource> {
  return await createSourceInDb(applicationId, {
    type,
    name,
    status: "pending",
  });
}

// ========================================
// Embedding Helpers
// ========================================

/**
 * Generate mock embeddings for testing.
 * Returns a 1536-dimensional vector (OpenAI embedding size).
 */
export function generateMockEmbedding(seed: number = 0): number[] {
  // Generate deterministic mock embedding based on seed
  const embedding: number[] = [];
  for (let i = 0; i < 1536; i++) {
    embedding.push(Math.sin(seed + i) * 0.5);
  }
  return embedding;
}

/**
 * Generate embeddings that will have high similarity.
 * Used for testing retrieval ranking.
 */
export function generateSimilarEmbeddings(
  count: number,
  baseSeed: number = 0
): number[][] {
  const embeddings: number[][] = [];
  for (let i = 0; i < count; i++) {
    // Small perturbations create similar embeddings
    embeddings.push(generateMockEmbedding(baseSeed + i * 0.01));
  }
  return embeddings;
}

/**
 * Generate embeddings that will have low similarity.
 * Used for testing retrieval filtering.
 */
export function generateDissimilarEmbeddings(count: number): number[][] {
  const embeddings: number[][] = [];
  for (let i = 0; i < count; i++) {
    // Large seed differences create dissimilar embeddings
    embeddings.push(generateMockEmbedding(i * 1000));
  }
  return embeddings;
}

// ========================================
// Source Update Helpers
// ========================================

/**
 * Update a knowledge source's status directly in the database.
 */
export async function updateSourceStatus(
  sourceId: string,
  status: KnowledgeSourceStatus,
  errorMessage?: string
): Promise<void> {
  await sql`
    UPDATE rag.knowledge_sources
    SET
      status = ${status},
      error_message = ${errorMessage || null},
      updated_at = NOW()
    WHERE id = ${sourceId}::uuid
  `;
}

// ========================================
// Cleanup
// ========================================

/**
 * Delete all knowledge sources for an application.
 */
export async function cleanupAppSources(appId: string): Promise<void> {
  // Delete chunks first (foreign key)
  await sql`
    DELETE FROM rag.text_chunks
    WHERE knowledge_source_id IN (
      SELECT id FROM rag.knowledge_sources
      WHERE application_id = ${appId}::uuid
    )
  `;

  // Delete knowledge sources
  await sql`
    DELETE FROM rag.knowledge_sources
    WHERE application_id = ${appId}::uuid
  `;
}

/**
 * Delete all test knowledge sources.
 */
export async function cleanupAllTestSources(): Promise<void> {
  // Delete chunks for test sources
  await sql`
    DELETE FROM rag.text_chunks
    WHERE knowledge_source_id IN (
      SELECT id FROM rag.knowledge_sources
      WHERE name LIKE 'test_%'
    )
  `;

  // Delete test sources
  await sql`
    DELETE FROM rag.knowledge_sources
    WHERE name LIKE 'test_%'
  `;
}
