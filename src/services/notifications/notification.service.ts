/**
 * Notification Service
 *
 * Central orchestrator for all builder/dashboard email notifications.
 * Handles recipient resolution, preference checking, white-label branding,
 * template rendering, sending via transactional-email.service.ts, and audit logging.
 *
 * All sends are fire-and-forget -- never throws, always logs errors to Sentry.
 */

import { sql, db } from "../../db/client.ts";
import * as Sentry from "@sentry/deno";
import {
  NOTIFICATION_REGISTRY,
  type NotificationType,
  type RecipientFilter,
} from "./notification-types.ts";
import { renderWithLayout, type BrandingParams } from "./templates/base-layout.ts";

// Template imports
import { consumerSignup } from "./templates/consumer-signup.ts";
import { creditLow } from "./templates/credit-low.ts";
import { creditExhausted } from "./templates/credit-exhausted.ts";
import { paymentFailed } from "./templates/payment-failed.ts";
import { workspaceMemberJoined } from "./templates/workspace-member-joined.ts";
import { subscriptionChanged } from "./templates/subscription-changed.ts";
import { creditPurchase } from "./templates/credit-purchase.ts";
import { appEngagement } from "./templates/app-engagement.ts";
import { newChat } from "./templates/new-chat.ts";

// ========================================
// Types
// ========================================

interface SendParams {
  type: NotificationType;
  organizationId: string | number;
  data: Record<string, unknown>;
  recipientFilter?: RecipientFilter;
  specificUserId?: string;
}

interface Recipient {
  userId: string;
  email: string;
  name: string | null;
}

// deno-lint-ignore no-explicit-any
type TemplateModule = {
  subject(data: any): string;
  renderHtml(data: any, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string;
  renderText(data: any): string;
};

const TEMPLATES: Record<NotificationType, TemplateModule> = {
  new_chat: newChat,
  consumer_signup: consumerSignup,
  credit_low: creditLow,
  credit_exhausted: creditExhausted,
  payment_failed: paymentFailed,
  workspace_member_joined: workspaceMemberJoined,
  subscription_changed: subscriptionChanged,
  credit_purchase: creditPurchase,
  app_engagement: appEngagement,
};

// ========================================
// Service
// ========================================

export const notificationService = {
  /**
   * Send a notification. Fire-and-forget -- never throws.
   */
  async send(params: SendParams): Promise<void> {
    try {
      await this._sendInternal(params);
    } catch (error) {
      console.error("[notification-service] Failed to send notification", {
        type: params.type,
        organizationId: params.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      Sentry.captureException(error, {
        tags: { source: "notification-service", type: params.type },
        extra: { organizationId: params.organizationId },
      });
    }
  },

  async _sendInternal(params: SendParams): Promise<void> {
    const { type, organizationId, data, specificUserId } = params;

    const typeInfo = NOTIFICATION_REGISTRY[type];
    if (!typeInfo) {
      console.warn(`[notification-service] Unknown notification type: ${type}`);
      return;
    }

    const recipientFilter = params.recipientFilter || typeInfo.defaultRecipients;

    // 1. Resolve recipients
    const recipients = await this._resolveRecipients(
      organizationId,
      recipientFilter,
      specificUserId
    );

    if (recipients.length === 0) {
      console.log(`[notification-service] No recipients for ${type}`, { organizationId });
      return;
    }

    // 2. Push real-time WebSocket notification (instant, before email)
    await this._pushWebSocket(type, recipients, data);

    // 3. Resolve white-label branding
    const branding = await this._resolveBranding(organizationId);

    // 4. Get template
    const template = TEMPLATES[type];
    if (!template) {
      console.warn(`[notification-service] No template for type: ${type}`);
      return;
    }

    // 5. Resolve sender info
    const senderDomain = await this._resolveVerifiedDomain(organizationId);

    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5174";

    // 6. Send to each recipient (with preference check)
    for (const recipient of recipients) {
      const isEnabled = await this._checkPreference(recipient.userId, type);
      if (!isEnabled) {
        continue;
      }

      const trackingId = `notif_${type}_${organizationId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const trackingPixelUrl = `${appUrl}/api/email/track/${trackingId}`;
      const unsubscribeUrl = `${appUrl}/#/settings/notifications`;

      const subject = template.subject(data);
      const html = template.renderHtml(data, branding, { trackingPixelUrl, unsubscribeUrl });
      const text = template.renderText(data);

      // Send via SMTP
      const sent = await this._sendEmail({
        to: recipient.email,
        subject,
        html,
        text,
        senderDomain,
        branding,
      });

      // Log to notification_log
      await this._logNotification({
        organizationId,
        type,
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        subject,
        trackingId,
        sent,
        data,
      });
    }
  },

  /**
   * Resolve recipients based on filter.
   */
  async _resolveRecipients(
    organizationId: string | number,
    filter: RecipientFilter,
    specificUserId?: string
  ): Promise<Recipient[]> {
    if (filter === "specific_user" && specificUserId) {
      const rows = await sql`
        SELECT id, email, name FROM app.users
        WHERE id = ${specificUserId}
        LIMIT 1
      `;
      return (rows as unknown as Array<{ id: string; email: string; name: string | null }>).map((r) => ({
        userId: r.id,
        email: r.email,
        name: r.name,
      }));
    }

    if (filter === "org_admins") {
      const rows = await sql`
        SELECT id, email, name FROM app.users
        WHERE organization_id = ${organizationId}
          AND role IN ('owner', 'admin')
      `;
      return (rows as unknown as Array<{ id: string; email: string; name: string | null }>).map((r) => ({
        userId: r.id,
        email: r.email,
        name: r.name,
      }));
    }

    if (filter === "workspace_admins") {
      // Get all workspace admins for the org
      const rows = await sql`
        SELECT DISTINCT u.id, u.email, u.name
        FROM app.users u
        JOIN app.workspace_members wm ON wm.user_id = u.id
        WHERE u.organization_id = ${organizationId}
          AND wm.role IN ('OWNER', 'EDITOR')
      `;
      return (rows as unknown as Array<{ id: string; email: string; name: string | null }>).map((r) => ({
        userId: r.id,
        email: r.email,
        name: r.name,
      }));
    }

    if (filter === "app_owner") {
      // Falls back to org admins
      const rows = await sql`
        SELECT id, email, name FROM app.users
        WHERE organization_id = ${organizationId}
          AND role IN ('owner', 'admin')
      `;
      return (rows as unknown as Array<{ id: string; email: string; name: string | null }>).map((r) => ({
        userId: r.id,
        email: r.email,
        name: r.name,
      }));
    }

    return [];
  },

  /**
   * Check user's notification preference. Returns true if notification should be sent (opt-out model).
   */
  async _checkPreference(
    userId: string,
    type: NotificationType
  ): Promise<boolean> {
    try {
      const pref = await db
        .selectFrom("app.notification_preferences" as any)
        .select(["enabled"])
        .where("userId" as any, "=", userId)
        .where("notificationType" as any, "=", type)
        .where("channel" as any, "=", "email")
        .executeTakeFirst();

      // Opt-out model: enabled by default
      if (!pref) return true;
      return (pref as any).enabled !== false;
    } catch {
      // If table doesn't exist yet or query fails, default to enabled
      return true;
    }
  },

  /**
   * Resolve white-label branding for the organization.
   */
  async _resolveBranding(organizationId: string | number): Promise<BrandingParams> {
    const defaults: BrandingParams = {
      brandName: "Chipp",
      brandColor: "#000000",
    };

    try {
      // Check whitelabel tenant
      const tenant = await sql`
        SELECT name, primary_color, logo_url
        FROM app.whitelabel_tenants
        WHERE organization_id = ${organizationId}
        LIMIT 1
      `;

      if (tenant.length > 0) {
        const t = tenant[0] as { name: string; primary_color: string; logo_url: string };
        return {
          brandName: t.name || defaults.brandName,
          brandColor: t.primary_color || defaults.brandColor,
          logoUrl: t.logo_url || undefined,
        };
      }

      // Fallback: get org name
      const orgs = await sql`
        SELECT name FROM app.organizations
        WHERE id = ${organizationId}
        LIMIT 1
      `;

      if (orgs.length > 0) {
        return {
          ...defaults,
          brandName: (orgs[0] as { name: string }).name || defaults.brandName,
        };
      }
    } catch (error) {
      console.error("[notification-service] Error resolving branding:", error);
      Sentry.captureException(error, {
        tags: { source: "notifications", feature: "branding" },
        extra: { organizationId },
      });
    }

    return defaults;
  },

  /**
   * Get verified sender domain for the org, if any.
   */
  async _resolveVerifiedDomain(
    organizationId: string | number
  ): Promise<string | null> {
    try {
      const rows = await sql`
        SELECT domain FROM app.sender_domains
        WHERE organization_id = ${organizationId}
          AND status = 'verified'
        LIMIT 1
      `;
      if (rows.length > 0) {
        return (rows[0] as { domain: string }).domain;
      }
    } catch {
      // Table may not exist yet
    }
    return null;
  },

  /**
   * Send email via the existing transactional email SMTP transport.
   */
  async _sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    senderDomain: string | null;
    branding: BrandingParams;
  }): Promise<boolean> {
    const { to, subject, html, text, senderDomain, branding } = params;

    // Determine from address
    const defaultEmail = Deno.env.get("SMTP_FROM_EMAIL") || "noreply@chipp.ai";
    const fromEmail = senderDomain ? `noreply@${senderDomain}` : defaultEmail;
    const fromName = branding.brandName;
    const fromFormatted = `${fromName} <${fromEmail}>`;

    try {
      // Lazy import nodemailer transport (reusing same pattern as transactional-email.service.ts)
      const host = Deno.env.get("SMTP_HOST");
      const port = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
      const user = Deno.env.get("SMTP_USERNAME");
      const pass = Deno.env.get("SMTP_PASSWORD");

      if (!host || !user || !pass) {
        console.log("[notification-service] SMTP not configured -- would send:", {
          to,
          subject,
          from: fromFormatted,
        });
        return true; // Treat as "sent" in dev
      }

      const nodemailer = await import("nodemailer");
      const transport = nodemailer.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transport.sendMail({
        from: fromFormatted,
        to,
        subject,
        html,
        text,
      });

      console.log(`[notification-service] Sent "${subject}" to ${to}`);
      return true;
    } catch (error) {
      console.error("[notification-service] Email send failed:", {
        to,
        subject,
        error: error instanceof Error ? error.message : String(error),
      });
      Sentry.captureException(error, {
        tags: { source: "notifications", feature: "email-send" },
        extra: { to, subject, senderDomain },
      });
      return false;
    }
  },

  /**
   * Push real-time WebSocket notification to recipients.
   * Fire-and-forget -- never throws.
   */
  async _pushWebSocket(
    type: NotificationType,
    recipients: Recipient[],
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const content = this._buildPushContent(type, data);
      if (!content) return;

      const typeInfo = NOTIFICATION_REGISTRY[type];
      const { publishToUser } = await import("../../websocket/pubsub.ts");

      const event = {
        type: "notification:push" as const,
        notificationType: type,
        category: typeInfo.category,
        title: content.title,
        body: content.body,
        data,
        actionUrl: content.actionUrl,
        actionLabel: content.actionLabel,
        timestamp: new Date().toISOString(),
      };

      await Promise.all(
        recipients.map((r) => publishToUser(r.userId, event))
      );
    } catch (error) {
      // Fire-and-forget -- log but don't block email sending
      console.error("[notification-service] WebSocket push failed:", error);
      Sentry.captureException(error, {
        tags: { source: "notifications", feature: "websocket-push" },
        extra: { type, recipientCount: recipients.length },
      });
    }
  },

  /**
   * Build push notification content for a given type.
   */
  _buildPushContent(
    type: NotificationType,
    data: Record<string, unknown>
  ): { title: string; body: string; actionUrl?: string; actionLabel?: string } | null {
    switch (type) {
      case "new_chat":
        return {
          title: "New Conversation",
          body: `${data.consumerName || data.consumerEmail || "Someone"} started a chat on ${data.appName || "your app"}`,
          actionUrl: data.appId ? `/#/apps/${data.appId}/chats` : undefined,
          actionLabel: data.appId ? "View Chat" : undefined,
        };
      case "consumer_signup":
        return {
          title: "New User Signup",
          body: `${data.email || "Someone"} signed up for ${data.appName || "your app"}`,
          actionUrl: data.appId ? `/#/apps/${data.appId}` : undefined,
          actionLabel: data.appId ? "View App" : undefined,
        };
      case "credit_purchase":
        return {
          title: "Credit Purchase",
          body: `${data.email || "A user"} purchased ${data.amount || "credits"} on ${data.appName || "your app"}`,
          actionUrl: "/#/settings/billing",
          actionLabel: "View Billing",
        };
      case "credit_low":
        return {
          title: "Low Credit Balance",
          body: `Your balance is ${data.balance ?? "running low"}`,
          actionUrl: "/#/settings/billing",
          actionLabel: "Add Credits",
        };
      case "credit_exhausted":
        return {
          title: "Credits Exhausted",
          body: "Your apps will not respond until credits are added",
          actionUrl: "/#/settings/billing",
          actionLabel: "Add Credits",
        };
      case "payment_failed":
        return {
          title: "Payment Failed",
          body: `Payment of ${data.amount || "your subscription"} failed`,
          actionUrl: "/#/settings/billing",
          actionLabel: "Update Payment",
        };
      case "subscription_changed":
        return {
          title: "Subscription Updated",
          body: data.tier ? `Your plan has been changed to ${data.tier}` : "Your subscription has been updated",
          actionUrl: "/#/settings/billing",
          actionLabel: "View Plan",
        };
      case "workspace_member_joined":
        return {
          title: "New Team Member",
          body: `${data.name || "Someone"} joined ${data.workspace || "your workspace"}`,
          actionUrl: "/#/workspaces",
          actionLabel: "View Team",
        };
      case "app_engagement":
        return {
          title: "Engagement Report",
          body: "Your weekly engagement report is ready",
          actionUrl: "/#/dashboard",
          actionLabel: "View Dashboard",
        };
      default:
        return null;
    }
  },

  /**
   * Log notification to the audit table.
   */
  async _logNotification(params: {
    organizationId: string | number;
    type: NotificationType;
    recipientUserId: string;
    recipientEmail: string;
    subject: string;
    trackingId: string;
    sent: boolean;
    data: Record<string, unknown>;
  }): Promise<void> {
    try {
      await sql`
        INSERT INTO app.notification_log (
          organization_id,
          notification_type,
          recipient_user_id,
          recipient_email,
          subject,
          tracking_id,
          sent_at,
          metadata
        ) VALUES (
          ${params.organizationId},
          ${params.type},
          ${params.recipientUserId},
          ${params.recipientEmail},
          ${params.subject},
          ${params.trackingId},
          ${params.sent ? new Date().toISOString() : null},
          ${JSON.stringify(params.data)}::jsonb
        )
      `;
    } catch (error) {
      console.error("[notification-service] Failed to log notification:", {
        trackingId: params.trackingId,
        error: error instanceof Error ? error.message : String(error),
      });
      Sentry.captureException(error, {
        tags: { source: "notifications", feature: "audit-log" },
        extra: {
          trackingId: params.trackingId,
          type: params.type,
          organizationId: params.organizationId,
          recipientEmail: params.recipientEmail,
        },
      });
    }
  },
};
