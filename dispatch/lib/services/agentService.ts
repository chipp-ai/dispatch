import { db } from "../db";
import { v4 as uuidv4 } from "uuid";

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  webhook_url: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  webhookUrl?: string;
}

export async function getOrCreateAgentByName(
  workspaceId: string,
  name: string
): Promise<Agent> {
  // Try to find existing agent by name (case-insensitive)
  const existing = await db.queryOne<Agent>(
    `SELECT * FROM chipp_agent WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
    [workspaceId, name]
  );

  if (existing) {
    return existing;
  }

  // Create new agent
  const id = uuidv4();
  await db.query(
    `INSERT INTO chipp_agent (id, workspace_id, name, is_active, created_at)
     VALUES ($1, $2, $3, true, NOW())`,
    [id, workspaceId, name]
  );

  return (await db.queryOne<Agent>(`SELECT * FROM chipp_agent WHERE id = $1`, [
    id,
  ]))!;
}

export async function listAgents(
  workspaceId: string,
  includeInactive: boolean = false
): Promise<Agent[]> {
  if (includeInactive) {
    return db.query<Agent>(
      `SELECT * FROM chipp_agent WHERE workspace_id = $1 ORDER BY name ASC`,
      [workspaceId]
    );
  }

  return db.query<Agent>(
    `SELECT * FROM chipp_agent WHERE workspace_id = $1 AND is_active = true ORDER BY name ASC`,
    [workspaceId]
  );
}

export async function createAgent(
  workspaceId: string,
  input: CreateAgentInput
): Promise<Agent> {
  const id = uuidv4();
  await db.query(
    `INSERT INTO chipp_agent (id, workspace_id, name, description, webhook_url, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW())`,
    [
      id,
      workspaceId,
      input.name,
      input.description || null,
      input.webhookUrl || null,
    ]
  );

  return (await db.queryOne<Agent>(`SELECT * FROM chipp_agent WHERE id = $1`, [
    id,
  ]))!;
}

export async function getAgent(agentId: string): Promise<Agent | null> {
  return db.queryOne<Agent>(`SELECT * FROM chipp_agent WHERE id = $1`, [
    agentId,
  ]);
}

export async function updateAgent(
  agentId: string,
  input: Partial<CreateAgentInput> & { isActive?: boolean }
): Promise<Agent | null> {
  const existing = await getAgent(agentId);
  if (!existing) return null;

  await db.query(
    `UPDATE chipp_agent SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      webhook_url = COALESCE($3, webhook_url),
      is_active = COALESCE($4, is_active)
    WHERE id = $5`,
    [input.name, input.description, input.webhookUrl, input.isActive, agentId]
  );

  return (await db.queryOne<Agent>(`SELECT * FROM chipp_agent WHERE id = $1`, [
    agentId,
  ]))!;
}
