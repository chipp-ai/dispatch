/**
 * Phone Number Service
 *
 * Manages Twilio phone numbers assigned to applications.
 */

import { sql } from "../db/client.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";
import { applicationService } from "./application.service.ts";

export interface PhoneNumber {
  id: string;
  application_id: string;
  phone_number: string;
  twilio_phone_number_sid: string | null;
  friendly_name: string | null;
  is_active: boolean;
  voice_enabled: boolean;
  sms_enabled: boolean;
  webhook_url: string | null;
  status_callback_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePhoneNumberParams {
  applicationId: string;
  userId: string;
  phoneNumber: string;
  twilioPhoneNumberSid?: string;
  friendlyName?: string;
  voiceEnabled?: boolean;
  smsEnabled?: boolean;
  webhookUrl?: string;
  statusCallbackUrl?: string;
}

export interface UpdatePhoneNumberParams {
  friendlyName?: string;
  isActive?: boolean;
  voiceEnabled?: boolean;
  smsEnabled?: boolean;
  webhookUrl?: string;
  statusCallbackUrl?: string;
}

export const phoneNumberService = {
  /**
   * List phone numbers for an application
   */
  async list(applicationId: string, userId: string): Promise<PhoneNumber[]> {
    // Verify access
    await applicationService.get(applicationId, userId);

    const result = await sql`
      SELECT
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
      FROM app.phone_numbers
      WHERE application_id = ${applicationId}::uuid
      ORDER BY created_at DESC
    `;

    return result as unknown as PhoneNumber[];
  },

  /**
   * Get a phone number by ID
   */
  async get(phoneNumberId: string, userId: string): Promise<PhoneNumber> {
    const result = await sql`
      SELECT
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
      FROM app.phone_numbers
      WHERE id = ${phoneNumberId}::uuid
    `;

    if (result.length === 0) {
      throw new NotFoundError("Phone number", phoneNumberId);
    }

    const phoneNumber = result[0] as PhoneNumber;

    // Verify access
    await applicationService.get(phoneNumber.application_id, userId);

    return phoneNumber;
  },

  /**
   * Find phone number by phone number string
   */
  async findByNumber(phoneNumber: string): Promise<PhoneNumber | null> {
    const result = await sql`
      SELECT
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
      FROM app.phone_numbers
      WHERE phone_number = ${phoneNumber}
        AND is_active = true
        AND voice_enabled = true
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0] as PhoneNumber;
  },

  /**
   * Create a new phone number
   */
  async create(params: CreatePhoneNumberParams): Promise<PhoneNumber> {
    const {
      applicationId,
      userId,
      phoneNumber,
      twilioPhoneNumberSid,
      friendlyName,
      voiceEnabled = true,
      smsEnabled = false,
      webhookUrl,
      statusCallbackUrl,
    } = params;

    // Verify access
    await applicationService.get(applicationId, userId);

    // Validate phone number format (E.164)
    if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      throw new Error(
        "Invalid phone number format. Must be E.164 format (e.g., +1234567890)"
      );
    }

    // Check for duplicate
    const existing = await sql`
      SELECT id FROM app.phone_numbers
      WHERE phone_number = ${phoneNumber}
    `;

    if (existing.length > 0) {
      throw new Error(`Phone number ${phoneNumber} is already assigned`);
    }

    const result = await sql`
      INSERT INTO app.phone_numbers (
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
        ${applicationId}::uuid,
        ${phoneNumber},
        ${twilioPhoneNumberSid || null},
        ${friendlyName || null},
        true,
        ${voiceEnabled},
        ${smsEnabled},
        ${webhookUrl || null},
        ${statusCallbackUrl || null},
        NOW(),
        NOW()
      )
      RETURNING
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
    `;

    return result[0] as PhoneNumber;
  },

  /**
   * Update a phone number
   */
  async update(
    phoneNumberId: string,
    userId: string,
    params: UpdatePhoneNumberParams
  ): Promise<PhoneNumber> {
    // Verify access
    await this.get(phoneNumberId, userId);

    const updates: string[] = [];
    const values: (string | boolean | null)[] = [];

    if (params.friendlyName !== undefined) {
      updates.push(`friendly_name = $${values.length + 1}`);
      values.push(params.friendlyName);
    }

    if (params.isActive !== undefined) {
      updates.push(`is_active = $${values.length + 1}`);
      values.push(params.isActive);
    }

    if (params.voiceEnabled !== undefined) {
      updates.push(`voice_enabled = $${values.length + 1}`);
      values.push(params.voiceEnabled);
    }

    if (params.smsEnabled !== undefined) {
      updates.push(`sms_enabled = $${values.length + 1}`);
      values.push(params.smsEnabled);
    }

    if (params.webhookUrl !== undefined) {
      updates.push(`webhook_url = $${values.length + 1}`);
      values.push(params.webhookUrl);
    }

    if (params.statusCallbackUrl !== undefined) {
      updates.push(`status_callback_url = $${values.length + 1}`);
      values.push(params.statusCallbackUrl);
    }

    if (updates.length === 0) {
      return await this.get(phoneNumberId, userId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(phoneNumberId);

    const query = `
      UPDATE app.phone_numbers
      SET ${updates.join(", ")}
      WHERE id = $${values.length}::uuid
      RETURNING
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
    `;

    const result = await sql.unsafe<PhoneNumber[]>(query, values);
    return result[0];
  },

  /**
   * Delete a phone number
   */
  async delete(phoneNumberId: string, userId: string): Promise<void> {
    // Verify access
    await this.get(phoneNumberId, userId);

    await sql`
      DELETE FROM app.phone_numbers
      WHERE id = ${phoneNumberId}::uuid
    `;
  },
};
