import { db, PoolClient } from "../db";
import { v4 as uuidv4 } from "uuid";

export interface Status {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_triage: boolean;
  is_closed: boolean;
}

export interface CreateStatusInput {
  name: string;
  color: string;
  position?: number;
  is_triage?: boolean;
  is_closed?: boolean;
}

export async function listStatuses(workspaceId: string): Promise<Status[]> {
  return db.query<Status>(
    `SELECT * FROM chipp_status WHERE workspace_id = $1 ORDER BY position ASC`,
    [workspaceId]
  );
}

export async function getStatus(statusId: string): Promise<Status | null> {
  return db.queryOne<Status>(`SELECT * FROM chipp_status WHERE id = $1`, [
    statusId,
  ]);
}

export async function getStatusByName(
  workspaceId: string,
  name: string
): Promise<Status | null> {
  return db.queryOne<Status>(
    `SELECT * FROM chipp_status WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
    [workspaceId, name]
  );
}

export async function createStatus(
  workspaceId: string,
  input: CreateStatusInput
): Promise<Status> {
  // Get max position if not provided
  let position = input.position;
  if (position === undefined) {
    const maxResult = await db.queryOne<{ max_pos: number }>(
      `SELECT COALESCE(MAX(position), -1) as max_pos FROM chipp_status WHERE workspace_id = $1`,
      [workspaceId]
    );
    position = (maxResult?.max_pos ?? -1) + 1;
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO chipp_status (id, workspace_id, name, color, position, is_triage, is_closed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      workspaceId,
      input.name,
      input.color,
      position,
      input.is_triage ?? false,
      input.is_closed ?? false,
    ]
  );

  return (await db.queryOne<Status>(
    `SELECT * FROM chipp_status WHERE id = $1`,
    [id]
  ))!;
}

export async function updateStatus(
  statusId: string,
  input: Partial<CreateStatusInput>
): Promise<Status | null> {
  const existing = await getStatus(statusId);
  if (!existing) return null;

  await db.query(
    `UPDATE chipp_status SET
      name = COALESCE($1, name),
      color = COALESCE($2, color),
      position = COALESCE($3, position),
      is_triage = COALESCE($4, is_triage),
      is_closed = COALESCE($5, is_closed)
    WHERE id = $6`,
    [
      input.name,
      input.color,
      input.position,
      input.is_triage,
      input.is_closed,
      statusId,
    ]
  );

  return (await db.queryOne<Status>(
    `SELECT * FROM chipp_status WHERE id = $1`,
    [statusId]
  ))!;
}

export async function reorderStatuses(
  workspaceId: string,
  statusIds: string[]
): Promise<Status[]> {
  return db.transaction(async (client: PoolClient) => {
    // Update positions based on array order
    for (let i = 0; i < statusIds.length; i++) {
      await client.query(
        `UPDATE chipp_status SET position = $1 WHERE id = $2 AND workspace_id = $3`,
        [i, statusIds[i], workspaceId]
      );
    }

    // Return updated statuses
    const result = await client.query(
      `SELECT * FROM chipp_status WHERE workspace_id = $1 ORDER BY position ASC`,
      [workspaceId]
    );
    return result.rows as Status[];
  });
}

export async function deleteStatus(statusId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM chipp_status WHERE id = $1 RETURNING id`,
    [statusId]
  );
  return result.length > 0;
}
