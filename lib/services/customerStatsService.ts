import { db } from "../db";

export interface CustomerHealthMetrics {
  customerId: string;
  customerName: string;
  // Issue counts
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  // Health indicators
  staleIssues: number; // No updates in 3+ days
  criticalStale: number; // P1/P2 with no updates in 2+ days
  unrespondedIssues: number; // Issues with no comments from team
  highPriorityOpen: number; // P1/P2 that are still open
  // Activity
  lastActivityAt: Date | null;
  lastIssueCreatedAt: Date | null;
  avgResponseTimeHours: number | null;
  // Time since last activity
  daysSinceActivity: number | null;
}

export interface CustomerIssueDetails {
  id: string;
  identifier: string;
  title: string;
  priority: string;
  statusName: string;
  statusColor: string;
  createdAt: Date;
  updatedAt: Date;
  daysSinceUpdate: number;
  commentCount: number;
  hasTeamResponse: boolean;
}

export interface CustomerRecentActivity {
  type: "issue_created" | "issue_updated" | "comment_added" | "status_changed";
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  description: string;
  timestamp: Date;
  actorName: string | null;
}

/**
 * Get comprehensive health metrics for a customer
 */
export async function getCustomerHealthMetrics(
  customerId: string
): Promise<CustomerHealthMetrics | null> {
  // Get customer name
  const customer = await db.queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM dispatch_customer WHERE id = $1`,
    [customerId]
  );

  if (!customer) return null;

  // Get issue counts and health indicators in parallel queries
  const [
    totalResult,
    openResult,
    closedResult,
    staleResult,
    criticalStaleResult,
    unrespondedResult,
    highPriorityResult,
    lastActivityResult,
    lastIssueResult,
    avgResponseResult,
  ] = await Promise.all([
    // Total issues
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dispatch_issue WHERE customer_id = $1`,
      [customerId]
    ),
    // Open issues (not in "done" type status)
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       WHERE i.customer_id = $1 AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`,
      [customerId]
    ),
    // Closed issues
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       WHERE i.customer_id = $1 AND LOWER(s.name) IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`,
      [customerId]
    ),
    // Stale issues (no updates in 3+ days, still open)
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       WHERE i.customer_id = $1
         AND i.updated_at < NOW() - INTERVAL '3 days'
         AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`,
      [customerId]
    ),
    // Critical stale (P1/P2 with no updates in 2+ days)
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       WHERE i.customer_id = $1
         AND i.priority IN ('P1', 'P2')
         AND i.updated_at < NOW() - INTERVAL '2 days'
         AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`,
      [customerId]
    ),
    // Unresponded issues (no comments at all)
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       WHERE i.customer_id = $1
         AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')
         AND NOT EXISTS (SELECT 1 FROM dispatch_comment c WHERE c.issue_id = i.id)`,
      [customerId]
    ),
    // High priority open
    db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM dispatch_issue i
       JOIN dispatch_status s ON i.status_id = s.id
       WHERE i.customer_id = $1
         AND i.priority IN ('P1', 'P2')
         AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`,
      [customerId]
    ),
    // Last activity (most recent issue update or comment)
    db.queryOne<{ last_activity: Date | null }>(
      `SELECT GREATEST(
         (SELECT MAX(updated_at) FROM dispatch_issue WHERE customer_id = $1),
         (SELECT MAX(c.created_at) FROM dispatch_comment c JOIN dispatch_issue i ON c.issue_id = i.id WHERE i.customer_id = $1)
       ) as last_activity`,
      [customerId]
    ),
    // Last issue created
    db.queryOne<{ created_at: Date | null }>(
      `SELECT MAX(created_at) as created_at FROM dispatch_issue WHERE customer_id = $1`,
      [customerId]
    ),
    // Average response time (time to first comment)
    db.queryOne<{ avg_hours: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_comment.created_at - i.created_at)) / 3600) as avg_hours
       FROM dispatch_issue i
       JOIN LATERAL (
         SELECT MIN(created_at) as created_at
         FROM dispatch_comment c
         WHERE c.issue_id = i.id
       ) first_comment ON TRUE
       WHERE i.customer_id = $1 AND first_comment.created_at IS NOT NULL`,
      [customerId]
    ),
  ]);

  const lastActivity = lastActivityResult?.last_activity || null;
  const daysSinceActivity = lastActivity
    ? Math.floor(
        (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return {
    customerId: customer.id,
    customerName: customer.name,
    totalIssues: parseInt(totalResult?.count || "0", 10),
    openIssues: parseInt(openResult?.count || "0", 10),
    closedIssues: parseInt(closedResult?.count || "0", 10),
    staleIssues: parseInt(staleResult?.count || "0", 10),
    criticalStale: parseInt(criticalStaleResult?.count || "0", 10),
    unrespondedIssues: parseInt(unrespondedResult?.count || "0", 10),
    highPriorityOpen: parseInt(highPriorityResult?.count || "0", 10),
    lastActivityAt: lastActivity,
    lastIssueCreatedAt: lastIssueResult?.created_at || null,
    avgResponseTimeHours: avgResponseResult?.avg_hours
      ? parseFloat(avgResponseResult.avg_hours)
      : null,
    daysSinceActivity,
  };
}

/**
 * Get issues for a customer with health details
 */
export async function getCustomerIssuesWithHealth(
  customerId: string,
  options?: {
    limit?: number;
    filter?: "all" | "stale" | "unresponded" | "critical";
  }
): Promise<CustomerIssueDetails[]> {
  const limit = options?.limit || 50;
  const filter = options?.filter || "all";

  let whereClause = `WHERE i.customer_id = $1`;

  if (filter === "stale") {
    whereClause += ` AND i.updated_at < NOW() - INTERVAL '3 days'
      AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`;
  } else if (filter === "unresponded") {
    whereClause += ` AND NOT EXISTS (SELECT 1 FROM dispatch_comment c WHERE c.issue_id = i.id)
      AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`;
  } else if (filter === "critical") {
    whereClause += ` AND i.priority IN ('P1', 'P2')
      AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled')`;
  }

  const issues = await db.query<{
    id: string;
    identifier: string;
    title: string;
    priority: string;
    status_name: string;
    status_color: string;
    created_at: Date;
    updated_at: Date;
    comment_count: string;
  }>(
    `SELECT
      i.id, i.identifier, i.title, i.priority,
      s.name as status_name, s.color as status_color,
      i.created_at, i.updated_at,
      (SELECT COUNT(*) FROM dispatch_comment c WHERE c.issue_id = i.id) as comment_count
     FROM dispatch_issue i
     JOIN dispatch_status s ON i.status_id = s.id
     ${whereClause}
     ORDER BY
       CASE i.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
       i.updated_at DESC
     LIMIT $2`,
    [customerId, limit]
  );

  return issues.map((issue) => {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(issue.updated_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      priority: issue.priority,
      statusName: issue.status_name,
      statusColor: issue.status_color,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      daysSinceUpdate,
      commentCount: parseInt(issue.comment_count, 10),
      hasTeamResponse: parseInt(issue.comment_count, 10) > 0,
    };
  });
}

/**
 * Get recent activity for a customer
 */
export async function getCustomerRecentActivity(
  customerId: string,
  limit: number = 20
): Promise<CustomerRecentActivity[]> {
  // Get recent comments
  const comments = await db.query<{
    issue_id: string;
    issue_identifier: string;
    issue_title: string;
    body: string;
    created_at: Date;
    author_name: string | null;
  }>(
    `SELECT
      i.id as issue_id, i.identifier as issue_identifier, i.title as issue_title,
      c.body, c.created_at,
      a.name as author_name
     FROM dispatch_comment c
     JOIN dispatch_issue i ON c.issue_id = i.id
     LEFT JOIN dispatch_agent a ON c.author_id = a.id
     WHERE i.customer_id = $1
     ORDER BY c.created_at DESC
     LIMIT $2`,
    [customerId, limit]
  );

  // Get recent issue creations
  const issues = await db.query<{
    id: string;
    identifier: string;
    title: string;
    created_at: Date;
  }>(
    `SELECT id, identifier, title, created_at
     FROM dispatch_issue
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [customerId, limit]
  );

  // Combine and sort by timestamp
  const activities: CustomerRecentActivity[] = [
    ...comments.map((c) => ({
      type: "comment_added" as const,
      issueId: c.issue_id,
      issueIdentifier: c.issue_identifier,
      issueTitle: c.issue_title,
      description:
        c.body.length > 100 ? c.body.substring(0, 100) + "..." : c.body,
      timestamp: c.created_at,
      actorName: c.author_name,
    })),
    ...issues.map((i) => ({
      type: "issue_created" as const,
      issueId: i.id,
      issueIdentifier: i.identifier,
      issueTitle: i.title,
      description: `Issue created`,
      timestamp: i.created_at,
      actorName: null,
    })),
  ];

  // Sort by timestamp descending and limit
  return activities
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, limit);
}

/**
 * Get health summary for all customers (for dashboard)
 */
export async function getAllCustomersHealthSummary(
  workspaceId: string
): Promise<
  {
    id: string;
    name: string;
    slug: string;
    slackChannelId: string | null;
    totalIssues: number;
    openIssues: number;
    staleIssues: number;
    criticalStale: number;
    highPriorityOpen: number;
    lastActivityAt: Date | null;
    daysSinceActivity: number | null;
    healthScore: number; // 0-100, higher is better
  }[]
> {
  const customers = await db.query<{
    id: string;
    name: string;
    slug: string;
    slack_channel_id: string | null;
    total_issues: string;
    open_issues: string;
    stale_issues: string;
    critical_stale: string;
    high_priority_open: string;
    last_activity: Date | null;
  }>(
    `SELECT
      c.id, c.name, c.slug, c.slack_channel_id,
      COUNT(i.id) as total_issues,
      COUNT(CASE WHEN LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled') THEN 1 END) as open_issues,
      COUNT(CASE WHEN i.updated_at < NOW() - INTERVAL '3 days'
        AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled') THEN 1 END) as stale_issues,
      COUNT(CASE WHEN i.priority IN ('P1', 'P2')
        AND i.updated_at < NOW() - INTERVAL '2 days'
        AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled') THEN 1 END) as critical_stale,
      COUNT(CASE WHEN i.priority IN ('P1', 'P2')
        AND LOWER(s.name) NOT IN ('done', 'deployed', 'closed', 'cancelled', 'canceled') THEN 1 END) as high_priority_open,
      MAX(i.updated_at) as last_activity
     FROM dispatch_customer c
     LEFT JOIN dispatch_issue i ON c.id = i.customer_id
     LEFT JOIN dispatch_status s ON i.status_id = s.id
     WHERE c.workspace_id = $1
     GROUP BY c.id, c.name, c.slug, c.slack_channel_id
     ORDER BY critical_stale DESC, stale_issues DESC, c.name ASC`,
    [workspaceId]
  );

  return customers.map((c) => {
    const totalIssues = parseInt(c.total_issues, 10);
    const openIssues = parseInt(c.open_issues, 10);
    const staleIssues = parseInt(c.stale_issues, 10);
    const criticalStale = parseInt(c.critical_stale, 10);
    const highPriorityOpen = parseInt(c.high_priority_open, 10);
    const lastActivity = c.last_activity;
    const daysSinceActivity = lastActivity
      ? Math.floor(
          (Date.now() - new Date(lastActivity).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

    // Calculate health score (100 = perfect, 0 = critical)
    let healthScore = 100;
    // Critical stale issues are severe (-20 each, max -60)
    healthScore -= Math.min(criticalStale * 20, 60);
    // Stale issues reduce score (-10 each, max -30)
    healthScore -= Math.min(staleIssues * 10, 30);
    // High priority open issues reduce score (-5 each, max -20)
    healthScore -= Math.min(highPriorityOpen * 5, 20);
    // Days since activity penalty (after 7 days)
    if (daysSinceActivity !== null && daysSinceActivity > 7) {
      healthScore -= Math.min((daysSinceActivity - 7) * 2, 20);
    }
    healthScore = Math.max(0, healthScore);

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      slackChannelId: c.slack_channel_id,
      totalIssues,
      openIssues,
      staleIssues,
      criticalStale,
      highPriorityOpen,
      lastActivityAt: lastActivity,
      daysSinceActivity,
      healthScore,
    };
  });
}
