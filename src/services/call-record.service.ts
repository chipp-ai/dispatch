/**
 * Call Record Service
 *
 * Tracks voice call records for applications.
 */

import { sql } from "../db/client.ts";
import { NotFoundError } from "../utils/errors.ts";

export interface CallRecord {
  id: string;
  application_id: string;
  phone_number_id: string | null;
  twilio_call_sid: string;
  twilio_account_sid: string | null;
  from_number: string;
  to_number: string;
  direction: "inbound" | "outbound-api" | "outbound-dial";
  status: string;
  duration_seconds: number | null;
  openai_call_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  recording_url: string | null;
  transcription_text: string | null;
  metadata: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCallRecordParams {
  applicationId: string;
  phoneNumberId?: string;
  twilioCallSid: string;
  twilioAccountSid?: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound-api" | "outbound-dial";
  openaiCallId?: string;
  metadata?: unknown;
}

export interface UpdateCallRecordParams {
  status?: string;
  durationSeconds?: number;
  endedAt?: Date;
  recordingUrl?: string;
  transcriptionText?: string;
  metadata?: unknown;
}

export const callRecordService = {
  /**
   * Create a new call record
   */
  async create(params: CreateCallRecordParams): Promise<CallRecord> {
    const {
      applicationId,
      phoneNumberId,
      twilioCallSid,
      twilioAccountSid,
      fromNumber,
      toNumber,
      direction,
      openaiCallId,
      metadata,
    } = params;

    const result = await sql`
      INSERT INTO app.call_records (
        application_id,
        phone_number_id,
        twilio_call_sid,
        twilio_account_sid,
        from_number,
        to_number,
        direction,
        status,
        openai_call_id,
        metadata,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        ${applicationId}::uuid,
        ${phoneNumberId ? `${phoneNumberId}::uuid` : null},
        ${twilioCallSid},
        ${twilioAccountSid || null},
        ${fromNumber},
        ${toNumber},
        ${direction},
        'initiated',
        ${openaiCallId || null},
        ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING
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
        openai_call_id,
        started_at,
        ended_at,
        recording_url,
        transcription_text,
        metadata,
        created_at,
        updated_at
    `;

    return result[0] as CallRecord;
  },

  /**
   * Get a call record by Twilio call SID
   */
  async getByTwilioSid(twilioCallSid: string): Promise<CallRecord | null> {
    const result = await sql`
      SELECT
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
        openai_call_id,
        started_at,
        ended_at,
        recording_url,
        transcription_text,
        metadata,
        created_at,
        updated_at
      FROM app.call_records
      WHERE twilio_call_sid = ${twilioCallSid}
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0] as CallRecord;
  },

  /**
   * Update a call record
   */
  async update(
    twilioCallSid: string,
    params: UpdateCallRecordParams
  ): Promise<CallRecord> {
    const updates: string[] = [];
    // Type for postgres.js parameterized query values
    const values: (string | number | Date | null)[] = [];

    if (params.status !== undefined) {
      updates.push(`status = $${values.length + 1}`);
      values.push(params.status);
    }

    if (params.durationSeconds !== undefined) {
      updates.push(`duration_seconds = $${values.length + 1}`);
      values.push(params.durationSeconds);
    }

    if (params.endedAt !== undefined) {
      updates.push(`ended_at = $${values.length + 1}::timestamptz`);
      values.push(params.endedAt);
    }

    if (params.recordingUrl !== undefined) {
      updates.push(`recording_url = $${values.length + 1}`);
      values.push(params.recordingUrl);
    }

    if (params.transcriptionText !== undefined) {
      updates.push(`transcription_text = $${values.length + 1}`);
      values.push(params.transcriptionText);
    }

    if (params.metadata !== undefined) {
      updates.push(`metadata = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      const existing = await this.getByTwilioSid(twilioCallSid);
      if (!existing) {
        throw new NotFoundError("Call record", twilioCallSid);
      }
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(twilioCallSid);

    const query = `
      UPDATE app.call_records
      SET ${updates.join(", ")}
      WHERE twilio_call_sid = $${values.length}
      RETURNING
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
        openai_call_id,
        started_at,
        ended_at,
        recording_url,
        transcription_text,
        metadata,
        created_at,
        updated_at
    `;

    const result = await sql.unsafe<CallRecord[]>(query, values);
    if (result.length === 0) {
      throw new NotFoundError("Call record", twilioCallSid);
    }

    return result[0];
  },

  /**
   * List call records for an application
   */
  async list(
    applicationId: string,
    limit = 50,
    offset = 0
  ): Promise<CallRecord[]> {
    const result = await sql`
      SELECT
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
        openai_call_id,
        started_at,
        ended_at,
        recording_url,
        transcription_text,
        metadata,
        created_at,
        updated_at
      FROM app.call_records
      WHERE application_id = ${applicationId}::uuid
      ORDER BY started_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return result as unknown as CallRecord[];
  },
};
