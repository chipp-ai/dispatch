/**
 * Subscription Changed notification template.
 * Sent when a subscription is upgraded, downgraded, or canceled.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface SubscriptionChangedData {
  organizationName: string;
  previousTier: string;
  newTier: string;
  changeType: "upgraded" | "downgraded" | "canceled" | "reactivated";
  billingUrl: string;
}

export const subscriptionChanged = {
  subject(data: SubscriptionChangedData): string {
    const action = data.changeType === "upgraded" ? "Upgrade" :
      data.changeType === "downgraded" ? "Downgrade" :
      data.changeType === "canceled" ? "Cancellation" : "Reactivation";
    return `Subscription ${action} - ${data.organizationName}`;
  },

  renderHtml(data: SubscriptionChangedData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const actionVerb = data.changeType === "upgraded" ? "upgraded" :
      data.changeType === "downgraded" ? "downgraded" :
      data.changeType === "canceled" ? "canceled" : "reactivated";

    const bgColor = data.changeType === "canceled" ? "#fee2e2" :
      data.changeType === "upgraded" ? "#dcfce7" : "#f4f4f5";
    const textColor = data.changeType === "canceled" ? "#991b1b" :
      data.changeType === "upgraded" ? "#166534" : "#52525b";

    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">Subscription ${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)}</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        Your subscription for <strong>${data.organizationName}</strong> has been ${actionVerb}.
      </p>
      <div style="background-color: ${bgColor}; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: ${textColor}; margin: 0;">
          ${data.previousTier} &rarr; ${data.newTier}
        </p>
      </div>
      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="${data.billingUrl}" style="background-color: ${branding.brandColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          View Billing
        </a>
      </div>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: SubscriptionChangedData): string {
    const actionVerb = data.changeType === "upgraded" ? "upgraded" :
      data.changeType === "downgraded" ? "downgraded" :
      data.changeType === "canceled" ? "canceled" : "reactivated";

    return `Subscription ${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)}

Your subscription for ${data.organizationName} has been ${actionVerb}.

${data.previousTier} -> ${data.newTier}

View billing at: ${data.billingUrl}`;
  },
};
