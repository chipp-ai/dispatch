/**
 * Transactional Email Service
 *
 * Sends OTP verification emails via SMTP2GO for consumer and developer auth flows.
 * Supports white-label from-email resolution: whitelabel tenant -> custom domain -> default.
 *
 * Falls back to structured console.log when SMTP is not configured (local dev).
 */

import * as Sentry from "@sentry/deno";
import { db } from "@/src/db/client.ts";

// ========================================
// Types
// ========================================

export interface EmailContext {
  appName: string;
  appId: string;
  organizationId: string;
  brandColor: string;
  language?: string;
}

interface FromAddress {
  email: string;
  name: string;
}

interface EmailTemplate {
  html: string;
  text: string;
}

// ========================================
// SMTP Transport (lazy singleton)
// ========================================

let _transport: unknown | null = null;
let _transportChecked = false;

async function getTransport(): Promise<unknown | null> {
  if (_transportChecked) return _transport;
  _transportChecked = true;

  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
  const user = Deno.env.get("SMTP_USERNAME");
  const pass = Deno.env.get("SMTP_PASSWORD");

  if (!host || !user || !pass) {
    console.log("[transactional-email] SMTP not configured, emails will be logged to console");
    return null;
  }

  const nodemailer = await import("nodemailer");
  _transport = nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transport;
}

// ========================================
// From-Email Resolution
// ========================================

async function resolveFromAddress(context: EmailContext): Promise<FromAddress> {
  const defaultEmail = Deno.env.get("SMTP_FROM_EMAIL") || "noreply@chipp.ai";
  const defaultName = Deno.env.get("SMTP_FROM_NAME") || "Chipp";

  try {
    // 1. Check whitelabel tenant
    const tenant = await db
      .selectFrom("app.whitelabel_tenants")
      .select(["features"])
      .where("organizationId", "=", context.organizationId)
      .executeTakeFirst();

    if (tenant) {
      const features = typeof tenant.features === "string"
        ? JSON.parse(tenant.features)
        : (tenant.features ?? {});

      if (features.smtpFromEmail) {
        return {
          email: features.smtpFromEmail,
          name: features.smtpFromName || context.appName,
        };
      }
    }

    // 2. Check custom domain
    const customDomain = await db
      .selectFrom("app.custom_domains")
      .select(["hostname"])
      .where("appId", "=", context.appId)
      .where("sslStatus", "=", "active")
      .executeTakeFirst();

    if (customDomain) {
      return {
        email: `noreply@${customDomain.hostname}`,
        name: context.appName,
      };
    }
  } catch (err) {
    console.error("[transactional-email] Error resolving from address:", err);
  }

  // 3. Default
  return { email: defaultEmail, name: defaultName };
}

// ========================================
// OTP Email Template
// ========================================

function otpTemplate(otpCode: string, context: EmailContext): EmailTemplate {
  const color = context.brandColor || "#000000";
  const appName = context.appName;
  const year = new Date().getFullYear();

  const html = `
    <style>
      @media only screen and (max-width: 600px) {
        .otp-code {
          font-size: 24px !important;
          letter-spacing: 2px !important;
          padding: 20px 8px !important;
        }
        .otp-container {
          padding: 16px 8px !important;
        }
      }
    </style>
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); padding: 40px;">
        <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; text-align: center;">
          Verify Your Email
        </h1>

        <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 32px 0; text-align: center;">
          Enter this code to verify your email address
        </p>

        <div class="otp-container" style="background-color: #ffffff; border: 2px solid ${color}; border-radius: 12px; padding: 24px 16px; margin: 0 0 32px 0; text-align: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);">
          <div class="otp-code" style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #111111; text-shadow: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${otpCode}
          </div>
        </div>

        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
          <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0; text-align: center;">
            <strong style="color: #1a1a1a;">\u23F1\uFE0F This code expires in 10 minutes</strong>
          </p>
        </div>

        <p style="color: #999999; font-size: 13px; line-height: 18px; margin: 0; text-align: center;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>

      <div style="margin-top: 24px; text-align: center;">
        <p style="color: #999999; font-size: 12px; line-height: 16px; margin: 0;">
          \u00A9 ${year} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const text = `Verify Your Email

Enter this code to verify your email address

Your verification code is: ${otpCode}

This code expires in 10 minutes.

If you didn't request this code, you can safely ignore this email.

\u00A9 ${year} ${appName}. All rights reserved.`;

  return { html, text };
}

// ========================================
// Core Send Function
// ========================================

async function sendEmail(params: {
  to: string;
  subject: string;
  template: EmailTemplate;
  from: FromAddress;
}): Promise<boolean> {
  const { to, subject, template, from } = params;
  const fromFormatted = `${from.name} <${from.email}>`;

  try {
    const transport = await getTransport();

    if (!transport) {
      console.log("[transactional-email] SMTP not configured — would send:", {
        to,
        subject,
        from: fromFormatted,
      });
      return true;
    }

    // deno-lint-ignore no-explicit-any
    await (transport as any).sendMail({
      from: fromFormatted,
      to,
      subject,
      html: template.html,
      text: template.text,
    });

    console.log(`[transactional-email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error("[transactional-email] Failed to send email:", {
      to,
      subject,
      error: err instanceof Error ? err.message : String(err),
    });
    Sentry.captureException(err, { extra: { to, subject, from: fromFormatted } });
    return false;
  }
}

// ========================================
// Public API
// ========================================

export async function sendOtpEmail(params: {
  to: string;
  otpCode: string;
  context: EmailContext;
}): Promise<boolean> {
  const from = await resolveFromAddress(params.context);
  const template = otpTemplate(params.otpCode, params.context);
  return sendEmail({
    to: params.to,
    subject: `${params.otpCode} is your ${params.context.appName} verification code`,
    template,
    from,
  });
}

// ========================================
// Password Reset Email Template
// ========================================

function passwordResetTemplate(resetUrl: string, context: EmailContext): EmailTemplate {
  const color = context.brandColor || "#000000";
  const appName = context.appName;
  const year = new Date().getFullYear();

  const html = `
    <style>
      @media only screen and (max-width: 600px) {
        .reset-btn {
          padding: 14px 24px !important;
          font-size: 15px !important;
        }
      }
    </style>
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); padding: 40px;">
        <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; text-align: center;">
          Reset Your Password
        </h1>

        <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 32px 0; text-align: center;">
          Click the button below to set a new password
        </p>

        <div style="text-align: center; margin: 0 0 32px 0;">
          <a href="${resetUrl}" class="reset-btn"
             style="background-color: ${color}; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
            Reset Password
          </a>
        </div>

        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
          <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0; text-align: center;">
            <strong style="color: #1a1a1a;">\u23F1\uFE0F This link expires in 1 hour</strong>
          </p>
        </div>

        <p style="color: #999999; font-size: 13px; line-height: 18px; margin: 0; text-align: center;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>

      <div style="margin-top: 24px; text-align: center;">
        <p style="color: #999999; font-size: 12px; line-height: 16px; margin: 0;">
          \u00A9 ${year} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const text = `Reset Your Password

Click the link below to set a new password:

${resetUrl}

This link expires in 1 hour.

If you didn't request this, you can safely ignore this email.

\u00A9 ${year} ${appName}. All rights reserved.`;

  return { html, text };
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  context: EmailContext;
}): Promise<boolean> {
  const from = await resolveFromAddress(params.context);
  const template = passwordResetTemplate(params.resetUrl, params.context);
  return sendEmail({
    to: params.to,
    subject: `Reset your ${params.context.appName} password`,
    template,
    from,
  });
}

// Exported for testing only
export const _testing = {
  otpTemplate,
  passwordResetTemplate,
  resolveFromAddress,
  resetTransport: () => {
    _transport = null;
    _transportChecked = false;
  },
};
