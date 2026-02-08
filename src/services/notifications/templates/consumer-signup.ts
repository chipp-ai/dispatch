/**
 * Consumer Signup notification template.
 * Sent to org admins when a new user signs up to their app.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface ConsumerSignupData {
  consumerEmail: string;
  appName: string;
  appId: string;
}

export const consumerSignup = {
  subject(data: ConsumerSignupData): string {
    return `New signup on ${data.appName}`;
  },

  renderHtml(data: ConsumerSignupData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">New User Signup</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        Someone just signed up to <strong>${data.appName}</strong>.
      </p>
      <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: #52525b; margin: 0;">
          <strong style="color: #18181b;">Email:</strong> ${data.consumerEmail}
        </p>
      </div>
      <p style="font-size: 13px; color: #a1a1aa; margin: 0;">
        You're receiving this because you're an admin of the organization that owns this app.
      </p>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: ConsumerSignupData): string {
    return `New User Signup

Someone just signed up to ${data.appName}.

Email: ${data.consumerEmail}

You're receiving this because you're an admin of the organization that owns this app.`;
  },
};
