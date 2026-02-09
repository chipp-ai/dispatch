import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { validatePortalToken } from "../../../../lib/services/customerService";

interface StatusRow {
  id: string;
  name: string;
  color: string;
  position: number;
  is_closed: boolean;
}

interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  status_name: string;
  status_color: string;
  status_position: number;
  reporter_name: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * GET /api/portal/[customerSlug]
 *
 * Returns issues for a customer portal (read-only view).
 * Shows issues where the customer is a watcher.
 * By default, hides Done/Canceled issues (closed statuses).
 * Requires valid portal token in query params.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerSlug: string }> }
) {
  const { customerSlug } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const showClosed = request.nextUrl.searchParams.get("showClosed") === "true";

  // Validate token
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 401 });
  }

  const customer = await validatePortalToken(token);
  if (!customer) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Verify slug matches the customer
  if (customer.slug !== customerSlug) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Get all statuses for the workspace (filter closed statuses if needed)
  const statusQuery = showClosed
    ? `SELECT * FROM dispatch_status WHERE workspace_id = $1 ORDER BY position ASC`
    : `SELECT * FROM dispatch_status WHERE workspace_id = $1 AND is_closed = false ORDER BY position ASC`;

  const statuses = await db.query<StatusRow>(statusQuery, [
    customer.workspaceId,
  ]);

  // Get all issues where this customer is a watcher
  const issueQuery = showClosed
    ? `SELECT i.*,
              s.name as status_name, s.color as status_color, s.position as status_position,
              u.slack_display_name as reporter_name
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       LEFT JOIN dispatch_customer_user u ON i.reporter_id = u.id
       WHERE EXISTS (SELECT 1 FROM dispatch_issue_watcher w WHERE w.issue_id = i.id AND w.customer_id = $1)
       ORDER BY i.updated_at DESC`
    : `SELECT i.*,
              s.name as status_name, s.color as status_color, s.position as status_position,
              u.slack_display_name as reporter_name
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       LEFT JOIN dispatch_customer_user u ON i.reporter_id = u.id
       WHERE EXISTS (SELECT 1 FROM dispatch_issue_watcher w WHERE w.issue_id = i.id AND w.customer_id = $1)
         AND s.is_closed = false
       ORDER BY i.updated_at DESC`;

  const issues = await db.query<IssueRow>(issueQuery, [customer.id]);

  // Group issues by status
  const statusesWithIssues = statuses.map((status) => ({
    id: status.id,
    name: status.name,
    color: status.color,
    position: status.position,
    issues: issues
      .filter((issue) => issue.status_id === status.id)
      .map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        reporterName: issue.reporter_name,
        status: {
          id: issue.status_id,
          name: issue.status_name,
          color: issue.status_color,
          position: issue.status_position,
        },
        createdAt: issue.created_at.toISOString(),
        updatedAt: issue.updated_at.toISOString(),
      })),
  }));

  return NextResponse.json({
    customer: {
      name: customer.name,
      slug: customer.slug,
      brandColor: customer.brandColor,
      logoUrl: customer.logoUrl,
    },
    statuses: statusesWithIssues,
    showingClosed: showClosed,
  });
}
