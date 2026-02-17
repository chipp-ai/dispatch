/**
 * Orchestrator Tools
 *
 * 20 tools for the Dispatch orchestrator:
 * - 10 mission tools (dispatch_*, get_*, search_*, list_*, update_*) for agent orchestration
 * - 6 Loki tools (loki_*) for production log analytics
 * - 4 database tools (chipp_db_*) for product database queries
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  createIssue,
  updateIssue,
  searchIssuesSemantic,
  getIssue,
  getIssueForBoard,
} from "./issueService";
import type { Priority } from "./issueService";
import {
  canSpawn,
  dispatchWorkflow,
  recordSpawn,
} from "./spawnService";
import { broadcastBoardEvent } from "./boardBroadcast";
import { getOrCreateDefaultWorkspace } from "./workspaceService";
import { db } from "../db";
import { lokiTools, executeLokiTool } from "./analyticsLokiTools";
import { dbTools, executeDbTool } from "./analyticsDbTools";

type Tool = Anthropic.Tool;

// --- Tool Definitions ---

export const tools: Tool[] = [
  // --- Analytics Tools ---
  ...lokiTools,
  ...dbTools,

  // --- Mission Tools ---
  {
    name: "dispatch_investigation",
    description:
      "Dispatch an investigation agent to explore the codebase and produce an implementation plan. Creates a mission and immediately spawns the agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Concise mission title describing what to investigate",
        },
        description: {
          type: "string",
          description:
            "Detailed description with context, goals, and any constraints",
        },
        priority: {
          type: "string",
          enum: ["P1", "P2", "P3", "P4"],
          description: "Priority: P1=critical, P2=high, P3=medium, P4=low",
        },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "dispatch_implementation",
    description:
      "Dispatch an implementation agent to execute an approved plan. The mission must have a plan (plan_status = 'approved' or plan_content exists).",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_identifier: {
          type: "string",
          description: "Mission identifier (e.g. DISPATCH-42)",
        },
      },
      required: ["mission_identifier"],
    },
  },
  {
    name: "dispatch_qa",
    description:
      "Dispatch a QA agent to test an implementation. The agent navigates the UI, tests endpoints, verifies database state, and writes a test report.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_identifier: {
          type: "string",
          description: "Mission identifier (e.g. DISPATCH-42)",
        },
        test_instructions: {
          type: "string",
          description:
            "Specific test instructions or scenarios to cover (optional)",
        },
      },
      required: ["mission_identifier"],
    },
  },
  {
    name: "dispatch_research",
    description:
      "Dispatch a deep research agent to search the internet and codebase, producing a comprehensive report. Creates a mission and immediately spawns the agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "Research topic",
        },
        description: {
          type: "string",
          description:
            "What to research, what questions to answer, what context is needed",
        },
      },
      required: ["topic", "description"],
    },
  },
  {
    name: "dispatch_triage",
    description:
      "Dispatch a lightweight triage agent to evaluate a backlog item. The agent investigates the issue and makes one of three decisions: close it (stale/fixed/duplicate), fix it (simple <50 line fix), or escalate it (complex, needs a full plan). Use this for bulk backlog grooming.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_identifier: {
          type: "string",
          description: "Mission identifier (e.g. DISPATCH-42)",
        },
      },
      required: ["mission_identifier"],
    },
  },
  {
    name: "get_fleet_status",
    description:
      "Get fleet dashboard: running agents, recent completions, daily cost, budget usage. Use this to understand current state before dispatching.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_mission",
    description:
      "Get full details for a mission including agent status, plan (truncated), activity, cost, and PR URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_identifier: {
          type: "string",
          description: "Mission identifier (e.g. DISPATCH-42) or UUID",
        },
      },
      required: ["mission_identifier"],
    },
  },
  {
    name: "search_missions",
    description:
      "Semantic search across all missions. Returns the most relevant matches with similarity scores. Always search before dispatching to avoid duplicate work.",
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
    name: "list_missions",
    description:
      "List missions with optional filters. Use this to browse the board by column (status), priority, or assignee. Supports filtering by status name (e.g. 'Backlog', 'Investigating', 'Needs Review', 'In Progress', 'In Review', 'Done', 'Canceled').",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description:
            "Filter by board column/status name (e.g. 'Backlog', 'Investigating', 'Needs Review', 'In Progress', 'In Review', 'Done', 'Canceled')",
        },
        priority: {
          type: "string",
          enum: ["P1", "P2", "P3", "P4"],
          description: "Filter by priority",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 50, max 500)",
        },
      },
      required: [],
    },
  },
  {
    name: "update_mission",
    description:
      "Update an existing mission. Use this to change status (move between board columns), update priority, close duplicates, or edit title/description.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_identifier: {
          type: "string",
          description: "Mission identifier (e.g. DISPATCH-42)",
        },
        status: {
          type: "string",
          description:
            "New status/column name (e.g. 'Backlog', 'Investigating', 'Needs Review', 'In Progress', 'In Review', 'Done', 'Canceled')",
        },
        priority: {
          type: "string",
          enum: ["P1", "P2", "P3", "P4"],
          description: "New priority",
        },
        title: {
          type: "string",
          description: "New title",
        },
        description: {
          type: "string",
          description: "New description",
        },
      },
      required: ["mission_identifier"],
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
    // Route analytics tools by prefix
    if (name.startsWith("loki_")) {
      return await executeLokiTool(name, input);
    }
    if (name.startsWith("chipp_db_")) {
      return await executeDbTool(name, input);
    }

    switch (name) {
      case "dispatch_investigation":
        return await executeDispatchInvestigation(input);
      case "dispatch_implementation":
        return await executeDispatchImplementation(input);
      case "dispatch_qa":
        return await executeDispatchQA(input);
      case "dispatch_research":
        return await executeDispatchResearch(input);
      case "dispatch_triage":
        return await executeDispatchTriage(input);
      case "get_fleet_status":
        return await executeGetFleetStatus();
      case "get_mission":
        return await executeGetMission(input);
      case "search_missions":
        return await executeSearchMissions(input);
      case "list_missions":
        return await executeListMissions(input);
      case "update_mission":
        return await executeUpdateMission(input);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

// --- Dispatch Tools ---

async function executeDispatchInvestigation(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const title = input.title as string;
  const description = input.description as string;
  const priority = (input.priority as Priority) || "P3";

  // Create the mission
  const issue = await createIssue(workspace.id, {
    title,
    description,
    priority,
    labelIds: [],
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

  // Check spawn gate
  const allowed = await canSpawn("prd_investigate");
  if (!allowed) {
    return JSON.stringify({
      mission_id: issue.id,
      identifier: issue.identifier,
      created: true,
      dispatched: false,
      reason: "Spawn not allowed -- concurrency limit or daily budget exhausted. Mission created but agent not dispatched.",
    });
  }

  // Dispatch the agent
  const dispatchId = await dispatchWorkflow(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
    },
    "prd_investigate"
  );

  await recordSpawn(issue.id, dispatchId, "investigate");

  // Broadcast status change
  const updatedBoardIssue = await getIssueForBoard(issue.identifier);
  if (updatedBoardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: updatedBoardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    mission_id: issue.id,
    identifier: issue.identifier,
    dispatch_id: dispatchId,
    dispatched: true,
  });
}

async function executeDispatchImplementation(input: ToolInput): Promise<string> {
  const identifier = input.mission_identifier as string;

  const issue = await getIssue(identifier);
  if (!issue) {
    return JSON.stringify({ error: `Mission ${identifier} not found` });
  }

  // Validate plan exists
  if (!issue.plan_content) {
    return JSON.stringify({
      error: `Mission ${identifier} has no plan. Dispatch an investigation first, then approve the plan.`,
    });
  }

  const allowed = await canSpawn("prd_implement");
  if (!allowed) {
    return JSON.stringify({
      error: "Spawn not allowed -- concurrency limit or daily budget exhausted",
      suggestion: "Check get_fleet_status for current agent/budget info",
    });
  }

  const dispatchId = await dispatchWorkflow(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      plan_content: issue.plan_content,
    },
    "prd_implement"
  );

  await recordSpawn(issue.id, dispatchId, "implement");

  const boardIssue = await getIssueForBoard(issue.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    dispatched: true,
    identifier: issue.identifier,
    dispatch_id: dispatchId,
  });
}

async function executeDispatchQA(input: ToolInput): Promise<string> {
  const identifier = input.mission_identifier as string;
  const testInstructions = (input.test_instructions as string) || null;

  const issue = await getIssue(identifier);
  if (!issue) {
    return JSON.stringify({ error: `Mission ${identifier} not found` });
  }

  const allowed = await canSpawn("qa");
  if (!allowed) {
    return JSON.stringify({
      error: "Spawn not allowed -- concurrency limit or daily budget exhausted",
      suggestion: "Check get_fleet_status for current agent/budget info",
    });
  }

  const dispatchId = await dispatchWorkflow(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      plan_content: issue.plan_content,
      test_instructions: testInstructions,
    },
    "qa"
  );

  await recordSpawn(issue.id, dispatchId, "qa");

  const boardIssue = await getIssueForBoard(issue.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    dispatched: true,
    identifier: issue.identifier,
    dispatch_id: dispatchId,
  });
}

async function executeDispatchResearch(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const topic = input.topic as string;
  const description = input.description as string;

  // Create the mission
  const issue = await createIssue(workspace.id, {
    title: topic,
    description,
    priority: "P3",
    labelIds: [],
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

  // Check spawn gate
  const allowed = await canSpawn("deep_research");
  if (!allowed) {
    return JSON.stringify({
      mission_id: issue.id,
      identifier: issue.identifier,
      created: true,
      dispatched: false,
      reason: "Spawn not allowed -- concurrency limit or daily budget exhausted. Mission created but agent not dispatched.",
    });
  }

  // Dispatch the agent
  const dispatchId = await dispatchWorkflow(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
    },
    "deep_research"
  );

  await recordSpawn(issue.id, dispatchId, "research");

  const updatedBoardIssue = await getIssueForBoard(issue.identifier);
  if (updatedBoardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: updatedBoardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    mission_id: issue.id,
    identifier: issue.identifier,
    dispatch_id: dispatchId,
    dispatched: true,
  });
}

async function executeDispatchTriage(input: ToolInput): Promise<string> {
  const identifier = input.mission_identifier as string;

  const issue = await getIssue(identifier);
  if (!issue) {
    return JSON.stringify({ error: `Mission ${identifier} not found` });
  }

  // Guard: don't triage closed issues
  const statusName = issue.status.name.toLowerCase();
  if (statusName === "done" || statusName === "canceled") {
    return JSON.stringify({
      error: `Mission ${identifier} is already ${issue.status.name}. Nothing to triage.`,
    });
  }

  // Guard: don't triage issues with an agent already running
  if (issue.spawn_status === "running") {
    return JSON.stringify({
      error: `Mission ${identifier} already has an agent running (${issue.agent_status}). Wait for it to complete.`,
    });
  }

  const allowed = await canSpawn("auto_triage");
  if (!allowed) {
    return JSON.stringify({
      error: "Spawn not allowed -- concurrency limit or daily budget exhausted",
      suggestion: "Check get_fleet_status for current agent/budget info",
    });
  }

  const dispatchId = await dispatchWorkflow(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
    },
    "auto_triage"
  );

  await recordSpawn(issue.id, dispatchId, "triage");

  const boardIssue = await getIssueForBoard(issue.identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    dispatched: true,
    identifier: issue.identifier,
    dispatch_id: dispatchId,
    message: `Triage agent dispatched for ${issue.identifier}. It will investigate and decide: close, fix, or escalate.`,
  });
}

// --- Query Tools ---

async function executeGetFleetStatus(): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();

  // Running agents with details
  const runningAgents = await db.query<{
    identifier: string;
    title: string;
    agent_status: string;
    spawn_type: string;
    spawn_started_at: string;
  }>(
    `SELECT identifier, title, agent_status, spawn_type, spawn_started_at
     FROM dispatch_issue
     WHERE workspace_id = $1 AND spawn_status = 'running'
     ORDER BY spawn_started_at DESC`,
    [workspace.id]
  );

  // Recent completions (last 24h)
  const recentCompletions = await db.query<{
    identifier: string;
    title: string;
    run_outcome: string;
    cost_usd: string;
    spawn_completed_at: string;
  }>(
    `SELECT identifier, title, run_outcome, COALESCE(cost_usd, 0) as cost_usd, spawn_completed_at
     FROM dispatch_issue
     WHERE workspace_id = $1
       AND spawn_status = 'completed'
       AND spawn_completed_at >= NOW() - INTERVAL '24 hours'
     ORDER BY spawn_completed_at DESC
     LIMIT 5`,
    [workspace.id]
  );

  // Daily cost (from agent runs for accurate per-run accounting)
  const costResult = await db.queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(ar.cost_usd), 0) as total
     FROM dispatch_agent_runs ar
     JOIN dispatch_issue i ON ar.issue_id = i.id
     WHERE i.workspace_id = $1
       AND ar.started_at >= CURRENT_DATE`,
    [workspace.id]
  );
  const dailyCost = parseFloat(costResult?.total || "0");

  // Budget usage
  const budgetResult = await db.queryOne<{ spawn_count: number; max_spawns: number }>(
    `SELECT spawn_count, max_spawns FROM dispatch_spawn_budget
     WHERE date = CURRENT_DATE AND spawn_type = 'prd'`
  );

  // Total missions
  const totalResult = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM dispatch_issue WHERE workspace_id = $1`,
    [workspace.id]
  );

  return JSON.stringify({
    running_agents: runningAgents.map((a) => ({
      identifier: a.identifier,
      title: a.title,
      status: a.agent_status,
      type: a.spawn_type,
      started: a.spawn_started_at,
    })),
    recent_completions: recentCompletions.map((c) => ({
      identifier: c.identifier,
      title: c.title,
      outcome: c.run_outcome,
      cost: `$${parseFloat(c.cost_usd).toFixed(2)}`,
    })),
    active_agent_count: runningAgents.length,
    total_missions: parseInt(totalResult?.count || "0", 10),
    daily_cost_usd: `$${dailyCost.toFixed(2)}`,
    daily_spawns: budgetResult
      ? `${budgetResult.spawn_count}/${budgetResult.max_spawns}`
      : "0/1000",
  });
}

async function executeSearchMissions(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const query = input.query as string;
  const limit = (input.limit as number) || 5;

  const results = await searchIssuesSemantic(workspace.id, query, limit);

  if (results.length === 0) {
    return JSON.stringify({ results: [], message: "No matching missions found." });
  }

  return JSON.stringify({
    results: results.map((r) => ({
      identifier: r.identifier,
      title: r.title,
      similarity: parseFloat(Number(r.similarity).toFixed(3)),
    })),
  });
}

async function executeListMissions(input: ToolInput): Promise<string> {
  const workspace = await getOrCreateDefaultWorkspace();
  const status = input.status as string | undefined;
  const priority = input.priority as string | undefined;
  const limit = (input.limit as number) || 50;

  let sql = `
    SELECT ci.identifier, ci.title, ci.priority, cs.name as status_name, ca.name as assignee_name
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

  sql += ` ORDER BY ci.priority, ci.created_at DESC LIMIT $${idx}`;
  params.push(Math.min(limit, 500));

  const issues = await db.query<{
    identifier: string;
    title: string;
    priority: string;
    status_name: string;
    assignee_name: string | null;
  }>(sql, params);

  return JSON.stringify({
    count: issues.length,
    filter: { status: status || "all", priority: priority || "all" },
    missions: issues.map((i) => ({
      identifier: i.identifier,
      title: i.title,
      priority: i.priority,
      status: i.status_name,
      assignee: i.assignee_name,
    })),
  });
}

async function executeUpdateMission(input: ToolInput): Promise<string> {
  const identifier = input.mission_identifier as string;
  const issue = await getIssue(identifier);
  if (!issue) {
    return JSON.stringify({ error: `Mission ${identifier} not found` });
  }

  // Resolve status name to ID if provided
  let statusId: string | undefined;
  if (input.status) {
    const statusResult = await db.queryOne<{ id: string }>(
      `SELECT id FROM dispatch_status WHERE LOWER(name) LIKE LOWER($1)`,
      [`%${input.status}%`]
    );
    if (!statusResult) {
      return JSON.stringify({
        error: `Status "${input.status}" not found. Valid statuses: Backlog, Investigating, Needs Review, In Progress, In Review, Done, Canceled`,
      });
    }
    statusId = statusResult.id;
  }

  const updateInput: Parameters<typeof updateIssue>[1] = {};
  if (input.title) updateInput.title = input.title as string;
  if (input.description !== undefined) updateInput.description = input.description as string;
  if (statusId) updateInput.statusId = statusId;
  if (input.priority) updateInput.priority = input.priority as Priority;

  const updated = await updateIssue(identifier, updateInput);

  if (!updated) {
    return JSON.stringify({ error: `Failed to update mission ${identifier}` });
  }

  // Broadcast board update
  const boardIssue = await getIssueForBoard(identifier);
  if (boardIssue) {
    broadcastBoardEvent({
      type: "issue_updated",
      issue: boardIssue,
      timestamp: new Date().toISOString(),
    });
  }

  return JSON.stringify({
    success: true,
    identifier: updated.identifier,
    title: updated.title,
    status: input.status || issue.status?.name,
    priority: updated.priority,
  });
}

async function executeGetMission(input: ToolInput): Promise<string> {
  const identifier = input.mission_identifier as string;
  const issue = await getIssue(identifier);

  if (!issue) {
    return JSON.stringify({ error: `Mission ${identifier} not found` });
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

