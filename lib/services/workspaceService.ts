import { db } from "../db";
import { v4 as uuidv4 } from "uuid";

export interface Workspace {
  id: string;
  name: string;
  issue_prefix: string;
  next_issue_number: number;
  created_at: Date;
}

export interface Status {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_triage: boolean;
  is_closed: boolean;
}

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

// 7-column Kanban board: left-to-right flow
const DEFAULT_STATUSES = [
  {
    name: "Backlog",
    color: "#6B7280",
    position: 0,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "Investigating",
    color: "#F59E0B",
    position: 1,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "Needs Review",
    color: "#EAB308",
    position: 2,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "In Progress",
    color: "#3B82F6",
    position: 3,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "In Review",
    color: "#10B981",
    position: 4,
    is_triage: false,
    is_closed: false,
  },
  {
    name: "Done",
    color: "#22C55E",
    position: 5,
    is_triage: false,
    is_closed: true,
  },
  {
    name: "Canceled",
    color: "#EF4444",
    position: 6,
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

export async function getOrCreateDefaultWorkspace(): Promise<Workspace> {
  const issuePrefix = process.env.DEFAULT_ISSUE_PREFIX || "DISPATCH";
  const workspaceName = process.env.DEFAULT_WORKSPACE_NAME || "My Workspace";

  let workspace = await db.queryOne<Workspace>(
    `SELECT * FROM dispatch_workspace WHERE issue_prefix = $1`,
    [issuePrefix]
  );

  if (workspace) {
    return workspace;
  }

  // Also check for legacy "CHIPP" prefix from pre-rename deployments
  if (issuePrefix !== "CHIPP") {
    workspace = await db.queryOne<Workspace>(
      `SELECT * FROM dispatch_workspace WHERE issue_prefix = 'CHIPP'`
    );
    if (workspace) return workspace;
  }

  const workspaceId = uuidv4();

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
        uuidv4(),
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
      [uuidv4(), workspaceId, label.name, label.color]
    );
  }

  workspace = await db.queryOne<Workspace>(
    `SELECT * FROM dispatch_workspace WHERE id = $1`,
    [workspaceId]
  );

  return workspace!;
}

export async function getStatuses(workspaceId: string): Promise<Status[]> {
  return db.query<Status>(
    `SELECT * FROM dispatch_status WHERE workspace_id = $1 ORDER BY position ASC`,
    [workspaceId]
  );
}

export async function getLabels(workspaceId: string): Promise<Label[]> {
  return db.query<Label>(
    `SELECT * FROM dispatch_label WHERE workspace_id = $1 ORDER BY name ASC`,
    [workspaceId]
  );
}

export async function createStatus(
  workspaceId: string,
  name: string,
  color: string,
  position: number
): Promise<Status> {
  const id = uuidv4();
  await db.query(
    `INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
     VALUES ($1, $2, $3, $4, $5, false, false)`,
    [id, workspaceId, name, color, position]
  );
  return (await db.queryOne<Status>(
    `SELECT * FROM dispatch_status WHERE id = $1`,
    [id]
  ))!;
}

export async function createLabel(
  workspaceId: string,
  name: string,
  color: string
): Promise<Label> {
  const id = uuidv4();
  await db.query(
    `INSERT INTO dispatch_label (id, workspace_id, name, color)
     VALUES ($1, $2, $3, $4)`,
    [id, workspaceId, name, color]
  );
  return (await db.queryOne<Label>(`SELECT * FROM dispatch_label WHERE id = $1`, [
    id,
  ]))!;
}
