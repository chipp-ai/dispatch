/**
 * Workspace Member Joined notification template.
 * Sent when someone joins a workspace.
 */

import { renderWithLayout, type BrandingParams } from "./base-layout.ts";

interface WorkspaceMemberJoinedData {
  memberEmail: string;
  memberName?: string;
  workspaceName: string;
  role: string;
}

export const workspaceMemberJoined = {
  subject(data: WorkspaceMemberJoinedData): string {
    return `${data.memberName || data.memberEmail} joined ${data.workspaceName}`;
  },

  renderHtml(data: WorkspaceMemberJoinedData, branding: BrandingParams, options?: { trackingPixelUrl?: string; unsubscribeUrl?: string }): string {
    const displayName = data.memberName || data.memberEmail;
    const inner = `
      <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">New Workspace Member</h1>
      <p style="font-size: 15px; color: #52525b; line-height: 24px; margin: 0 0 24px 0;">
        <strong>${displayName}</strong> has joined <strong>${data.workspaceName}</strong>.
      </p>
      <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
        <p style="font-size: 14px; color: #52525b; margin: 0 0 4px 0;">
          <strong style="color: #18181b;">Email:</strong> ${data.memberEmail}
        </p>
        <p style="font-size: 14px; color: #52525b; margin: 0;">
          <strong style="color: #18181b;">Role:</strong> ${data.role}
        </p>
      </div>
    `;
    return renderWithLayout(branding, inner, options);
  },

  renderText(data: WorkspaceMemberJoinedData): string {
    const displayName = data.memberName || data.memberEmail;
    return `New Workspace Member

${displayName} has joined ${data.workspaceName}.

Email: ${data.memberEmail}
Role: ${data.role}`;
  },
};
