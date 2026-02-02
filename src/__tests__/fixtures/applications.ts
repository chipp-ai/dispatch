/**
 * Application Test Fixtures
 *
 * Pre-defined test applications with various configurations.
 * Used to test app CRUD, chat, RAG, custom actions, and publishing.
 *
 * FIXTURE CATEGORIES:
 * - Basic apps: Simple chat apps with default settings
 * - RAG apps: Apps with knowledge sources (documents, URLs, etc.)
 * - Custom action apps: Apps with API integrations configured
 * - Voice apps: Apps with voice/phone capabilities
 * - Published apps: Apps in various publish states
 * - Model configurations: Apps using different LLM providers/models
 *
 * USAGE:
 *   import { getBasicApp, getRagApp } from "../fixtures/applications.ts";
 *   const app = await getBasicApp(testUser);
 *   const res = await post("/api/chat", testUser, { applicationId: app.id, message: "Hello" });
 *
 * TODO:
 * - [ ] Implement createBasicApp() with minimal config
 * - [ ] Implement createRagApp() with pre-seeded knowledge sources
 * - [ ] Implement createCustomActionApp() with action templates
 * - [ ] Implement createVoiceApp() with voice configuration
 * - [ ] Implement createPublishedApp() with live/staging variants
 * - [ ] Add model configuration variants (GPT-4, Claude, etc.)
 */

import type { TestUser, TestApplication } from "../setup.ts";
import { createTestApplication, sql } from "../setup.ts";

// ========================================
// Types
// ========================================

export interface TestAppWithKnowledge extends TestApplication {
  knowledgeSources: { id: string; type: string; name: string }[];
}

export interface TestAppWithActions extends TestApplication {
  customActions: { id: string; name: string; endpoint: string }[];
}

// ========================================
// Basic App Fixtures
// ========================================

/**
 * Create a basic chat application with default settings.
 * No knowledge sources, no custom actions.
 */
export async function createBasicApp(
  user: TestUser,
  overrides: Partial<{
    name: string;
    description: string;
    systemPrompt: string;
  }> = {}
): Promise<TestApplication> {
  return createTestApplication(user, {
    name: overrides.name || `test_basic_app_${Date.now()}`,
    description: overrides.description || "Basic test application",
    systemPrompt: overrides.systemPrompt || "You are a helpful assistant.",
  });
}

/**
 * Create a draft (unpublished) application.
 * Used for testing publish flows and access restrictions.
 */
export async function createDraftApp(user: TestUser): Promise<TestApplication> {
  return createTestApplication(user, {
    name: `test_draft_app_${Date.now()}`,
    description: "Draft test application (not published)",
    systemPrompt: "You are a helpful assistant.",
  });
}

/**
 * Create an app with a custom system prompt.
 */
export async function createAppWithPrompt(
  user: TestUser,
  systemPrompt: string
): Promise<TestApplication> {
  return createTestApplication(user, {
    name: `test_prompted_app_${Date.now()}`,
    description: "App with custom prompt",
    systemPrompt,
  });
}

// ========================================
// RAG App Fixtures
// ========================================

/**
 * Create an app with text knowledge source.
 * Pre-seeds with sample text content for RAG testing.
 *
 * @param user - Test user
 * @param options - Either a string (text content) or an options object
 * @returns Object with `app` and `source` properties (source may be null if embeddings tables don't exist)
 */
export async function createRagAppWithText(
  user: TestUser,
  options:
    | string
    | {
        name?: string;
        texts?: string[];
        textContent?: string;
        embeddingProvider?: string;
      } = "This is sample knowledge content for testing RAG retrieval."
): Promise<{
  app: TestApplication;
  source: { id: string; type: string; name: string } | null;
}> {
  // Normalize options
  const textContent =
    typeof options === "string"
      ? options
      : options.texts?.join("\n") ||
        options.textContent ||
        "Sample text content";
  const appName =
    typeof options === "object" && options.name
      ? options.name
      : `test_rag_text_app_${Date.now()}`;
  const embeddingProvider =
    typeof options === "object" && options.embeddingProvider
      ? options.embeddingProvider
      : "openai";

  const app = await createTestApplication(user, {
    name: appName,
    description: "RAG app with text source",
    systemPrompt:
      "You are a helpful assistant. Use the provided context to answer questions.",
  });

  // Try to create knowledge source - may fail if embeddings tables don't exist
  let source: { id: string; type: string; name: string } | null = null;
  try {
    const sourceName = `test_source_${Date.now()}`;
    const [created] = await sql`
      INSERT INTO embeddings.knowledge_sources (
        app_id,
        name,
        type,
        status,
        embedding_provider,
        embedding_model
      )
      VALUES (
        ${app.id},
        ${sourceName},
        'text',
        'ready',
        ${embeddingProvider},
        ${embeddingProvider === "openai" ? "text-embedding-3-large" : embeddingProvider === "local" ? "bge-large-en-v1.5" : "bridgetower-large-itm-mlm-itc"}
      )
      RETURNING id
    `;

    if (created) {
      source = { id: created.id, type: "text", name: sourceName };

      // Create a text chunk with mock embedding
      const embedding = new Array(3072)
        .fill(0)
        .map(() => Math.random() * 2 - 1);
      const embeddingStr = `[${embedding.join(",")}]`;

      await sql`
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
          ${created.id},
          ${textContent},
          ${embeddingStr}::vector,
          ${embeddingProvider},
          ${embeddingProvider === "openai" ? "text-embedding-3-large" : embeddingProvider === "local" ? "bge-large-en-v1.5" : "bridgetower-large-itm-mlm-itc"},
          ${embeddingProvider === "openai" ? 3072 : embeddingProvider === "local" ? 768 : 1024},
          0
        )
      `;
    }
  } catch {
    // Embeddings tables don't exist - source remains null
  }

  return { app, source };
}

/**
 * Create an app with URL knowledge source.
 * Pre-seeds with crawled/scraped URL content.
 */
export async function createRagAppWithUrl(
  user: TestUser,
  url: string = "https://example.com"
): Promise<TestAppWithKnowledge> {
  const app = await createTestApplication(user, {
    name: `test_rag_url_app_${Date.now()}`,
    description: "RAG app with URL source",
    systemPrompt:
      "You are a helpful assistant. Use the provided context to answer questions.",
  });

  // TODO: Create URL knowledge source record
  // TODO: Add mock embeddings for the URL content
  return {
    ...app,
    knowledgeSources: [],
  };
}

/**
 * Create an app with document knowledge source (PDF, DOCX, etc.).
 */
export async function createRagAppWithDocument(
  user: TestUser
): Promise<TestAppWithKnowledge> {
  const app = await createTestApplication(user, {
    name: `test_rag_doc_app_${Date.now()}`,
    description: "RAG app with document source",
    systemPrompt:
      "You are a helpful assistant. Use the provided context to answer questions.",
  });

  // TODO: Create document knowledge source with mock file
  // TODO: Add mock embeddings for document content
  return {
    ...app,
    knowledgeSources: [],
  };
}

/**
 * Create an app with multiple knowledge sources.
 * Useful for testing RAG across heterogeneous sources.
 */
export async function createRagAppWithMultipleSources(
  user: TestUser
): Promise<TestAppWithKnowledge> {
  const app = await createTestApplication(user, {
    name: `test_rag_multi_app_${Date.now()}`,
    description: "RAG app with multiple sources",
    systemPrompt:
      "You are a helpful assistant. Use the provided context to answer questions.",
  });

  // TODO: Create multiple knowledge sources (text, URL, document)
  // TODO: Add embeddings for each source
  return {
    ...app,
    knowledgeSources: [],
  };
}

// ========================================
// Custom Action App Fixtures
// ========================================

/**
 * Create an app with a simple REST API action.
 */
export async function createAppWithRestAction(
  user: TestUser
): Promise<TestAppWithActions> {
  const app = await createTestApplication(user, {
    name: `test_action_rest_app_${Date.now()}`,
    description: "App with REST API action",
    systemPrompt: "You are a helpful assistant that can make API calls.",
  });

  // TODO: Create custom action with REST endpoint
  // TODO: Configure action parameters and auth
  return {
    ...app,
    customActions: [],
  };
}

/**
 * Create an app with a webhook action.
 */
export async function createAppWithWebhookAction(
  user: TestUser
): Promise<TestAppWithActions> {
  const app = await createTestApplication(user, {
    name: `test_action_webhook_app_${Date.now()}`,
    description: "App with webhook action",
    systemPrompt: "You are a helpful assistant that can trigger webhooks.",
  });

  // TODO: Create webhook action configuration
  return {
    ...app,
    customActions: [],
  };
}

/**
 * Create an app with chained actions (action depends on another).
 */
export async function createAppWithChainedActions(
  user: TestUser
): Promise<TestAppWithActions> {
  const app = await createTestApplication(user, {
    name: `test_action_chain_app_${Date.now()}`,
    description: "App with chained actions",
    systemPrompt: "You are a helpful assistant that can chain API calls.",
  });

  // TODO: Create multiple actions with dependencies
  // TODO: Configure action chaining/tool dependencies
  return {
    ...app,
    customActions: [],
  };
}

// ========================================
// Voice App Fixtures
// ========================================

/**
 * Create an app with voice capabilities enabled.
 */
export async function createVoiceApp(user: TestUser): Promise<TestApplication> {
  const app = await createTestApplication(user, {
    name: `test_voice_app_${Date.now()}`,
    description: "App with voice enabled",
    systemPrompt: "You are a helpful voice assistant. Keep responses concise.",
  });

  // TODO: Enable voice features in app config
  // TODO: Configure voice settings (provider, voice ID, etc.)
  return app;
}

// ========================================
// Published App Fixtures
// ========================================

/**
 * Create a published app with public access.
 */
export async function createPublishedApp(
  user: TestUser
): Promise<TestApplication> {
  const app = await createTestApplication(user, {
    name: `test_published_app_${Date.now()}`,
    description: "Published test app",
    systemPrompt: "You are a helpful assistant.",
  });

  // TODO: Set app to published state
  // TODO: Generate public URL/embed code
  return app;
}

/**
 * Create an app with custom domain configured.
 */
export async function createAppWithCustomDomain(
  user: TestUser,
  domain: string = "test.example.com"
): Promise<TestApplication> {
  const app = await createTestApplication(user, {
    name: `test_domain_app_${Date.now()}`,
    description: "App with custom domain",
    systemPrompt: "You are a helpful assistant.",
  });

  // TODO: Configure custom domain record
  // TODO: Set up SSL/verification status
  return app;
}

// ========================================
// Model Configuration Fixtures
// ========================================

/**
 * Create an app configured to use a specific model.
 */
export async function createAppWithModel(
  user: TestUser,
  model: string = "gpt-4o"
): Promise<TestApplication> {
  return createTestApplication(user, {
    name: `test_model_${model}_app_${Date.now()}`,
    description: `App using ${model}`,
    systemPrompt: "You are a helpful assistant.",
    model,
  });
}

// ========================================
// Cleanup
// ========================================

/**
 * Delete all test applications for a user.
 */
export async function cleanupUserApps(user: TestUser): Promise<void> {
  await sql`
    DELETE FROM app.applications
    WHERE developer_id = ${user.id}
    AND name LIKE 'test_%'
  `;
}
