/**
 * Voice Agent Fixtures
 *
 * Pre-defined fixtures for testing voice agent functionality including
 * phone number configuration, call handling, and recordings.
 *
 * FIXTURE TYPES:
 * 1. Voice-enabled applications
 * 2. Phone number configurations
 * 3. Mock call events (Twilio webhooks)
 * 4. Call recordings and transcripts
 *
 * DATABASE TABLES:
 * - app.applications (capabilities.voiceAgent JSON)
 * - app.phone_numbers (Twilio phone number assignments)
 * - app.call_records (Voice call history)
 *
 * USAGE:
 *   import { createVoiceEnabledApp, createMockIncomingCall } from "../fixtures/voice.ts";
 *
 *   const voiceApp = await createVoiceEnabledApp(user);
 *   const callEvent = createMockIncomingCall(voiceApp);
 */

import type { TestApplication, TestUser } from "../setup.ts";
import { sql, createTestApplication } from "../setup.ts";
import { generateId } from "../../utils/id.ts";

// ========================================
// Types
// ========================================

export interface VoiceConfig {
  enabled: boolean;
  provider: "openai" | "twilio";
  voice: {
    voiceId: string;
    language?: string;
  };
  greeting?: string;
  systemPrompt?: string;
  maxDuration?: number;
}

export interface TestVoiceApp extends TestApplication {
  phoneNumber: string;
  phoneNumberId: string;
  voiceConfig: VoiceConfig;
}

export interface TestPhoneNumber {
  id: string;
  applicationId: string;
  phoneNumber: string;
  twilioPhoneNumberSid: string | null;
  friendlyName: string | null;
  isActive: boolean;
  voiceEnabled: boolean;
  smsEnabled: boolean;
}

export interface TestCallRecord {
  id: string;
  applicationId: string;
  phoneNumberId: string | null;
  twilioCallSid: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound-api" | "outbound-dial";
  status: string;
  durationSeconds: number | null;
  recordingUrl: string | null;
  transcriptionText: string | null;
}

export interface TestCall {
  callSid: string;
  from: string;
  to: string;
  status: "initiated" | "ringing" | "in-progress" | "completed" | "failed";
  direction: "inbound" | "outbound";
  duration?: number;
  recordingUrl?: string;
}

export interface TwilioWebhookPayload {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Called?: string;
  Caller?: string;
  CallStatus: string;
  Direction: string;
  ApiVersion: string;
  Timestamp: string;
  [key: string]: string | undefined;
}

// ========================================
// Core Database Operations
// ========================================

/**
 * Create a phone number directly in the database.
 */
async function createPhoneNumberInDb(
  applicationId: string,
  options: {
    phoneNumber?: string;
    twilioPhoneNumberSid?: string;
    friendlyName?: string;
    isActive?: boolean;
    voiceEnabled?: boolean;
    smsEnabled?: boolean;
    webhookUrl?: string;
    statusCallbackUrl?: string;
  } = {}
): Promise<TestPhoneNumber> {
  const phoneNumberId = generateId();
  const phoneNumber =
    options.phoneNumber ||
    `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;

  await sql`
    INSERT INTO app.phone_numbers (
      id,
      application_id,
      phone_number,
      twilio_phone_number_sid,
      friendly_name,
      is_active,
      voice_enabled,
      sms_enabled,
      webhook_url,
      status_callback_url,
      created_at,
      updated_at
    )
    VALUES (
      ${phoneNumberId}::uuid,
      ${applicationId}::uuid,
      ${phoneNumber},
      ${options.twilioPhoneNumberSid || `PN${generateRandomId(32)}`},
      ${options.friendlyName || "Test Voice Number"},
      ${options.isActive ?? true},
      ${options.voiceEnabled ?? true},
      ${options.smsEnabled ?? false},
      ${options.webhookUrl || null},
      ${options.statusCallbackUrl || null},
      NOW(),
      NOW()
    )
  `;

  return {
    id: phoneNumberId,
    applicationId,
    phoneNumber,
    twilioPhoneNumberSid: options.twilioPhoneNumberSid || null,
    friendlyName: options.friendlyName || "Test Voice Number",
    isActive: options.isActive ?? true,
    voiceEnabled: options.voiceEnabled ?? true,
    smsEnabled: options.smsEnabled ?? false,
  };
}

/**
 * Create a call record directly in the database.
 */
async function createCallRecordInDb(
  applicationId: string,
  phoneNumberId: string | null,
  options: {
    twilioCallSid?: string;
    twilioAccountSid?: string;
    fromNumber?: string;
    toNumber?: string;
    direction?: "inbound" | "outbound-api" | "outbound-dial";
    status?: string;
    durationSeconds?: number;
    startedAt?: Date;
    endedAt?: Date;
    recordingUrl?: string;
    transcriptionText?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TestCallRecord> {
  const callId = generateId();
  const twilioCallSid = options.twilioCallSid || `CA${generateRandomId(32)}`;

  await sql`
    INSERT INTO app.call_records (
      id,
      application_id,
      phone_number_id,
      twilio_call_sid,
      twilio_account_sid,
      from_number,
      to_number,
      direction,
      status,
      duration_seconds,
      started_at,
      ended_at,
      recording_url,
      transcription_text,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      ${callId}::uuid,
      ${applicationId}::uuid,
      ${phoneNumberId ?? null}::uuid,
      ${twilioCallSid},
      ${options.twilioAccountSid || "ACtest123"},
      ${options.fromNumber || "+14155551234"},
      ${options.toNumber || "+18005551234"},
      ${options.direction || "inbound"},
      ${options.status || "initiated"},
      ${options.durationSeconds || null},
      ${options.startedAt || new Date()},
      ${options.endedAt || null},
      ${options.recordingUrl || null},
      ${options.transcriptionText || null},
      ${options.metadata ? JSON.stringify(options.metadata) : null}::jsonb,
      NOW(),
      NOW()
    )
  `;

  return {
    id: callId,
    applicationId,
    phoneNumberId,
    twilioCallSid,
    fromNumber: options.fromNumber || "+14155551234",
    toNumber: options.toNumber || "+18005551234",
    direction: options.direction || "inbound",
    status: options.status || "initiated",
    durationSeconds: options.durationSeconds || null,
    recordingUrl: options.recordingUrl || null,
    transcriptionText: options.transcriptionText || null,
  };
}

/**
 * Update application capabilities with voice config.
 */
async function updateAppVoiceConfig(
  applicationId: string,
  voiceConfig: VoiceConfig
): Promise<void> {
  // Get current capabilities
  const [app] = await sql`
    SELECT capabilities FROM app.applications WHERE id = ${applicationId}::uuid
  `;

  // Parse capabilities if it's a string
  let capabilities: Record<string, unknown> = {};
  if (app?.capabilities) {
    if (typeof app.capabilities === "string") {
      try {
        capabilities = JSON.parse(app.capabilities);
      } catch {
        capabilities = {};
      }
    } else if (typeof app.capabilities === "object") {
      capabilities = app.capabilities as Record<string, unknown>;
    }
  }
  capabilities.voiceAgent = voiceConfig;

  await sql`
    UPDATE app.applications
    SET capabilities = ${JSON.stringify(capabilities)}::jsonb,
        updated_at = NOW()
    WHERE id = ${applicationId}::uuid
  `;
}

// ========================================
// Voice-Enabled Applications
// ========================================

/**
 * Create an application with voice agent enabled.
 * Includes phone number configuration (mocked for testing).
 */
export async function createVoiceEnabledApp(
  user: TestUser,
  config?: Partial<VoiceConfig>
): Promise<TestVoiceApp> {
  // Create base application
  const app = await createTestApplication(user, {
    name: `test_voice_app_${Date.now()}`,
    systemPrompt: "You are a helpful voice assistant.",
  });

  // Default voice config
  const voiceConfig: VoiceConfig = {
    enabled: true,
    provider: config?.provider || "openai",
    voice: {
      voiceId: config?.voice?.voiceId || "marin",
      language: config?.voice?.language || "en-US",
    },
    greeting: config?.greeting || "Hello! How can I help you today?",
    systemPrompt: config?.systemPrompt,
    maxDuration: config?.maxDuration || 600,
  };

  // Update app with voice capabilities
  await updateAppVoiceConfig(app.id, voiceConfig);

  // Create phone number for the app
  const phoneNumber = await createPhoneNumberInDb(app.id);

  return {
    ...app,
    phoneNumber: phoneNumber.phoneNumber,
    phoneNumberId: phoneNumber.id,
    voiceConfig,
  };
}

/**
 * Create a voice app with custom greeting prompt.
 */
export async function createVoiceAppWithGreeting(
  user: TestUser,
  greeting: string
): Promise<TestVoiceApp> {
  return createVoiceEnabledApp(user, { greeting });
}

/**
 * Create a voice app with custom system prompt.
 */
export async function createVoiceAppWithSystemPrompt(
  user: TestUser,
  systemPrompt: string
): Promise<TestVoiceApp> {
  return createVoiceEnabledApp(user, { systemPrompt });
}

/**
 * Create a voice app with custom actions/tools for voice.
 * NOTE: This returns a voice app without actual tools since app.custom_actions
 * may not exist in all test databases. Tests should handle gracefully.
 */
export async function createVoiceAppWithTools(
  user: TestUser,
  _toolCount: number = 2
): Promise<TestVoiceApp> {
  // Just create a voice-enabled app - tool execution tests should be skipped
  // if the custom_actions table doesn't exist
  return createVoiceEnabledApp(user);
}

/**
 * Create a voice app with specific voice ID.
 */
export async function createVoiceAppWithVoice(
  user: TestUser,
  voiceId: string
): Promise<TestVoiceApp> {
  return createVoiceEnabledApp(user, {
    voice: { voiceId, language: "en-US" },
  });
}

/**
 * Create a voice app with voice disabled (for testing disabled state).
 */
export async function createVoiceDisabledApp(
  user: TestUser
): Promise<TestVoiceApp> {
  const voiceApp = await createVoiceEnabledApp(user);

  // Disable voice
  await updateAppVoiceConfig(voiceApp.id, {
    ...voiceApp.voiceConfig,
    enabled: false,
  });

  return {
    ...voiceApp,
    voiceConfig: { ...voiceApp.voiceConfig, enabled: false },
  };
}

// ========================================
// Phone Number Fixtures
// ========================================

/**
 * Create an additional phone number for an application.
 */
export async function createPhoneNumber(
  applicationId: string,
  options?: {
    phoneNumber?: string;
    friendlyName?: string;
    voiceEnabled?: boolean;
    smsEnabled?: boolean;
  }
): Promise<TestPhoneNumber> {
  return createPhoneNumberInDb(applicationId, options);
}

/**
 * Create a deactivated phone number.
 */
export async function createInactivePhoneNumber(
  applicationId: string
): Promise<TestPhoneNumber> {
  return createPhoneNumberInDb(applicationId, {
    isActive: false,
    friendlyName: "Inactive Number",
  });
}

/**
 * Create a phone number with voice disabled.
 */
export async function createVoiceDisabledPhoneNumber(
  applicationId: string
): Promise<TestPhoneNumber> {
  return createPhoneNumberInDb(applicationId, {
    voiceEnabled: false,
    smsEnabled: true,
  });
}

// ========================================
// Call Record Fixtures
// ========================================

/**
 * Create a call record for an application.
 */
export async function createCallRecord(
  applicationId: string,
  phoneNumberId: string | null,
  options?: {
    direction?: "inbound" | "outbound-api" | "outbound-dial";
    status?: string;
    durationSeconds?: number;
  }
): Promise<TestCallRecord> {
  return createCallRecordInDb(applicationId, phoneNumberId, options);
}

/**
 * Create a completed call with all metadata.
 */
export async function createCompletedCallRecord(
  applicationId: string,
  phoneNumberId: string | null,
  options?: {
    duration?: number;
    hasRecording?: boolean;
    hasTranscript?: boolean;
  }
): Promise<TestCallRecord> {
  return createCallRecordInDb(applicationId, phoneNumberId, {
    status: "completed",
    durationSeconds: options?.duration || 120,
    endedAt: new Date(),
    recordingUrl: options?.hasRecording
      ? `https://api.twilio.com/recordings/RE${generateRandomId(32)}`
      : undefined,
    transcriptionText: options?.hasTranscript
      ? "This is a test transcription of the call."
      : undefined,
  });
}

/**
 * Create a failed call record.
 */
export async function createFailedCallRecord(
  applicationId: string,
  phoneNumberId: string | null,
  failureReason: "busy" | "no-answer" | "failed" = "failed"
): Promise<TestCallRecord> {
  return createCallRecordInDb(applicationId, phoneNumberId, {
    status: failureReason,
    endedAt: new Date(),
  });
}

/**
 * Create multiple call records for history testing.
 */
export async function createCallHistory(
  applicationId: string,
  phoneNumberId: string | null,
  count: number = 10
): Promise<TestCallRecord[]> {
  const calls: TestCallRecord[] = [];

  for (let i = 0; i < count; i++) {
    const isCompleted = Math.random() > 0.2; // 80% completed
    const duration = isCompleted ? Math.floor(30 + Math.random() * 300) : 0;

    const call = await createCallRecordInDb(applicationId, phoneNumberId, {
      status: isCompleted ? "completed" : "failed",
      durationSeconds: duration,
      startedAt: new Date(Date.now() - i * 3600000), // Each call 1 hour apart
      endedAt: isCompleted
        ? new Date(Date.now() - i * 3600000 + duration * 1000)
        : new Date(),
      direction: i % 3 === 0 ? "outbound-api" : "inbound",
    });

    calls.push(call);
  }

  return calls;
}

// ========================================
// Twilio Webhook Payloads
// ========================================

/**
 * Generate a mock incoming call webhook payload.
 */
export function createMockIncomingCall(
  voiceApp: TestVoiceApp,
  fromNumber: string = "+14155551234"
): TwilioWebhookPayload {
  const callSid = `CA${generateRandomId(32)}`;
  return {
    CallSid: callSid,
    AccountSid: "ACtest123",
    From: fromNumber,
    To: voiceApp.phoneNumber,
    Called: voiceApp.phoneNumber,
    Caller: fromNumber,
    CallStatus: "ringing",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: new Date().toISOString(),
  };
}

/**
 * Generate an outbound call webhook payload.
 */
export function createMockOutboundCall(
  voiceApp: TestVoiceApp,
  toNumber: string = "+14155559999"
): TwilioWebhookPayload {
  const callSid = `CA${generateRandomId(32)}`;
  return {
    CallSid: callSid,
    AccountSid: "ACtest123",
    From: voiceApp.phoneNumber,
    To: toNumber,
    Called: toNumber,
    Caller: voiceApp.phoneNumber,
    CallStatus: "initiated",
    Direction: "outbound-api",
    ApiVersion: "2010-04-01",
    Timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a call status update webhook payload.
 */
export function createMockCallStatusUpdate(
  callSid: string,
  status: "in-progress" | "completed" | "failed" | "busy" | "no-answer",
  options?: {
    duration?: number;
    toNumber?: string;
    fromNumber?: string;
  }
): TwilioWebhookPayload {
  const payload: TwilioWebhookPayload = {
    CallSid: callSid,
    AccountSid: "ACtest123",
    From: options?.fromNumber || "+14155551234",
    To: options?.toNumber || "+18005551234",
    CallStatus: status,
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: new Date().toISOString(),
  };

  if (status === "completed" && options?.duration !== undefined) {
    payload.CallDuration = String(options.duration);
  }

  return payload;
}

/**
 * Generate a recording completed webhook payload.
 */
export function createMockRecordingComplete(
  callSid: string,
  recordingUrl: string = `https://api.twilio.com/recordings/RE${generateRandomId(32)}`
): TwilioWebhookPayload {
  return {
    CallSid: callSid,
    AccountSid: "ACtest123",
    RecordingSid: `RE${generateRandomId(32)}`,
    RecordingUrl: recordingUrl,
    RecordingStatus: "completed",
    RecordingDuration: "120",
    RecordingChannels: "2",
    From: "+14155551234",
    To: "+18005551234",
    CallStatus: "completed",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a transcription completed webhook payload.
 */
export function createMockTranscriptionComplete(
  callSid: string,
  transcriptionText: string = "Hello, this is a test transcription."
): TwilioWebhookPayload {
  return {
    CallSid: callSid,
    AccountSid: "ACtest123",
    TranscriptionSid: `TR${generateRandomId(32)}`,
    TranscriptionText: transcriptionText,
    TranscriptionStatus: "completed",
    From: "+14155551234",
    To: "+18005551234",
    CallStatus: "completed",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: new Date().toISOString(),
  };
}

/**
 * Convert Twilio payload to URL-encoded form data string.
 * Used for simulating Twilio webhook requests.
 */
export function toFormData(payload: TwilioWebhookPayload): string {
  return new URLSearchParams(
    Object.entries(payload).filter(([, v]) => v !== undefined) as [
      string,
      string,
    ][]
  ).toString();
}

// ========================================
// Call Fixtures (Simplified)
// ========================================

/**
 * Create a mock completed call with all metadata.
 */
export function createMockCompletedCall(
  voiceApp: TestVoiceApp,
  options?: {
    duration?: number;
    hasRecording?: boolean;
    hasTranscript?: boolean;
  }
): TestCall {
  return {
    callSid: `CA${generateRandomId(32)}`,
    from: "+14155551234",
    to: voiceApp.phoneNumber,
    status: "completed",
    direction: "inbound",
    duration: options?.duration ?? 120,
    recordingUrl: options?.hasRecording
      ? `https://api.twilio.com/recordings/RE${generateRandomId(32)}`
      : undefined,
  };
}

/**
 * Create a mock failed call.
 */
export function createMockFailedCall(
  voiceApp: TestVoiceApp,
  failureReason: "busy" | "no-answer" | "failed" = "failed"
): TestCall {
  return {
    callSid: `CA${generateRandomId(32)}`,
    from: "+14155551234",
    to: voiceApp.phoneNumber,
    status: "failed",
    direction: "inbound",
  };
}

/**
 * Create a mock in-progress call.
 */
export function createMockInProgressCall(voiceApp: TestVoiceApp): TestCall {
  return {
    callSid: `CA${generateRandomId(32)}`,
    from: "+14155551234",
    to: voiceApp.phoneNumber,
    status: "in-progress",
    direction: "inbound",
  };
}

// ========================================
// OpenAI Realtime Session Fixtures
// ========================================

/**
 * Create a mock OpenAI Realtime session response.
 * Used for testing /api/voice/session endpoint.
 */
export function createMockRealtimeSession(voiceId: string = "marin"): {
  client_secret: { value: string; expires_at: number };
  modalities: string[];
  voice: string;
} {
  return {
    client_secret: {
      value: `sess_${generateRandomId(32)}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
    modalities: ["text", "audio"],
    voice: voiceId,
  };
}

/**
 * Create a mock session config that would be sent to OpenAI.
 */
export function createMockSessionConfig(voiceApp: TestVoiceApp): {
  session: {
    type: string;
    model: string;
    instructions: string;
    audio: { output: { voice: string } };
  };
} {
  return {
    session: {
      type: "realtime",
      model: "gpt-realtime",
      instructions:
        voiceApp.voiceConfig.systemPrompt ||
        "You are a helpful voice assistant.",
      audio: {
        output: { voice: voiceApp.voiceConfig.voice.voiceId },
      },
    },
  };
}

// ========================================
// Helpers
// ========================================

function generateRandomId(length: number): string {
  const chars = "abcdef0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ========================================
// Cleanup
// ========================================

/**
 * Delete all voice configurations for an application.
 */
export async function cleanupVoiceConfigs(
  applicationId: string
): Promise<void> {
  // Remove voice config from capabilities - handle null/empty capabilities
  await sql`
    UPDATE app.applications
    SET capabilities = CASE
      WHEN capabilities IS NULL OR capabilities = 'null'::jsonb THEN '{}'::jsonb
      WHEN jsonb_typeof(capabilities) != 'object' THEN '{}'::jsonb
      ELSE capabilities - 'voiceAgent'
    END,
    updated_at = NOW()
    WHERE id = ${applicationId}::uuid
  `;
}

/**
 * Delete all phone numbers for an application.
 */
export async function cleanupPhoneNumbers(
  applicationId: string
): Promise<void> {
  await sql`
    DELETE FROM app.phone_numbers
    WHERE application_id = ${applicationId}::uuid
  `;
}

/**
 * Delete all call records for an application.
 */
export async function cleanupTestCalls(applicationId: string): Promise<void> {
  await sql`
    DELETE FROM app.call_records
    WHERE application_id = ${applicationId}::uuid
  `;
}

/**
 * Full cleanup of all voice-related test data for an app.
 */
export async function cleanupVoiceApp(applicationId: string): Promise<void> {
  await cleanupTestCalls(applicationId);
  await cleanupPhoneNumbers(applicationId);
  await cleanupVoiceConfigs(applicationId);
}

/**
 * Delete all test voice-related data across all apps.
 */
export async function cleanupAllTestVoiceData(): Promise<void> {
  // Delete test call records
  await sql`
    DELETE FROM app.call_records
    WHERE application_id IN (
      SELECT id FROM app.applications WHERE name LIKE 'test_%'
    )
  `;

  // Delete test phone numbers
  await sql`
    DELETE FROM app.phone_numbers
    WHERE application_id IN (
      SELECT id FROM app.applications WHERE name LIKE 'test_%'
    )
  `;
}
