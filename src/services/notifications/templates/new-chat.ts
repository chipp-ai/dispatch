/**
 * New Chat Session notification template.
 *
 * Sent to org admins / app owners when a consumer starts a new chat.
 * Features: avatar initial, message preview, source badge, branded CTA.
 */

import { renderWithLayout, darkenColor, tintColor, type BrandingParams } from "./base-layout.ts";

interface NewChatData {
  appName: string;
  appId: string;
  sessionId: string;
  consumerName?: string;
  consumerEmail?: string;
  messagePreview?: string;
  source?: string; // APP, WHATSAPP, SLACK, EMAIL
  timestamp?: string;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  APP: { label: "Web Chat", color: "#6366f1", icon: "&#x1F310;" },
  WHATSAPP: { label: "WhatsApp", color: "#25d366", icon: "&#x1F4AC;" },
  SLACK: { label: "Slack", color: "#4a154b", icon: "&#x1F4E8;" },
  EMAIL: { label: "Email", color: "#ea580c", icon: "&#x2709;" },
};

function getInitial(name?: string, email?: string): string {
  if (name) return name.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

function formatTime(timestamp?: string): string {
  if (!timestamp) return "";
  try {
    const d = new Date(timestamp);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const newChat = {
  subject(data: NewChatData): string {
    const who = data.consumerName || data.consumerEmail || "Someone";
    return `New conversation on ${data.appName} from ${who}`;
  },

  renderHtml(
    data: NewChatData,
    branding: BrandingParams,
    options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }
  ): string {
    const who = data.consumerName || data.consumerEmail || "Anonymous visitor";
    const initial = getInitial(data.consumerName, data.consumerEmail);
    const time = formatTime(data.timestamp);
    const sourceInfo = SOURCE_LABELS[data.source || "APP"] || SOURCE_LABELS.APP;
    const brandTint = tintColor(branding.brandColor, 0.88);
    const brandDark = darkenColor(branding.brandColor, 0.08);
    const appUrl = typeof Deno !== "undefined"
      ? (Deno.env.get("APP_URL") || "http://localhost:5174")
      : "http://localhost:5174";
    const chatUrl = `${appUrl}/#/apps/${data.appId}/chats`;

    const inner = `
      <!-- Headline -->
      <h1 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 4px 0; line-height: 1.3;">
        New conversation started
      </h1>
      <p style="font-size: 14px; color: #71717a; margin: 0 0 28px 0; line-height: 1.5;">
        on <strong style="color: #3f3f46;">${escapeHtml(data.appName)}</strong>${time ? ` &middot; ${time}` : ""}
      </p>

      <!-- Consumer Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 24px 0;">
        <tr>
          <td style="background: ${brandTint}; border-radius: 12px; padding: 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <!-- Avatar -->
                <td style="width: 48px; vertical-align: top; padding-right: 16px;">
                  <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, ${branding.brandColor}, ${brandDark}); background-color: ${branding.brandColor}; text-align: center; line-height: 48px; font-size: 20px; font-weight: 700; color: #ffffff;">
                    ${initial}
                  </div>
                </td>
                <!-- Info -->
                <td style="vertical-align: middle;">
                  <p style="font-size: 16px; font-weight: 600; color: #18181b; margin: 0 0 2px 0; line-height: 1.3;">
                    ${escapeHtml(who)}
                  </p>
                  ${data.consumerEmail && data.consumerName
                    ? `<p style="font-size: 13px; color: #71717a; margin: 0; line-height: 1.4;">${escapeHtml(data.consumerEmail)}</p>`
                    : ""
                  }
                </td>
                <!-- Source Badge -->
                <td style="vertical-align: middle; text-align: right;">
                  <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: #ffffff; border: 1px solid #e4e4e7; font-size: 11px; font-weight: 600; color: ${sourceInfo.color}; white-space: nowrap;">
                    ${sourceInfo.icon}&nbsp; ${sourceInfo.label}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${data.messagePreview ? `
      <!-- Message Preview -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 28px 0;">
        <tr>
          <td style="padding: 16px 20px; background: #fafafa; border-radius: 10px; border-left: 3px solid ${branding.brandColor};">
            <p style="font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 6px 0;">First message</p>
            <p style="font-size: 15px; color: #3f3f46; line-height: 1.55; margin: 0; font-style: italic;">
              &ldquo;${escapeHtml(data.messagePreview)}&rdquo;
            </p>
          </td>
        </tr>
      </table>
      ` : ""}

      <!-- CTA Button -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 4px 0 0 0;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${chatUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" strokecolor="${branding.brandColor}" fillcolor="${branding.brandColor}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">View Conversation</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${chatUrl}" style="display: inline-block; padding: 13px 36px; background: linear-gradient(135deg, ${branding.brandColor}, ${brandDark}); background-color: ${branding.brandColor}; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; letter-spacing: 0.01em;">
              View Conversation &rarr;
            </a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>

      <!-- Subtle tip -->
      <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 20px 0 0 0; line-height: 1.5;">
        You can take over this chat live from your dashboard.
      </p>
    `;

    return renderWithLayout(branding, inner, {
      preheader: `${who} started a conversation on ${data.appName}`,
      ...options,
    });
  },

  renderText(data: NewChatData): string {
    const who = data.consumerName || data.consumerEmail || "Anonymous visitor";
    const time = formatTime(data.timestamp);
    const sourceInfo = SOURCE_LABELS[data.source || "APP"] || SOURCE_LABELS.APP;

    return `New conversation on ${data.appName}

${who} started a chat${time ? ` on ${time}` : ""} via ${sourceInfo.label}.
${data.consumerEmail && data.consumerName ? `Email: ${data.consumerEmail}\n` : ""}
${data.messagePreview ? `First message: "${data.messagePreview}"` : ""}

View the conversation in your dashboard.`;
  },
};
