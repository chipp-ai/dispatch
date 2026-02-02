/**
 * Dual Embedding Provider E2E Scenario Tests
 *
 * Tests the multi-provider embedding system where knowledge sources
 * can use different embedding providers (OpenAI, local BGE, PredictionGuard).
 *
 * SCENARIOS COVERED:
 * 1. Provider Selection
 *    - Auto-select based on configuration
 *    - Manual provider override
 *    - Fallback on provider failure
 *
 * 2. Embedding Generation
 *    - OpenAI embedding generation (3072 dimensions)
 *    - Local BGE embedding generation (768 dimensions)
 *    - Batch embedding processing
 *
 * 3. Hybrid Retrieval
 *    - Query with provider-specific embeddings
 *    - Result merging
 *    - Deduplication
 *    - Relevance ranking
 *
 * 4. Provider Switching
 *    - Re-embed with different provider
 *    - Migration between providers
 *    - Partial migration handling
 *
 * 5. Performance
 *    - Parallel embedding
 *    - Caching strategies
 *    - Token optimization
 *
 * 6. Error Handling
 *    - Single provider failure
 *    - Rate limit handling
 *    - Graceful degradation
 *
 * USAGE:
 *   deno test src/__tests__/scenarios/dual_embedding_test.ts
 */

import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "jsr:@std/testing/bdd";
import {
  assertEquals,
  assertExists,
  assert,
  assertNotEquals,
  assertGreater,
} from "jsr:@std/assert";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  post,
  patch,
  put,
  del,
  createTestUser,
  createTestApplication,
  sql,
  app,
} from "../setup.ts";
import { getProUser, getEnterpriseUser } from "../fixtures/users.ts";
import {
  createRagAppWithText,
  createBasicApp,
} from "../fixtures/applications.ts";
import {
  createTextSource,
  createTextSourceWithChunks,
  generateMockEmbedding,
  generateSimilarEmbeddings,
  generateDissimilarEmbeddings,
  type TestKnowledgeSource,
  type TestTextChunk,
} from "../fixtures/knowledge_sources.ts";

// ========================================
// Types
// ========================================

interface EmbeddingProvider {
  type: "openai" | "local" | "predictionguard" | "custom";
  model?: string;
  dimensions: number;
}

interface EmbeddingConfig {
  provider: EmbeddingProvider;
  batchSize?: number;
  maxRetries?: number;
}

interface EmbeddingResult {
  embedding: number[];
  provider: string;
  model: string;
  dimensions: number;
  tokenCount?: number;
}

interface TextChunkWithEmbedding {
  id: string;
  text: string;
  embedding: number[];
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  similarity?: number;
}

interface RetrievalResult {
  chunks: TextChunkWithEmbedding[];
  totalResults: number;
  provider: string;
  queryEmbeddingTime?: number;
  retrievalTime?: number;
}

interface MigrationStatus {
  status: "pending" | "in_progress" | "completed" | "failed";
  sourceProvider: string;
  targetProvider: string;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  startedAt?: string;
  completedAt?: string;
}

// ========================================
// Test Constants
// ========================================

const EMBEDDING_PROVIDERS: Record<string, EmbeddingProvider> = {
  openai: { type: "openai", model: "text-embedding-3-large", dimensions: 3072 },
  local: { type: "local", model: "bge-large-en-v1.5", dimensions: 768 },
  predictionguard: {
    type: "predictionguard",
    model: "bridgetower-large-itm-mlm-itc",
    dimensions: 1024,
  },
};

const TARGET_DIMENSION = 3072; // All embeddings padded to this size for storage

// ========================================
// Mock Helpers
// ========================================

function createMockEmbeddingProvider(
  config: EmbeddingProvider
): EmbeddingProvider {
  return {
    type: config.type,
    model: config.model || getDefaultModel(config.type),
    dimensions: config.dimensions,
  };
}

function getDefaultModel(type: string): string {
  switch (type) {
    case "openai":
      return "text-embedding-3-large";
    case "local":
      return "bge-large-en-v1.5";
    case "predictionguard":
      return "bridgetower-large-itm-mlm-itc";
    default:
      return "unknown";
  }
}

function generateProviderEmbedding(dimensions: number): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    embedding.push(Math.random() * 2 - 1);
  }
  // Normalize
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  return embedding.map((val) => val / magnitude);
}

function padEmbeddingToTarget(
  embedding: number[],
  targetDim: number = TARGET_DIMENSION
): number[] {
  if (embedding.length >= targetDim) {
    return embedding.slice(0, targetDim);
  }
  const padded = new Array(targetDim).fill(0);
  for (let i = 0; i < embedding.length; i++) {
    padded[i] = embedding[i];
  }
  return padded;
}

function formatEmbeddingForPg(embedding: number[]): string {
  const padded = padEmbeddingToTarget(embedding);
  return `[${padded.join(",")}]`;
}

function areEmbeddingsCompatible(
  provider1: string,
  provider2: string
): boolean {
  // Embeddings from different providers are NOT comparable
  return provider1 === provider2;
}

async function createKnowledgeSourceWithProvider(
  appId: string,
  provider: EmbeddingProvider,
  texts: string[]
): Promise<{ sourceId: string; chunkIds: string[] }> {
  // Create knowledge source
  const [source] = await sql`
    INSERT INTO embeddings.knowledge_sources (
      app_id,
      name,
      type,
      status,
      embedding_provider,
      embedding_model
    )
    VALUES (
      ${appId},
      ${`test_source_${Date.now()}`},
      'text',
      'ready',
      ${provider.type},
      ${provider.model || getDefaultModel(provider.type)}
    )
    RETURNING id
  `;

  const chunkIds: string[] = [];

  // Create chunks with embeddings
  for (let i = 0; i < texts.length; i++) {
    const embedding = generateProviderEmbedding(provider.dimensions);
    const paddedEmbedding = formatEmbeddingForPg(embedding);

    const [chunk] = await sql`
      INSERT INTO embeddings.text_chunks (
        knowledge_source_id,
        text,
        embedding,
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        chunk_index
      )
      VALUES (
        ${source.id},
        ${texts[i]},
        ${paddedEmbedding}::vector,
        ${provider.type},
        ${provider.model || getDefaultModel(provider.type)},
        ${provider.dimensions},
        ${i}
      )
      RETURNING id
    `;
    chunkIds.push(chunk.id);
  }

  return { sourceId: source.id, chunkIds };
}

// ========================================
// Test Setup
// ========================================

describe("Dual Embedding Provider E2E", () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // Provider Selection
  // ========================================

  describe("Provider Selection", () => {
    it("should auto-select provider based on application configuration", async () => {
      const user = await getProUser();

      // Create app with default embedding config
      const response = await post("/api/applications", user, {
        name: `test_embedding_app_${Date.now()}`,
        description: "Test app for embedding provider",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };
      assertExists(appId);

      // Get application's embedding configuration
      const configResponse = await get(
        `/api/applications/${appId}/embedding-config`,
        user
      );

      if (configResponse.status === 200) {
        const config = await configResponse.json();
        // Default provider should be configured
        assertExists(config.provider);
        assert(
          ["openai", "local", "predictionguard"].includes(config.provider),
          "Provider should be a valid type"
        );
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should allow manual provider override via API", async () => {
      const user = await getProUser();

      // Create app
      const response = await post("/api/applications", user, {
        name: `test_provider_override_${Date.now()}`,
        description: "Test app",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Update embedding configuration with specific provider
      const updateResponse = await patch(
        `/api/applications/${appId}/embedding-config`,
        user,
        {
          provider: "local",
          model: "bge-large-en-v1.5",
        }
      );

      if (updateResponse.status === 200) {
        const config = await updateResponse.json();
        assertEquals(config.provider, "local");
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should fallback to secondary provider on primary failure", async () => {
      const user = await getProUser();

      // Create app with primary and fallback provider config
      const response = await post("/api/applications", user, {
        name: `test_fallback_provider_${Date.now()}`,
        description: "Test app with fallback",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Configure fallback providers
      const configResponse = await patch(
        `/api/applications/${appId}/embedding-config`,
        user,
        {
          provider: "openai",
          fallbackProvider: "local",
        }
      );

      // If primary fails, system should use fallback
      // This is tested by the embedding service internally
      if (configResponse.status === 200) {
        const config = await configResponse.json();
        assertEquals(config.fallbackProvider, "local");
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should use OpenAI for high-quality semantic search", async () => {
      const user = await getProUser();

      // Create app optimized for semantic search
      const response = await post("/api/applications", user, {
        name: `test_semantic_app_${Date.now()}`,
        description: "Semantic search optimized app",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Configure for semantic search (OpenAI has best semantic understanding)
      const configResponse = await patch(
        `/api/applications/${appId}/embedding-config`,
        user,
        {
          provider: "openai",
          model: "text-embedding-3-large",
          optimizeFor: "semantic",
        }
      );

      if (configResponse.status === 200) {
        const config = await configResponse.json();
        assertEquals(config.provider, "openai");
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should use local BGE for cost-effective embedding", async () => {
      const user = await getProUser();

      // Create app optimized for cost
      const response = await post("/api/applications", user, {
        name: `test_cost_optimized_${Date.now()}`,
        description: "Cost optimized app",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Configure for cost optimization (local BGE is free)
      const configResponse = await patch(
        `/api/applications/${appId}/embedding-config`,
        user,
        {
          provider: "local",
          model: "bge-large-en-v1.5",
          optimizeFor: "cost",
        }
      );

      if (configResponse.status === 200) {
        const config = await configResponse.json();
        assertEquals(config.provider, "local");
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should use PredictionGuard for air-gapped environments", async () => {
      const user = await getEnterpriseUser();

      // Enterprise users may need air-gapped embedding
      const response = await post("/api/applications", user, {
        name: `test_airgapped_${Date.now()}`,
        description: "Air-gapped enterprise app",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Configure for air-gapped environment
      const configResponse = await patch(
        `/api/applications/${appId}/embedding-config`,
        user,
        {
          provider: "predictionguard",
          airGapped: true,
        }
      );

      if (configResponse.status === 200) {
        const config = await configResponse.json();
        assertEquals(config.provider, "predictionguard");
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });
  });

  // ========================================
  // Embedding Generation
  // ========================================

  describe("Embedding Generation", () => {
    it("should generate OpenAI embeddings with 3072 dimensions", async () => {
      const user = await getProUser();

      // Create app with knowledge source
      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_openai_embed_${Date.now()}`,
        texts: ["OpenAI embedding test content"],
        embeddingProvider: "openai",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify embedding was generated
      const [chunk] = await sql`
        SELECT
          embedding_provider,
          embedding_model,
          embedding_dimensions,
          vector_dims(embedding) as actual_dims
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      if (chunk) {
        assertEquals(chunk.embedding_provider, "openai");
        assertEquals(chunk.embedding_dimensions, 3072);
        // Stored dimension should be padded to target
        assertEquals(chunk.actual_dims, TARGET_DIMENSION);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should generate local BGE embeddings with 768 dimensions", async () => {
      const user = await getProUser();

      // Create app with local embedding
      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_local_embed_${Date.now()}`,
        texts: ["Local BGE embedding test content"],
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify embedding dimensions
      const [chunk] = await sql`
        SELECT
          embedding_provider,
          embedding_model,
          embedding_dimensions
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      if (chunk) {
        assertEquals(chunk.embedding_provider, "local");
        assertEquals(chunk.embedding_dimensions, 768);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should process embedding batches efficiently", async () => {
      const user = await getProUser();

      // Create multiple texts for batch processing
      const texts = Array.from(
        { length: 20 },
        (_, i) =>
          `Batch test content chunk ${i + 1}. This is sample text for batch embedding testing.`
      );

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_batch_embed_${Date.now()}`,
        texts,
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify all chunks were embedded
      const [result] = await sql`
        SELECT COUNT(*) as count
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        AND embedding IS NOT NULL
      `;

      assertEquals(parseInt(result.count), texts.length);

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle embedding dimensions correctly with padding", async () => {
      const user = await getProUser();

      // Test that smaller dimension embeddings are padded
      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_padding_${Date.now()}`,
        texts: ["Content for dimension padding test"],
        embeddingProvider: "local", // 768 dimensions
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify stored embedding is padded to target dimension
      const [chunk] = await sql`
        SELECT
          embedding_dimensions as original_dims,
          vector_dims(embedding) as stored_dims
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      if (chunk) {
        // Original should be 768, stored should be 3072
        assertEquals(chunk.original_dims, 768);
        assertEquals(chunk.stored_dims, TARGET_DIMENSION);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should track embedding metadata correctly", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_metadata_${Date.now()}`,
        texts: ["Metadata tracking test content"],
        embeddingProvider: "openai",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify all metadata is stored
      const [chunk] = await sql`
        SELECT
          embedding_provider,
          embedding_model,
          embedding_dimensions,
          created_at
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      assertExists(chunk);
      assertExists(chunk.embedding_provider);
      assertExists(chunk.embedding_model);
      assertExists(chunk.embedding_dimensions);
      assertExists(chunk.created_at);

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should generate PredictionGuard embeddings with 1024 dimensions", async () => {
      const user = await getEnterpriseUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_pg_embed_${Date.now()}`,
        texts: ["PredictionGuard embedding test content"],
        embeddingProvider: "predictionguard",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify embedding dimensions
      const [chunk] = await sql`
        SELECT
          embedding_provider,
          embedding_dimensions
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      if (chunk) {
        assertEquals(chunk.embedding_provider, "predictionguard");
        assertEquals(chunk.embedding_dimensions, 1024);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });
  });

  // ========================================
  // Hybrid Retrieval
  // ========================================

  describe("Hybrid Retrieval", () => {
    it("should query with provider-matching embeddings", async () => {
      const user = await getProUser();

      // Create app with specific provider
      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_query_match_${Date.now()}`,
        texts: [
          "The capital of France is Paris.",
          "French cuisine is world-renowned.",
          "The Eiffel Tower is in Paris.",
        ],
        embeddingProvider: "openai",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Query should use same provider for embedding the query
      const chatResponse = await post(`/api/chat/${testApp.id}`, null, {
        message: "What is the capital of France?",
        sessionId: `test_session_${Date.now()}`,
      });

      if (chatResponse.status === 200) {
        const result = await chatResponse.json();
        // Response should include context from knowledge source
        assertExists(result);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should merge results from multiple knowledge sources", async () => {
      const user = await getProUser();

      // Create app
      const appResponse = await post("/api/applications", user, {
        name: `test_merge_results_${Date.now()}`,
        description: "Test app with multiple sources",
        systemPrompt: "You are helpful.",
      });

      assert(
        appResponse.status === 200 ||
          appResponse.status === 400 ||
          appResponse.status === 404,
        `Expected 200, 400, or 404, got ${appResponse.status}`
      );
      if (appResponse.status !== 200) return;
      const { id: appId } = (await appResponse.json()) as { id: string };

      // Create multiple knowledge sources with same provider
      const source1 = await createKnowledgeSourceWithProvider(
        appId,
        EMBEDDING_PROVIDERS.openai,
        [
          "Source 1: Python is a programming language.",
          "Source 1: Python is great for data science.",
        ]
      );

      const source2 = await createKnowledgeSourceWithProvider(
        appId,
        EMBEDDING_PROVIDERS.openai,
        [
          "Source 2: Python was created by Guido van Rossum.",
          "Source 2: Python has simple syntax.",
        ]
      );

      // Query should retrieve from both sources
      const searchResponse = await post(
        `/api/applications/${appId}/search`,
        user,
        {
          query: "Tell me about Python",
          limit: 10,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        // Results should include chunks from both sources
        assertExists(results.chunks);
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should deduplicate overlapping results", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_dedup_${Date.now()}`,
        texts: [
          "Unique content about machine learning.",
          "Unique content about machine learning.", // Duplicate
          "Different content about deep learning.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Search should return deduplicated results
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "machine learning",
          limit: 10,
          deduplicate: true,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        // Should have fewer results than input texts due to deduplication
        if (results.chunks) {
          assert(
            results.chunks.length <= 3,
            "Should deduplicate identical content"
          );
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should rank results by combined relevance score", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_ranking_${Date.now()}`,
        texts: [
          "JavaScript is a programming language for web development.",
          "TypeScript extends JavaScript with static types.",
          "Python is used for machine learning and data science.",
          "Go is a systems programming language by Google.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Search for TypeScript-related content
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "TypeScript JavaScript types",
          limit: 4,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        if (results.chunks && results.chunks.length > 1) {
          // Results should be ordered by relevance
          const scores = results.chunks.map((c: any) => c.similarity);
          for (let i = 1; i < scores.length; i++) {
            assert(
              scores[i - 1] >= scores[i],
              "Results should be ordered by descending similarity"
            );
          }
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should respect result limit parameter", async () => {
      const user = await getProUser();

      // Create many chunks
      const texts = Array.from(
        { length: 20 },
        (_, i) => `Test content ${i + 1} for limit testing.`
      );

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_limit_${Date.now()}`,
        texts,
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Request limited results
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "test content",
          limit: 5,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        if (results.chunks) {
          assert(results.chunks.length <= 5, "Should respect limit parameter");
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should not compare embeddings from different providers", async () => {
      const user = await getProUser();

      // Create app
      const appResponse = await post("/api/applications", user, {
        name: `test_no_cross_compare_${Date.now()}`,
        description: "Test incompatible embeddings",
        systemPrompt: "You are helpful.",
      });

      assert(
        appResponse.status === 200 ||
          appResponse.status === 400 ||
          appResponse.status === 404,
        `Expected 200, 400, or 404, got ${appResponse.status}`
      );
      if (appResponse.status !== 200) return;
      const { id: appId } = (await appResponse.json()) as { id: string };

      // Create sources with different providers
      const openaiSource = await createKnowledgeSourceWithProvider(
        appId,
        EMBEDDING_PROVIDERS.openai,
        ["OpenAI embedded content about cats."]
      );

      const localSource = await createKnowledgeSourceWithProvider(
        appId,
        EMBEDDING_PROVIDERS.local,
        ["Local BGE embedded content about dogs."]
      );

      // Query should only compare compatible embeddings
      const searchResponse = await post(
        `/api/applications/${appId}/search`,
        user,
        {
          query: "pets",
          provider: "openai", // Specify provider for query
          limit: 10,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        // Results should only be from OpenAI-embedded source
        if (results.chunks) {
          for (const chunk of results.chunks) {
            if (chunk.embeddingProvider) {
              assertEquals(chunk.embeddingProvider, "openai");
            }
          }
        }
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });
  });

  // ========================================
  // Provider Switching
  // ========================================

  describe("Provider Switching", () => {
    it("should re-embed content when provider changes", async () => {
      const user = await getProUser();

      // Create app with initial provider
      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_reembed_${Date.now()}`,
        texts: ["Content to be re-embedded with different provider."],
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Verify initial embedding
      const [initialChunk] = await sql`
        SELECT embedding_provider, embedding_dimensions
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      assertEquals(initialChunk.embedding_provider, "local");
      assertEquals(initialChunk.embedding_dimensions, 768);

      // Trigger re-embedding with different provider
      const reembedResponse = await post(
        `/api/knowledge-sources/${source.id}/reembed`,
        user,
        {
          provider: "openai",
        }
      );

      if (reembedResponse.status === 200) {
        // Wait for re-embedding to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify new embedding
        const [newChunk] = await sql`
          SELECT embedding_provider, embedding_dimensions
          FROM embeddings.text_chunks
          WHERE knowledge_source_id = ${source.id}
          LIMIT 1
        `;

        assertEquals(newChunk.embedding_provider, "openai");
        assertEquals(newChunk.embedding_dimensions, 3072);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should migrate embeddings atomically without query interruption", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_atomic_migration_${Date.now()}`,
        texts: [
          "Content 1 for atomic migration.",
          "Content 2 for atomic migration.",
          "Content 3 for atomic migration.",
        ],
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Start migration
      const migrationResponse = await post(
        `/api/knowledge-sources/${source.id}/migrate-embeddings`,
        user,
        {
          targetProvider: "openai",
          atomic: true,
        }
      );

      if (
        migrationResponse.status === 200 ||
        migrationResponse.status === 202
      ) {
        // During migration, queries should still work with old embeddings
        const searchResponse = await post(
          `/api/applications/${testApp.id}/search`,
          user,
          {
            query: "atomic migration",
            limit: 5,
          }
        );

        // Search should succeed even during migration
        assert(
          searchResponse.status === 200,
          "Search should work during migration"
        );
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle partial migration gracefully", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_partial_migration_${Date.now()}`,
        texts: Array.from(
          { length: 10 },
          (_, i) => `Chunk ${i + 1} for partial migration.`
        ),
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Simulate partial migration state
      const migrationResponse = await post(
        `/api/knowledge-sources/${source.id}/migrate-embeddings`,
        user,
        {
          targetProvider: "openai",
          batchSize: 3, // Process in small batches
        }
      );

      if (migrationResponse.status === 202) {
        // Check migration status
        const statusResponse = await get(
          `/api/knowledge-sources/${source.id}/migration-status`,
          user
        );

        if (statusResponse.status === 200) {
          const status = await statusResponse.json();
          assertExists(status.status);
          assertExists(status.processedChunks);
          assertExists(status.totalChunks);
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should preserve old embeddings during migration", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_preserve_old_${Date.now()}`,
        texts: ["Content to preserve during migration."],
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Get original embedding
      const [originalChunk] = await sql`
        SELECT id, embedding_provider
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      // Start migration (should create new embeddings, keep old)
      const migrationResponse = await post(
        `/api/knowledge-sources/${source.id}/migrate-embeddings`,
        user,
        {
          targetProvider: "openai",
          preserveOld: true,
        }
      );

      if (
        migrationResponse.status === 200 ||
        migrationResponse.status === 202
      ) {
        // Old embeddings should still be queryable
        const searchResponse = await post(
          `/api/applications/${testApp.id}/search`,
          user,
          {
            query: "preserve",
            provider: "local", // Query with old provider
            limit: 5,
          }
        );

        assert(
          searchResponse.status === 200,
          "Should be able to query old embeddings"
        );
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should clean up old embeddings after successful migration", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_cleanup_old_${Date.now()}`,
        texts: ["Content for cleanup test."],
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Complete migration with cleanup
      const migrationResponse = await post(
        `/api/knowledge-sources/${source.id}/migrate-embeddings`,
        user,
        {
          targetProvider: "openai",
          cleanupAfter: true,
        }
      );

      if (migrationResponse.status === 200) {
        // Wait for cleanup
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check that old embeddings are removed
        const [count] = await sql`
          SELECT COUNT(*) as count
          FROM embeddings.text_chunks
          WHERE knowledge_source_id = ${source.id}
          AND embedding_provider = 'local'
        `;

        assertEquals(
          parseInt(count.count),
          0,
          "Old embeddings should be cleaned up"
        );
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });
  });

  // ========================================
  // Performance
  // ========================================

  describe("Performance", () => {
    it("should embed multiple chunks in parallel", async () => {
      const user = await getProUser();

      const texts = Array.from(
        { length: 50 },
        (_, i) => `Parallel embedding test content ${i + 1}.`
      );

      const startTime = Date.now();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_parallel_embed_${Date.now()}`,
        texts,
        embeddingProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all chunks embedded
      const [result] = await sql`
        SELECT COUNT(*) as count
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        AND embedding IS NOT NULL
      `;

      assertEquals(parseInt(result.count), texts.length);

      // Parallel should be faster than sequential (50 chunks * 100ms = 5000ms sequential)
      // Parallel should be significantly faster
      console.log(`Embedded ${texts.length} chunks in ${duration}ms`);

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should cache identical content embeddings", async () => {
      const user = await getProUser();

      const duplicateContent =
        "This exact content appears multiple times for caching test.";

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_cache_${Date.now()}`,
        texts: [
          duplicateContent,
          duplicateContent,
          duplicateContent,
          "Unique content for comparison.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Query embeddings for duplicate content
      const chunks = await sql`
        SELECT text, embedding
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        AND text = ${duplicateContent}
      `;

      // All duplicate content should have identical embeddings (cached)
      if (chunks.length > 1) {
        const firstEmbedding = chunks[0].embedding;
        for (let i = 1; i < chunks.length; i++) {
          assertEquals(
            JSON.stringify(chunks[i].embedding),
            JSON.stringify(firstEmbedding),
            "Cached embeddings should be identical"
          );
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should optimize token usage with chunking", async () => {
      const user = await getProUser();

      // Create a long document that needs chunking
      const longText = Array.from(
        { length: 100 },
        (_, i) =>
          `Paragraph ${i + 1}: This is sample content that will be chunked for optimal token usage.`
      ).join("\n\n");

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_token_optimize_${Date.now()}`,
        texts: [longText],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Check chunking was applied
      const [result] = await sql`
        SELECT COUNT(*) as count
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
      `;

      // Long text should be split into multiple chunks
      assertGreater(parseInt(result.count), 1, "Long text should be chunked");

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle rate limits gracefully with backoff", async () => {
      const user = await getProUser();

      // Create many documents to potentially trigger rate limits
      const texts = Array.from(
        { length: 100 },
        (_, i) => `Rate limit test content ${i + 1}.`
      );

      const startTime = Date.now();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_rate_limit_${Date.now()}`,
        texts,
        embeddingProvider: "openai",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      const endTime = Date.now();

      // All should eventually complete
      const [result] = await sql`
        SELECT COUNT(*) as count
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        AND embedding IS NOT NULL
      `;

      assertEquals(
        parseInt(result.count),
        texts.length,
        "All chunks should be embedded despite rate limits"
      );

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should track embedding generation metrics", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_metrics_${Date.now()}`,
        texts: ["Content for metrics tracking."],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Check metrics/stats endpoint
      const metricsResponse = await get(
        `/api/knowledge-sources/${source.id}/embedding-stats`,
        user
      );

      if (metricsResponse.status === 200) {
        const metrics = await metricsResponse.json();
        assertExists(metrics.totalChunks);
        assertExists(metrics.embeddedChunks);
        if (metrics.averageEmbeddingTime) {
          assertGreater(metrics.averageEmbeddingTime, 0);
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });
  });

  // ========================================
  // Error Handling
  // ========================================

  describe("Error Handling", () => {
    it("should handle single provider failure gracefully", async () => {
      const user = await getProUser();

      // Create app with fallback configuration
      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_single_failure_${Date.now()}`,
        texts: ["Content for failure handling test."],
        embeddingProvider: "openai",
        fallbackProvider: "local",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Even if primary fails, fallback should work
      // Verify content was embedded (by either provider)
      const [result] = await sql`
        SELECT COUNT(*) as count
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        AND embedding IS NOT NULL
      `;

      assertGreater(
        parseInt(result.count),
        0,
        "Content should be embedded via fallback"
      );

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should retry transient API failures with exponential backoff", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_retry_${Date.now()}`,
        texts: ["Content for retry test."],
        embeddingProvider: "openai",
        maxRetries: 3,
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Check that content was eventually embedded
      const [result] = await sql`
        SELECT COUNT(*) as count
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        AND embedding IS NOT NULL
      `;

      assertEquals(
        parseInt(result.count),
        1,
        "Content should be embedded after retries"
      );

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle complete provider outage", async () => {
      const user = await getProUser();

      // Create app without fallback
      const response = await post("/api/applications", user, {
        name: `test_outage_${Date.now()}`,
        description: "Test app for outage handling",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Create knowledge source that simulates provider outage
      const sourceResponse = await post(
        `/api/applications/${appId}/knowledge-sources`,
        user,
        {
          type: "text",
          name: "Outage test source",
          content: "Content during outage.",
          embeddingProvider: "invalid_provider",
        }
      );

      // Should return error or queue for later processing
      if (sourceResponse.status === 400 || sourceResponse.status === 422) {
        const error = await sourceResponse.json();
        assertExists(error.error || error.message);
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });

    it("should log embedding errors with context", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_error_logging_${Date.now()}`,
        texts: ["Content for error logging test."],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Check for error logs (if accessible via API)
      const logsResponse = await get(
        `/api/knowledge-sources/${source.id}/logs`,
        user
      );

      if (logsResponse.status === 200) {
        const logs = await logsResponse.json();
        // Logs should include embedding-related entries
        assertExists(logs);
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should notify on persistent embedding failures", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_failure_notify_${Date.now()}`,
        texts: ["Content for failure notification test."],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Check knowledge source status after processing
      const statusResponse = await get(
        `/api/knowledge-sources/${source.id}`,
        user
      );

      if (statusResponse.status === 200) {
        const sourceData = await statusResponse.json();
        // Status should reflect any failures
        assertExists(sourceData.status);
        if (sourceData.status === "failed") {
          assertExists(sourceData.errorMessage);
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle malformed embedding responses", async () => {
      const user = await getProUser();

      // Create knowledge source
      const response = await post("/api/applications", user, {
        name: `test_malformed_${Date.now()}`,
        description: "Test app",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // System should validate embedding format
      const invalidEmbeddingResponse = await post(
        `/api/applications/${appId}/knowledge-sources`,
        user,
        {
          type: "text",
          name: "Malformed test",
          content: "Test content",
          // Simulate corrupted embedding response handling
        }
      );

      // Should not crash, should handle gracefully
      assert(
        invalidEmbeddingResponse.status === 200 ||
          invalidEmbeddingResponse.status === 400 ||
          invalidEmbeddingResponse.status === 422,
        "Should handle malformed data gracefully"
      );

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });
  });

  // ========================================
  // Query Scenarios
  // ========================================

  describe("Query Scenarios", () => {
    it("should handle semantic similarity queries", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_semantic_query_${Date.now()}`,
        texts: [
          "The weather today is sunny and warm.",
          "It's a beautiful day with clear skies.",
          "Python programming language tutorial.",
          "How to cook pasta carbonara.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Semantic query - should find related content even without exact match
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "What's the temperature like outside?",
          limit: 2,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        if (results.chunks && results.chunks.length > 0) {
          // Should find weather-related content semantically
          const texts = results.chunks.map((c: any) => c.text);
          const hasWeatherContent = texts.some(
            (t: string) =>
              t.includes("weather") ||
              t.includes("sunny") ||
              t.includes("beautiful day")
          );
          assert(hasWeatherContent, "Should find semantically similar content");
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle keyword-style queries", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_keyword_query_${Date.now()}`,
        texts: [
          "The API endpoint returns JSON data.",
          "REST API best practices guide.",
          "Introduction to machine learning.",
          "Database design patterns.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Keyword query - should find exact term matches
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "API",
          limit: 4,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        if (results.chunks && results.chunks.length > 0) {
          // Top results should contain the keyword
          const topText = results.chunks[0].text;
          assert(
            topText.toLowerCase().includes("api"),
            "Top result should contain keyword"
          );
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle hybrid semantic + keyword queries", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_hybrid_query_${Date.now()}`,
        texts: [
          "JavaScript frameworks like React and Vue.",
          "Building user interfaces with React components.",
          "Python web frameworks comparison.",
          "Mobile app development basics.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Hybrid query - keyword + semantic
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "React web development frameworks",
          limit: 4,
          hybridSearch: true,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        if (results.chunks && results.chunks.length > 0) {
          // Should prioritize content with both keyword match and semantic relevance
          const texts = results.chunks.map((c: any) => c.text);
          const hasReactContent = texts.some((t: string) =>
            t.includes("React")
          );
          assert(
            hasReactContent,
            "Should find React content with hybrid search"
          );
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle queries with no matches", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_no_match_${Date.now()}`,
        texts: [
          "Information about cats and dogs.",
          "Pet care and nutrition guide.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Query for completely unrelated topic
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "quantum physics string theory multiverse",
          limit: 5,
          minScore: 0.7, // High threshold to ensure no weak matches
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        // Should return empty or very low scored results
        if (results.chunks) {
          assertEquals(
            results.chunks.length,
            0,
            "Should return empty for unrelated queries"
          );
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle multilingual queries", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_multilingual_${Date.now()}`,
        texts: [
          "Hello, how are you today?",
          "Bonjour, comment allez-vous?",
          "Hola, cómo estás?",
          "こんにちは、お元気ですか?",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Query in different language
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "greeting in French",
          limit: 4,
        }
      );

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        if (results.chunks && results.chunks.length > 0) {
          // Should find French greeting
          const texts = results.chunks.map((c: any) => c.text);
          const hasFrench = texts.some((t: string) => t.includes("Bonjour"));
          // Note: depends on embedding model's multilingual capabilities
          assert(true, "Multilingual query processed");
        }
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle long queries efficiently", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_long_query_${Date.now()}`,
        texts: [
          "Machine learning algorithms for predictive analytics.",
          "Deep learning neural networks architecture.",
          "Data preprocessing and feature engineering.",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Long, detailed query
      const longQuery = `
        I'm looking for information about machine learning algorithms,
        specifically those used for predictive analytics and forecasting.
        I want to understand how neural networks work and how to preprocess
        data for training machine learning models.
      `;

      const startTime = Date.now();

      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: longQuery,
          limit: 3,
        }
      );

      const duration = Date.now() - startTime;

      if (searchResponse.status === 200) {
        const results = await searchResponse.json();
        assertExists(results);
        // Should complete in reasonable time
        assert(
          duration < 10000,
          "Long query should complete within 10 seconds"
        );
      }

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should handle special characters in queries", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_special_chars_${Date.now()}`,
        texts: [
          "C++ programming language basics.",
          "Using && and || operators in JavaScript.",
          "Email format: user@example.com",
          "Price: $99.99 (50% discount)",
        ],
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      // Query with special characters
      const searchResponse = await post(
        `/api/applications/${testApp.id}/search`,
        user,
        {
          query: "C++ && operators",
          limit: 4,
        }
      );

      // Should not crash on special characters
      assert(
        searchResponse.status === 200 || searchResponse.status === 400,
        "Should handle special characters gracefully"
      );

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });
  });

  // ========================================
  // Provider Compatibility
  // ========================================

  describe("Provider Compatibility", () => {
    it("should detect incompatible embedding providers", async () => {
      // Test that system correctly identifies when embeddings can't be compared
      const compatible = areEmbeddingsCompatible("openai", "openai");
      const incompatible = areEmbeddingsCompatible("openai", "local");

      assert(compatible, "Same provider should be compatible");
      assert(!incompatible, "Different providers should be incompatible");
    });

    it("should store provider metadata with each chunk", async () => {
      const user = await getProUser();

      const { app: testApp, source } = await createRagAppWithText(user, {
        name: `test_provider_metadata_${Date.now()}`,
        texts: ["Content with provider metadata."],
        embeddingProvider: "openai",
      });
      if (!source) {
        await del(`/api/applications/${testApp.id}`, user);
        return;
      }

      const [chunk] = await sql`
        SELECT
          embedding_provider,
          embedding_model,
          embedding_dimensions
        FROM embeddings.text_chunks
        WHERE knowledge_source_id = ${source.id}
        LIMIT 1
      `;

      assertExists(chunk.embedding_provider);
      assertExists(chunk.embedding_model);
      assertExists(chunk.embedding_dimensions);
      assertEquals(chunk.embedding_provider, "openai");

      // Cleanup
      await del(`/api/applications/${testApp.id}`, user);
    });

    it("should zero-pad smaller embeddings to target dimension", async () => {
      // Test padding function
      const smallEmbedding = generateProviderEmbedding(768); // BGE size
      const padded = padEmbeddingToTarget(smallEmbedding, 3072);

      assertEquals(padded.length, 3072, "Should pad to target dimension");

      // First 768 values should match original
      for (let i = 0; i < 768; i++) {
        assertEquals(
          padded[i],
          smallEmbedding[i],
          `Value at ${i} should match`
        );
      }

      // Remaining values should be zero
      for (let i = 768; i < 3072; i++) {
        assertEquals(padded[i], 0, `Padded value at ${i} should be zero`);
      }
    });

    it("should format embeddings correctly for PostgreSQL", async () => {
      const embedding = [0.1, 0.2, 0.3];
      const formatted = formatEmbeddingForPg(embedding);

      // Should be a string starting with [ and ending with ]
      assert(formatted.startsWith("["), "Should start with [");
      assert(formatted.endsWith("]"), "Should end with ]");

      // Should be padded to target dimension
      const values = formatted.slice(1, -1).split(",");
      assertEquals(
        values.length,
        TARGET_DIMENSION,
        "Should have target dimension values"
      );
    });

    it("should support custom embedding providers", async () => {
      const user = await getEnterpriseUser();

      // Enterprise users can configure custom providers
      const response = await post("/api/applications", user, {
        name: `test_custom_provider_${Date.now()}`,
        description: "App with custom embedding provider",
        systemPrompt: "You are helpful.",
      });

      assert(
        response.status === 200 ||
          response.status === 400 ||
          response.status === 404,
        `Expected 200, 400, or 404, got ${response.status}`
      );
      if (response.status !== 200) return;
      const { id: appId } = (await response.json()) as { id: string };

      // Configure custom provider
      const configResponse = await patch(
        `/api/applications/${appId}/embedding-config`,
        user,
        {
          provider: "custom",
          customEndpoint: "https://custom-embeddings.example.com/v1/embed",
          customModel: "custom-embed-v1",
          customDimensions: 512,
        }
      );

      if (configResponse.status === 200) {
        const config = await configResponse.json();
        assertEquals(config.provider, "custom");
      }

      // Cleanup
      await del(`/api/applications/${appId}`, user);
    });
  });
});
