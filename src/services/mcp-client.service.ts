/**
 * MCP Client Service
 *
 * Lightweight MCP client using direct HTTP JSON-RPC calls.
 * Follows the MCP Streamable HTTP transport specification.
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpAuthConfig {
  token?: string;
  access_token?: string;
  apiKey?: string;
  apiKeyName?: string;
  apiKeyPrefix?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
}

interface McpClientOptions {
  serverUrl: string;
  transport?: string;
  authType?: string;
  authConfig?: McpAuthConfig;
}

function buildHeaders(
  authType?: string,
  authConfig?: McpAuthConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (!authType || !authConfig) return headers;

  const type = authType.toUpperCase();

  switch (type) {
    case "BEARER":
    case "OAUTH": {
      const token = authConfig.token || authConfig.access_token;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      break;
    }
    case "API_KEY": {
      if (authConfig.apiKey) {
        const name = authConfig.apiKeyName || "X-API-Key";
        headers[name] = authConfig.apiKeyPrefix
          ? `${authConfig.apiKeyPrefix} ${authConfig.apiKey}`
          : authConfig.apiKey;
      }
      break;
    }
    case "BASIC": {
      if (authConfig.username && authConfig.password) {
        const b64 = btoa(`${authConfig.username}:${authConfig.password}`);
        headers["Authorization"] = `Basic ${b64}`;
      }
      break;
    }
    case "CUSTOM_HEADER": {
      if (authConfig.headerName && authConfig.headerValue) {
        headers[authConfig.headerName] = authConfig.headerValue;
      }
      break;
    }
  }

  return headers;
}

async function jsonRpcCall(
  url: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
  headers: Record<string, string>
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    method,
    params,
    id,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `MCP server returned ${response.status}: ${text.slice(0, 200)}`
    );
  }

  const contentType = response.headers.get("content-type") || "";

  // Handle SSE responses
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.id === id) return data;
        } catch {
          // skip non-JSON lines
        }
      }
    }
    throw new Error("No matching JSON-RPC response found in SSE stream");
  }

  return await response.json();
}

/**
 * Test connection to an MCP server and list available tools.
 */
export async function testMcpConnection(
  opts: McpClientOptions
): Promise<{ tools: McpTool[]; durationMs: number }> {
  const { serverUrl, authType, authConfig } = opts;
  const headers = buildHeaders(authType, authConfig);
  const start = Date.now();

  // Step 1: Initialize
  const initResponse = (await jsonRpcCall(
    serverUrl,
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "chipp-deno", version: "1.0.0" },
    },
    1,
    headers
  )) as { result?: { protocolVersion?: string }; error?: { message: string } };

  if (initResponse.error) {
    throw new Error(`MCP initialize failed: ${initResponse.error.message}`);
  }

  // Step 2: Send initialized notification (no id = notification)
  await fetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // Notification failures are non-fatal
  });

  // Step 3: List tools
  const toolsResponse = (await jsonRpcCall(
    serverUrl,
    "tools/list",
    {},
    2,
    headers
  )) as { result?: { tools: McpTool[] }; error?: { message: string } };

  if (toolsResponse.error) {
    throw new Error(`MCP tools/list failed: ${toolsResponse.error.message}`);
  }

  const durationMs = Date.now() - start;
  const tools = toolsResponse.result?.tools || [];

  return { tools, durationMs };
}
