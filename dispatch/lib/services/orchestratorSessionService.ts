/**
 * Orchestrator Session Service
 *
 * CRUD operations for orchestrator conversation sessions.
 * Messages are stored in Anthropic's native format for exact replay.
 */

import { db } from "../db";
import { v4 as uuidv4 } from "uuid";
import type Anthropic from "@anthropic-ai/sdk";

type MessageParam = Anthropic.MessageParam;

export interface OrchestratorSession {
  id: string;
  workspace_id: string;
  messages: MessageParam[];
  created_at: string;
  updated_at: string;
}

export async function createSession(
  workspaceId: string
): Promise<OrchestratorSession> {
  const id = uuidv4();
  const result = await db.query<OrchestratorSession>(
    `INSERT INTO dispatch_orchestrator_session (id, workspace_id, messages, created_at, updated_at)
     VALUES ($1, $2, '[]'::jsonb, NOW(), NOW())
     RETURNING *`,
    [id, workspaceId]
  );
  return parseSession(result[0]);
}

export async function getSession(
  sessionId: string
): Promise<OrchestratorSession | null> {
  const result = await db.queryOne<OrchestratorSession>(
    `SELECT * FROM dispatch_orchestrator_session WHERE id = $1`,
    [sessionId]
  );
  return result ? parseSession(result) : null;
}

export async function getLatestSession(
  workspaceId: string
): Promise<OrchestratorSession | null> {
  const result = await db.queryOne<OrchestratorSession>(
    `SELECT * FROM dispatch_orchestrator_session
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [workspaceId]
  );
  return result ? parseSession(result) : null;
}

export async function saveMessages(
  sessionId: string,
  messages: MessageParam[]
): Promise<void> {
  await db.query(
    `UPDATE dispatch_orchestrator_session
     SET messages = $2::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [sessionId, JSON.stringify(messages)]
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.query(`DELETE FROM dispatch_orchestrator_session WHERE id = $1`, [
    sessionId,
  ]);
}

/**
 * Clean up old sessions (older than 30 days).
 */
export async function cleanupOldSessions(
  workspaceId: string
): Promise<number> {
  const result = await db.query(
    `DELETE FROM dispatch_orchestrator_session
     WHERE workspace_id = $1 AND updated_at < NOW() - INTERVAL '30 days'
     RETURNING id`,
    [workspaceId]
  );
  return result.length;
}

function parseSession(raw: OrchestratorSession): OrchestratorSession {
  return {
    ...raw,
    messages:
      typeof raw.messages === "string"
        ? JSON.parse(raw.messages)
        : raw.messages,
  };
}
