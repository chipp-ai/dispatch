/**
 * Credit Purchase notification template.
 * Sent when a consumer purchases credits on an app.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface CreditPurchaseData {
  consumerEmail: string;
  appName: string;
  amountFormatted: string;
}

export const creditPurchase = {
  subject(data: CreditPurchaseData): string {
    return `Credit purchase on ${data.appName} - ${data.amountFormatted}`;
  },

  renderHtml(data: CreditPurchaseData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">Credit Purchase</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        A user purchased credits on <strong>${data.appName}</strong>.
      </p>
      <div style="background-color: #dcfce7; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: #166534; margin: 0 0 4px 0;">
          <strong>Amount:</strong> ${data.amountFormatted}
        </p>
        <p style="font-size: 14px; color: #166534; margin: 0;">
          <strong>User:</strong> ${data.consumerEmail}
        </p>
      </div>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: CreditPurchaseData): string {
    return `Credit Purchase

A user purchased credits on ${data.appName}.

Amount: ${data.amountFormatted}
User: ${data.consumerEmail}`;
  },
};
