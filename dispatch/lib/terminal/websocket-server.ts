import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";

export interface TerminalMessage {
  type: "output" | "status" | "error";
  issueIdentifier: string;
  timestamp: string;
  data: string;
}

interface ClientConnection {
  ws: WebSocket;
  issueIdentifier: string | null;
  isAgent: boolean;
}

// Global state for terminal connections
const connections = new Map<string, Set<ClientConnection>>();
const agentConnections = new Map<string, ClientConnection>();

let wss: WebSocketServer | null = null;

/**
 * Initialize the WebSocket server for terminal streaming.
 * This should be called once during server startup.
 */
export function initTerminalWebSocket(server: Server): WebSocketServer {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({
    server,
    path: "/api/terminal",
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const issueIdentifier = url.searchParams.get("issue");
    const isAgent = url.searchParams.get("agent") === "true";

    const client: ClientConnection = {
      ws,
      issueIdentifier,
      isAgent,
    };

    if (issueIdentifier) {
      // Add to connections for this issue
      if (!connections.has(issueIdentifier)) {
        connections.set(issueIdentifier, new Set());
      }
      connections.get(issueIdentifier)!.add(client);

      // If this is an agent, track it separately
      if (isAgent) {
        agentConnections.set(issueIdentifier, client);
        console.log(`[Terminal WS] Agent connected for ${issueIdentifier}`);

        // Notify UI clients that agent is connected
        broadcastToViewers(issueIdentifier, {
          type: "status",
          issueIdentifier,
          timestamp: new Date().toISOString(),
          data: "Agent connected",
        });
      } else {
        console.log(`[Terminal WS] Viewer connected for ${issueIdentifier}`);
      }
    }

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as TerminalMessage;
        handleMessage(client, message);
      } catch (error) {
        console.error("[Terminal WS] Invalid message:", error);
      }
    });

    ws.on("close", () => {
      if (issueIdentifier) {
        connections.get(issueIdentifier)?.delete(client);

        if (isAgent) {
          agentConnections.delete(issueIdentifier);
          console.log(
            `[Terminal WS] Agent disconnected for ${issueIdentifier}`
          );

          // Notify UI clients that agent disconnected
          broadcastToViewers(issueIdentifier, {
            type: "status",
            issueIdentifier,
            timestamp: new Date().toISOString(),
            data: "Agent disconnected",
          });
        } else {
          console.log(
            `[Terminal WS] Viewer disconnected for ${issueIdentifier}`
          );
        }

        // Clean up empty connection sets
        if (connections.get(issueIdentifier)?.size === 0) {
          connections.delete(issueIdentifier);
        }
      }
    });

    ws.on("error", (error) => {
      console.error("[Terminal WS] Connection error:", error);
    });
  });

  console.log("[Terminal WS] WebSocket server initialized on /api/terminal");
  return wss;
}

/**
 * Handle incoming messages from agents or viewers
 */
function handleMessage(
  client: ClientConnection,
  message: TerminalMessage
): void {
  if (!client.issueIdentifier) {
    return;
  }

  if (client.isAgent) {
    // Agent is sending terminal output - broadcast to all viewers
    broadcastToViewers(client.issueIdentifier, message);
  } else {
    // Viewer is sending a command (e.g., input to the terminal)
    const agent = agentConnections.get(client.issueIdentifier);
    if (agent && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(JSON.stringify(message));
    }
  }
}

/**
 * Broadcast a message to all viewers of an issue (not the agent)
 */
function broadcastToViewers(
  issueIdentifier: string,
  message: TerminalMessage
): void {
  const issueConnections = connections.get(issueIdentifier);
  if (!issueConnections) return;

  const messageStr = JSON.stringify(message);

  Array.from(issueConnections).forEach((client) => {
    if (!client.isAgent && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  });
}

/**
 * Send a command to the agent working on an issue
 */
export function sendToAgent(
  issueIdentifier: string,
  command: { type: string; data?: string }
): boolean {
  const agent = agentConnections.get(issueIdentifier);
  if (agent && agent.ws.readyState === WebSocket.OPEN) {
    agent.ws.send(JSON.stringify(command));
    return true;
  }
  return false;
}

/**
 * Check if an agent is connected for an issue
 */
export function isAgentConnected(issueIdentifier: string): boolean {
  const agent = agentConnections.get(issueIdentifier);
  return agent !== undefined && agent.ws.readyState === WebSocket.OPEN;
}

/**
 * Get count of viewers for an issue
 */
export function getViewerCount(issueIdentifier: string): number {
  const issueConnections = connections.get(issueIdentifier);
  if (!issueConnections) return 0;

  let count = 0;
  Array.from(issueConnections).forEach((client) => {
    if (!client.isAgent && client.ws.readyState === WebSocket.OPEN) {
      count++;
    }
  });
  return count;
}

/**
 * Close the WebSocket server
 */
export function closeTerminalWebSocket(): void {
  if (wss) {
    wss.close();
    wss = null;
    connections.clear();
    agentConnections.clear();
  }
}
