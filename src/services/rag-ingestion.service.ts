/**
 * RAG Ingestion Service
 *
 * Processes uploaded files for RAG:
 * 1. Downloads file from GCS
 * 2. Extracts and semantically chunks using LlamaParse (or fallback to fixed-size)
 * 3. Generates embeddings using configurable provider (local, OpenAI, custom)
 * 4. Stores chunks with provider metadata in database
 * 5. Updates knowledge source status
 *
 * Uses LlamaParse for intelligent semantic chunking that preserves meaning.
 * Falls back to fixed-size splitting only if LlamaParse is unavailable.
 * Inline processing for small files, Temporal for large files/batches.
 *
 * IMPORTANT: Embeddings from different providers are NOT comparable.
 * Switching providers requires re-uploading all knowledge sources.
 */

import { sql } from "../db/client.ts";
import { getSignedUrl } from "./storage.service.ts";
import {
  isLlamaParseAvailable,
  extractWithLlamaParse,
} from "./llamaparse.service.ts";
import {
  createEmbeddingProvider,
  formatEmbeddingForPg,
  getDefaultEmbeddingConfig,
  type EmbeddingConfig,
  type EmbeddingProvider,
} from "./embedding-provider.service.ts";
import {
  notifyJobCompleted,
  notifyJobFailed,
  notifyJobProgress,
} from "../websocket/pubsub.ts";
import * as Sentry from "@sentry/deno";

// Thresholds for inline vs Temporal processing
const MAX_INLINE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_INLINE_FILE_COUNT = 5;
// Fallback chunk size if LlamaParse unavailable
const FALLBACK_CHUNK_SIZE = 12000; // Characters per chunk
const FALLBACK_CHUNK_OVERLAP = 500; // Overlap between chunks

export interface ProcessKnowledgeSourceParams {
  knowledgeSourceId: string;
  applicationId: string;
  userId?: string; // For WebSocket notifications
  embeddingConfig?: EmbeddingConfig; // Optional - defaults to local BGE
}

export interface ProcessingResult {
  success: boolean;
  chunkCount: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  error?: string;
}

/**
 * Determine if files should be processed inline or via Temporal
 */
export function shouldProcessInline(files: Array<{ size: number }>): boolean {
  if (files.length > MAX_INLINE_FILE_COUNT) {
    return false;
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  return totalSize < MAX_INLINE_FILE_SIZE;
}

/**
 * Process a knowledge source - extract, semantically chunk, embed, store
 */
export async function processKnowledgeSource(
  params: ProcessKnowledgeSourceParams
): Promise<ProcessingResult> {
  const { knowledgeSourceId, applicationId, embeddingConfig } = params;

  // Create embedding provider (defaults to local BGE)
  const config = embeddingConfig || getDefaultEmbeddingConfig();
  const embeddingProvider = createEmbeddingProvider(config);

  console.log("[rag-ingestion] Starting processing", {
    knowledgeSourceId,
    applicationId,
    llamaParseAvailable: isLlamaParseAvailable(),
    embeddingProvider: embeddingProvider.provider,
    embeddingModel: embeddingProvider.model,
  });

  try {
    // Update status to processing
    await updateKnowledgeSourceStatus(knowledgeSourceId, "processing");

    // Get knowledge source details
    const source = await getKnowledgeSource(knowledgeSourceId);
    if (!source) {
      throw new Error(`Knowledge source not found: ${knowledgeSourceId}`);
    }

    // Extract and chunk using LlamaParse (semantic) or fallback (fixed-size)
    let chunks: string[];
    const mimeType = (source.metadata?.mimeType as string) || "";

    if (isLlamaParseAvailable()) {
      // Use LlamaParse for semantic chunking
      console.log("[rag-ingestion] Using LlamaParse for semantic chunking", {
        knowledgeSourceId,
        mimeType,
      });

      chunks = await extractWithSemanticChunking(source);
    } else {
      // Fallback to fixed-size chunking
      console.log(
        "[rag-ingestion] LlamaParse unavailable, using fixed-size chunking",
        {
          knowledgeSourceId,
        }
      );

      const text = await extractTextFromSource(source);
      if (!text || text.trim().length === 0) {
        throw new Error("No text content extracted from file");
      }

      chunks = splitTextIntoChunks(text, {
        chunkSize: FALLBACK_CHUNK_SIZE,
        overlap: FALLBACK_CHUNK_OVERLAP,
      });
    }

    console.log("[rag-ingestion] Content chunked", {
      knowledgeSourceId,
      chunkCount: chunks.length,
      usedLlamaParse: isLlamaParseAvailable(),
    });

    if (chunks.length === 0) {
      throw new Error("No chunks generated from content");
    }

    // Generate embeddings and store chunks with provider metadata
    await storeChunksWithEmbeddings({
      applicationId,
      knowledgeSourceId,
      chunks,
      fileName: source.name,
      metadata: source.metadata || {},
      embeddingProvider,
    });

    // Update status to completed
    await updateKnowledgeSourceStatus(
      knowledgeSourceId,
      "completed",
      undefined,
      chunks.length
    );

    console.log("[rag-ingestion] Processing complete", {
      knowledgeSourceId,
      chunkCount: chunks.length,
      embeddingProvider: embeddingProvider.provider,
      embeddingModel: embeddingProvider.model,
    });

    // Notify via WebSocket if userId provided
    if (params.userId) {
      await notifyJobCompleted(params.userId, knowledgeSourceId, {
        type: "knowledge_source_processed",
        knowledgeSourceId,
        chunkCount: chunks.length,
        embeddingProvider: embeddingProvider.provider,
        embeddingModel: embeddingProvider.model,
      });
    }

    return {
      success: true,
      chunkCount: chunks.length,
      embeddingProvider: embeddingProvider.provider,
      embeddingModel: embeddingProvider.model,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error("[rag-ingestion] Processing failed", {
      knowledgeSourceId,
      error: errorMessage,
    });
    Sentry.captureException(error, {
      tags: {
        source: "rag-ingestion-service",
        feature: "process-knowledge-source",
      },
      extra: { knowledgeSourceId, applicationId },
    });

    // Update status to failed
    await updateKnowledgeSourceStatus(
      knowledgeSourceId,
      "failed",
      errorMessage
    );

    // Notify via WebSocket if userId provided
    if (params.userId) {
      await notifyJobFailed(params.userId, knowledgeSourceId, errorMessage);
    }

    return { success: false, chunkCount: 0, error: errorMessage };
  }
}

/**
 * Extract and chunk using LlamaParse for semantic splitting
 */
async function extractWithSemanticChunking(source: {
  type: string;
  file_path: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
}): Promise<string[]> {
  if (source.type === "file" && source.file_path) {
    // Get download URL for file
    let downloadUrl = source.file_path;

    if (source.file_path.includes("storage.googleapis.com")) {
      const urlParts = source.file_path
        .replace("https://storage.googleapis.com/", "")
        .split("/");
      const filePath = urlParts.slice(1).join("/");

      if (!filePath.startsWith("public/")) {
        downloadUrl = await getSignedUrl(filePath, 3600);
      }
    }

    const result = await extractWithLlamaParse(
      downloadUrl,
      source.metadata?.mimeType as string
    );
    return result.chunks;
  }

  if (source.type === "url" && source.url) {
    const result = await extractWithLlamaParse(source.url);
    return result.chunks;
  }

  throw new Error(`Unsupported source type: ${source.type}`);
}

/**
 * Get knowledge source from database
 */
async function getKnowledgeSource(id: string) {
  const result = await sql`
    SELECT id, application_id, type, name, url, file_path, metadata
    FROM rag.knowledge_sources
    WHERE id = ${id}::uuid
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0] as {
    id: string;
    application_id: string;
    type: string;
    name: string;
    url: string | null;
    file_path: string | null;
    metadata: Record<string, unknown> | null;
  };
}

/**
 * Update knowledge source status
 */
async function updateKnowledgeSourceStatus(
  id: string,
  status: "pending" | "processing" | "completed" | "failed",
  errorMessage?: string,
  chunkCount?: number
) {
  if (chunkCount !== undefined) {
    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = ${status},
        error_message = ${errorMessage || null},
        chunk_count = ${chunkCount},
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  } else {
    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = ${status},
        error_message = ${errorMessage || null},
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  }
}

/**
 * Extract text from a knowledge source
 */
async function extractTextFromSource(source: {
  type: string;
  file_path: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
}): Promise<string> {
  if (source.type === "file" && source.file_path) {
    return await downloadAndExtractFile(source.file_path, source.metadata);
  }

  if (source.type === "url" && source.url) {
    return await fetchAndExtractUrl(source.url);
  }

  throw new Error(`Unsupported source type: ${source.type}`);
}

/**
 * Download file from GCS and extract text
 */
async function downloadAndExtractFile(
  fileUrl: string,
  metadata: Record<string, unknown> | null
): Promise<string> {
  const mimeType = (metadata?.mimeType as string) || "";

  // Extract the GCS path from the full URL
  // URL format: https://storage.googleapis.com/bucket-name/path/to/file
  let downloadUrl = fileUrl;

  // If it's a GCS URL and not public, get a signed URL
  if (fileUrl.includes("storage.googleapis.com")) {
    const urlParts = fileUrl
      .replace("https://storage.googleapis.com/", "")
      .split("/");
    const bucketName = urlParts[0];
    const filePath = urlParts.slice(1).join("/");

    // Check if file is in public directory
    if (!filePath.startsWith("public/")) {
      // Get a signed URL for private files
      console.log("[rag-ingestion] Getting signed URL for private file", {
        filePath,
      });
      downloadUrl = await getSignedUrl(filePath, 3600); // 1 hour expiry
    }
  }

  // Download file
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  // For text-based files, read as text
  if (isTextBasedMimeType(mimeType)) {
    return await response.text();
  }

  // For binary files (PDF, DOCX, etc.), we'd need specialized extractors
  // For now, throw an error - these should go through Temporal
  throw new Error(
    `Binary file extraction not yet implemented for: ${mimeType}`
  );
}

/**
 * Fetch URL content and extract text
 */
async function fetchAndExtractUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/html")) {
    // Strip HTML tags for basic text extraction
    const html = await response.text();
    return stripHtmlTags(html);
  }

  if (
    contentType.includes("text/plain") ||
    contentType.includes("text/markdown")
  ) {
    return await response.text();
  }

  throw new Error(`Unsupported content type for URL: ${contentType}`);
}

/**
 * Check if MIME type is text-based
 */
function isTextBasedMimeType(mimeType: string): boolean {
  const textTypes = [
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    "application/json",
    "application/xml",
    "text/xml",
  ];

  return textTypes.some((t) => mimeType.includes(t)) || mimeType === "";
}

/**
 * Basic HTML tag stripping
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into overlapping chunks
 */
function splitTextIntoChunks(
  text: string,
  options: { chunkSize: number; overlap: number }
): string[] {
  const { chunkSize, overlap } = options;
  const chunks: string[] = [];

  if (text.length <= chunkSize) {
    return [text];
  }

  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    // Prevent infinite loop
    if (start >= text.length - overlap) {
      break;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Store chunks with embeddings in database
 */
async function storeChunksWithEmbeddings(params: {
  applicationId: string;
  knowledgeSourceId: string;
  chunks: string[];
  fileName: string;
  metadata: Record<string, unknown>;
  embeddingProvider: EmbeddingProvider;
  skipDelete?: boolean;
}): Promise<void> {
  const {
    applicationId,
    knowledgeSourceId,
    chunks,
    fileName,
    metadata,
    embeddingProvider,
    skipDelete = false,
  } = params;

  // Delete existing chunks for this knowledge source (unless appending)
  if (!skipDelete) {
    await sql`
      DELETE FROM rag.text_chunks
      WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
    `;
  }

  // Process chunks in batches to avoid memory issues
  const BATCH_SIZE = 10;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Generate embeddings for batch using the configured provider
    const embeddings = await embeddingProvider.generateBatch(batch, false);

    // Insert batch with provider metadata
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embeddingResult = embeddings[j];
      const embeddingStr = formatEmbeddingForPg(embeddingResult.embedding);
      const chunkIndex = i + j;

      // Use ::vector(3072) to zero-pad smaller embeddings (e.g., 768-dim BGE to 3072)
      // This matches production pattern in shared/utils-server/src/rag/insertBulkChunksDual.ts
      await sql`
        INSERT INTO rag.text_chunks (
          application_id,
          knowledge_source_id,
          content,
          embedding,
          embedding_provider,
          embedding_model,
          embedding_dimensions,
          chunk_index,
          token_count,
          metadata,
          created_at
        )
        VALUES (
          ${applicationId}::uuid,
          ${knowledgeSourceId}::uuid,
          ${chunk},
          ${embeddingStr}::vector(3072),
          ${embeddingResult.provider},
          ${embeddingResult.model},
          ${embeddingResult.dimensions},
          ${chunkIndex},
          ${Math.ceil(chunk.length / 4)},
          ${JSON.stringify({ ...metadata, fileName, chunkIndex })}::jsonb,
          NOW()
        )
      `;
    }

    console.log("[rag-ingestion] Batch processed", {
      knowledgeSourceId,
      batchStart: i,
      batchEnd: Math.min(i + BATCH_SIZE, chunks.length),
      totalChunks: chunks.length,
      provider: embeddingProvider.provider,
    });
  }
}

/**
 * Process pre-fetched URL content through the RAG pipeline (chunk → embed → store).
 * Used by Firecrawl integration to ingest scraped markdown.
 */
export interface ProcessUrlContentParams {
  knowledgeSourceId: string;
  applicationId: string;
  url: string;
  markdown: string;
  sourceMetadata?: Record<string, unknown>;
  userId?: string;
  embeddingConfig?: EmbeddingConfig;
  skipDelete?: boolean; // true for site crawl pages (append mode)
}

export async function processUrlContent(
  params: ProcessUrlContentParams
): Promise<{ chunkCount: number }> {
  const {
    knowledgeSourceId,
    applicationId,
    url,
    markdown,
    sourceMetadata,
    userId,
    embeddingConfig,
    skipDelete = false,
  } = params;

  const config = embeddingConfig || getDefaultEmbeddingConfig();
  const embeddingProvider = createEmbeddingProvider(config);

  try {
    // Update status to processing
    await updateKnowledgeSourceStatus(knowledgeSourceId, "processing");

    if (!markdown || markdown.trim().length === 0) {
      throw new Error("No content extracted from URL");
    }

    const chunks = splitTextIntoChunks(markdown, {
      chunkSize: FALLBACK_CHUNK_SIZE,
      overlap: FALLBACK_CHUNK_OVERLAP,
    });

    if (chunks.length === 0) {
      throw new Error("No chunks generated from content");
    }

    await storeChunksWithEmbeddings({
      applicationId,
      knowledgeSourceId,
      chunks,
      fileName: url,
      metadata: { ...sourceMetadata, sourceUrl: url },
      embeddingProvider,
      skipDelete,
    });

    // Update status to completed
    await updateKnowledgeSourceStatus(
      knowledgeSourceId,
      "completed",
      undefined,
      chunks.length
    );

    console.log("[rag-ingestion] URL content processed", {
      knowledgeSourceId,
      url,
      chunkCount: chunks.length,
    });

    // Notify via WebSocket if userId provided
    if (userId) {
      await notifyJobCompleted(userId, knowledgeSourceId, {
        type: "knowledge_source_processed",
        knowledgeSourceId,
        chunkCount: chunks.length,
        embeddingProvider: embeddingProvider.provider,
        embeddingModel: embeddingProvider.model,
      });
    }

    return { chunkCount: chunks.length };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error("[rag-ingestion] URL content processing failed", {
      knowledgeSourceId,
      url,
      error: errorMessage,
    });
    Sentry.captureException(error, {
      tags: { source: "rag-ingestion-service", feature: "process-url-content" },
      extra: { knowledgeSourceId, applicationId, url },
    });

    await updateKnowledgeSourceStatus(
      knowledgeSourceId,
      "failed",
      errorMessage
    );

    if (userId) {
      await notifyJobFailed(userId, knowledgeSourceId, errorMessage);
    }

    throw error;
  }
}

export const ragIngestionService = {
  shouldProcessInline,
  processKnowledgeSource,
  processUrlContent,
};
