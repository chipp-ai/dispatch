/**
 * Linear API Service
 *
 * Handles fetching issues from Linear and mapping them to Chipp Issues format.
 * Uses the Linear SDK for type-safe API interactions.
 */

import { LinearClient, Issue as LinearIssue } from "@linear/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinearIssueData {
  id: string; // Linear UUID
  identifier: string; // e.g., "ENG-123"
  title: string;
  description: string | null;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  state: {
    id: string;
    name: string;
    type: string; // backlog, unstarted, started, completed, canceled
  };
  labels: Array<{ id: string; name: string; color: string }>;
  assignee: { id: string; name: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinearImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Client Setup
// ---------------------------------------------------------------------------

let linearClient: LinearClient | null = null;

function getLinearClient(): LinearClient {
  if (!linearClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error("LINEAR_API_KEY environment variable is not set");
    }
    linearClient = new LinearClient({ apiKey });
  }
  return linearClient;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch all issues from a Linear team.
 */
export async function fetchLinearIssues(
  teamIdOrName?: string
): Promise<LinearIssueData[]> {
  const client = getLinearClient();

  // Get team - use provided ID/name or default to "Product"
  const teamQuery = teamIdOrName || process.env.LINEAR_TEAM_ID || "Product";

  let teamId: string;

  // Check if it's a UUID or a name
  if (teamQuery.match(/^[0-9a-f-]{36}$/i)) {
    teamId = teamQuery;
  } else {
    // Find team by name
    const teams = await client.teams();
    const team = teams.nodes.find(
      (t) => t.name.toLowerCase() === teamQuery.toLowerCase()
    );
    if (!team) {
      throw new Error(`Team "${teamQuery}" not found`);
    }
    teamId = team.id;
  }

  console.log(`[Linear] Fetching issues for team: ${teamId}`);

  // Fetch all issues (paginated)
  const allIssues: LinearIssueData[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const issues = await client.issues({
      filter: { team: { id: { eq: teamId } } },
      first: 100,
      after: cursor,
    });

    for (const issue of issues.nodes) {
      const state = await issue.state;
      const assignee = await issue.assignee;
      const labelsConnection = await issue.labels();

      allIssues.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description || null,
        priority: issue.priority,
        state: state
          ? {
              id: state.id,
              name: state.name,
              type: state.type,
            }
          : { id: "", name: "Backlog", type: "backlog" },
        labels: labelsConnection.nodes.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        assignee: assignee
          ? {
              id: assignee.id,
              name: assignee.name,
              email: assignee.email,
            }
          : null,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      });
    }

    hasMore = issues.pageInfo.hasNextPage;
    cursor = issues.pageInfo.endCursor;

    console.log(
      `[Linear] Fetched ${allIssues.length} issues so far, hasMore: ${hasMore}`
    );
  }

  console.log(`[Linear] Total issues fetched: ${allIssues.length}`);
  return allIssues;
}

/**
 * Fetch a single issue by ID.
 */
export async function fetchLinearIssue(
  issueId: string
): Promise<LinearIssueData | null> {
  const client = getLinearClient();

  try {
    const issue = await client.issue(issueId);
    if (!issue) return null;

    const state = await issue.state;
    const assignee = await issue.assignee;
    const labelsConnection = await issue.labels();

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || null,
      priority: issue.priority,
      state: state
        ? {
            id: state.id,
            name: state.name,
            type: state.type,
          }
        : { id: "", name: "Backlog", type: "backlog" },
      labels: labelsConnection.nodes.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      assignee: assignee
        ? {
            id: assignee.id,
            name: assignee.name,
            email: assignee.email,
          }
        : null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  } catch (error) {
    console.error(`[Linear] Error fetching issue ${issueId}:`, error);
    return null;
  }
}

/**
 * Map Linear priority (0-4) to Chipp priority (P1-P4).
 */
export function mapLinearPriority(
  linearPriority: number
): "P1" | "P2" | "P3" | "P4" {
  switch (linearPriority) {
    case 1: // Urgent
      return "P1";
    case 2: // High
      return "P2";
    case 3: // Medium
      return "P3";
    case 4: // Low
      return "P4";
    default: // No priority (0)
      return "P3";
  }
}

/**
 * Map Linear status name to Chipp Issues status name.
 * Linear and Chipp Issues statuses should match exactly after migration.
 */
export function mapLinearStatus(linearStatusName: string): string {
  // Direct mapping - statuses should match exactly
  const statusMap: Record<string, string> = {
    backlog: "Backlog",
    triage: "Triage",
    "waiting for agent": "Waiting for agent",
    "being developed": "Being Developed",
    "pr open": "PR Open",
    "verify in staging": "Verify in Staging",
    "verify in prod": "Verify in Prod",
    "ready for prod": "Ready for prod",
    done: "Done",
    canceled: "Canceled",
    cancelled: "Canceled",
  };

  const normalized = linearStatusName.toLowerCase();
  return statusMap[normalized] || linearStatusName;
}

/**
 * Verify a Linear webhook signature.
 */
export function verifyLinearWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    console.warn("[Linear Webhook] Missing signature or secret");
    return false;
  }

  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const expectedSignature = hmac.digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
