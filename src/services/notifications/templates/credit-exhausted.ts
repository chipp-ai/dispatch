/**
 * Credit Exhausted notification template.
 * Sent when org credits are completely used up.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface CreditExhaustedData {
  organizationName: string;
  addCreditsUrl: string;
}

export const creditExhausted = {
  subject(data: CreditExhaustedData): string {
    return `Credits exhausted - ${data.organizationName}`;
  },

  renderHtml(data: CreditExhaustedData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">Credits Exhausted</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        Your credit balance for <strong>${data.organizationName}</strong> has been fully used.
        Your apps will not be able to process new requests until credits are added.
      </p>
      <div style="background-color: #fee2e2; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: #991b1b; margin: 0; font-weight: 600;">
          Current balance: $0.00
        </p>
      </div>
      <div style="text-align: center; margin: 0 0 24px 0;">
        <a href="${data.addCreditsUrl}" style="background-color: ${branding.brandColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Add Credits Now
        </a>
      </div>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: CreditExhaustedData): string {
    return `Credits Exhausted

Your credit balance for ${data.organizationName} has been fully used.
Your apps will not be able to process new requests until credits are added.

Current balance: $0.00

Add credits at: ${data.addCreditsUrl}`;
  },
};
