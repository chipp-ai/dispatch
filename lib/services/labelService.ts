import { db } from "../db";
import { v4 as uuidv4 } from "uuid";

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

export interface CreateLabelInput {
  name: string;
  color: string;
}

// Validate hex color format
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export async function listLabels(workspaceId: string): Promise<Label[]> {
  return db.query<Label>(
    `SELECT * FROM dispatch_label WHERE workspace_id = $1 ORDER BY name ASC`,
    [workspaceId]
  );
}

export async function getLabel(labelId: string): Promise<Label | null> {
  return db.queryOne<Label>(`SELECT * FROM dispatch_label WHERE id = $1`, [
    labelId,
  ]);
}

export async function getLabelByName(
  workspaceId: string,
  name: string
): Promise<Label | null> {
  return db.queryOne<Label>(
    `SELECT * FROM dispatch_label WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)`,
    [workspaceId, name]
  );
}

export async function createLabel(
  workspaceId: string,
  input: CreateLabelInput
): Promise<Label> {
  if (!isValidHexColor(input.color)) {
    throw new Error("Invalid color format. Must be a hex color like #FFFFFF");
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO dispatch_label (id, workspace_id, name, color)
     VALUES ($1, $2, $3, $4)`,
    [id, workspaceId, input.name, input.color]
  );

  return (await db.queryOne<Label>(`SELECT * FROM dispatch_label WHERE id = $1`, [
    id,
  ]))!;
}

export async function updateLabel(
  labelId: string,
  input: Partial<CreateLabelInput>
): Promise<Label | null> {
  const existing = await getLabel(labelId);
  if (!existing) return null;

  if (input.color && !isValidHexColor(input.color)) {
    throw new Error("Invalid color format. Must be a hex color like #FFFFFF");
  }

  await db.query(
    `UPDATE dispatch_label SET
      name = COALESCE($1, name),
      color = COALESCE($2, color)
    WHERE id = $3`,
    [input.name, input.color, labelId]
  );

  return (await db.queryOne<Label>(`SELECT * FROM dispatch_label WHERE id = $1`, [
    labelId,
  ]))!;
}

export async function deleteLabel(labelId: string): Promise<boolean> {
  // First remove label from all issues
  await db.query(`DELETE FROM dispatch_issue_label WHERE label_id = $1`, [
    labelId,
  ]);

  const result = await db.query(
    `DELETE FROM dispatch_label WHERE id = $1 RETURNING id`,
    [labelId]
  );
  return result.length > 0;
}
