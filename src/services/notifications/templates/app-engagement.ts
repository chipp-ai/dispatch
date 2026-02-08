/**
 * App Engagement digest notification template.
 * Deferred: type is registered but the digest generation is not yet implemented.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface AppEngagementData {
  organizationName: string;
  periodLabel: string;
  totalSessions: number;
  totalMessages: number;
  topApps: Array<{ name: string; sessions: number }>;
}

export const appEngagement = {
  subject(data: AppEngagementData): string {
    return `${data.periodLabel} engagement digest - ${data.organizationName}`;
  },

  renderHtml(data: AppEngagementData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const appRows = data.topApps
      .map(
        (app) =>
          `<tr><td style="padding: 8px 0; font-size: 14px; color: #52525b;">${app.name}</td><td style="padding: 8px 0; font-size: 14px; color: #18181b; text-align: right;">${app.sessions} sessions</td></tr>`
      )
      .join("");

    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">${data.periodLabel} Engagement</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        Here's a summary of activity across <strong>${data.organizationName}</strong>.
      </p>
      <div style="display: flex; gap: 16px; margin: 0 0 24px 0;">
        <div style="flex: 1; background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center;">
          <p style="font-size: 24px; font-weight: 700; color: #18181b; margin: 0;">${data.totalSessions}</p>
          <p style="font-size: 12px; color: #71717a; margin: 4px 0 0 0;">Sessions</p>
        </div>
        <div style="flex: 1; background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center;">
          <p style="font-size: 24px; font-weight: 700; color: #18181b; margin: 0;">${data.totalMessages}</p>
          <p style="font-size: 12px; color: #71717a; margin: 4px 0 0 0;">Messages</p>
        </div>
      </div>
      ${
        appRows
          ? `<table style="width: 100%; border-collapse: collapse;">${appRows}</table>`
          : ""
      }
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: AppEngagementData): string {
    const apps = data.topApps.map((a) => `  ${a.name}: ${a.sessions} sessions`).join("\n");
    return `${data.periodLabel} Engagement - ${data.organizationName}

Sessions: ${data.totalSessions}
Messages: ${data.totalMessages}

Top Apps:
${apps}`;
  },
};
