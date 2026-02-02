/**
 * Embeddings Service
 *
 * Generates embeddings using OpenAI's text-embedding-3-large model.
 * Used for RAG similarity search.
 */

import OpenAI from "openai";

const MODEL = "text-embedding-3-large";
const DIMENSIONS = 3072;

// Lazy-initialized client
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: Deno.env.get("OPENAI_API_KEY"),
    });
  }
  return _client;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount: number;
}

/**
 * Generate an embedding for a text string
 */
export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult> {
  const client = getClient();

  const response = await client.embeddings.create({
    model: MODEL,
    input: text,
    dimensions: DIMENSIONS,
  });

  return {
    embedding: response.data[0].embedding,
    model: response.model,
    tokenCount: response.usage.total_tokens,
  };
}

/**
 * Generate embeddings for multiple texts in a single batch
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return [];

  const client = getClient();

  const response = await client.embeddings.create({
    model: MODEL,
    input: texts,
    dimensions: DIMENSIONS,
  });

  return response.data.map((d) => ({
    embedding: d.embedding,
    model: response.model,
    tokenCount: Math.floor(response.usage.total_tokens / texts.length),
  }));
}

/**
 * Format embedding array for PostgreSQL vector type
 */
export function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
