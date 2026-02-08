/**
 * Email Tracking Routes
 *
 * Public endpoints for email open/click tracking.
 * Routes tracking events to the appropriate log table based on tracking ID prefix:
 * - cred_* -> billing.credit_notification_log (legacy credit notifications)
 * - notif_* -> app.notification_log (general notifications)
 *
 * No authentication required (tracking pixels and redirect links).
 */

import { Hono } from "hono";
import { creditNotificationService } from "../../../services/billing/credit-notifications.ts";
import { sql } from "../../../db/client.ts";

export const emailTrackingRoutes = new Hono();

// 1x1 transparent GIF for open tracking
const TRACKING_PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

/**
 * Track open event for general notification log (notif_* prefix).
 */
async function trackNotifOpen(
  trackingId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await sql`
      UPDATE app.notification_log
      SET
        opened_at = COALESCE(opened_at, NOW()),
        open_count = open_count + 1,
        last_opened_at = NOW(),
        ip_address = COALESCE(${ipAddress ?? null}, ip_address),
        user_agent = COALESCE(${userAgent ?? null}, user_agent)
      WHERE tracking_id = ${trackingId}
    `;
  } catch {
    // Fire-and-forget
  }
}

/**
 * Track click event for general notification log (notif_* prefix).
 */
async function trackNotifClick(trackingId: string): Promise<void> {
  try {
    await sql`
      UPDATE app.notification_log
      SET clicked_at = COALESCE(clicked_at, NOW())
      WHERE tracking_id = ${trackingId}
    `;
  } catch {
    // Fire-and-forget
  }
}

/**
 * GET /api/email/track/:trackingId
 * Record email open event and return a 1x1 transparent GIF.
 */
emailTrackingRoutes.get("/track/:trackingId", async (c) => {
  const trackingId = c.req.param("trackingId");
  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    undefined;
  const userAgent = c.req.header("user-agent") || undefined;

  // Route to appropriate tracker based on prefix
  if (trackingId.startsWith("notif_")) {
    trackNotifOpen(trackingId, ipAddress, userAgent).catch(() => {});
  } else {
    // Legacy credit notifications (cred_* prefix) and any other prefix
    creditNotificationService.trackOpen(trackingId, ipAddress, userAgent).catch(() => {});
  }

  return new Response(TRACKING_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
});

/**
 * GET /api/email/click/:trackingId
 * Record email click event and redirect to credits page.
 */
emailTrackingRoutes.get("/click/:trackingId", async (c) => {
  const trackingId = c.req.param("trackingId");
  const appUrl = Deno.env.get("APP_URL") || "http://localhost:5174";

  // Route to appropriate tracker based on prefix
  if (trackingId.startsWith("notif_")) {
    trackNotifClick(trackingId).catch(() => {});
  } else {
    creditNotificationService.trackClick(trackingId).catch(() => {});
  }

  // Redirect to credits page with topup modal open
  return c.redirect(`${appUrl}/#/settings/billing/credits?openTopup=true`);
});
