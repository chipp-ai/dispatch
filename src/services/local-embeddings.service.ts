/**
 * Local Embeddings Service
 *
 * Generates embeddings locally using @huggingface/transformers.
 * Uses BGE-base-en-v1.5 - one of the best open-source embedding models.
 *
 * Performance: ~50ms latency vs ~1200ms with OpenAI API
 * Quality: Competitive with OpenAI text-embedding-3-small on MTEB benchmarks
 */

import { log } from "@/lib/logger.ts";

// deno-lint-ignore no-explicit-any
let pipeline: any = null;

// BGE-base-en-v1.5: Best balance of quality and speed for local embeddings
// Produces 768-dimensional embeddings, optimized for retrieval tasks
const MODEL_ID = "Xenova/bge-base-en-v1.5";

/**
 * Initialize the local embedding model.
 * This pre-loads the model for faster inference.
 */
export async function initEmbedder(): Promise<void> {
  // Skip in development if no model needed
  if (Deno.env.get("SKIP_LOCAL_EMBEDDINGS") === "true") {
    log.info("Skipping local embeddings (SKIP_LOCAL_EMBEDDINGS=true)", {
      source: "embeddings",
      feature: "init",
    });
    return;
  }

  try {
    // Dynamic import to avoid loading heavy dependencies if not needed
    const { pipeline: createPipeline } = await import(
      "@huggingface/transformers"
    );

    pipeline = await createPipeline("feature-extraction", MODEL_ID, {
      // quantized: true, // Use quantized model for faster inference (not available in this version)
    });

    log.info("Local embedding model loaded", { source: "embeddings", feature: "init", model: MODEL_ID });
  } catch (error) {
    log.warn("Failed to load local model", { source: "embeddings", feature: "init", error: String(error) });
    // Don't throw - allow server to start without local embeddings
  }
}

export interface LocalEmbeddingResult {
  embedding: number[];
  model: string;
}

// Target dimension for embeddings (matches text-embedding-3-large and our HNSW index)
const TARGET_DIMENSIONS = 3072;

/**
 * Pad embedding to target dimensions by adding zeros
 * This allows mixing models with different output dimensions
 */
export function padEmbedding(
  embedding: number[],
  targetDim = TARGET_DIMENSIONS
): number[] {
  if (embedding.length >= targetDim) {
    return embedding.slice(0, targetDim);
  }
  return [...embedding, ...new Array(targetDim - embedding.length).fill(0)];
}

/**
 * Generate an embedding locally using BGE model
 *
 * Note: BGE models work best with a query prefix for retrieval:
 * - For queries: "Represent this sentence for searching relevant passages: {query}"
 * - For documents: No prefix needed
 */
export async function generateLocalEmbedding(
  text: string,
  isQuery = true
): Promise<LocalEmbeddingResult> {
  if (!pipeline) {
    throw new Error(
      "Local embeddings not initialized. Call initEmbedder() first."
    );
  }

  // BGE models recommend prefixing queries for better retrieval performance
  const inputText = isQuery
    ? `Represent this sentence for searching relevant passages: ${text}`
    : text;

  const output = await pipeline(inputText, {
    pooling: "mean",
    normalize: true,
  });

  return {
    embedding: Array.from(output.data),
    model: MODEL_ID,
  };
}

/**
 * Format embedding array for PostgreSQL vector type
 */
export function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Check if local embeddings are available
 */
export function isLocalEmbeddingsAvailable(): boolean {
  return pipeline !== null;
}
