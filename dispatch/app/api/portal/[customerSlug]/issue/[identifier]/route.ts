import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";
import { validatePortalToken } from "../../../../../../lib/services/customerService";
import {
  isCustomerWatching,
  getWatchingCustomers,
} from "../../../../../../lib/services/watcherService";

interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  status_name: string;
  status_color: string;
  reporter_name: string | null;
  agent_status: string;
  created_at: Date;
  updated_at: Date;
}

interface CommentRow {
  id: string;
  body: string;
  author_name: string | null;
  created_at: Date;
}

/**
 * GET /api/portal/[customerSlug]/issue/[identifier]
 *
 * Returns a single issue detail for a customer portal (read-only view).
 * Customer must be a watcher of the issue to view it.
 * Requires valid portal token in query params.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerSlug: string; identifier: string }> }
) {
  const { customerSlug, identifier } = await params;
  const token = request.nextUrl.searchParams.get("token");

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

  // Get the issue
  const issue = await db.queryOne<IssueRow>(
    `SELECT i.*,
            s.name as status_name, s.color as status_color,
            u.slack_display_name as reporter_name
     FROM dispatch_issue i
     JOIN dispatch_status s ON i.status_id = s.id
     LEFT JOIN dispatch_customer_user u ON i.reporter_id = u.id
     WHERE i.identifier = $1`,
    [identifier]
  );

  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  // Verify customer is watching this issue
  const isWatching = await isCustomerWatching(issue.id, customer.id);
  if (!isWatching) {
    return NextResponse.json(
      { error: "You don't have access to this issue" },
      { status: 403 }
    );
  }

  // Get comments
  const comments = await db.query<CommentRow>(
    `SELECT c.id, c.body, a.name as author_name, c.created_at
     FROM dispatch_comment c
     LEFT JOIN dispatch_agent a ON c.author_id = a.id
     WHERE c.issue_id = $1
     ORDER BY c.created_at ASC`,
    [issue.id]
  );

  // Get all watchers for display
  const watchers = await getWatchingCustomers(issue.id);

  return NextResponse.json({
    customer: {
      name: customer.name,
      slug: customer.slug,
      brandColor: customer.brandColor,
      logoUrl: customer.logoUrl,
    },
    issue: {
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
      },
      agentStatus: issue.agent_status,
      createdAt: issue.created_at.toISOString(),
      updatedAt: issue.updated_at.toISOString(),
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: c.author_name ? { name: c.author_name } : null,
        createdAt: c.created_at.toISOString(),
      })),
      watcherCount: watchers.length,
    },
  });
}
