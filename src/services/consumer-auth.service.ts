/**
 * Consumer Authentication Service
 *
 * Handles authentication for end-users (consumers) of chat applications.
 * Supports:
 * - Email/password signup and login
 * - OTP (one-time password) verification
 * - Magic link authentication
 * - Password reset flow
 * - Session management
 */

import { db } from "../db/client.ts";
import type { Consumer, ConsumerSession } from "../db/schema.ts";
import { generateId } from "../utils/id.ts";
import { notificationService } from "./notifications/notification.service.ts";

// Constants
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_EXPIRY_DAYS = 30;

// Types
export interface AppSettings {
  signupsRestrictedToDomain?: string | null;
  startingFreeTrialTokens?: number;
  language?: string;
  emailGatingEnabled?: boolean;
  redirectAfterSignupUrl?: string;
}

export interface SignupInput {
  applicationId: string;
  email: string;
  password?: string;
  name?: string;
  appSettings?: AppSettings;
}

export interface LoginInput {
  applicationId: string;
  email: string;
  password: string;
}

export interface OtpVerifyInput {
  applicationId: string;
  email: string;
  otpCode: string;
}


export interface SessionInfo {
  sessionId: string;
  consumer: Pick<Consumer, "id" | "email" | "name" | "identifier" | "credits">;
  expiresAt: Date;
}

/**
 * Hash a password using Web Crypto API (available in Deno)
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Use PBKDF2 for password hashing
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    data,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  // Combine salt and hash for storage
  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a password against a hash
 */
async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const storedHashBytes = combined.slice(16);

    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      data,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    const newHashBytes = new Uint8Array(derivedBits);

    // Constant-time comparison
    if (newHashBytes.length !== storedHashBytes.length) return false;
    let result = 0;
    for (let i = 0; i < newHashBytes.length; i++) {
      result |= newHashBytes[i] ^ storedHashBytes[i];
    }
    return result === 0;
  } catch {
    return false;
  }
}

/**
 * Generate a random OTP code (6 digits)
 */
function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

export const consumerAuthService = {
  /**
   * Check if an email is allowed to signup (email gating)
   */
  async isEmailWhitelisted(
    applicationId: string,
    email: string
  ): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();

    const whitelisted = await db
      .selectFrom("app.application_email_whitelist")
      .select("id")
      .where("applicationId", "=", applicationId)
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    return !!whitelisted;
  },

  /**
   * Register a new consumer
   *
   * Features ported from chipp-admin:
   * - Domain restriction check
   * - Email gating check (whitelist)
   * - Block '+' in email addresses
   * - If user exists but unverified, update password and allow retry
   * - Starting credits from app settings
   */
  async signup(
    input: SignupInput
  ): Promise<{ consumer: Consumer; otp: string }> {
    const { applicationId, email, password, name, appSettings } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // Validate email format - block '+' characters (security measure)
    if (normalizedEmail.includes("+")) {
      throw new Error(
        "Email addresses cannot contain '+' characters. Please use a different email."
      );
    }

    // Check domain restriction if configured
    if (appSettings?.signupsRestrictedToDomain) {
      const allowedDomain = appSettings.signupsRestrictedToDomain;
      if (!normalizedEmail.endsWith(`@${allowedDomain}`)) {
        throw new Error(
          `Your email domain does not match the whitelisted domain for this application.`
        );
      }
    }

    // Check email gating (whitelist) if enabled
    if (appSettings?.emailGatingEnabled) {
      const isAllowed = await this.isEmailWhitelisted(
        applicationId,
        normalizedEmail
      );
      if (!isAllowed) {
        throw new Error(
          "This email is not authorized to access this application."
        );
      }
    }

    // Check if consumer already exists for this app
    const existing = await db
      .selectFrom("app.consumers")
      .selectAll()
      .where("applicationId", "=", applicationId)
      .where("identifier", "=", normalizedEmail)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    // Hash password if provided
    const passwordHash = password ? await hashPassword(password) : null;

    // Starting credits from app settings (default to 0)
    const startingCredits = appSettings?.startingFreeTrialTokens ?? 0;

    let consumer: Consumer;

    if (existing) {
      // If user exists and email is verified, they should login instead
      if (existing.emailVerified) {
        throw new Error(
          `An account with this email already exists. Please login instead.`
        );
      }

      // If user exists but hasn't verified email, update their password and allow retry
      // This matches chipp-admin behavior
      consumer = await db
        .updateTable("app.consumers")
        .set({
          passwordHash: passwordHash ?? existing.passwordHash,
          name: name ?? existing.name,
          // Reset any existing magic link tokens since they're retrying
          magicLinkToken: null,
          magicLinkExpiry: null,
          updatedAt: new Date(),
        })
        .where("id", "=", existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      // Generate consumer ID
      const consumerId = generateId();

      // Create new consumer
      consumer = await db
        .insertInto("app.consumers")
        .values({
          id: consumerId,
          applicationId,
          identifier: normalizedEmail,
          email: normalizedEmail,
          name: name ?? null,
          passwordHash,
          emailVerified: false,
          credits: startingCredits,
          subscriptionActive: false,
          mode: "LIVE",
          isDeleted: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Fire-and-forget consumer_signup notification
      try {
        const appInfo = await db
          .selectFrom("app.applications as a")
          .innerJoin("app.workspaces as w", "w.id", "a.workspaceId")
          .select(["a.name as appName", "w.organizationId"])
          .where("a.id", "=", applicationId)
          .executeTakeFirst();

        if (appInfo) {
          notificationService.send({
            type: "consumer_signup",
            organizationId: appInfo.organizationId,
            data: {
              consumerEmail: normalizedEmail,
              appName: appInfo.appName || "App",
              appId: applicationId,
            },
          }).catch(() => {});
        }
      } catch { /* fire-and-forget */ }
    }

    // Generate OTP for email verification
    const otp = await this.createOtp(applicationId, normalizedEmail);

    return { consumer, otp };
  },

  /**
   * Create an OTP for email verification
   */
  async createOtp(applicationId: string, email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Delete any existing OTPs for this email/app
    await db
      .deleteFrom("app.consumer_otps")
      .where("applicationId", "=", applicationId)
      .where("email", "=", normalizedEmail)
      .execute();

    // Create new OTP
    await db
      .insertInto("app.consumer_otps")
      .values({
        id: generateId(),
        email: normalizedEmail,
        applicationId,
        otpCode,
        expiresAt,
      })
      .execute();

    return otpCode;
  },

  /**
   * Verify an OTP and mark email as verified
   */
  async verifyOtp(input: OtpVerifyInput): Promise<Consumer> {
    const { applicationId, email, otpCode } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // Find the OTP
    const otp = await db
      .selectFrom("app.consumer_otps")
      .selectAll()
      .where("applicationId", "=", applicationId)
      .where("email", "=", normalizedEmail)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst();

    if (!otp) {
      throw new Error("OTP expired or not found");
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new Error("Maximum verification attempts exceeded");
    }

    if (otp.otpCode !== otpCode) {
      // Increment attempts
      await db
        .updateTable("app.consumer_otps")
        .set({ attempts: otp.attempts + 1 })
        .where("id", "=", otp.id)
        .execute();

      throw new Error("Invalid OTP");
    }

    // Delete the OTP
    await db.deleteFrom("app.consumer_otps").where("id", "=", otp.id).execute();

    // Mark consumer as verified
    const consumer = await db
      .updateTable("app.consumers")
      .set({
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where("applicationId", "=", applicationId)
      .where("identifier", "=", normalizedEmail)
      .where("isDeleted", "=", false)
      .returningAll()
      .executeTakeFirst();

    if (!consumer) {
      throw new Error("Consumer not found");
    }

    return consumer;
  },

  /**
   * Login with email and password
   */
  async login(input: LoginInput): Promise<SessionInfo> {
    const { applicationId, email, password } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // Find consumer
    const consumer = await db
      .selectFrom("app.consumers")
      .selectAll()
      .where("applicationId", "=", applicationId)
      .where("identifier", "=", normalizedEmail)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    if (!consumer) {
      throw new Error("Invalid email or password");
    }

    if (!consumer.emailVerified) {
      throw new Error("Email not verified. Please verify your email first.");
    }

    if (!consumer.passwordHash) {
      throw new Error("Account was created without password. Use magic link.");
    }

    // Verify password
    const isValid = await verifyPassword(password, consumer.passwordHash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    // Create session
    return this.createSession(consumer);
  },

  /**
   * Create a session for a consumer
   */
  async createSession(consumer: Consumer): Promise<SessionInfo> {
    const sessionId = generateId();
    const expiresAt = new Date(
      Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await db
      .insertInto("app.consumer_sessions")
      .values({
        id: sessionId,
        consumerId: consumer.id,
        applicationId: consumer.applicationId,
        expiresAt,
      })
      .execute();

    return {
      sessionId,
      consumer: {
        id: consumer.id,
        email: consumer.email,
        name: consumer.name,
        identifier: consumer.identifier,
        credits: consumer.credits,
      },
      expiresAt,
    };
  },

  /**
   * Logout - invalidate session
   */
  async logout(sessionId: string): Promise<void> {
    await db
      .deleteFrom("app.consumer_sessions")
      .where("id", "=", sessionId)
      .execute();
  },

  /**
   * Get consumer by ID
   */
  async getConsumer(consumerId: string): Promise<Consumer | null> {
    const consumer = await db
      .selectFrom("app.consumers")
      .selectAll()
      .where("id", "=", consumerId)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    return consumer ?? null;
  },

  /**
   * Find consumer by email and app
   */
  async findByEmail(
    applicationId: string,
    email: string
  ): Promise<Consumer | null> {
    const normalizedEmail = email.toLowerCase().trim();

    const consumer = await db
      .selectFrom("app.consumers")
      .selectAll()
      .where("applicationId", "=", applicationId)
      .where("identifier", "=", normalizedEmail)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    return consumer ?? null;
  },

  /**
   * Update consumer profile
   */
  async updateProfile(
    consumerId: string,
    updates: { name?: string; pictureUrl?: string }
  ): Promise<Consumer> {
    const consumer = await db
      .updateTable("app.consumers")
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where("id", "=", consumerId)
      .where("isDeleted", "=", false)
      .returningAll()
      .executeTakeFirst();

    if (!consumer) {
      throw new Error("Consumer not found");
    }

    return consumer;
  },
};
