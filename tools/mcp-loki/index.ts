#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-run=kubectl

/**
 * Chipp Loki MCP Server
 *
 * MCP server for querying production logs from Loki (deployed on GKE).
 * Auto-manages kubectl port-forward to the Loki gateway.
 *
 * Tools:
 * - loki_query: Raw LogQL query
 * - loki_errors: Recent errors with smart formatting
 * - loki_search: Search logs by text pattern
 * - loki_stats: Aggregated error counts
 * - loki_status: Connection / port-forward health
 * - loki_user_activity: User behavioral analytics from source="analytics" events
 * - loki_error_impact: Error blast radius analysis (affected users, trends, co-errors)
 *
 * Environment Variables:
 *   LOKI_URL - Loki base URL (default: http://localhost:3100)
 *   LOKI_NAMESPACE - Kubernetes namespace (default: monitoring)
 *   LOKI_SERVICE - Kubernetes service name (default: loki-gateway)
 */

import { Server } from "npm:@modelcontextprotocol/sdk@1.0.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.0.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk@1.0.0/types.js";

// --- Configuration ---

const DEFAULT_LOKI_URL = "http://localhost:3100";
const LOKI_NAMESPACE = Deno.env.get("LOKI_NAMESPACE") || "monitoring";
const LOKI_SERVICE = Deno.env.get("LOKI_SERVICE") || "loki-gateway";
const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3105;
const PORT_FORWARD_TIMEOUT_MS = 8000;

// --- Port-Forward Manager ---

let portForwardProcess: Deno.ChildProcess | null = null;
let lokiBaseUrl: string = Deno.env.get("LOKI_URL") || DEFAULT_LOKI_URL;
let managedPort: number | null = null;

function log(msg: string) {
  console.error(`[mcp-loki] ${msg}`);
}

async function isLokiReady(url: string): Promise<boolean> {
  try {
    // The loki-gateway nginx proxy doesn't expose /ready.
    // Use /loki/api/v1/labels as a lightweight readiness check instead.
    const resp = await fetch(`${url}/loki/api/v1/labels`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function isPortInUse(port: number): Promise<boolean> {
  try {
    const listener = Deno.listen({ port });
    listener.close();
    return false; // We could bind, so port is free
  } catch {
    return true; // Port is in use
  }
}

async function startPortForward(): Promise<{ success: boolean; url: string; message: string }> {
  // Check if already have a working connection
  if (await isLokiReady(lokiBaseUrl)) {
    return { success: true, url: lokiBaseUrl, message: "Loki already reachable" };
  }

  // Kill any existing managed port-forward
  await stopPortForward();

  // Find an available port
  let port = PORT_RANGE_START;
  for (; port <= PORT_RANGE_END; port++) {
    if (!(await isPortInUse(port))) break;
  }

  if (port > PORT_RANGE_END) {
    return {
      success: false,
      url: "",
      message: `All ports ${PORT_RANGE_START}-${PORT_RANGE_END} are in use`,
    };
  }

  log(`Starting kubectl port-forward on port ${port}...`);

  const cmd = new Deno.Command("kubectl", {
    args: [
      "port-forward",
      "-n", LOKI_NAMESPACE,
      `svc/${LOKI_SERVICE}`,
      `${port}:80`,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  portForwardProcess = cmd.spawn();
  managedPort = port;
  lokiBaseUrl = `http://localhost:${port}`;

  // Drain stdout/stderr in background to prevent blocking
  drainStream(portForwardProcess.stdout);
  drainStream(portForwardProcess.stderr);

  // Wait for it to become ready
  const start = Date.now();
  while (Date.now() - start < PORT_FORWARD_TIMEOUT_MS) {
    if (await isLokiReady(lokiBaseUrl)) {
      log(`Port-forward ready on port ${port}`);
      return { success: true, url: lokiBaseUrl, message: `Port-forward established on port ${port}` };
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Timed out
  await stopPortForward();
  return {
    success: false,
    url: "",
    message: `Port-forward on port ${port} did not become ready within ${PORT_FORWARD_TIMEOUT_MS / 1000}s. Check kubectl context and cluster connectivity.`,
  };
}

async function drainStream(stream: ReadableStream<Uint8Array>) {
  try {
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch {
    // ignore
  }
}

async function stopPortForward() {
  if (portForwardProcess) {
    try {
      portForwardProcess.kill("SIGTERM");
      await portForwardProcess.status;
    } catch {
      // already dead
    }
    portForwardProcess = null;
    managedPort = null;
  }
}

async function ensureLoki(): Promise<string> {
  if (await isLokiReady(lokiBaseUrl)) {
    return lokiBaseUrl;
  }
  const result = await startPortForward();
  if (!result.success) {
    throw new Error(result.message);
  }
  return result.url;
}

// --- Time Parsing ---

function parseDuration(since: string): number {
  const match = since.match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) throw new Error(`Invalid duration: "${since}". Use e.g. "1h", "24h", "7d".`);
  const [, num, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1, m: 60, h: 3600, d: 86400, w: 604800,
  };
  return Number(num) * multipliers[unit] * 1_000_000_000; // nanoseconds
}

function nowNano(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

// --- Loki API ---

interface LokiStreamResult {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: LokiStreamResult[] | LokiMatrixResult[];
  };
}

interface LokiMatrixResult {
  metric: Record<string, string>;
  values: [number, string][];
}

interface ParsedLogEntry {
  timestamp: string;
  level?: string;
  source?: string;
  feature?: string;
  msg?: string;
  errorMessage?: string;
  errorStack?: string;
  userId?: string;
  appId?: string;
  orgId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  status?: string;
  version?: string;
  pod?: string;
  raw?: string;
}

function parseLogEntry(tsNano: string, line: string, streamLabels: Record<string, string>): ParsedLogEntry {
  const ts = new Date(Number(BigInt(tsNano) / 1_000_000n)).toISOString();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(line);
  } catch {
    // Not JSON -- return raw
    return {
      timestamp: ts,
      level: streamLabels.level,
      msg: line,
      pod: streamLabels.pod,
    };
  }

  // Extract error info - could be nested
  let errorMessage: string | undefined;
  let errorStack: string | undefined;
  if (parsed.error && typeof parsed.error === "object") {
    const err = parsed.error as Record<string, unknown>;
    errorMessage = err.message as string | undefined;
    errorStack = err.stack as string | undefined;
  } else if (parsed.error && typeof parsed.error === "string") {
    errorMessage = parsed.error;
  }
  if (parsed.err && typeof parsed.err === "string") {
    errorMessage = errorMessage || parsed.err;
  }

  return {
    timestamp: ts,
    level: (parsed.level as string) || streamLabels.level,
    source: parsed.source as string | undefined,
    feature: parsed.feature as string | undefined,
    msg: (parsed.msg as string) || (parsed.message as string) || undefined,
    errorMessage,
    errorStack,
    userId: parsed.userId as string | undefined,
    appId: (parsed.appId as string) || (parsed.applicationId as string) || undefined,
    orgId: parsed.orgId as string | undefined,
    requestId: parsed.requestId as string | undefined,
    path: parsed.path as string | undefined,
    method: parsed.method as string | undefined,
    status: parsed.status != null ? String(parsed.status) : undefined,
    version: parsed.version as string | undefined,
    pod: (parsed.pod as string) || streamLabels.pod,
  };
}

function flattenStreamResults(result: LokiStreamResult[]): ParsedLogEntry[] {
  const entries: ParsedLogEntry[] = [];
  for (const stream of result) {
    for (const [tsNano, line] of stream.values) {
      entries.push(parseLogEntry(tsNano, line, stream.stream));
    }
  }
  // Sort by timestamp descending (most recent first)
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

async function lokiQueryRange(
  query: string,
  sinceStr: string,
  limit: number
): Promise<ParsedLogEntry[]> {
  const base = await ensureLoki();
  const sinceNano = parseDuration(sinceStr);
  const end = nowNano();
  const start = end - BigInt(sinceNano);

  const params = new URLSearchParams({
    query,
    start: start.toString(),
    end: end.toString(),
    limit: String(limit),
    direction: "backward",
  });

  const url = `${base}/loki/api/v1/query_range?${params}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Loki query failed (${resp.status}): ${body}`);
  }

  const data: LokiQueryResponse = await resp.json();

  if (data.data.resultType === "streams") {
    return flattenStreamResults(data.data.result as LokiStreamResult[]);
  }

  // For matrix results (from metric queries), return simplified format
  if (data.data.resultType === "matrix") {
    const matrixResults = data.data.result as LokiMatrixResult[];
    return matrixResults.flatMap((m) =>
      m.values.map(([ts, val]) => ({
        timestamp: new Date(ts * 1000).toISOString(),
        msg: `${JSON.stringify(m.metric)}: ${val}`,
      }))
    );
  }

  return [];
}

// --- Tool Definitions ---

const tools = [
  {
    name: "loki_query",
    description:
      "Execute a raw LogQL query against Loki. Power user escape hatch for custom queries. Returns parsed log entries with extracted JSON fields.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'LogQL query. Examples: \'{app="chipp-deno"} | json\', \'{app="chipp-deno", level="error"} | json | source="billing"\'',
        },
        since: {
          type: "string",
          description: 'Time range like "1h", "24h", "7d" (default: "1h")',
        },
        limit: {
          type: "number",
          description: "Max entries to return (default: 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "loki_errors",
    description:
      "Get recent errors from production logs with smart formatting. Filters by source, feature, and/or requestId. Returns structured error objects.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description:
            'Filter by source module (e.g. "billing", "builder-chat", "stripe-webhook", "consumer-chat")',
        },
        feature: {
          type: "string",
          description: 'Filter by feature (e.g. "auto-topup", "credit-check", "stream")',
        },
        requestId: {
          type: "string",
          description: "Filter by request ID to trace a single request across all services",
        },
        since: {
          type: "string",
          description: 'Time range (default: "1h")',
        },
        limit: {
          type: "number",
          description: "Max entries (default: 50)",
        },
      },
    },
  },
  {
    name: "loki_search",
    description:
      "Search log content by text pattern. Supports regex. Optionally filter by log level or requestId.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text or regex pattern to search for in log messages",
        },
        level: {
          type: "string",
          description: 'Filter by level: "error", "warn", "info", "debug"',
          enum: ["error", "warn", "info", "debug"],
        },
        requestId: {
          type: "string",
          description: "Filter by request ID to trace a single request across all services",
        },
        since: {
          type: "string",
          description: 'Time range (default: "1h")',
        },
        limit: {
          type: "number",
          description: "Max entries (default: 50)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "loki_stats",
    description:
      'Aggregated error counts grouped by source, feature, message, or version. Returns { group, count }[] sorted descending.',
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description: 'Time range (default: "24h")',
        },
        groupBy: {
          type: "string",
          description: 'Group by: "source", "feature", "message", or "version" (default: "source")',
          enum: ["source", "feature", "message", "version"],
        },
      },
    },
  },
  {
    name: "loki_status",
    description:
      "Check Loki connection health, port-forward status, and readiness.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "loki_compare",
    description:
      'Compare error counts between two time periods. Useful for answering "did this deploy make things worse?" Shows side-by-side error stats for current vs previous period.',
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: 'Period to compare. "current" is the most recent period, "previous" is the same-length period before it. e.g. "1h" compares last 1h vs 1h-2h ago. (default: "1h")',
        },
        source: {
          type: "string",
          description: "Optional: filter to a specific source module",
        },
        groupBy: {
          type: "string",
          description: 'Group by: "source", "feature", or "message" (default: "source")',
          enum: ["source", "feature", "message"],
        },
      },
    },
  },
  {
    name: "loki_trace",
    description:
      "Trace a single request across all services by requestId. Shows every log line from that request's lifecycle: middleware -> auth -> service -> external calls -> response. The requestId is auto-injected on every log line by the structured logger.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: {
          type: "string",
          description: "The request ID to trace (UUID format, auto-generated per request)",
        },
        since: {
          type: "string",
          description: 'Time range to search within (default: "1h")',
        },
      },
      required: ["requestId"],
    },
  },
  {
    name: "loki_user_activity",
    description:
      "Get user behavioral analytics from Loki. Query activity for a specific user, org, or app. Returns timestamped events showing what actions the user took.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "User UUID to query activity for",
        },
        organizationId: {
          type: "string",
          description: "Organization UUID to query activity for",
        },
        applicationId: {
          type: "string",
          description: "Application UUID to query activity for",
        },
        since: {
          type: "string",
          description: 'Time range (default: "24h")',
        },
        limit: {
          type: "number",
          description: "Max entries (default: 100)",
        },
      },
    },
  },
  {
    name: "loki_error_impact",
    description:
      "Get impact analysis for an error. Shows affected users, frequency trends, co-occurring errors, and related analytics events from affected users.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: 'Error source module (e.g. "billing", "consumer-chat")',
        },
        feature: {
          type: "string",
          description: 'Error feature (e.g. "stream", "credit-check")',
        },
        since: {
          type: "string",
          description: 'Time range (default: "24h")',
        },
      },
      required: ["source"],
    },
  },
];

// --- Tool Implementations ---

async function handleLokiQuery(args: Record<string, unknown>): Promise<unknown> {
  const query = args.query as string;
  const since = (args.since as string) || "1h";
  const limit = (args.limit as number) || 50;

  const entries = await lokiQueryRange(query, since, limit);
  return {
    query,
    since,
    count: entries.length,
    entries,
  };
}

async function handleLokiErrors(args: Record<string, unknown>): Promise<unknown> {
  const source = args.source as string | undefined;
  const feature = args.feature as string | undefined;
  const requestId = args.requestId as string | undefined;
  const since = (args.since as string) || "1h";
  const limit = (args.limit as number) || 50;

  // Build LogQL query
  let query = '{app="chipp-deno", level="error"} | json';
  if (source) query += ` | source="${source}"`;
  if (feature) query += ` | feature="${feature}"`;
  if (requestId) query += ` | requestId="${requestId}"`;

  const entries = await lokiQueryRange(query, since, limit);

  // Format entries for error-focused display
  const errors = entries.map((e) => ({
    timestamp: e.timestamp,
    source: e.source,
    feature: e.feature,
    msg: e.msg,
    errorMessage: e.errorMessage,
    userId: e.userId,
    appId: e.appId,
    orgId: e.orgId,
    path: e.path,
    method: e.method,
    version: e.version,
    pod: e.pod,
    ...(e.errorStack ? { stack: e.errorStack } : {}),
  }));

  return {
    query,
    since,
    count: errors.length,
    errors,
  };
}

async function handleLokiSearch(args: Record<string, unknown>): Promise<unknown> {
  const pattern = args.pattern as string;
  const level = args.level as string | undefined;
  const requestId = args.requestId as string | undefined;
  const since = (args.since as string) || "1h";
  const limit = (args.limit as number) || 50;

  // Build LogQL query with line filter
  let selector = '{app="chipp-deno"}';
  if (level) selector = `{app="chipp-deno", level="${level}"}`;

  let query = `${selector} |~ \`${pattern}\` | json`;
  if (requestId) query += ` | requestId="${requestId}"`;

  const entries = await lokiQueryRange(query, since, limit);
  return {
    query,
    pattern,
    since,
    count: entries.length,
    entries,
  };
}

async function handleLokiStats(args: Record<string, unknown>): Promise<unknown> {
  const since = (args.since as string) || "24h";
  const groupBy = (args.groupBy as string) || "source";

  // For stats, we fetch error logs and aggregate client-side.
  // Loki's metric queries with topk work but return less structured results.
  // Client-side aggregation gives us more control and is simpler.
  const query = '{app="chipp-deno", level="error"} | json';
  const entries = await lokiQueryRange(query, since, 5000);

  // Aggregate by group
  const counts = new Map<string, number>();
  for (const entry of entries) {
    let key: string;
    switch (groupBy) {
      case "source":
        key = entry.source || "(unknown)";
        break;
      case "feature":
        key = entry.feature || "(unknown)";
        break;
      case "message":
        key = entry.msg || entry.errorMessage || "(unknown)";
        break;
      case "version":
        key = entry.version || "(unknown)";
        break;
      default:
        key = entry.source || "(unknown)";
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Sort descending by count
  const stats = Array.from(counts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count);

  return {
    since,
    groupBy,
    totalErrors: entries.length,
    groups: stats.length,
    stats,
  };
}

async function handleLokiStatus(): Promise<unknown> {
  const configuredUrl = Deno.env.get("LOKI_URL") || DEFAULT_LOKI_URL;
  const ready = await isLokiReady(lokiBaseUrl);

  return {
    lokiUrl: lokiBaseUrl,
    configuredUrl,
    ready,
    portForward: portForwardProcess
      ? {
          active: true,
          port: managedPort,
          namespace: LOKI_NAMESPACE,
          service: LOKI_SERVICE,
        }
      : { active: false },
  };
}

async function handleLokiCompare(args: Record<string, unknown>): Promise<unknown> {
  const periodStr = (args.period as string) || "1h";
  const source = args.source as string | undefined;
  const groupBy = (args.groupBy as string) || "source";

  // Build base query
  let baseQuery = '{app="chipp-deno", level="error"} | json';
  if (source) baseQuery += ` | source="${source}"`;

  // Fetch current period
  const currentEntries = await lokiQueryRange(baseQuery, periodStr, 5000);

  // Fetch previous period (same length, shifted back)
  // We need to use raw query_range with explicit start/end for the previous period
  const base = await ensureLoki();
  const periodNano = parseDuration(periodStr);
  const end = nowNano();
  const currentStart = end - BigInt(periodNano);
  const previousEnd = currentStart;
  const previousStart = previousEnd - BigInt(periodNano);

  const params = new URLSearchParams({
    query: baseQuery,
    start: previousStart.toString(),
    end: previousEnd.toString(),
    limit: "5000",
    direction: "backward",
  });

  const url = `${base}/loki/api/v1/query_range?${params}`;
  let previousEntries: ParsedLogEntry[] = [];
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (resp.ok) {
      const data: LokiQueryResponse = await resp.json();
      if (data.data.resultType === "streams") {
        previousEntries = flattenStreamResults(data.data.result as LokiStreamResult[]);
      }
    }
  } catch {
    // If previous period query fails, continue with empty
  }

  // Aggregate both periods
  function aggregate(entries: ParsedLogEntry[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      let key: string;
      switch (groupBy) {
        case "source": key = entry.source || "(unknown)"; break;
        case "feature": key = entry.feature || "(unknown)"; break;
        case "message": key = entry.msg || entry.errorMessage || "(unknown)"; break;
        default: key = entry.source || "(unknown)";
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  const currentCounts = aggregate(currentEntries);
  const previousCounts = aggregate(previousEntries);

  // Merge keys from both periods
  const allKeys = new Set([...currentCounts.keys(), ...previousCounts.keys()]);
  const comparison = Array.from(allKeys).map((key) => {
    const current = currentCounts.get(key) || 0;
    const previous = previousCounts.get(key) || 0;
    const delta = current - previous;
    const changePercent = previous > 0 ? Math.round((delta / previous) * 100) : (current > 0 ? 100 : 0);
    return { group: key, current, previous, delta, changePercent };
  }).sort((a, b) => b.delta - a.delta);

  return {
    period: periodStr,
    groupBy,
    source: source || "(all)",
    currentPeriod: { totalErrors: currentEntries.length },
    previousPeriod: { totalErrors: previousEntries.length },
    overallDelta: currentEntries.length - previousEntries.length,
    overallChangePercent: previousEntries.length > 0
      ? Math.round(((currentEntries.length - previousEntries.length) / previousEntries.length) * 100)
      : (currentEntries.length > 0 ? 100 : 0),
    comparison,
  };
}

async function handleLokiTrace(args: Record<string, unknown>): Promise<unknown> {
  const requestId = args.requestId as string;
  const since = (args.since as string) || "1h";

  // Get ALL log lines for this request (across all levels and sources)
  const query = `{app="chipp-deno"} | json | requestId="${requestId}"`;
  const entries = await lokiQueryRange(query, since, 500);

  // Sort chronologically (oldest first) for trace view
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Extract unique sources and features for summary
  const sources = new Set<string>();
  const features = new Set<string>();
  const levels = new Map<string, number>();
  for (const entry of entries) {
    if (entry.source) sources.add(entry.source);
    if (entry.feature) features.add(entry.feature);
    const lvl = entry.level || "unknown";
    levels.set(lvl, (levels.get(lvl) || 0) + 1);
  }

  return {
    requestId,
    since,
    totalEntries: entries.length,
    summary: {
      sources: Array.from(sources),
      features: Array.from(features),
      levelCounts: Object.fromEntries(levels),
      firstTimestamp: entries[0]?.timestamp,
      lastTimestamp: entries[entries.length - 1]?.timestamp,
    },
    trace: entries.map((e) => ({
      timestamp: e.timestamp,
      level: e.level,
      source: e.source,
      feature: e.feature,
      msg: e.msg,
      errorMessage: e.errorMessage,
      ...(e.errorStack ? { stack: e.errorStack } : {}),
    })),
  };
}

async function handleLokiUserActivity(args: Record<string, unknown>): Promise<unknown> {
  const userId = args.userId as string | undefined;
  const organizationId = args.organizationId as string | undefined;
  const applicationId = args.applicationId as string | undefined;
  const since = (args.since as string) || "24h";
  const limit = (args.limit as number) || 100;

  if (!userId && !organizationId && !applicationId) {
    throw new Error("At least one of userId, organizationId, or applicationId is required");
  }

  // Build filter for analytics events
  let query = '{app="chipp-deno"} | json | source="analytics"';
  if (userId) query += ` | userId="${userId}"`;
  if (organizationId) query += ` | organizationId="${organizationId}"`;
  if (applicationId) query += ` | applicationId="${applicationId}"`;

  const entries = await lokiQueryRange(query, since, limit);

  // Summarize activity by event type
  const eventCounts = new Map<string, number>();
  for (const entry of entries) {
    const event = entry.feature || entry.msg || "(unknown)";
    eventCounts.set(event, (eventCounts.get(event) || 0) + 1);
  }

  const summary = Array.from(eventCounts.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);

  return {
    query,
    since,
    totalEvents: entries.length,
    summary,
    events: entries.map((e) => ({
      timestamp: e.timestamp,
      event: e.feature || e.msg,
      userId: e.userId,
      appId: e.appId,
      orgId: e.orgId,
    })),
  };
}

async function handleLokiErrorImpact(args: Record<string, unknown>): Promise<unknown> {
  const source = args.source as string;
  const feature = args.feature as string | undefined;
  const since = (args.since as string) || "24h";

  // 1. Get error entries
  let errorQuery = `{app="chipp-deno", level="error"} | json | source="${source}"`;
  if (feature) errorQuery += ` | feature="${feature}"`;

  const errors = await lokiQueryRange(errorQuery, since, 1000);

  // 2. Extract affected users and orgs
  const affectedUsers = new Set<string>();
  const affectedOrgs = new Set<string>();
  const errorMessages = new Map<string, number>();

  for (const entry of errors) {
    if (entry.userId) affectedUsers.add(entry.userId);
    if (entry.orgId) affectedOrgs.add(entry.orgId);
    const msg = entry.msg || entry.errorMessage || "(unknown)";
    errorMessages.set(msg, (errorMessages.get(msg) || 0) + 1);
  }

  // 3. Get co-occurring errors (same source, different features)
  let coErrorQuery = `{app="chipp-deno", level="error"} | json | source="${source}"`;
  if (feature) coErrorQuery += ` | feature!="${feature}"`;

  const coErrors = await lokiQueryRange(coErrorQuery, since, 500);
  const coFeatures = new Map<string, number>();
  for (const entry of coErrors) {
    const f = entry.feature || "(unknown)";
    coFeatures.set(f, (coFeatures.get(f) || 0) + 1);
  }

  // 4. Get analytics events from affected users (sample first 5)
  const userActivity: Record<string, unknown[]> = {};
  const sampleUsers = Array.from(affectedUsers).slice(0, 5);
  for (const uid of sampleUsers) {
    const activityQuery = `{app="chipp-deno"} | json | source="analytics" | userId="${uid}"`;
    const activity = await lokiQueryRange(activityQuery, since, 20);
    userActivity[uid] = activity.map((e) => ({
      timestamp: e.timestamp,
      event: e.feature || e.msg,
    }));
  }

  return {
    source,
    feature: feature || "(all)",
    since,
    errorCount: errors.length,
    affectedUsers: affectedUsers.size,
    affectedOrgs: affectedOrgs.size,
    topErrors: Array.from(errorMessages.entries())
      .map(([msg, count]) => ({ message: msg, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    coOccurringFeatures: Array.from(coFeatures.entries())
      .map(([f, count]) => ({ feature: f, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    sampleUserActivity: userActivity,
    affectedUserIds: Array.from(affectedUsers).slice(0, 20),
    affectedOrgIds: Array.from(affectedOrgs).slice(0, 20),
  };
}

// --- Tool Router ---

async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "loki_query":
      return await handleLokiQuery(args);
    case "loki_errors":
      return await handleLokiErrors(args);
    case "loki_search":
      return await handleLokiSearch(args);
    case "loki_stats":
      return await handleLokiStats(args);
    case "loki_status":
      return await handleLokiStatus();
    case "loki_compare":
      return await handleLokiCompare(args);
    case "loki_trace":
      return await handleLokiTrace(args);
    case "loki_user_activity":
      return await handleLokiUserActivity(args);
    case "loki_error_impact":
      return await handleLokiErrorImpact(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- MCP Server ---

const server = new Server(
  {
    name: "mcp-chipp-loki",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, (args || {}) as Record<string, unknown>);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
              hint: error instanceof Error && error.message.includes("port-forward")
                ? "Ensure kubectl is configured with access to the cluster. Try: kubectl get pods -n monitoring"
                : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// --- Cleanup ---

globalThis.addEventListener("unload", () => {
  stopPortForward();
});

// Handle SIGINT/SIGTERM for clean shutdown
const signalHandler = () => {
  stopPortForward();
  Deno.exit(0);
};

try {
  Deno.addSignalListener("SIGINT", signalHandler);
  Deno.addSignalListener("SIGTERM", signalHandler);
} catch {
  // Signal listeners may not be available in all environments
}

// --- Main ---

async function main() {
  log("Starting server...");

  const transport = new StdioServerTransport();

  server.onerror = (error) => {
    log(`Error: ${error}`);
  };

  await server.connect(transport);
  log("Server running on stdio");

  // Auto-check Loki connectivity (non-blocking, don't fail startup)
  try {
    const ready = await isLokiReady(lokiBaseUrl);
    if (ready) {
      log(`Loki reachable at ${lokiBaseUrl}`);
    } else {
      log(`Loki not reachable at ${lokiBaseUrl} -- will auto port-forward on first query`);
    }
  } catch {
    log("Loki connectivity check failed -- will auto port-forward on first query");
  }
}

main().catch((error) => {
  log(`Fatal error: ${error}`);
  Deno.exit(1);
});
