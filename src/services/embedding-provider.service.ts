/**
 * Embedding Provider Service
 *
 * Unified abstraction over different embedding providers.
 * Supports local (BGE), OpenAI, and custom providers.
 *
 * IMPORTANT: Embeddings from different providers are NOT comparable.
 * Switching providers requires re-uploading all knowledge sources.
 */

import OpenAI from "openai";
import { log } from "@/lib/logger.ts";

// ============================================================
// Types
// ============================================================

export type EmbeddingProviderType =
  | "local"
  | "openai"
  | "predictionguard"
  | "custom";

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  model?: string;
  dimensions?: number;
  apiKey?: string; // For custom providers
  baseUrl?: string; // For custom OpenAI-compatible endpoints
}

export interface EmbeddingResult {
  embedding: number[];
  provider: EmbeddingProviderType;
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  readonly provider: EmbeddingProviderType;
  readonly model: string;
  readonly dimensions: number;
  generate(text: string, isQuery?: boolean): Promise<EmbeddingResult>;
  generateBatch(texts: string[], isQuery?: boolean): Promise<EmbeddingResult[]>;
}

// ============================================================
// Provider Definitions
// ============================================================

const PROVIDERS: Record<
  EmbeddingProviderType,
  { defaultModel: string; defaultDimensions: number }
> = {
  local: {
    defaultModel: "Xenova/bge-base-en-v1.5",
    defaultDimensions: 768,
  },
  openai: {
    // Full 3072 dimensions - pgvector uses halfvec cast for HNSW index
    // (halfvec supports up to 16,000 dimensions)
    defaultModel: "text-embedding-3-large",
    defaultDimensions: 3072,
  },
  predictionguard: {
    defaultModel: "bge-m3",
    defaultDimensions: 1024,
  },
  custom: {
    defaultModel: "custom",
    defaultDimensions: 768,
  },
};

// ============================================================
// Local BGE Provider
// ============================================================

// deno-lint-ignore no-explicit-any
let localPipeline: any = null;

async function initLocalProvider(): Promise<void> {
  if (localPipeline) return;

  const { pipeline: createPipeline } = await import(
    "@huggingface/transformers"
  );
  localPipeline = await createPipeline(
    "feature-extraction",
    PROVIDERS.local.defaultModel,
    {}
  );
  log.info("Local model loaded", {
    source: "embedding-provider",
    feature: "init",
    model: PROVIDERS.local.defaultModel,
  });
}

function createLocalProvider(): EmbeddingProvider {
  const config = PROVIDERS.local;

  return {
    provider: "local",
    model: config.defaultModel,
    dimensions: config.defaultDimensions,

    async generate(text: string, isQuery = false): Promise<EmbeddingResult> {
      if (!localPipeline) {
        await initLocalProvider();
      }

      // BGE models recommend prefixing queries for better retrieval
      const inputText = isQuery
        ? `Represent this sentence for searching relevant passages: ${text}`
        : text;

      const output = await localPipeline(inputText, {
        pooling: "mean",
        normalize: true,
      });

      return {
        embedding: Array.from(output.data),
        provider: "local",
        model: config.defaultModel,
        dimensions: config.defaultDimensions,
      };
    },

    async generateBatch(
      texts: string[],
      isQuery = false
    ): Promise<EmbeddingResult[]> {
      // Local model processes one at a time for now
      const results: EmbeddingResult[] = [];
      for (const text of texts) {
        results.push(await this.generate(text, isQuery));
      }
      return results;
    },
  };
}

// ============================================================
// OpenAI Provider
// ============================================================

function createOpenAIProvider(config: EmbeddingConfig): EmbeddingProvider {
  const model = config.model || PROVIDERS.openai.defaultModel;
  const dimensions = config.dimensions || PROVIDERS.openai.defaultDimensions;

  const client = new OpenAI({
    apiKey: config.apiKey || Deno.env.get("OPENAI_API_KEY"),
    baseURL: config.baseUrl,
  });

  return {
    provider: "openai",
    model,
    dimensions,

    async generate(text: string): Promise<EmbeddingResult> {
      const response = await client.embeddings.create({
        model,
        input: text,
        dimensions,
      });

      return {
        embedding: response.data[0].embedding,
        provider: "openai",
        model: response.model,
        dimensions,
      };
    },

    async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
      if (texts.length === 0) return [];

      const response = await client.embeddings.create({
        model,
        input: texts,
        dimensions,
      });

      return response.data.map((d: { embedding: number[] }) => ({
        embedding: d.embedding,
        provider: "openai" as const,
        model: response.model,
        dimensions,
      }));
    },
  };
}

// ============================================================
// PredictionGuard Provider (OpenAI-compatible)
// ============================================================

function createPredictionGuardProvider(
  config: EmbeddingConfig
): EmbeddingProvider {
  const model = config.model || PROVIDERS.predictionguard.defaultModel;
  const dimensions =
    config.dimensions || PROVIDERS.predictionguard.defaultDimensions;

  const client = new OpenAI({
    apiKey: config.apiKey || Deno.env.get("PREDICTIONGUARD_API_KEY"),
    baseURL: config.baseUrl || "https://api.predictionguard.com/v1",
  });

  return {
    provider: "predictionguard",
    model,
    dimensions,

    async generate(text: string): Promise<EmbeddingResult> {
      const response = await client.embeddings.create({
        model,
        input: text,
      });

      return {
        embedding: response.data[0].embedding,
        provider: "predictionguard",
        model,
        dimensions,
      };
    },

    async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
      if (texts.length === 0) return [];

      const response = await client.embeddings.create({
        model,
        input: texts,
      });

      return response.data.map((d: { embedding: number[] }) => ({
        embedding: d.embedding,
        provider: "predictionguard" as const,
        model,
        dimensions,
      }));
    },
  };
}

// ============================================================
// Custom Provider (OpenAI-compatible endpoint)
// ============================================================

function createCustomProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (!config.baseUrl) {
    throw new Error("Custom provider requires baseUrl");
  }

  const model = config.model || PROVIDERS.custom.defaultModel;
  const dimensions = config.dimensions || PROVIDERS.custom.defaultDimensions;

  const client = new OpenAI({
    apiKey: config.apiKey || "not-needed",
    baseURL: config.baseUrl,
  });

  return {
    provider: "custom",
    model,
    dimensions,

    async generate(text: string): Promise<EmbeddingResult> {
      const response = await client.embeddings.create({
        model,
        input: text,
      });

      return {
        embedding: response.data[0].embedding,
        provider: "custom",
        model,
        dimensions,
      };
    },

    async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
      if (texts.length === 0) return [];

      const response = await client.embeddings.create({
        model,
        input: texts,
      });

      return response.data.map((d: { embedding: number[] }) => ({
        embedding: d.embedding,
        provider: "custom" as const,
        model,
        dimensions,
      }));
    },
  };
}

// ============================================================
// Factory
// ============================================================

/**
 * Create an embedding provider from configuration.
 * Default is local BGE for cost savings.
 */
export function createEmbeddingProvider(
  config?: EmbeddingConfig
): EmbeddingProvider {
  const providerType = config?.provider || "local";

  switch (providerType) {
    case "local":
      return createLocalProvider();
    case "openai":
      return createOpenAIProvider(config || { provider: "openai" });
    case "predictionguard":
      return createPredictionGuardProvider(
        config || { provider: "predictionguard" }
      );
    case "custom":
      return createCustomProvider(config!);
    default:
      throw new Error(`Unknown embedding provider: ${providerType}`);
  }
}

/**
 * Get the default embedding configuration.
 * Uses local BGE for cost savings (free, fast, good quality).
 */
export function getDefaultEmbeddingConfig(): EmbeddingConfig {
  return {
    provider: "local",
    model: PROVIDERS.local.defaultModel,
    dimensions: PROVIDERS.local.defaultDimensions,
  };
}

/**
 * Get provider metadata for a given configuration.
 */
export function getProviderMetadata(config?: EmbeddingConfig): {
  provider: EmbeddingProviderType;
  model: string;
  dimensions: number;
} {
  const providerType = config?.provider || "local";
  const defaults = PROVIDERS[providerType];

  return {
    provider: providerType,
    model: config?.model || defaults.defaultModel,
    dimensions: config?.dimensions || defaults.defaultDimensions,
  };
}

/**
 * Check if embeddings are compatible (same provider).
 * Embeddings from different providers cannot be compared.
 */
export function areEmbeddingsCompatible(
  config1: EmbeddingConfig,
  config2: EmbeddingConfig
): boolean {
  return (
    config1.provider === config2.provider &&
    (config1.model || PROVIDERS[config1.provider].defaultModel) ===
      (config2.model || PROVIDERS[config2.provider].defaultModel)
  );
}

/**
 * Format embedding for PostgreSQL vector column.
 * Zero-pads the embedding to the target dimension (3072) to match the database schema.
 * This allows embeddings of any dimension (768, 1024, 3072) to be stored in a vector(3072) column.
 */
const TARGET_DIMENSION = 3072;

export function formatEmbeddingForPg(embedding: number[]): string {
  // Zero-pad if embedding is smaller than target dimension
  if (embedding.length < TARGET_DIMENSION) {
    const padded = new Array(TARGET_DIMENSION).fill(0);
    for (let i = 0; i < embedding.length; i++) {
      padded[i] = embedding[i];
    }
    return `[${padded.join(",")}]`;
  }
  return `[${embedding.join(",")}]`;
}

// ============================================================
// Singleton for default provider
// ============================================================

let defaultProvider: EmbeddingProvider | null = null;

/**
 * Get the default embedding provider (singleton).
 * Initialize once and reuse.
 */
export function getDefaultProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    defaultProvider = createEmbeddingProvider();
  }
  return defaultProvider;
}

/**
 * Initialize the default embedding provider.
 * Call at server startup for faster first request.
 */
export async function initDefaultProvider(): Promise<void> {
  const provider = getDefaultProvider();
  // Warm up the provider by generating a test embedding
  await provider.generate("warmup");
  log.info("Default provider ready", {
    source: "embedding-provider",
    feature: "init",
    provider: provider.provider,
    model: provider.model,
  });
}
