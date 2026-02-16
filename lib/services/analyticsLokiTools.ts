/**
 * Analytics Loki Tools
 *
 * 6 Loki log-querying tools for the Dispatch orchestrator.
 * Ported from the Deno MCP server (tools/mcp-loki/index.ts) to Node.js.
 *
 * In-cluster: connects to Loki gateway via K8s service URL (no port-forward).
 * Local dev: gracefully returns "Loki not reachable" messages.
 */

import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;

// --- Configuration ---

const LOKI_GATEWAY_URL =
  process.env.LOKI_GATEWAY_URL ||
  "http://loki-gateway.monitoring.svc.cluster.local";

const LOKI_TIMEOUT_MS = 30_000;

// --- Types ---

interface LokiStreamResult {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: LokiStreamResult[];
  };
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
}

// --- Loki Helpers ---

async function isLokiReachable(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOKI_GATEWAY_URL}/loki/api/v1/labels`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function parseDurationMs(since: string): number {
  const match = since.match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return 24 * 3600 * 1000; // default 24h
  const [, num, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return Number(num) * multipliers[unit];
}

function parseLogEntry(
  tsNano: string,
  line: string,
  streamLabels: Record<string, string>
): ParsedLogEntry {
  const ts = new Date(Number(BigInt(tsNano) / 1_000_000n)).toISOString();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      timestamp: ts,
      level: streamLabels.level,
      msg: line,
      pod: streamLabels.pod,
    };
  }

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
    appId:
      (parsed.appId as string) ||
      (parsed.applicationId as string) ||
      undefined,
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
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

async function lokiQueryRange(
  query: string,
  sinceStr: string,
  limit: number
): Promise<ParsedLogEntry[]> {
  const sinceMs = parseDurationMs(sinceStr);
  const endMs = Date.now();
  const startMs = endMs - sinceMs;

  // Loki expects nanoseconds
  const startNano = BigInt(startMs) * 1_000_000n;
  const endNano = BigInt(endMs) * 1_000_000n;

  const params = new URLSearchParams({
    query,
    start: startNano.toString(),
    end: endNano.toString(),
    limit: String(limit),
    direction: "backward",
  });

  const url = `${LOKI_GATEWAY_URL}/loki/api/v1/query_range?${params}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(LOKI_TIMEOUT_MS) });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Loki query failed (${resp.status}): ${body}`);
  }

  const data: LokiQueryResponse = await resp.json();

  if (data.data.resultType === "streams") {
    return flattenStreamResults(data.data.result);
  }

  return [];
}

/**
 * Like lokiQueryRange but with explicit start/end timestamps (for compare tool).
 */
async function lokiQueryRangeAbsolute(
  query: string,
  startNano: bigint,
  endNano: bigint,
  limit: number
): Promise<ParsedLogEntry[]> {
  const params = new URLSearchParams({
    query,
    start: startNano.toString(),
    end: endNano.toString(),
    limit: String(limit),
    direction: "backward",
  });

  const url = `${LOKI_GATEWAY_URL}/loki/api/v1/query_range?${params}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(LOKI_TIMEOUT_MS) });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Loki query failed (${resp.status}): ${body}`);
  }

  const data: LokiQueryResponse = await resp.json();

  if (data.data.resultType === "streams") {
    return flattenStreamResults(data.data.result);
  }

  return [];
}

// --- Tool Definitions ---

export const lokiTools: Tool[] = [
  {
    name: "loki_errors",
    description:
      "Get recent errors from production logs. Filters by source, feature, and/or requestId. Returns structured error objects with timestamps, messages, and context.",
    input_schema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description:
            'Filter by source module (e.g. "billing", "consumer-chat", "copilot", "llm", "stripe-webhook")',
        },
        feature: {
          type: "string",
          description:
            'Filter by feature (e.g. "auto-topup", "credit-check", "stream")',
        },
        requestId: {
          type: "string",
          description:
            "Filter by request ID to trace a single request across all services",
        },
        since: {
          type: "string",
          description: 'Time range (default: "1h"). Examples: "30m", "6h", "7d"',
        },
        limit: {
          type: "number",
          description: "Max entries (default: 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "loki_search",
    description:
      "Search log content by text pattern. Supports regex. Optionally filter by log level or requestId.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description:
            "Text or regex pattern to search for in log messages",
        },
        level: {
          type: "string",
          enum: ["error", "warn", "info", "debug"],
          description: 'Filter by level: "error", "warn", "info", "debug"',
        },
        requestId: {
          type: "string",
          description: "Filter by request ID",
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
      'Aggregated error counts grouped by source, feature, message, or version. Returns {group, count}[] sorted descending. Great for "what\'s erroring?" overview.',
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: 'Time range (default: "24h")',
        },
        groupBy: {
          type: "string",
          enum: ["source", "feature", "message", "version"],
          description:
            'Group by: "source", "feature", "message", or "version" (default: "source")',
        },
      },
      required: [],
    },
  },
  {
    name: "loki_compare",
    description:
      'Compare error counts between two time periods. Answers "did this deploy make things worse?" Shows current vs previous period side-by-side.',
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          description:
            'Period length to compare. e.g. "1h" compares last 1h vs the 1h before that. (default: "1h")',
        },
        source: {
          type: "string",
          description: "Optional: filter to a specific source module",
        },
        groupBy: {
          type: "string",
          enum: ["source", "feature", "message"],
          description:
            'Group by: "source", "feature", or "message" (default: "source")',
        },
      },
      required: [],
    },
  },
  {
    name: "loki_trace",
    description:
      "Trace a single request across all services by requestId. Shows every log line chronologically: middleware -> auth -> service -> external calls -> response.",
    input_schema: {
      type: "object" as const,
      properties: {
        requestId: {
          type: "string",
          description:
            "The request ID to trace (UUID format, auto-generated per request)",
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
      "Get user behavioral analytics from production logs. Query activity for a specific user, org, or app. Returns timestamped events.",
    input_schema: {
      type: "object" as const,
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
      required: [],
    },
  },
];

// --- Tool Executors ---

interface ToolInput {
  [key: string]: unknown;
}

export async function executeLokiTool(
  name: string,
  input: ToolInput
): Promise<string> {
  // Check Loki reachability before every call
  if (!(await isLokiReachable())) {
    return JSON.stringify({
      error: "Loki not reachable",
      hint: "Loki is only available inside the Kubernetes cluster. This is expected in local development.",
    });
  }

  switch (name) {
    case "loki_errors":
      return await handleLokiErrors(input);
    case "loki_search":
      return await handleLokiSearch(input);
    case "loki_stats":
      return await handleLokiStats(input);
    case "loki_compare":
      return await handleLokiCompare(input);
    case "loki_trace":
      return await handleLokiTrace(input);
    case "loki_user_activity":
      return await handleLokiUserActivity(input);
    default:
      return JSON.stringify({ error: `Unknown Loki tool: ${name}` });
  }
}

// --- Handlers ---

async function handleLokiErrors(input: ToolInput): Promise<string> {
  const source = input.source as string | undefined;
  const feature = input.feature as string | undefined;
  const requestId = input.requestId as string | undefined;
  const since = (input.since as string) || "1h";
  const limit = (input.limit as number) || 50;

  let query = '{app="chipp-deno", level="error"} | json';
  if (source) query += ` | source="${source}"`;
  if (feature) query += ` | feature="${feature}"`;
  if (requestId) query += ` | requestId="${requestId}"`;

  const entries = await lokiQueryRange(query, since, limit);

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

  return JSON.stringify({ query, since, count: errors.length, errors });
}

async function handleLokiSearch(input: ToolInput): Promise<string> {
  const pattern = input.pattern as string;
  const level = input.level as string | undefined;
  const requestId = input.requestId as string | undefined;
  const since = (input.since as string) || "1h";
  const limit = (input.limit as number) || 50;

  let selector = '{app="chipp-deno"}';
  if (level) selector = `{app="chipp-deno", level="${level}"}`;

  let query = `${selector} |~ \`${pattern}\` | json`;
  if (requestId) query += ` | requestId="${requestId}"`;

  const entries = await lokiQueryRange(query, since, limit);
  return JSON.stringify({
    query,
    pattern,
    since,
    count: entries.length,
    entries,
  });
}

async function handleLokiStats(input: ToolInput): Promise<string> {
  const since = (input.since as string) || "24h";
  const groupBy = (input.groupBy as string) || "source";

  const query = '{app="chipp-deno", level="error"} | json';
  const entries = await lokiQueryRange(query, since, 5000);

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

  const stats = Array.from(counts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count);

  return JSON.stringify({
    since,
    groupBy,
    totalErrors: entries.length,
    groups: stats.length,
    stats,
  });
}

async function handleLokiCompare(input: ToolInput): Promise<string> {
  const periodStr = (input.period as string) || "1h";
  const source = input.source as string | undefined;
  const groupBy = (input.groupBy as string) || "source";

  let baseQuery = '{app="chipp-deno", level="error"} | json';
  if (source) baseQuery += ` | source="${source}"`;

  // Current period
  const currentEntries = await lokiQueryRange(baseQuery, periodStr, 5000);

  // Previous period (same length, shifted back)
  const periodMs = parseDurationMs(periodStr);
  const endMs = Date.now();
  const currentStartMs = endMs - periodMs;
  const previousEndNano = BigInt(currentStartMs) * 1_000_000n;
  const previousStartNano = BigInt(currentStartMs - periodMs) * 1_000_000n;

  let previousEntries: ParsedLogEntry[] = [];
  try {
    previousEntries = await lokiQueryRangeAbsolute(
      baseQuery,
      previousStartNano,
      previousEndNano,
      5000
    );
  } catch {
    // If previous period query fails, continue with empty
  }

  function aggregate(entries: ParsedLogEntry[]): Map<string, number> {
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
        default:
          key = entry.source || "(unknown)";
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  const currentCounts = aggregate(currentEntries);
  const previousCounts = aggregate(previousEntries);

  const allKeys = new Set([...currentCounts.keys(), ...previousCounts.keys()]);
  const comparison = Array.from(allKeys)
    .map((key) => {
      const current = currentCounts.get(key) || 0;
      const previous = previousCounts.get(key) || 0;
      const delta = current - previous;
      const changePercent =
        previous > 0
          ? Math.round((delta / previous) * 100)
          : current > 0
            ? 100
            : 0;
      return { group: key, current, previous, delta, changePercent };
    })
    .sort((a, b) => b.delta - a.delta);

  return JSON.stringify({
    period: periodStr,
    groupBy,
    source: source || "(all)",
    currentPeriod: { totalErrors: currentEntries.length },
    previousPeriod: { totalErrors: previousEntries.length },
    overallDelta: currentEntries.length - previousEntries.length,
    overallChangePercent:
      previousEntries.length > 0
        ? Math.round(
            ((currentEntries.length - previousEntries.length) /
              previousEntries.length) *
              100
          )
        : currentEntries.length > 0
          ? 100
          : 0,
    comparison,
  });
}

async function handleLokiTrace(input: ToolInput): Promise<string> {
  const requestId = input.requestId as string;
  const since = (input.since as string) || "1h";

  const query = `{app="chipp-deno"} | json | requestId="${requestId}"`;
  const entries = await lokiQueryRange(query, since, 500);

  // Sort chronologically (oldest first) for trace view
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const sources = new Set<string>();
  const features = new Set<string>();
  const levels = new Map<string, number>();
  for (const entry of entries) {
    if (entry.source) sources.add(entry.source);
    if (entry.feature) features.add(entry.feature);
    const lvl = entry.level || "unknown";
    levels.set(lvl, (levels.get(lvl) || 0) + 1);
  }

  return JSON.stringify({
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
  });
}

async function handleLokiUserActivity(input: ToolInput): Promise<string> {
  const userId = input.userId as string | undefined;
  const organizationId = input.organizationId as string | undefined;
  const applicationId = input.applicationId as string | undefined;
  const since = (input.since as string) || "24h";
  const limit = (input.limit as number) || 100;

  if (!userId && !organizationId && !applicationId) {
    return JSON.stringify({
      error:
        "At least one of userId, organizationId, or applicationId is required",
    });
  }

  let query = '{app="chipp-deno"} | json | source="analytics"';
  if (userId) query += ` | userId="${userId}"`;
  if (organizationId) query += ` | organizationId="${organizationId}"`;
  if (applicationId) query += ` | applicationId="${applicationId}"`;

  const entries = await lokiQueryRange(query, since, limit);

  const eventCounts = new Map<string, number>();
  for (const entry of entries) {
    const event = entry.feature || entry.msg || "(unknown)";
    eventCounts.set(event, (eventCounts.get(event) || 0) + 1);
  }

  const summary = Array.from(eventCounts.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);

  return JSON.stringify({
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
  });
}
