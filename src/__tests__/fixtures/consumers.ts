/**
 * Consumer Fixtures
 *
 * Pre-defined consumer (end-user) fixtures for testing consumer-facing
 * features like public chat, authentication, and lead capture.
 *
 * Consumers are end-users who interact with published applications.
 *
 * FIXTURE TYPES:
 * 1. Anonymous consumers (no account)
 * 2. Registered consumers (email)
 * 3. Consumers with chat history
 * 4. Consumers with lead data captured (via metadata)
 *
 * USAGE:
 *   import { createAnonymousConsumer, createRegisteredConsumer } from "../fixtures/consumers.ts";
 *
 *   const app = await createPublishedApp(user);
 *   const consumer = await createAnonymousConsumer(app.id);
 *   const res = await app.request(`/consumer/${app.appNameId}/chat/sessions`, {
 *     headers: getConsumerAuthHeaders(consumer),
 *   });
 */

import { sql } from "../setup.ts";
import { generateId } from "../../utils/id.ts";

// ========================================
// Types
// ========================================

// JSONValue type matching postgres.js expectations
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface TestConsumer {
  id: string;
  applicationId: string;
  email?: string;
  name?: string;
  externalId?: string;
  identifier?: string;
  sessionToken: string; // For API auth - using consumer ID as token
  sessionId: string; // Same as ID for simplicity
  isAnonymous: boolean;
  credits: number;
  createdAt: Date;
}

export interface TestConsumerWithHistory extends TestConsumer {
  chatSessionIds: string[];
  messageCount: number;
}

export interface TestConsumerWithLead extends TestConsumer {
  leadData: {
    email: string;
    name?: string;
    phone?: string;
    company?: string;
    customFields?: Record<string, string>;
  };
}

// ========================================
// Core Consumer Creation
// ========================================

/**
 * Create a consumer directly in the database.
 * This bypasses the API for faster test setup.
 */
async function createConsumerInDb(
  applicationId: string,
  options: {
    email?: string;
    name?: string;
    externalId?: string;
    identifier?: string;
    credits?: number;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TestConsumer> {
  const consumerId = generateId();
  const isAnonymous = !options.email;
  const externalId =
    options.externalId ||
    (isAnonymous ? `anon_${consumerId.slice(0, 8)}` : undefined);
  const identifier =
    options.identifier ||
    (isAnonymous ? `anon_${consumerId.slice(0, 8)}` : options.email);

  // Create consumer - use sql.json() for proper JSONB handling
  // Cast to JSONValue to satisfy postgres.js type requirements
  const metadataValue = (options.metadata || {}) as JSONValue;
  await sql`
    INSERT INTO app.consumers (
      id,
      application_id,
      external_id,
      identifier,
      email,
      name,
      metadata,
      credits,
      created_at
    )
    VALUES (
      ${consumerId},
      ${applicationId},
      ${externalId || null},
      ${identifier || null},
      ${options.email || null},
      ${options.name || null},
      ${sql.json(metadataValue)},
      ${options.credits ?? 0},
      NOW()
    )
  `;

  return {
    id: consumerId,
    applicationId,
    email: options.email,
    name: options.name,
    externalId,
    identifier,
    sessionToken: consumerId, // Use consumer ID as token
    sessionId: consumerId,
    isAnonymous,
    credits: options.credits ?? 0,
    createdAt: new Date(),
  };
}

// ========================================
// Anonymous Consumers
// ========================================

/**
 * Create an anonymous consumer for a published app.
 * Used for testing public chat without authentication.
 *
 * @param applicationId - The application's database ID
 * @returns Consumer with session token but no account
 */
export async function createAnonymousConsumer(
  applicationId: string
): Promise<TestConsumer> {
  return createConsumerInDb(applicationId);
}

/**
 * Create multiple anonymous consumers for concurrency testing.
 */
export async function createMultipleAnonymousConsumers(
  applicationId: string,
  count: number
): Promise<TestConsumer[]> {
  const consumers: TestConsumer[] = [];
  for (let i = 0; i < count; i++) {
    consumers.push(await createAnonymousConsumer(applicationId));
  }
  return consumers;
}

// ========================================
// Registered Consumers
// ========================================

/**
 * Create a registered consumer with email (and optional password).
 *
 * @param applicationId - The application's database ID
 * @param credentials - Email, optional name, and optional password
 * @returns Consumer with email
 */
export async function createRegisteredConsumer(
  applicationId: string,
  credentials: { email: string; name?: string; password?: string }
): Promise<TestConsumer> {
  const consumer = await createConsumerInDb(applicationId, {
    email: credentials.email,
    name: credentials.name,
  });

  // If password provided, update consumer with password hash
  // (In tests, we just store a marker that password was set)
  if (credentials.password) {
    await sql`
      UPDATE app.consumers
      SET password_hash = ${btoa(`test_hash:${credentials.password}`)},
          email_verified = true
      WHERE id = ${consumer.id}
    `;
  }

  return consumer;
}

/**
 * Create a consumer who authenticates via magic link (no password).
 *
 * @param applicationId - The application's database ID
 * @param email - Email address
 * @returns Consumer authenticated via magic link
 */
export async function createMagicLinkConsumer(
  applicationId: string,
  email: string
): Promise<TestConsumer> {
  const consumer = await createConsumerInDb(applicationId, {
    email,
  });

  // Mark as verified since magic link auth auto-verifies
  await sql`
    UPDATE app.consumers
    SET email_verified = true
    WHERE id = ${consumer.id}
  `;

  return consumer;
}

// ========================================
// Consumers with History
// ========================================

/**
 * Create a consumer with existing chat history.
 * Useful for testing history retrieval, resume, etc.
 *
 * @param applicationId - The application's database ID
 * @param messageCount - Number of messages to create
 */
export async function createConsumerWithHistory(
  applicationId: string,
  messageCount: number = 10
): Promise<TestConsumerWithHistory> {
  const consumer = await createConsumerInDb(applicationId, {
    email: `test_history_${Date.now()}@example.com`,
  });

  // Create a chat session
  const chatSessionId = generateId();
  await sql`
    INSERT INTO chat.sessions (
      id,
      application_id,
      consumer_id,
      started_at,
      source
    )
    VALUES (
      ${chatSessionId},
      ${applicationId},
      ${consumer.id},
      NOW(),
      'APP'
    )
  `;

  // Create messages
  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    const messageId = generateId();
    await sql`
      INSERT INTO chat.messages (
        id,
        session_id,
        role,
        content,
        created_at
      )
      VALUES (
        ${messageId},
        ${chatSessionId},
        ${role}::message_role,
        ${role === "user" ? `Test message ${i}` : `Test response ${i}`},
        NOW()
      )
    `;
  }

  return {
    ...consumer,
    chatSessionIds: [chatSessionId],
    messageCount,
  };
}

/**
 * Create a consumer with multiple chat sessions.
 * Useful for testing session list, session switching.
 */
export async function createConsumerWithMultipleSessions(
  applicationId: string,
  sessionCount: number = 3
): Promise<TestConsumerWithHistory> {
  const consumer = await createConsumerInDb(applicationId, {
    email: `test_multisession_${Date.now()}@example.com`,
  });

  const chatSessionIds: string[] = [];
  let totalMessages = 0;

  for (let s = 0; s < sessionCount; s++) {
    const chatSessionId = generateId();
    chatSessionIds.push(chatSessionId);

    await sql`
      INSERT INTO chat.sessions (
        id,
        application_id,
        consumer_id,
        started_at,
        source
      )
      VALUES (
        ${chatSessionId},
        ${applicationId},
        ${consumer.id},
        NOW(),
        'APP'
      )
    `;

    // Add a few messages to each session
    const messagesPerSession = 4;
    for (let i = 0; i < messagesPerSession; i++) {
      const role = i % 2 === 0 ? "user" : "assistant";
      const messageId = generateId();
      await sql`
        INSERT INTO chat.messages (
          id,
          session_id,
          role,
          content,
          created_at
        )
        VALUES (
          ${messageId},
          ${chatSessionId},
          ${role}::message_role,
          ${`Session ${s} message ${i}`},
          NOW()
        )
      `;
      totalMessages++;
    }
  }

  return {
    ...consumer,
    chatSessionIds,
    messageCount: totalMessages,
  };
}

// ========================================
// Consumers with Lead Data
// ========================================

/**
 * Create a consumer who has submitted lead capture form.
 * Lead data is stored in the consumer's metadata field.
 */
export async function createConsumerWithLead(
  applicationId: string,
  leadData: {
    email: string;
    name?: string;
    phone?: string;
    company?: string;
    customFields?: Record<string, string>;
  }
): Promise<TestConsumerWithLead> {
  const consumer = await createConsumerInDb(applicationId, {
    email: leadData.email,
    name: leadData.name,
    metadata: {
      lead: {
        phone: leadData.phone,
        company: leadData.company,
        ...leadData.customFields,
        capturedAt: new Date().toISOString(),
      },
    },
  });

  return {
    ...consumer,
    leadData,
  };
}

// ========================================
// Auth Helpers
// ========================================

/**
 * Generate consumer auth headers for API requests.
 * Uses the consumer ID as bearer token.
 */
export function getConsumerAuthHeaders(
  consumer: TestConsumer
): Record<string, string> {
  return {
    Authorization: `Bearer ${consumer.sessionToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Generate consumer auth headers with session cookie.
 * Some routes check cookies instead of bearer token.
 */
export function getConsumerCookieHeaders(
  consumer: TestConsumer
): Record<string, string> {
  return {
    Cookie: `consumer_session_id=${consumer.sessionToken}`,
    "Content-Type": "application/json",
  };
}

// ========================================
// Cleanup
// ========================================

/**
 * Delete all test consumers for an application.
 */
export async function cleanupAppConsumers(
  applicationId: string
): Promise<void> {
  // Delete chat sessions (which will cascade to messages)
  await sql`
    DELETE FROM chat.sessions
    WHERE application_id = ${applicationId}
  `;

  // Delete consumers
  await sql`
    DELETE FROM app.consumers
    WHERE application_id = ${applicationId}
  `;
}

/**
 * Delete all test consumers across all apps.
 * Uses email/external_id prefix to identify test consumers.
 */
export async function cleanupAllTestConsumers(): Promise<void> {
  // Delete chat sessions for test consumers
  await sql`
    DELETE FROM chat.sessions cs
    USING app.consumers c
    WHERE cs.consumer_id = c.id
    AND (c.external_id LIKE 'test_%' OR c.external_id LIKE 'anon_%' OR c.email LIKE 'test_%')
  `;

  // Delete test consumers
  await sql`
    DELETE FROM app.consumers
    WHERE external_id LIKE 'test_%'
    OR external_id LIKE 'anon_%'
    OR email LIKE 'test_%'
  `;
}
