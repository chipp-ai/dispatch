/**
 * Credit Notification Service
 *
 * Sends email notifications when credit balance drops below thresholds.
 * Respects 24-hour cooldown per organization.
 * Logs to billing.credit_notification_log for tracking/audit.
 *
 * Note: Actual email sending is deferred until the transactional email
 * service is built. Currently logs intent and creates audit records.
 */

import { sql } from "../../db/client.ts";
import { log } from "@/lib/logger.ts";
import { notificationService } from "../notifications/notification.service.ts";

const COOLDOWN_HOURS = 24;

interface SendNotificationParams {
  organizationId: string | number;
  severity: "low" | "exhausted";
  creditBalanceCents: number;
  thresholdCents?: number;
  organizationName?: string;
}

export const creditNotificationService = {
  /**
   * Send a low credits notification email.
   * Respects 24-hour cooldown. Logs to notification log.
   *
   * Returns true if notification was sent (or intent logged), false if skipped.
   */
  async sendLowCreditsEmail(
    params: SendNotificationParams
  ): Promise<boolean> {
    const {
      organizationId,
      severity,
      creditBalanceCents,
      thresholdCents,
      organizationName,
    } = params;

    try {
      // Check 24-hour cooldown
      const cooldownCheck = await sql`
        SELECT last_credit_warning_email_at
        FROM app.organizations
        WHERE id = ${organizationId}
      `;

      if (cooldownCheck.length > 0 && cooldownCheck[0].last_credit_warning_email_at) {
        const lastSent = new Date(cooldownCheck[0].last_credit_warning_email_at);
        const hoursSince =
          (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);

        if (hoursSince < COOLDOWN_HOURS) {
          log.info("Skipping notification - within 24h cooldown", {
            source: "credit-notifications",
            feature: "low-credits-email",
            organizationId,
            hoursSince: hoursSince.toFixed(1),
          });
          return false;
        }
      }

      // Get recipient emails (owner and admin role users)
      const members = await sql`
        SELECT email, name
        FROM app.users
        WHERE organization_id = ${organizationId}
          AND role IN ('owner', 'admin')
      `;

      const recipientEmails = (members as any[])
        .map((m: any) => m.email)
        .filter(Boolean);

      if (recipientEmails.length === 0) {
        log.warn("No recipients found for credit notification", {
          source: "credit-notifications",
          feature: "low-credits-email",
          organizationId,
        });
        return false;
      }

      // Generate tracking ID
      const trackingId = `cred_${severity}_${organizationId}_${Date.now()}`;

      // Determine notification type and email subject
      const notificationType =
        severity === "exhausted" ? "EXHAUSTED" : "LOW_BALANCE";
      const upsellSource =
        severity === "exhausted"
          ? "CREDIT_EMAIL_EXHAUSTED"
          : "CREDIT_EMAIL_LOW";
      const emailSubject =
        severity === "exhausted"
          ? `Your credits are exhausted${organizationName ? ` - ${organizationName}` : ""}`
          : `Low credit balance${organizationName ? ` - ${organizationName}` : ""}`;

      // Log notification to audit table
      await sql`
        INSERT INTO billing.credit_notification_log (
          organization_id,
          notification_type,
          severity,
          recipient_emails,
          recipient_count,
          credit_balance_cents,
          triggered_threshold_cents,
          tracking_id,
          upsell_source,
          email_subject
        ) VALUES (
          ${organizationId},
          ${notificationType},
          ${severity},
          ${JSON.stringify(recipientEmails)}::jsonb,
          ${recipientEmails.length},
          ${creditBalanceCents},
          ${thresholdCents ?? null},
          ${trackingId},
          ${upsellSource},
          ${emailSubject}
        )
      `;

      // Update cooldown timestamp
      await sql`
        UPDATE app.organizations
        SET
          last_credit_warning_email_at = NOW(),
          updated_at = NOW()
        WHERE id = ${organizationId}
      `;

      // Log email intent (actual sending deferred until email service is built)
      log.info("Email notification intent", {
        source: "credit-notifications",
        feature: "low-credits-email",
        type: notificationType,
        severity,
        organizationId,
        organizationName,
        creditBalanceCents,
        thresholdCents,
        recipientCount: recipientEmails.length,
        recipients: recipientEmails,
        trackingId,
        emailSubject,
      });

      // Send via notification service (fire-and-forget)
      const appUrl = Deno.env.get("APP_URL") || "http://localhost:5174";
      const notifType = severity === "exhausted" ? "credit_exhausted" as const : "credit_low" as const;
      const addCreditsUrl = `${appUrl}/api/email/click/${trackingId}`;

      notificationService.send({
        type: notifType,
        organizationId: String(organizationId),
        data: severity === "exhausted"
          ? { organizationName: organizationName || "", addCreditsUrl }
          : {
              creditBalanceFormatted: `$${(creditBalanceCents / 100).toFixed(2)}`,
              creditBalanceCents,
              organizationName: organizationName || "",
              addCreditsUrl,
            },
      }).catch(() => {});

      return true;
    } catch (error) {
      log.error("Failed to send notification", {
        source: "credit-notifications",
        feature: "low-credits-email",
        organizationId,
        severity,
        creditBalanceCents,
      }, error);
      return false;
    }
  },

  /**
   * Record an email open event.
   */
  async trackOpen(
    trackingId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await sql`
        UPDATE billing.credit_notification_log
        SET
          opened_at = COALESCE(opened_at, NOW()),
          open_count = open_count + 1,
          last_opened_at = NOW(),
          ip_address = COALESCE(${ipAddress ?? null}, ip_address),
          user_agent = COALESCE(${userAgent ?? null}, user_agent),
          updated_at = NOW()
        WHERE tracking_id = ${trackingId}
      `;
    } catch (error) {
      log.error("Failed to track open", {
        source: "credit-notifications",
        feature: "track-open",
        trackingId,
        ipAddress,
        userAgent,
      }, error);
    }
  },

  /**
   * Record an email click event.
   */
  async trackClick(trackingId: string): Promise<void> {
    try {
      await sql`
        UPDATE billing.credit_notification_log
        SET
          clicked_at = COALESCE(clicked_at, NOW()),
          updated_at = NOW()
        WHERE tracking_id = ${trackingId}
      `;
    } catch (error) {
      log.error("Failed to track click", {
        source: "credit-notifications",
        feature: "track-click",
        trackingId,
      }, error);
    }
  },

  /**
   * Record a conversion event (user added credits after clicking email).
   */
  async trackConversion(
    trackingId: string,
    amountCents: number
  ): Promise<void> {
    try {
      await sql`
        UPDATE billing.credit_notification_log
        SET
          converted_at = COALESCE(converted_at, NOW()),
          conversion_amount_cents = ${amountCents},
          updated_at = NOW()
        WHERE tracking_id = ${trackingId}
      `;
    } catch (error) {
      log.error("Failed to track conversion", {
        source: "credit-notifications",
        feature: "track-conversion",
        trackingId,
        amountCents,
      }, error);
    }
  },
};
