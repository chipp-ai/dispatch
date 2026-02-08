/**
 * Payment Failed notification template.
 * Sent when a subscription payment fails.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface PaymentFailedData {
  organizationName: string;
  amountFormatted: string;
  attemptCount: number;
  nextRetryDate?: string;
  billingUrl: string;
}

export const paymentFailed = {
  subject(data: PaymentFailedData): string {
    return `Payment failed - ${data.organizationName}`;
  },

  renderHtml(data: PaymentFailedData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const retryInfo = data.nextRetryDate
      ? `<p style="font-size: 14px; color: #52525b; margin: 8px 0 0 0;">Next retry: ${data.nextRetryDate}</p>`
      : "";

    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">Payment Failed</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        We were unable to process a payment of <strong>${data.amountFormatted}</strong> for <strong>${data.organizationName}</strong>.
      </p>
      <div style="background-color: #fee2e2; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: #991b1b; margin: 0;">
          Attempt ${data.attemptCount} failed
        </p>
        ${retryInfo}
      </div>
      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="${data.billingUrl}" style="background-color: ${branding.brandColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Update Payment Method
        </a>
      </div>
      <p style="font-size: 13px; color: #a1a1aa; margin: 0;">
        Please update your payment method to avoid service interruption.
      </p>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: PaymentFailedData): string {
    const retryLine = data.nextRetryDate ? `\nNext retry: ${data.nextRetryDate}` : "";
    return `Payment Failed

We were unable to process a payment of ${data.amountFormatted} for ${data.organizationName}.

Attempt ${data.attemptCount} failed${retryLine}

Update your payment method at: ${data.billingUrl}

Please update your payment method to avoid service interruption.`;
  },
};
