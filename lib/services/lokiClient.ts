/**
 * Loki HTTP Client
 *
 * Queries Loki for error impact enrichment data.
 * In k8s, connects via internal service URL. Skips gracefully in local dev.
 */

const LOKI_GATEWAY_URL =
  process.env.LOKI_GATEWAY_URL ||
  "http://loki-gateway.monitoring.svc.cluster.local";

const LOKI_TIMEOUT_MS = 10_000;

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

/**
 * Check if Loki is reachable (only works inside k8s).
 */
async function isLokiAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOKI_GATEWAY_URL}/loki/api/v1/labels`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Run a LogQL query_range against Loki.
 */
async function queryRange(
  query: string,
  since: string,
  limit: number
): Promise<LokiStreamResult[]> {
  const sinceMs = parseDurationMs(since);
  const end = Date.now();
  const start = end - sinceMs;

  const params = new URLSearchParams({
    query,
    start: (start * 1_000_000).toString(), // nanoseconds
    end: (end * 1_000_000).toString(),
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
  return data.data.resultType === "streams" ? data.data.result : [];
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

/**
 * Parse JSON log entries from Loki stream results.
 */
function parseEntries(
  streams: LokiStreamResult[]
): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const stream of streams) {
    for (const [, line] of stream.values) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Not JSON, skip
      }
    }
  }
  return entries;
}

// --- Public API ---

export interface ErrorImpact {
  affectedUserCount: number;
  affectedOrgCount: number;
  errorFrequency: number;
  sampleUserIds: string[];
  sampleOrgIds: string[];
  relatedAnalyticsEvents: Array<{
    event: string;
    userId?: string;
    timestamp?: string;
  }>;
}

/**
 * Fetch error impact data from Loki for a given source/feature.
 * Returns null if Loki is not reachable (e.g. local dev).
 */
export async function fetchErrorImpact(
  source: string,
  feature: string,
  since = "1h"
): Promise<ErrorImpact | null> {
  if (!(await isLokiAvailable())) {
    console.log("[LokiClient] Loki not reachable, skipping enrichment");
    return null;
  }

  try {
    // 1. Query errors for this source/feature
    let errorQuery = `{app="chipp-deno", level="error"} | json | source="${source}"`;
    if (feature && feature !== "unknown") {
      errorQuery += ` | feature="${feature}"`;
    }

    const errorStreams = await queryRange(errorQuery, since, 500);
    const errorEntries = parseEntries(errorStreams);

    // Extract unique userIds and orgIds
    const userIds = new Set<string>();
    const orgIds = new Set<string>();
    for (const entry of errorEntries) {
      if (entry.userId && typeof entry.userId === "string") userIds.add(entry.userId);
      if (entry.orgId && typeof entry.orgId === "string") orgIds.add(entry.orgId);
    }

    // 2. Query analytics events from affected users (sample first 3)
    const relatedEvents: ErrorImpact["relatedAnalyticsEvents"] = [];
    const sampleUsers = Array.from(userIds).slice(0, 3);

    for (const uid of sampleUsers) {
      const activityQuery = `{app="chipp-deno"} | json | source="analytics" | userId="${uid}"`;
      const activityStreams = await queryRange(activityQuery, since, 10);
      const activityEntries = parseEntries(activityStreams);

      for (const entry of activityEntries) {
        relatedEvents.push({
          event: (entry.feature as string) || (entry.msg as string) || "unknown",
          userId: uid,
          timestamp: entry.time as string | undefined,
        });
      }
    }

    return {
      affectedUserCount: userIds.size,
      affectedOrgCount: orgIds.size,
      errorFrequency: errorEntries.length,
      sampleUserIds: Array.from(userIds).slice(0, 10),
      sampleOrgIds: Array.from(orgIds).slice(0, 10),
      relatedAnalyticsEvents: relatedEvents.slice(0, 20),
    };
  } catch (error) {
    console.error("[LokiClient] Error fetching impact data:", error);
    return null;
  }
}

/**
 * Format error impact as markdown for issue description enrichment.
 */
export function formatImpactMarkdown(impact: ErrorImpact): string {
  const lines: string[] = [];

  lines.push("## User Impact");
  lines.push(`- **Affected users:** ${impact.affectedUserCount}`);
  lines.push(`- **Affected orgs:** ${impact.affectedOrgCount}`);
  lines.push(`- **Error frequency:** ${impact.errorFrequency} events`);

  if (impact.sampleUserIds.length > 0) {
    lines.push(`- **Sample user IDs:** ${impact.sampleUserIds.map(id => `\`${id}\``).join(", ")}`);
  }

  if (impact.relatedAnalyticsEvents.length > 0) {
    lines.push("");
    lines.push("### Recent Activity from Affected Users");
    for (const evt of impact.relatedAnalyticsEvents.slice(0, 10)) {
      const ts = evt.timestamp ? ` (${evt.timestamp})` : "";
      lines.push(`- \`${evt.event}\` by \`${evt.userId}\`${ts}`);
    }
  }

  return lines.join("\n");
}
