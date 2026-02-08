/**
 * Credit Low notification template.
 * Sent when org credit balance drops below threshold.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface CreditLowData {
  creditBalanceFormatted: string;
  creditBalanceCents: number;
  organizationName: string;
  addCreditsUrl: string;
}

export const creditLow = {
  subject(data: CreditLowData): string {
    return `Low credit balance - ${data.organizationName}`;
  },

  renderHtml(data: CreditLowData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">Low Credit Balance</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        Your credit balance for <strong>${data.organizationName}</strong> is running low.
      </p>
      <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: #92400e; margin: 0; font-weight: 600;">
          Current balance: ${data.creditBalanceFormatted}
        </p>
      </div>
      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="${data.addCreditsUrl}" style="background-color: ${branding.brandColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Add Credits
        </a>
      </div>
      <p style="font-size: 13px; color: #a1a1aa; margin: 0;">
        Add credits to keep your apps running without interruption.
      </p>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: CreditLowData): string {
    return `Low Credit Balance

Your credit balance for ${data.organizationName} is running low.

Current balance: ${data.creditBalanceFormatted}

Add credits at: ${data.addCreditsUrl}

Add credits to keep your apps running without interruption.`;
  },
};
