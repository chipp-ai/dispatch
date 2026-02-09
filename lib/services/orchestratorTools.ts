/**
 * Orchestrator Tools
 *
 * 7 tool definitions for the orchestrator agent, wrapping existing
 * Dispatch services. Each tool has a JSON Schema definition and an
 * executor function.
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  createIssue,
  searchIssuesSemantic,
  getIssue,
  updateIssue,
  getIssueForBoard,
} from "./issueService";
import type { CreateIssueInput, ChippPriority } from "./issueService";
import {
  getActiveSpawnCount,
  canSpawn,
  dispatchWorkflow,
  recordSpawn,
} from "./spawnService";
import type { WorkflowType } from "./spawnService";
import { broadcastBoardEvent } from "./boardBroadcast";
import { getOrCreateDefaultWorkspace, getStatuses } from "./workspaceService";
import { db } from "../db";

type Tool = Anthropic.Tool;

// --- Tool Definitions ---

export const tools: Tool[] = [
  {
    name: "get_board_status",
    description:
      "Get a summary of the issue board: counts by status, active agents, daily spawn budget usage. Use this to understand current state before taking action.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_issues",
    description:
      "Semantic search across all issues using embeddings. Returns the most relevant matches with similarity scores. Use before creating issues to check for duplicates.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_issue",
    description:
      "Create a single issue on the board. Returns the created issue with its identifier (e.g. CHIPP-42). The issue will appear on the Kanban board in real-time.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Concise issue title",
        },
        description: {
          type: "string",
          description:
            "Detailed description with context, acceptance criteria, and technical notes",
        },
        priority: {
          type: "string",
          enum: ["P1", "P2", "P3", "P4"],
          description: "Priority: P1=critical, P2=high, P3=medium, P4=low",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Label names to attach (will be matched case-insensitively)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "create_issues_batch",
    description:
      "Create multiple issues at once. Use for feature decomposition — creates all issues atomically. Each issue appears on the board in real-time.",
    input_schema: {
      type: "object" as const,
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: {
                type: "string",
                enum: ["P1", "P2", "P3", "P4"],
              },
              labels: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["title"],
          },
          description: "Array of issues to create",
        },
      },
      required: ["issues"],
    },
  },
  {
    name: "spawn_agent",
    description:
      "Spawn an autonomous Claude Code agent to investigate or implement an issue via GitHub Actions. The agent will work asynchronously and update the issue with findings.",
    input_schema: {
      type: "object" as const,
      properties: {
        issue_identifier: {
          type: "string",
          description: "Issue identifier (e.g. CHIPP-42)",
        },
        workflow_type: {
          type: "string",
          enum: ["error_fix", "prd_investigate", "prd_implement"],
          description:
            "Type of work: error_fix (auto-fix errors), prd_investigate (research & plan), prd_implement (execute an approved plan)",
        },
      },
      required: ["issue_identifier"],
    },
  },
  {
    name: "get_issue_details",
    description:
      "Get full details for an issue including status, agent activity, plan content, and cost. Use to check on progress or understand context.",
    input_schema: {
      type: "object" as const,
      properties: {
        issue_identifier: {
          type: "string",
          description: "Issue identifier (e.g. CHIPP-42) or UUID",
        },
      },
      required: ["issue_identifier"],
    },
  },
  {
    name: "update_issue",
    description:
      "Update an existing issue's fields: status, priority, title, description, or labels. Changes are reflected on the Kanban board in real-time.",
    input_schema: {
      type: "object" as const,
      properties: {
        issue_identifier: {
          type: "string",
          description: "Issue identifier (e.g. CHIPP-42) or UUID",
        },
        title: { type: "string" },
        description: { type: "string" },
        priority: {
          type: "string",
          enum: ["P1", "P2", "P3", "P4"],
        },
        status: {
          type: "string",
          description:
            'Status name to move to (e.g. "Backlog", "In Progress", "Done")',
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Label names (replaces existing labels)",
        },
      },
      required: ["issue_identifier"],
    },
  },
];

// --- Tool Executors ---

interface ToolInput {
  [key: string]: unknown;
}

export async function executeTool(
  name: string,
  input: ToolInput
): Promise<string> {
  try {
    switch (name) {
      case "get_board_status":
        return await executeGetBoardStatus();
      case "search_issues":
        return await executeSearchIssues(input);
      case "create_issue":
        return await executeCreateIssue(input);
      case "create_issues_batch":
        return await executeCreateIssuesBatch(input);
      case "spawn_agent":
        return await executeSpawnAgent(input);
      case "get_issue_details":
        return await executeGetIssueDetails(input);
      case "update_issue":
        return await executeUpdateIssue(input);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

async function executeGetBoardStatus(): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const statuses = await getStatuses(workspace.id);

  // Count issues per status
  const counts = await db.query<{
    status_id: string;
    count: string;
  }>(
    `SELECT status_id, COUNT(*) as count
     FROM chipp_issue WHERE workspace_id = $1
     GROUP BY status_id`,
    [workspace.id]
  );

  const statusCounts = statuses.map((s) => ({
    name: s.name,
    count: parseInt(counts.find((c) => c.status_id === s.id)?.count || "0", 10),
  }));

  const totalIssues = statusCounts.reduce((sum, s) => sum + s.count, 0);

  // Active agents
  const activeAgents = await getActiveSpawnCount();

  // Daily cost
  const costResult = await db.queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total
     FROM chipp_issue
     WHERE workspace_id = $1
       AND spawn_started_at >= CURRENT_DATE`,
    [workspace.id]
  );
  const dailyCost = parseFloat(costResult?.total || "0");

  // Budget usage
  const budgetResult = await db.queryOne<{ spawn_count: number; max_spawns: number }>(
    `SELECT spawn_count, max_spawns FROM chipp_spawn_budget
     WHERE date = CURRENT_DATE AND spawn_type = 'error_fix'`
  );

  return JSON.stringify({
    total_issues: totalIssues,
    by_status: statusCounts,
    active_agents: activeAgents,
    daily_cost_usd: dailyCost.toFixed(2),
    daily_spawns: budgetResult
      ? `${budgetResult.spawn_count}/${budgetResult.max_spawns}`
      : "0/1000",
  });
}

async function executeSearchIssues(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const query = input.query as string;
  const limit = (input.limit as number) || 5;

  const results = await searchIssuesSemantic(workspace.id, query, limit);

  if (results.length === 0) {
    return JSON.stringify({ results: [], message: "No matching issues found." });
  }

  return JSON.stringify({
    results: results.map((r) => ({
      identifier: r.identifier,
      title: r.title,
      similarity: parseFloat(Number(r.similarity).toFixed(3)),
    })),
  });
}

async function executeCreateIssue(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();

  const labelIds = await resolveLabelIds(
    workspace.id,
    (input.labels as string[]) || []
  );

  const issue = await createIssue(workspace.id, {
    title: input.title as string,
    description: (input.description as string) || null,
    priority: (input.priority as ChippPriority) || "P3",
    labelIds,
  });

  // Broadcast to board
  const boardIssue = await getIssueForBoard(issue.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_created",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    created: true,
    identifier: issue.identifier,
    title: issue.title,
    priority: issue.priority,
  });
}

async function executeCreateIssuesBatch(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const issues = input.issues as Array<{
    title: string;
    description?: string;
    priority?: ChippPriority;
    labels?: string[];
  }>;

  const created: { identifier: string; title: string }[] = [];

  for (const issueInput of issues) {
    const labelIds = await resolveLabelIds(
      workspace.id,
      issueInput.labels || []
    );

    const issue = await createIssue(workspace.id, {
      title: issueInput.title,
      description: issueInput.description || null,
      priority: issueInput.priority || "P3",
      labelIds,
    });

    // Broadcast each to board
    const boardIssue = await getIssueForBoard(issue.identifier);
    if (boardIssue) {
      broadcastBoardEvent({
        type: "issue_created",
        issue: boardIssue,
        timestamp: new Date().toISOString(),
      });
    }

    created.push({ identifier: issue.identifier, title: issue.title });
  }

  return JSON.stringify({
    created: created.length,
    issues: created,
  });
}

async function executeSpawnAgent(input: ToolInput): Promise<string> {
  const identifier = input.issue_identifier as string;
  const workflowType = (input.workflow_type as WorkflowType) || "prd_investigate";

  const issue = await getIssue(identifier);
  if (!issue) {
    return JSON.stringify({ error: `Issue ${identifier} not found` });
  }

  const allowed = await canSpawn(workflowType);
  if (!allowed) {
    return JSON.stringify({
      error: "Spawn not allowed — concurrency limit or daily budget exhausted",
      suggestion: "Check get_board_status for current agent/budget info",
    });
  }

  const dispatchId = await dispatchWorkflow(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
    },
    workflowType
  );

  await recordSpawn(
    issue.id,
    dispatchId,
    workflowType === "error_fix"
      ? "error_fix"
      : workflowType === "prd_implement"
        ? "implement"
        : "investigate"
  );

  // Broadcast status change
  const boardIssue = await getIssueForBoard(issue.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    spawned: true,
    identifier: issue.identifier,
    workflow_type: workflowType,
    dispatch_id: dispatchId,
  });
}

async function executeGetIssueDetails(input: ToolInput): Promise<string> {
  const identifier = input.issue_identifier as string;
  const issue = await getIssue(identifier);

  if (!issue) {
    return JSON.stringify({ error: `Issue ${identifier} not found` });
  }

  return JSON.stringify({
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    status: issue.status.name,
    priority: issue.priority,
    agent_status: issue.agent_status,
    plan_status: issue.plan_status,
    plan_content: issue.plan_content
      ? issue.plan_content.slice(0, 2000)
      : null,
    spawn_status: issue.spawn_status,
    spawn_attempt_count: issue.spawn_attempt_count,
    cost_usd: issue.cost_usd,
    run_outcome: issue.run_outcome,
    outcome_summary: issue.outcome_summary,
    labels: issue.labels.map((l) => l.label.name),
    assignee: issue.assignee?.name || null,
    created_at: issue.created_at,
  });
}

async function executeUpdateIssue(input: ToolInput): Promise<string> {
  const identifier = input.issue_identifier as string;
  const workspace = await getOrCreateDefaultWorkspace();

  // Resolve status name to ID if provided
  let statusId: string | undefined;
  if (input.status) {
    const statuses = await getStatuses(workspace.id);
    const match = statuses.find(
      (s) => s.name.toLowerCase() === (input.status as string).toLowerCase()
    );
    if (match) {
      statusId = match.id;
    } else {
      return JSON.stringify({
        error: `Status "${input.status}" not found. Available: ${statuses.map((s) => s.name).join(", ")}`,
      });
    }
  }

  // Resolve label names to IDs
  let labelIds: string[] | undefined;
  if (input.labels) {
    labelIds = await resolveLabelIds(
      workspace.id,
      input.labels as string[]
    );
  }

  const previousIssue = await getIssue(identifier);
  const previousStatusId = previousIssue?.status_id;

  const updated = await updateIssue(identifier, {
    title: input.title as string | undefined,
    description: input.description as string | undefined,
    priority: input.priority as ChippPriority | undefined,
    statusId,
    labelIds,
  });

  if (!updated) {
    return JSON.stringify({ error: `Issue ${identifier} not found` });
  }

  // Broadcast update
  const boardIssue = await getIssueForBoard(updated.identifier);
  if (boardIssue) {
    const eventType =
      statusId && statusId !== previousStatusId
        ? "issue_moved"
        : "issue_updated";
    broadcastBoardEvent({
      type: eventType as "issue_moved" | "issue_updated",
      issue: boardIssue,
      previousStatusId: previousStatusId || undefined,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    updated: true,
    identifier: updated.identifier,
    title: updated.title,
    priority: updated.priority,
  });
}

// --- Helpers ---

async function resolveLabelIds(
  workspaceId: string,
  labelNames: string[]
): Promise<string[]> {
  if (labelNames.length === 0) return [];

  const labels = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM chipp_label WHERE workspace_id = $1`,
    [workspaceId]
  );

  return labelNames
    .map((name) =>
      labels.find((l) => l.name.toLowerCase() === name.toLowerCase())
    )
    .filter(Boolean)
    .map((l) => l!.id);
}
