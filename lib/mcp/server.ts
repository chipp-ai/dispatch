import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db";
import { randomUUID } from "crypto";
import {
  createIssue,
  updateIssue,
  getIssue,
  listIssues,
  searchIssuesSemantic,
  getSimilarIssues,
  getAgentActivity,
  createAgentActivity,
  type Priority,
  type AgentStatus,
  type AgentActivityType,
} from "../services/issueService";
import { broadcastActivity } from "../services/activityBroadcast";
import { generateEmbeddingForIssue, vectorToString } from "../utils/embeddings";
import {
  getOrCreateCustomerBySlackChannel,
  getCustomerBySlackChannel,
  buildPortalUrl,
} from "../services/customerService";
import { getOrCreateCustomerUser } from "../services/customerUserService";
import { addWatcher } from "../services/watcherService";

// Types
interface Workspace {
  id: string;
  name: string;
  issue_prefix: string;
  next_issue_number: number;
}

interface Agent {
  id: string;
  workspace_id: string;
  name: string;
}

interface Status {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

// Default data for workspace initialization
const DEFAULT_STATUSES = [
  {
    name: "Triage",
    color: "#8B5CF6",
    position: 0,
    is_triage: true,
    is_closed: false,
  },
  {
    name: "Backlog",
    color: "#6B7280",
    position: 1,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "Investigating",
    color: "#F59E0B",
    position: 2,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "Needs Review",
    color: "#EAB308",
    position: 3,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "In Progress",
    color: "#3B82F6",
    position: 4,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "In Review",
    color: "#10B981",
    position: 5,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "Done",
    color: "#22C55E",
    position: 6,
    is_triage: false,
    is_closed: true,
  },
  {
    name: "Canceled",
    color: "#EF4444",
    position: 7,
    is_triage: false,
    is_closed: true,
  },
];

const DEFAULT_LABELS = [
  { name: "bug", color: "#EF4444" },
  { name: "feature", color: "#3B82F6" },
  { name: "enhancement", color: "#8B5CF6" },
  { name: "documentation", color: "#6B7280" },
  { name: "agent", color: "#F59E0B" },
  { name: "investigate", color: "#EC4899" },
  { name: "implement", color: "#10B981" },
];

// Webhook event queue for polling
interface WebhookEvent {
  type:
    | "issue_assigned"
    | "issue_unassigned"
    | "issue_updated"
    | "comment_added";
  issue: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    assignee: string | null;
  };
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const webhookEventQueue: WebhookEvent[] = [];
const MAX_QUEUE_SIZE = 100;

// Add event to queue (called by webhook receiver)
export function queueWebhookEvent(event: WebhookEvent): void {
  webhookEventQueue.push(event);
  if (webhookEventQueue.length > MAX_QUEUE_SIZE) {
    webhookEventQueue.shift();
  }
}

// Helper: Get default workspace (creates if needed)
async function getDefaultWorkspace(): Promise<Workspace> {
  const issuePrefix = process.env.DEFAULT_ISSUE_PREFIX || "DISPATCH";
  const workspaceName = process.env.DEFAULT_WORKSPACE_NAME || "My Workspace";

  let workspace = await db.queryOne<Workspace>(
    `SELECT * FROM dispatch_workspace WHERE issue_prefix = $1`,
    [issuePrefix]
  );

  if (workspace) return workspace;

  // Also check for legacy "CHIPP" prefix from pre-rename deployments
  if (issuePrefix !== "CHIPP") {
    workspace = await db.queryOne<Workspace>(
      `SELECT * FROM dispatch_workspace WHERE issue_prefix = 'CHIPP'`
    );
    if (workspace) return workspace;
  }

  const workspaceId = randomUUID();
  await db.query(
    `INSERT INTO dispatch_workspace (id, name, issue_prefix, next_issue_number, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [workspaceId, workspaceName, issuePrefix, 1]
  );

  for (const status of DEFAULT_STATUSES) {
    await db.query(
      `INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        workspaceId,
        status.name,
        status.color,
        status.position,
        status.is_triage,
        status.is_closed,
      ]
    );
  }

  for (const label of DEFAULT_LABELS) {
    await db.query(
      `INSERT INTO dispatch_label (id, workspace_id, name, color)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), workspaceId, label.name, label.color]
    );
  }

  workspace = await db.queryOne<Workspace>(
    `SELECT * FROM dispatch_workspace WHERE id = $1`,
    [workspaceId]
  );

  return workspace!;
}

// Helper: Get or create agent
async function getOrCreateAgent(
  workspaceId: string,
  name: string
): Promise<Agent> {
  let agent = await db.queryOne<Agent>(
    `SELECT * FROM dispatch_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
    [workspaceId, name]
  );

  if (agent) return agent;

  const id = randomUUID();
  await db.query(
    `INSERT INTO dispatch_agent (id, workspace_id, name, is_active, created_at)
     VALUES ($1, $2, $3, true, NOW())`,
    [id, workspaceId, name]
  );

  return (await db.queryOne<Agent>(`SELECT * FROM dispatch_agent WHERE id = $1`, [
    id,
  ]))!;
}

// Create and configure MCP server
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "dispatch",
    version: "1.0.0",
  });

  // Tool 1: Search Issues (Semantic)
  server.tool(
    "search_issues",
    "Search for issues using natural language. Uses semantic search to find relevant issues based on meaning.",
    {
      query: z.string().describe("Natural language search query"),
      limit: z
        .number()
        .optional()
        .describe("Max results (default: 10, max: 50)"),
      status: z.string().optional().describe("Filter by status name"),
      priority: z
        .enum(["P1", "P2", "P3", "P4"])
        .optional()
        .describe("Filter by priority"),
    },
    async ({ query, limit = 10, status, priority }) => {
      try {
        const workspace = await getDefaultWorkspace();
        const embedding = await generateEmbeddingForIssue(query, null);
        const embeddingStr = vectorToString(embedding.vector);
        const safeLimit = Math.min(limit, 50);

        let sql = `
          SELECT ci.id, ci.identifier, ci.title, ci.description, ci.priority,
                 cs.name as status_name, ca.name as assignee_name,
                 1 - (ci.embedding <=> $1::vector) as similarity
          FROM dispatch_issue ci
          LEFT JOIN dispatch_status cs ON ci.status_id = cs.id
          LEFT JOIN dispatch_agent ca ON ci.assignee_id = ca.id
          WHERE ci.workspace_id = $2 AND ci.embedding IS NOT NULL
        `;
        const params: unknown[] = [embeddingStr, workspace.id];
        let idx = 3;

        if (status) {
          sql += ` AND LOWER(cs.name) LIKE LOWER($${idx})`;
          params.push(`%${status}%`);
          idx++;
        }
        if (priority) {
          sql += ` AND ci.priority = $${idx}`;
          params.push(priority);
          idx++;
        }

        sql += ` ORDER BY ci.embedding <=> $1::vector LIMIT $${idx}`;
        params.push(safeLimit);

        const results = await db.query<{
          identifier: string;
          title: string;
          description: string | null;
          priority: string;
          status_name: string;
          assignee_name: string | null;
          similarity: number;
        }>(sql, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  count: results.length,
                  issues: results.map((r) => ({
                    identifier: r.identifier,
                    title: r.title,
                    description: r.description?.substring(0, 200),
                    priority: r.priority,
                    status: r.status_name,
                    assignee: r.assignee_name,
                    similarity: Math.round(r.similarity * 100) / 100,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: List Issues
  server.tool(
    "list_issues",
    "List issues with optional filters.",
    {
      status: z.string().optional().describe("Filter by status name"),
      priority: z
        .enum(["P1", "P2", "P3", "P4"])
        .optional()
        .describe("Filter by priority"),
      assignee: z.string().optional().describe("Filter by assignee name"),
      limit: z.number().optional().describe("Max results (default: 20)"),
    },
    async ({ status, priority, assignee, limit = 20 }) => {
      try {
        const workspace = await getDefaultWorkspace();
        let sql = `
          SELECT ci.id, ci.identifier, ci.title, ci.priority, cs.name as status_name, ca.name as assignee_name
          FROM dispatch_issue ci
          LEFT JOIN dispatch_status cs ON ci.status_id = cs.id
          LEFT JOIN dispatch_agent ca ON ci.assignee_id = ca.id
          WHERE ci.workspace_id = $1
        `;
        const params: unknown[] = [workspace.id];
        let idx = 2;

        if (status) {
          sql += ` AND LOWER(cs.name) LIKE LOWER($${idx})`;
          params.push(`%${status}%`);
          idx++;
        }
        if (priority) {
          sql += ` AND ci.priority = $${idx}`;
          params.push(priority);
          idx++;
        }
        if (assignee) {
          sql += ` AND LOWER(ca.name) LIKE LOWER($${idx})`;
          params.push(`%${assignee}%`);
          idx++;
        }

        sql += ` ORDER BY ci.created_at DESC LIMIT $${idx}`;
        params.push(Math.min(limit, 100));

        const issues = await db.query(sql, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: issues.length, issues }, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: Get Issue Details
  server.tool(
    "get_issue",
    "Get full details of a specific issue.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
    },
    async ({ identifier }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(issue, null, 2) },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 4: Create Issue
  server.tool(
    "create_issue",
    "Create a new issue. Optionally link to a Slack channel and user for customer tracking.",
    {
      title: z.string().describe("Issue title"),
      description: z.string().optional().describe("Issue description"),
      priority: z
        .enum(["P1", "P2", "P3", "P4"])
        .optional()
        .describe("Priority (default: P3)"),
      assignee: z.string().optional().describe("Assignee agent name"),
      // Slack/Customer fields
      slackChannelId: z
        .string()
        .optional()
        .describe(
          "Slack channel ID (e.g., C12345678) - auto-creates customer if not exists"
        ),
      slackChannelName: z
        .string()
        .optional()
        .describe("Slack channel name for display purposes"),
      slackUserId: z
        .string()
        .optional()
        .describe("Slack user ID who reported the issue (e.g., U12345678)"),
      slackDisplayName: z
        .string()
        .optional()
        .describe("Slack display name of reporter"),
      slackAvatarUrl: z
        .string()
        .optional()
        .describe("Slack profile picture URL of reporter"),
      userEmail: z
        .string()
        .optional()
        .describe("Email of reporter for notifications"),
      slackThreadTs: z
        .string()
        .optional()
        .describe("Slack thread timestamp for reply notifications"),
    },
    async ({
      title,
      description,
      priority,
      assignee,
      slackChannelId,
      slackChannelName,
      slackUserId,
      slackDisplayName,
      slackAvatarUrl,
      userEmail,
      slackThreadTs,
    }) => {
      try {
        const workspace = await getDefaultWorkspace();

        // Get or create customer from Slack channel
        let customerId: string | null = null;
        let reporterId: string | null = null;

        if (slackChannelId) {
          const customer = await getOrCreateCustomerBySlackChannel(
            workspace.id,
            slackChannelId,
            slackChannelName
          );
          customerId = customer.id;

          // Create customer user if Slack user info provided
          if (slackUserId && slackDisplayName) {
            const user = await getOrCreateCustomerUser({
              customerId: customer.id,
              slackUserId,
              slackDisplayName,
              slackAvatarUrl,
              email: userEmail,
            });
            reporterId = user.id;
          }
        }

        const issue = await createIssue(workspace.id, {
          title,
          description,
          priority: priority as Priority,
          assigneeName: assignee,
          customerId,
          reporterId,
          slackChannelId,
          slackThreadTs,
        });

        // Automatically add customer as watcher
        if (customerId) {
          await addWatcher(issue.id, customerId);
        }

        // Build portal URL for the customer to view the issue
        let portalUrl: string | null = null;
        if (slackChannelId) {
          const customer = await getCustomerBySlackChannel(slackChannelId);
          if (customer) {
            const baseUrl =
              process.env.NEXT_PUBLIC_APP_URL || "";
            portalUrl = buildPortalUrl(
              baseUrl,
              customer.slug,
              customer.portalToken,
              issue.identifier
            );
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  identifier: issue.identifier,
                  title: issue.title,
                  customerId,
                  reporterId,
                  portalUrl,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 5: Update Issue
  server.tool(
    "update_issue",
    "Update an existing issue.",
    {
      identifier: z.string().describe("Issue identifier"),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional().describe("Status name"),
      priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
      assignee: z
        .string()
        .optional()
        .describe("Assignee name (empty to unassign)"),
    },
    async ({ identifier, title, description, status, priority, assignee }) => {
      try {
        // Get status ID if provided
        let statusId: string | undefined;
        if (status) {
          const statusRecord = await db.queryOne<Status>(
            `SELECT id FROM dispatch_status WHERE LOWER(name) LIKE LOWER($1)`,
            [`%${status}%`]
          );
          statusId = statusRecord?.id;
        }

        const issue = await updateIssue(identifier.toUpperCase(), {
          title,
          description,
          statusId,
          priority: priority as Priority,
          assigneeName: assignee,
        });

        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, identifier: issue.identifier },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 6: Assign to Me
  server.tool(
    "assign_to_me",
    "Assign an issue to yourself.",
    {
      identifier: z.string().describe("Issue identifier"),
      agentName: z.string().describe("Your agent name"),
    },
    async ({ identifier, agentName }) => {
      try {
        const issue = await updateIssue(identifier.toUpperCase(), {
          assigneeName: agentName,
        });
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  identifier: issue.identifier,
                  assignedTo: agentName,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 7: Post Activity
  server.tool(
    "post_activity",
    "Post an activity update that streams to the UI.",
    {
      identifier: z.string().describe("Issue identifier"),
      type: z
        .enum([
          "thought",
          "action",
          "observation",
          "tool_call",
          "file_read",
          "file_write",
          "search",
          "complete",
          "error",
        ])
        .describe("Activity type"),
      content: z.string().describe("Activity description"),
      tool: z.string().optional().describe("Tool name (for tool_call)"),
      file: z.string().optional().describe("File path (for file_read/write)"),
    },
    async ({ identifier, type, content, tool, file }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        const metadata: Record<string, unknown> = {};
        if (tool) metadata.tool = tool;
        if (file) metadata.file = file;

        const activity = await createAgentActivity(
          issue.id,
          type as AgentActivityType,
          content,
          Object.keys(metadata).length > 0 ? metadata : undefined
        );

        // Broadcast to all connected SSE clients
        const activityData = {
          id: activity.id,
          timestamp: activity.created_at.toISOString(),
          type: activity.type,
          content: activity.content,
          metadata: activity.metadata,
        };
        broadcastActivity(issue.id, { type: "activity", data: activityData });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, activityId: activity.id, type },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 8: Update Agent Status
  server.tool(
    "update_agent_status",
    "Update the agent execution status.",
    {
      identifier: z.string().describe("Issue identifier"),
      status: z
        .enum([
          "idle",
          "investigating",
          "implementing",
          "blocked",
          "awaiting_review",
        ])
        .describe("Agent status"),
      phase: z.string().optional().describe("Current phase"),
      summary: z.string().optional().describe("Work summary"),
      prUrl: z.string().optional().describe("PR URL"),
      error: z.string().optional().describe("Error message if blocked"),
    },
    async ({ identifier, status, phase, summary, prUrl, error }) => {
      try {
        const agentOutput: Record<string, unknown> = {};
        if (phase) agentOutput.phase = phase;
        if (summary) agentOutput.summary = summary;
        if (prUrl) agentOutput.pr_url = prUrl;
        if (error) agentOutput.error = error;

        const issue = await updateIssue(identifier.toUpperCase(), {
          agent_status: status as AgentStatus,
          agent_output:
            Object.keys(agentOutput).length > 0 ? agentOutput : undefined,
        });

        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  identifier: issue.identifier,
                  agentStatus: status,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 9: Register Webhook
  server.tool(
    "register_webhook",
    "Register a webhook URL to receive notifications when issues are assigned.",
    {
      webhookUrl: z.string().url().describe("Public webhook URL"),
      agentName: z.string().describe("Your agent name"),
    },
    async ({ webhookUrl, agentName }) => {
      try {
        const workspace = await getDefaultWorkspace();
        const agent = await getOrCreateAgent(workspace.id, agentName);

        const crypto = await import("crypto");
        const secret = crypto.randomBytes(32).toString("hex");

        await db.query(
          `UPDATE dispatch_agent SET webhook_url = $1, webhook_secret = $2, updated_at = NOW() WHERE id = $3`,
          [webhookUrl, secret, agent.id]
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  agentName,
                  webhookUrl,
                  message:
                    "Webhook registered. You'll receive POST requests when issues are assigned.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 10: Poll Events
  server.tool(
    "poll_events",
    "Poll for pending webhook events.",
    {},
    async () => {
      const events = [...webhookEventQueue];
      webhookEventQueue.length = 0;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { eventCount: events.length, events },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 11: Get My Issues
  server.tool(
    "get_my_issues",
    "Get all issues assigned to you.",
    {
      agentName: z.string().describe("Your agent name"),
    },
    async ({ agentName }) => {
      try {
        const workspace = await getDefaultWorkspace();
        const agent = await db.queryOne<Agent>(
          `SELECT * FROM dispatch_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
          [workspace.id, agentName]
        );

        if (!agent) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ agentName, issues: [] }, null, 2),
              },
            ],
          };
        }

        const issues = await db.query(
          `SELECT ci.identifier, ci.title, ci.priority, cs.name as status
           FROM dispatch_issue ci
           JOIN dispatch_status cs ON ci.status_id = cs.id
           WHERE ci.assignee_id = $1 AND cs.is_closed = false
           ORDER BY ci.priority, ci.created_at`,
          [agent.id]
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { agentName, issueCount: issues.length, issues },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 12: Add Comment
  server.tool(
    "add_comment",
    "Add a comment to an issue.",
    {
      identifier: z.string().describe("Issue identifier"),
      content: z.string().describe("Comment content"),
      authorName: z.string().describe("Your name"),
    },
    async ({ identifier, content, authorName }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        const workspace = await getDefaultWorkspace();
        const agent = await getOrCreateAgent(workspace.id, authorName);

        await db.query(
          `INSERT INTO dispatch_comment (id, issue_id, author_id, body, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [randomUUID(), issue.id, agent.id, content]
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, identifier: issue.identifier },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 13: Add Watcher
  server.tool(
    "add_watcher",
    "Add a customer as a watcher to an issue. Use this when deduplicating issues - if a customer reports an issue that already exists, add them as a watcher.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
      slackChannelId: z
        .string()
        .describe("Slack channel ID of the customer to add as watcher"),
      slackChannelName: z
        .string()
        .optional()
        .describe("Slack channel name for display purposes"),
    },
    async ({ identifier, slackChannelId, slackChannelName }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        // Get customer by Slack channel (must already exist for this operation)
        let customer = await getCustomerBySlackChannel(slackChannelId);
        if (!customer) {
          // Auto-create if doesn't exist
          const workspace = await getDefaultWorkspace();
          customer = await getOrCreateCustomerBySlackChannel(
            workspace.id,
            slackChannelId,
            slackChannelName
          );
        }

        await addWatcher(issue.id, customer.id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  identifier: issue.identifier,
                  customerAdded: customer.name,
                  customerId: customer.id,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 14: List Watchers
  server.tool(
    "list_watchers",
    "List all customers watching an issue.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
    },
    async ({ identifier }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        const { getWatchingCustomers } = await import(
          "../services/watcherService"
        );
        const watchers = await getWatchingCustomers(issue.id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  identifier: issue.identifier,
                  watcherCount: watchers.length,
                  watchers: watchers.map((w) => ({
                    name: w.name,
                    slackChannelId: w.slackChannelId,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 15: Get Portal URL
  server.tool(
    "get_portal_url",
    "Get the portal URL for a customer to view an issue. Returns a shareable link with rich OG previews.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
      slackChannelId: z.string().describe("Slack channel ID of the customer"),
    },
    async ({ identifier, slackChannelId }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        const customer = await getCustomerBySlackChannel(slackChannelId);
        if (!customer) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No customer found for Slack channel ${slackChannelId}`,
              },
            ],
            isError: true,
          };
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "";
        const portalUrl = buildPortalUrl(
          baseUrl,
          customer.slug,
          customer.portalToken,
          issue.identifier
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  identifier: issue.identifier,
                  title: issue.title,
                  customerName: customer.name,
                  portalUrl,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 16: Post Plan
  server.tool(
    "post_plan",
    "Post a structured implementation plan for human review. Sets the issue status to awaiting_review. The plan should include: Summary, Files to Create/Modify, DB Changes, API Changes, UI Changes, Dependencies, Testing Strategy, Risks, Stop Conditions.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
      content: z
        .string()
        .describe("Full plan content in markdown format"),
    },
    async ({ identifier, content }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        await updateIssue(issue.id, {
          plan_status: "awaiting_review",
          plan_content: content,
          agent_status: "awaiting_review",
        });

        // Post activity
        const activity = await createAgentActivity(
          issue.id,
          "complete",
          "Plan submitted for review"
        );
        broadcastActivity(issue.id, {
          type: "activity",
          data: {
            id: activity.id,
            timestamp: activity.created_at.toISOString(),
            type: activity.type,
            content: activity.content,
            metadata: activity.metadata,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  identifier: issue.identifier,
                  plan_status: "awaiting_review",
                  message:
                    "Plan posted. Waiting for human review. Do NOT proceed with implementation until the plan is approved.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 17: Report Blocker
  server.tool(
    "report_blocker",
    "Report that you are blocked and cannot proceed. This is the correct action when you encounter an obstacle you cannot resolve. Working around blockers instead of reporting them is a FAILURE.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
      reason: z
        .string()
        .describe("Detailed description of what is blocking you"),
      category: z
        .enum([
          "missing_env",
          "unclear_requirement",
          "missing_dependency",
          "test_failure",
          "design_decision",
          "out_of_scope",
        ])
        .describe("Category of the blocker"),
    },
    async ({ identifier, reason, category }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        await updateIssue(issue.id, {
          agent_status: "blocked",
          blocked_reason: `[${category}] ${reason}`,
        });

        // Post activity
        const activity = await createAgentActivity(
          issue.id,
          "error",
          `Blocked: [${category}] ${reason}`
        );
        broadcastActivity(issue.id, {
          type: "activity",
          data: {
            id: activity.id,
            timestamp: activity.created_at.toISOString(),
            type: activity.type,
            content: activity.content,
            metadata: activity.metadata,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  identifier: issue.identifier,
                  agent_status: "blocked",
                  category,
                  message:
                    "Blocker reported. A human will review and unblock you. You should STOP working now.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 18: Get Approved Plan
  server.tool(
    "get_approved_plan",
    "Retrieve the approved plan for an issue. Use this at the start of an implementation session to get the plan you should follow.",
    {
      identifier: z.string().describe("Issue identifier (e.g., DISPATCH-123)"),
    },
    async ({ identifier }) => {
      try {
        const issue = await getIssue(identifier.toUpperCase());
        if (!issue) {
          return {
            content: [
              { type: "text" as const, text: `Issue ${identifier} not found` },
            ],
            isError: true,
          };
        }

        if (issue.plan_status !== "approved") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Plan not approved",
                    current_status: issue.plan_status,
                    message:
                      issue.plan_status === "awaiting_review"
                        ? "Plan is awaiting human review. Do not proceed."
                        : "No approved plan exists for this issue.",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  identifier: issue.identifier,
                  title: issue.title,
                  plan_status: issue.plan_status,
                  plan_content: issue.plan_content,
                  plan_approved_at: issue.plan_approved_at,
                  plan_approved_by: issue.plan_approved_by,
                  plan_feedback: issue.plan_feedback,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Singleton server instance
let mcpServer: McpServer | null = null;

export function getMcpServer(): McpServer {
  if (!mcpServer) {
    mcpServer = createMcpServer();
  }
  return mcpServer;
}
