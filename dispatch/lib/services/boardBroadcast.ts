// Store active connections for the board (workspace-level updates)
const boardConnections = new Set<ReadableStreamDefaultController>();

export type BoardEventType =
  | "issue_created"
  | "issue_updated"
  | "issue_deleted"
  | "issue_moved";

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
  cost_usd?: number | null;
  run_outcome?: string | null;
  outcome_summary?: string | null;
}

export type BoardEvent =
  | {
      type: "issue_created" | "issue_updated" | "issue_moved";
      issue: BoardIssue;
      previousStatusId?: string; // For issue_moved events
      timestamp: string;
    }
  | {
      type: "issue_deleted";
      issueId: string;
      identifier: string;
      timestamp: string;
    };

// Broadcast an event to all connected board clients
export function broadcastBoardEvent(event: BoardEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(data);

  boardConnections.forEach((controller) => {
    try {
      controller.enqueue(encoded);
    } catch {
      // Connection closed, will be cleaned up
      boardConnections.delete(controller);
    }
  });
}

export function addBoardConnection(
  controller: ReadableStreamDefaultController
) {
  boardConnections.add(controller);
}

export function removeBoardConnection(
  controller: ReadableStreamDefaultController
) {
  boardConnections.delete(controller);
}

export function getBoardConnectionCount(): number {
  return boardConnections.size;
}
