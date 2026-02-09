// Store active connections per issue
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Get the connections map (for use in route handlers)
 */
export function getConnections(): Map<
  string,
  Set<ReadableStreamDefaultController>
> {
  return connections;
}

/**
 * Broadcast activity to all connections for an issue
 */
export function broadcastActivity(issueId: string, activity: unknown): void {
  const issueConnections = connections.get(issueId);
  if (issueConnections) {
    const data = `data: ${JSON.stringify(activity)}\n\n`;
    issueConnections.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(data));
      } catch {
        // Connection closed, will be cleaned up
      }
    });
  }
}

export function addConnection(
  issueId: string,
  controller: ReadableStreamDefaultController
) {
  if (!connections.has(issueId)) {
    connections.set(issueId, new Set());
  }
  connections.get(issueId)!.add(controller);
}

export function removeConnection(
  issueId: string,
  controller: ReadableStreamDefaultController
) {
  const issueConnections = connections.get(issueId);
  if (issueConnections) {
    issueConnections.delete(controller);
    if (issueConnections.size === 0) {
      connections.delete(issueId);
    }
  }
}
