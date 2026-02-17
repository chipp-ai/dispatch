import { db, PoolClient } from "../db";
import { v4 as uuidv4 } from "uuid";
import { generateEmbeddingForIssue, vectorToString } from "../utils/embeddings";
import { dispatchToAgent, buildWebhookPayload } from "./webhookService";
import {
  createHistoryEntry,
  recordStatusChange,
  type HistoryActorType,
} from "./issueHistoryService";

export type Priority = "P1" | "P2" | "P3" | "P4";
export type AgentStatus =
  | "idle"
  | "investigating"
  | "implementing"
  | "triaging"
  | "blocked"
  | "awaiting_review";

export interface AgentOutput {
  phase?: string;
  summary?: string;
  findings?: string[];
  recommendation?: string;
  pr_url?: string;
  error?: string;
}

export type WorkflowType = "error_fix" | "prd";
export type PlanStatus =
  | "investigating"
  | "posted"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "needs_revision";
export type SpawnType = "investigate" | "implement" | "error_fix" | "triage";
export type BlockerCategory =
  | "missing_env"
  | "unclear_requirement"
  | "missing_dependency"
  | "test_failure"
  | "design_decision"
  | "out_of_scope";

export interface Issue {
  id: string;
  identifier: string;
  issue_number: number;
  title: string;
  description: string | null;
  status_id: string;
  priority: Priority;
  assignee_id: string | null;
  workspace_id: string;
  created_at: Date;
  updated_at: Date;
  // Agent fields
  agent_status: AgentStatus;
  agent_output: AgentOutput | null;
  agent_confidence: number | null;
  agent_tokens_used: number | null;
  agent_started_at: Date | null;
  agent_completed_at: Date | null;
  // PRD workflow fields
  workflow_type: WorkflowType;
  plan_status: PlanStatus | null;
  plan_content: string | null;
  plan_feedback: string | null;
  plan_approved_at: Date | null;
  plan_approved_by: string | null;
  spawn_type: SpawnType | null;
  spawn_attempt_count: number;
  spawn_status: string | null;
  spawn_run_id: string | null;
  spawn_started_at: Date | null;
  spawn_completed_at: Date | null;
  blocked_reason: string | null;
  // Cost tracking
  cost_usd: number | null;
  model: string | null;
  num_turns: number | null;
  // Run outcome tracking
  run_outcome: string | null;
  outcome_summary: string | null;
}

export interface IssueWithRelations extends Issue {
  status: { id: string; name: string; color: string };
  assignee: { id: string; name: string } | null;
  labels: { label: { id: string; name: string; color: string } }[];
}

export interface CreateIssueInput {
  title: string;
  description?: string | null;
  statusId?: string;
  priority?: Priority;
  assigneeName?: string;
  labelIds?: string[];
  // Customer/Reporter fields
  customerId?: string | null;
  reporterId?: string | null;
  slackChannelId?: string | null;
  slackThreadTs?: string | null;
  // Audit trail
  actorType?: HistoryActorType;
  actorName?: string;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  statusId?: string;
  priority?: Priority;
  assigneeName?: string;
  labelIds?: string[];
  // Agent fields
  agent_status?: AgentStatus;
  agent_output?: AgentOutput | null;
  agent_confidence?: number | null;
  agent_tokens_used?: number | null;
  // PRD workflow fields
  workflow_type?: WorkflowType;
  plan_status?: PlanStatus | null;
  plan_content?: string | null;
  plan_feedback?: string | null;
  plan_approved_at?: Date | null;
  plan_approved_by?: string | null;
  spawn_type?: SpawnType | null;
  spawn_attempt_count?: number;
  spawn_status?: string | null;
  spawn_run_id?: string | null;
  blocked_reason?: string | null;
  // Cost tracking fields
  cost_usd?: string | number | null;
  model?: string | null;
  num_turns?: string | number | null;
  // Run outcome tracking
  run_outcome?: string | null;
  outcome_summary?: string | null;
  // Audit trail
  actorType?: HistoryActorType;
  actorName?: string;
}

export async function createIssue(
  workspaceId: string,
  input: CreateIssueInput
): Promise<Issue> {
  return db.transaction(async (client: PoolClient) => {
    // Get workspace and increment counter
    const workspaceResult = await client.query(
      `UPDATE dispatch_workspace
       SET next_issue_number = next_issue_number + 1
       WHERE id = $1
       RETURNING issue_prefix, next_issue_number - 1 as issue_number`,
      [workspaceId]
    );
    const { issue_prefix, issue_number } = workspaceResult.rows[0];
    const identifier = `${issue_prefix}-${issue_number}`;

    // Get default status if not provided
    let statusId = input.statusId;
    if (!statusId) {
      const statusResult = await client.query(
        `SELECT id FROM dispatch_status WHERE workspace_id = $1 ORDER BY position ASC LIMIT 1`,
        [workspaceId]
      );
      statusId = statusResult.rows[0]?.id;
    }

    // Get or create assignee
    let assigneeId: string | null = null;
    if (input.assigneeName) {
      const agentResult = await client.query(
        `SELECT id FROM dispatch_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
        [workspaceId, input.assigneeName]
      );
      if (agentResult.rows[0]) {
        assigneeId = agentResult.rows[0].id;
      } else {
        assigneeId = uuidv4();
        await client.query(
          `INSERT INTO dispatch_agent (id, workspace_id, name) VALUES ($1, $2, $3)`,
          [assigneeId, workspaceId, input.assigneeName]
        );
      }
    }

    // Generate embedding
    let embeddingStr: string | null = null;
    try {
      const embedding = await generateEmbeddingForIssue(
        input.title,
        input.description || null
      );
      embeddingStr = vectorToString(embedding.vector);
    } catch (e) {
      console.error("Failed to generate embedding:", e);
    }

    // Insert issue
    const issueId = uuidv4();
    const issueResult = await client.query(
      `INSERT INTO dispatch_issue (
        id, identifier, issue_number, title, description,
        status_id, priority, assignee_id, workspace_id,
        customer_id, reporter_id, slack_channel_id, slack_thread_ts,
        embedding, embedding_provider, embedding_model,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14::vector, $15, $16, NOW(), NOW()
      ) RETURNING *`,
      [
        issueId,
        identifier,
        issue_number,
        input.title,
        input.description || null,
        statusId,
        input.priority || "P3",
        assigneeId,
        workspaceId,
        input.customerId || null,
        input.reporterId || null,
        input.slackChannelId || null,
        input.slackThreadTs || null,
        embeddingStr,
        embeddingStr ? "openai" : null,
        embeddingStr ? "text-embedding-3-large" : null,
      ]
    );

    // Add labels
    if (input.labelIds && input.labelIds.length > 0) {
      for (const labelId of input.labelIds) {
        await client.query(
          `INSERT INTO dispatch_issue_label (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [issueId, labelId]
        );
      }
    }

    const issue = issueResult.rows[0] as Issue;

    // Record "created" in issue history
    try {
      await createHistoryEntry({
        issueId: issue.id,
        action: "created",
        newValue: {
          title: issue.title,
          priority: issue.priority,
          identifier: issue.identifier,
        },
        actorType: input.actorType || "system",
        actorName: input.actorName || null,
      });
    } catch (e) {
      console.error("[History] Failed to record issue creation:", e);
    }

    return issue;
  });
}

export async function updateIssue(
  issueId: string,
  input: UpdateIssueInput
): Promise<Issue | null> {
  const existing = await db.queryOne<Issue>(
    `SELECT * FROM dispatch_issue WHERE id = $1 OR identifier = $1`,
    [issueId]
  );
  if (!existing) return null;

  return db.transaction(async (client: PoolClient) => {
    // Handle assignee
    let assigneeId = existing.assignee_id;
    if (input.assigneeName !== undefined) {
      if (input.assigneeName === "") {
        assigneeId = null;
      } else if (input.assigneeName) {
        const agentResult = await client.query(
          `SELECT id FROM dispatch_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
          [existing.workspace_id, input.assigneeName]
        );
        if (agentResult.rows[0]) {
          assigneeId = agentResult.rows[0].id;
        } else {
          assigneeId = uuidv4();
          await client.query(
            `INSERT INTO dispatch_agent (id, workspace_id, name) VALUES ($1, $2, $3)`,
            [assigneeId, existing.workspace_id, input.assigneeName]
          );
        }
      }
    }

    // Regenerate embedding if title or description changed
    let embeddingStr: string | null = null;
    if (input.title !== undefined || input.description !== undefined) {
      try {
        const newTitle = input.title ?? existing.title;
        const newDesc =
          input.description !== undefined
            ? input.description
            : existing.description;
        const embedding = await generateEmbeddingForIssue(newTitle, newDesc);
        embeddingStr = vectorToString(embedding.vector);
      } catch (e) {
        console.error("Failed to generate embedding:", e);
      }
    }

    // Handle agent_status changes - set timestamps appropriately
    let agentStartedAt: Date | null | undefined = undefined; // undefined = don't change
    let agentCompletedAt: Date | null | undefined = undefined;

    if (input.agent_status !== undefined) {
      // When transitioning to an active state, set started_at
      if (
        (input.agent_status === "investigating" ||
          input.agent_status === "implementing" ||
          input.agent_status === "triaging") &&
        existing.agent_status === "idle"
      ) {
        agentStartedAt = new Date();
        agentCompletedAt = null; // Clear any previous completion time
      }
      // When transitioning to a completed/terminal state, set completed_at
      if (
        (input.agent_status === "idle" ||
          input.agent_status === "blocked" ||
          input.agent_status === "awaiting_review") &&
        (existing.agent_status === "investigating" ||
          existing.agent_status === "implementing" ||
          existing.agent_status === "triaging")
      ) {
        agentCompletedAt = new Date();
      }
    }

    // Parse cost as a number for accumulation
    const costIncrement =
      input.cost_usd != null ? parseFloat(String(input.cost_usd)) : null;
    const turnsIncrement =
      input.num_turns != null ? parseInt(String(input.num_turns), 10) : null;

    // Update issue
    const updateResult = await client.query(
      `UPDATE dispatch_issue SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status_id = COALESCE($3, status_id),
        priority = COALESCE($4, priority),
        assignee_id = $5,
        embedding = COALESCE($6::vector, embedding),
        agent_status = COALESCE($8, agent_status),
        agent_output = COALESCE($9, agent_output),
        agent_confidence = COALESCE($10, agent_confidence),
        agent_tokens_used = COALESCE($11, agent_tokens_used),
        agent_started_at = COALESCE($12, agent_started_at),
        agent_completed_at = COALESCE($13, agent_completed_at),
        workflow_type = COALESCE($14, workflow_type),
        plan_status = COALESCE($15, plan_status),
        plan_content = COALESCE($16, plan_content),
        plan_feedback = $17,
        plan_approved_at = COALESCE($18, plan_approved_at),
        plan_approved_by = COALESCE($19, plan_approved_by),
        spawn_type = COALESCE($20, spawn_type),
        spawn_attempt_count = COALESCE($21, spawn_attempt_count),
        blocked_reason = $22,
        cost_usd = COALESCE(cost_usd, 0::numeric) + COALESCE($23::numeric, 0),
        model = COALESCE($24, model),
        num_turns = COALESCE(num_turns, 0) + COALESCE($25, 0),
        run_outcome = COALESCE($26, run_outcome),
        outcome_summary = COALESCE($27, outcome_summary),
        spawn_status = COALESCE($28, spawn_status),
        spawn_run_id = COALESCE($29, spawn_run_id),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
      [
        input.title,
        input.description,
        input.statusId,
        input.priority,
        assigneeId,
        embeddingStr,
        existing.id,
        input.agent_status,
        input.agent_output ? JSON.stringify(input.agent_output) : null,
        input.agent_confidence,
        input.agent_tokens_used,
        agentStartedAt,
        agentCompletedAt,
        input.workflow_type,
        input.plan_status,
        input.plan_content,
        input.plan_feedback !== undefined ? input.plan_feedback : existing.plan_feedback,
        input.plan_approved_at,
        input.plan_approved_by,
        input.spawn_type,
        input.spawn_attempt_count,
        input.blocked_reason !== undefined ? input.blocked_reason : existing.blocked_reason,
        costIncrement,
        input.model,
        turnsIncrement,
        input.run_outcome,
        input.outcome_summary,
        input.spawn_status,
        input.spawn_run_id,
      ]
    );

    // Update labels if provided
    if (input.labelIds !== undefined) {
      await client.query(`DELETE FROM dispatch_issue_label WHERE issue_id = $1`, [
        existing.id,
      ]);
      for (const labelId of input.labelIds) {
        await client.query(
          `INSERT INTO dispatch_issue_label (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [existing.id, labelId]
        );
      }
    }

    const updatedIssue = updateResult.rows[0] as Issue;

    // --- Audit trail: record changes to history ---
    const actor: HistoryActorType = input.actorType || "system";
    const actorName = input.actorName || null;

    try {
      // Status change
      if (input.statusId && input.statusId !== existing.status_id) {
        const [oldStatus, newStatus] = await Promise.all([
          client.query<{ name: string }>(`SELECT name FROM dispatch_status WHERE id = $1`, [existing.status_id]),
          client.query<{ name: string }>(`SELECT name FROM dispatch_status WHERE id = $1`, [input.statusId]),
        ]);
        await recordStatusChange(
          existing.id,
          oldStatus.rows[0]?.name || "Unknown",
          newStatus.rows[0]?.name || "Unknown",
          actor,
          actorName || undefined,
        );
      }

      // Priority change
      if (input.priority && input.priority !== existing.priority) {
        await createHistoryEntry({
          issueId: existing.id,
          action: "priority_changed",
          oldValue: { priority: existing.priority },
          newValue: { priority: input.priority },
          actorType: actor,
          actorName,
        });
      }

      // Agent status change (started/completed)
      if (input.agent_status && input.agent_status !== existing.agent_status) {
        const isStarting = (input.agent_status === "investigating" || input.agent_status === "implementing" || input.agent_status === "triaging") && existing.agent_status === "idle";
        const isCompleting = (input.agent_status === "idle" || input.agent_status === "blocked" || input.agent_status === "awaiting_review")
          && (existing.agent_status === "investigating" || existing.agent_status === "implementing" || existing.agent_status === "triaging");

        if (isStarting) {
          await createHistoryEntry({
            issueId: existing.id,
            action: "agent_started",
            newValue: { agent_status: input.agent_status, spawn_type: input.spawn_type || existing.spawn_type },
            actorType: "agent",
            actorName: actorName || "Autonomous Agent",
          });
        } else if (isCompleting) {
          await createHistoryEntry({
            issueId: existing.id,
            action: "agent_completed",
            oldValue: { agent_status: existing.agent_status },
            newValue: {
              agent_status: input.agent_status,
              run_outcome: input.run_outcome || null,
              outcome_summary: input.outcome_summary || null,
            },
            actorType: "agent",
            actorName: actorName || "Autonomous Agent",
          });
        }
      }

      // Spawn status change (running/completed/failed)
      if (input.spawn_status && input.spawn_status !== existing.spawn_status) {
        await createHistoryEntry({
          issueId: existing.id,
          action: input.spawn_status === "running" ? "agent_started" : "agent_completed",
          oldValue: existing.spawn_status ? { spawn_status: existing.spawn_status } : null,
          newValue: {
            spawn_status: input.spawn_status,
            spawn_run_id: input.spawn_run_id || existing.spawn_run_id,
          },
          actorType: actor,
          actorName,
        });
      }
    } catch (e) {
      console.error("[History] Failed to record issue update:", e);
    }

    // Dispatch webhook if assignee changed
    if (assigneeId !== existing.assignee_id && assigneeId) {
      // Get status name for webhook payload
      const status = await client.query<{ name: string }>(
        `SELECT name FROM dispatch_status WHERE id = $1`,
        [updatedIssue.status_id]
      );
      const statusName = status.rows[0]?.name || "Unknown";

      // Get assignee name
      const agent = await client.query<{ name: string }>(
        `SELECT name FROM dispatch_agent WHERE id = $1`,
        [assigneeId]
      );
      const assigneeName = agent.rows[0]?.name || null;

      // Dispatch webhook to the newly assigned agent
      const payload = buildWebhookPayload("ISSUE_ASSIGNED", {
        id: updatedIssue.id,
        identifier: updatedIssue.identifier,
        title: updatedIssue.title,
        description: updatedIssue.description,
        priority: updatedIssue.priority,
        status_name: statusName,
        assignee_name: assigneeName,
      });

      // Fire and forget - don't block the update
      dispatchToAgent(assigneeId, payload).catch((err) =>
        console.error("[Webhook] Failed to dispatch ISSUE_ASSIGNED:", err)
      );
    }

    return updatedIssue;
  });
}

export async function getIssue(
  issueIdOrIdentifier: string
): Promise<IssueWithRelations | null> {
  const result = await db.query<
    IssueWithRelations & {
      status_name: string;
      status_color: string;
      assignee_name: string | null;
    }
  >(
    `SELECT
      i.*,
      s.name as status_name,
      s.color as status_color,
      a.name as assignee_name
    FROM dispatch_issue i
    JOIN dispatch_status s ON i.status_id = s.id
    LEFT JOIN dispatch_agent a ON i.assignee_id = a.id
    WHERE i.id = $1 OR i.identifier = $1`,
    [issueIdOrIdentifier]
  );

  if (!result[0]) return null;

  const issue = result[0];
  const labels = await db.query<{
    label_id: string;
    name: string;
    color: string;
  }>(
    `SELECT il.label_id, l.name, l.color
     FROM dispatch_issue_label il
     JOIN dispatch_label l ON il.label_id = l.id
     WHERE il.issue_id = $1`,
    [issue.id]
  );

  return {
    ...issue,
    status: {
      id: issue.status_id,
      name: issue.status_name,
      color: issue.status_color,
    },
    assignee: issue.assignee_id
      ? { id: issue.assignee_id, name: issue.assignee_name! }
      : null,
    labels: labels.map((l) => ({
      label: { id: l.label_id, name: l.name, color: l.color },
    })),
  };
}

export async function listIssues(
  workspaceId: string
): Promise<IssueWithRelations[]> {
  const issues = await db.query<
    Issue & {
      status_name: string;
      status_color: string;
      assignee_name: string | null;
    }
  >(
    `SELECT
      i.*,
      s.name as status_name,
      s.color as status_color,
      a.name as assignee_name
    FROM dispatch_issue i
    JOIN dispatch_status s ON i.status_id = s.id
    LEFT JOIN dispatch_agent a ON i.assignee_id = a.id
    WHERE i.workspace_id = $1
    ORDER BY i.created_at DESC`,
    [workspaceId]
  );

  const issueIds = issues.map((i) => i.id);
  if (issueIds.length === 0) return [];

  const labels = await db.query<{
    issue_id: string;
    label_id: string;
    name: string;
    color: string;
  }>(
    `SELECT il.issue_id, il.label_id, l.name, l.color
     FROM dispatch_issue_label il
     JOIN dispatch_label l ON il.label_id = l.id
     WHERE il.issue_id = ANY($1)`,
    [issueIds]
  );

  const labelsByIssue = new Map<
    string,
    { label: { id: string; name: string; color: string } }[]
  >();
  for (const label of labels) {
    if (!labelsByIssue.has(label.issue_id)) {
      labelsByIssue.set(label.issue_id, []);
    }
    labelsByIssue.get(label.issue_id)!.push({
      label: { id: label.label_id, name: label.name, color: label.color },
    });
  }

  return issues.map((issue) => ({
    ...issue,
    status: {
      id: issue.status_id,
      name: issue.status_name,
      color: issue.status_color,
    },
    assignee: issue.assignee_id
      ? { id: issue.assignee_id, name: issue.assignee_name! }
      : null,
    labels: labelsByIssue.get(issue.id) || [],
  }));
}

export async function searchIssuesSemantic(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<
  {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    priority: string;
    status_name: string;
    status_color: string;
    similarity: number;
  }[]
> {
  const embedding = await generateEmbeddingForIssue(query, null);
  const embeddingStr = vectorToString(embedding.vector);

  return db.query(
    `SELECT
      i.id, i.identifier, i.title, i.description, i.priority,
      s.name as status_name, s.color as status_color,
      1 - (i.embedding <=> $1::vector) as similarity
    FROM dispatch_issue i
    JOIN dispatch_status s ON i.status_id = s.id
    WHERE i.workspace_id = $2 AND i.embedding IS NOT NULL
    ORDER BY i.embedding <=> $1::vector
    LIMIT $3`,
    [embeddingStr, workspaceId, limit]
  );
}

export async function getSimilarIssues(
  issueIdOrIdentifier: string,
  limit: number = 5
): Promise<
  {
    id: string;
    identifier: string;
    title: string;
    similarity: number;
    status_name: string;
    status_color: string;
  }[]
> {
  // Get the issue's embedding directly from the database
  const result = await db.query<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id FROM dispatch_issue WHERE id = $1 OR identifier = $1`,
    [issueIdOrIdentifier]
  );

  if (!result[0]) return [];
  const { id: issueId, workspace_id: workspaceId } = result[0];

  // Find similar issues using the embedding, excluding the current issue
  return db.query(
    `SELECT
      i.id, i.identifier, i.title,
      s.name as status_name,
      s.color as status_color,
      1 - (i.embedding <=> (SELECT embedding FROM dispatch_issue WHERE id = $1)) as similarity
    FROM dispatch_issue i
    JOIN dispatch_status s ON i.status_id = s.id
    WHERE i.workspace_id = $2
      AND i.id != $1
      AND i.embedding IS NOT NULL
      AND (SELECT embedding FROM dispatch_issue WHERE id = $1) IS NOT NULL
    ORDER BY i.embedding <=> (SELECT embedding FROM dispatch_issue WHERE id = $1)
    LIMIT $3`,
    [issueId, workspaceId, limit]
  );
}

export async function deleteIssue(issueId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM dispatch_issue WHERE id = $1 OR identifier = $1 RETURNING id`,
    [issueId]
  );
  return result.length > 0;
}

// Get issue in board format for SSE broadcasting
export interface BoardIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  assignee: { name: string } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  created_at: string;
  agent_status?: string;
  plan_status?: string | null;
  blocked_reason?: string | null;
  cost_usd?: number | null;
  run_outcome?: string | null;
  outcome_summary?: string | null;
}

export async function getIssueForBoard(
  issueIdOrIdentifier: string
): Promise<BoardIssue | null> {
  const result = await db.query<{
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    priority: string;
    status_id: string;
    assignee_id: string | null;
    assignee_name: string | null;
    created_at: Date;
    agent_status: string;
    plan_status: string | null;
    blocked_reason: string | null;
    cost_usd: number | null;
    run_outcome: string | null;
    outcome_summary: string | null;
  }>(
    `SELECT
      i.id, i.identifier, i.title, i.description, i.priority, i.status_id,
      i.assignee_id, a.name as assignee_name, i.created_at,
      i.agent_status, i.plan_status, i.blocked_reason, i.cost_usd,
      i.run_outcome, i.outcome_summary
    FROM dispatch_issue i
    LEFT JOIN dispatch_agent a ON i.assignee_id = a.id
    WHERE i.id = $1 OR i.identifier = $1`,
    [issueIdOrIdentifier]
  );

  if (!result[0]) return null;

  const issue = result[0];
  const labels = await db.query<{
    label_id: string;
    name: string;
    color: string;
  }>(
    `SELECT il.label_id, l.name, l.color
     FROM dispatch_issue_label il
     JOIN dispatch_label l ON il.label_id = l.id
     WHERE il.issue_id = $1`,
    [issue.id]
  );

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    status_id: issue.status_id,
    assignee: issue.assignee_name ? { name: issue.assignee_name } : null,
    labels: labels.map((l) => ({
      label: { id: l.label_id, name: l.name, color: l.color },
    })),
    created_at: issue.created_at.toISOString(),
    agent_status: issue.agent_status,
    plan_status: issue.plan_status,
    blocked_reason: issue.blocked_reason,
    cost_usd: issue.cost_usd ? parseFloat(String(issue.cost_usd)) : null,
    run_outcome: issue.run_outcome,
    outcome_summary: issue.outcome_summary,
  };
}

// Agent Activity types
export type AgentActivityType =
  | "thought"
  | "action"
  | "observation"
  | "tool_call"
  | "file_read"
  | "file_write"
  | "search"
  | "complete"
  | "error"
  | "agent_heartbeat"
  | "agent_full_log";

export interface AgentActivityMetadata {
  tool?: string;
  file?: string;
  tokens?: number;
  duration_ms?: number;
  run_url?: string;
  run_id?: string;
  workflow_type?: string;
  pr_url?: string;
  cancelled_run_id?: string | null;
  gh_cancelled?: boolean;
  [key: string]: unknown;
}

export interface AgentActivity {
  id: string;
  issue_id: string;
  type: AgentActivityType;
  content: string;
  metadata: AgentActivityMetadata | null;
  created_at: Date;
}

export async function getAgentActivity(
  issueIdOrIdentifier: string,
  limit: number = 50
): Promise<
  {
    id: string;
    timestamp: string;
    type: AgentActivityType;
    content: string;
    metadata: AgentActivityMetadata | null;
  }[]
> {
  // First resolve the issue ID
  const issue = await db.queryOne<{ id: string }>(
    `SELECT id FROM dispatch_issue WHERE id = $1 OR identifier = $1`,
    [issueIdOrIdentifier]
  );

  if (!issue) return [];

  const activities = await db.query<AgentActivity>(
    `SELECT id, issue_id, type, content, metadata, created_at
     FROM dispatch_agent_activity
     WHERE issue_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [issue.id, limit]
  );

  return activities.map((a) => ({
    id: a.id,
    timestamp: a.created_at.toISOString(),
    type: a.type,
    content: a.content,
    metadata: a.metadata,
  }));
}

export async function createAgentActivity(
  issueId: string,
  type: AgentActivityType,
  content: string,
  metadata?: AgentActivityMetadata,
  runId?: string
): Promise<AgentActivity> {
  const result = await db.query<AgentActivity>(
    `INSERT INTO dispatch_agent_activity (id, issue_id, type, content, metadata, run_id, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [issueId, type, content, metadata ? JSON.stringify(metadata) : null, runId || null]
  );
  return result[0];
}

export async function clearAgentActivity(issueId: string): Promise<void> {
  await db.query(`DELETE FROM dispatch_agent_activity WHERE issue_id = $1`, [
    issueId,
  ]);
}
