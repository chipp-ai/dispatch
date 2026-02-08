/**
 * Sentry API Service
 *
 * Fetches detailed issue information from Sentry including stack traces,
 * tags, and context that isn't available in webhook payloads.
 */

export interface SentryEventFrame {
  filename?: string;
  function?: string;
  module?: string;
  lineno?: number;
  colno?: number;
  absPath?: string;
  context?: Array<[number, string]>;
  inApp?: boolean;
}

export interface SentryStacktrace {
  frames: SentryEventFrame[];
}

export interface SentryException {
  type: string;
  value: string;
  stacktrace?: SentryStacktrace;
  mechanism?: {
    type: string;
    handled: boolean;
  };
}

export interface SentryRequest {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  query_string?: string;
  data?: unknown;
}

export interface SentryUser {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
}

export interface SentryEventDetails {
  eventID: string;
  context: Record<string, Record<string, unknown>>;
  contexts: Record<string, Record<string, unknown>>;
  entries: Array<{
    type: string;
    data: unknown;
  }>;
  errors: unknown[];
  message?: string;
  metadata: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
  tags: Array<{ key: string; value: string }>;
  user?: SentryUser;
  request?: SentryRequest;
  sdk?: {
    name: string;
    version: string;
  };
  platform: string;
  dateCreated: string;
  dateReceived: string;
  title: string;
}

export interface SentryIssueDetails {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  level: string;
  status: string;
  substatus: string;
  platform: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  metadata: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  isUnhandled: boolean;
  // Latest event details (fetched separately)
  latestEvent?: SentryEventDetails;
}

/**
 * Fetch detailed issue information from Sentry API
 */
export async function fetchSentryIssueDetails(
  issueId: string,
  organizationSlug?: string
): Promise<SentryIssueDetails | null> {
  const apiToken = process.env.SENTRY_API_TOKEN;
  const orgSlug = organizationSlug || process.env.SENTRY_ORGANIZATION_SLUG;

  if (!apiToken) {
    console.warn(
      "[Sentry Service] No SENTRY_API_TOKEN configured, skipping API fetch"
    );
    return null;
  }

  if (!orgSlug) {
    console.warn(
      "[Sentry Service] No SENTRY_ORGANIZATION_SLUG configured, skipping API fetch"
    );
    return null;
  }

  try {
    // Fetch issue details
    const issueResponse = await fetch(
      `https://sentry.io/api/0/organizations/${orgSlug}/issues/${issueId}/`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (!issueResponse.ok) {
      console.error(
        `[Sentry Service] Failed to fetch issue ${issueId}: ${issueResponse.status}`
      );
      return null;
    }

    const issueData = (await issueResponse.json()) as SentryIssueDetails;

    // Fetch latest event for stack trace
    const eventsResponse = await fetch(
      `https://sentry.io/api/0/organizations/${orgSlug}/issues/${issueId}/events/?full=true&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (eventsResponse.ok) {
      const events = (await eventsResponse.json()) as SentryEventDetails[];
      if (events.length > 0) {
        issueData.latestEvent = events[0];
      }
    }

    return issueData;
  } catch (error) {
    console.error("[Sentry Service] Error fetching issue details:", error);
    return null;
  }
}

/**
 * Extract stack trace from Sentry event data
 */
export function extractStackTrace(event: SentryEventDetails): string | null {
  // Look for exception entry
  const exceptionEntry = event.entries?.find((e) => e.type === "exception") as
    | { data?: { values?: SentryException[] } }
    | undefined;

  if (!exceptionEntry?.data?.values?.length) {
    return null;
  }

  const lines: string[] = [];

  for (const exception of exceptionEntry.data.values) {
    lines.push(`**${exception.type}:** ${exception.value}`);
    lines.push("");

    if (exception.stacktrace?.frames) {
      // Frames are in reverse order (most recent last)
      const frames = [...exception.stacktrace.frames].reverse();

      lines.push("```");
      for (const frame of frames.slice(0, 15)) {
        // Limit to 15 frames
        const location = frame.filename || frame.module || "unknown";
        const func = frame.function || "?";
        const line = frame.lineno ? `:${frame.lineno}` : "";
        const col = frame.colno ? `:${frame.colno}` : "";
        const inApp = frame.inApp ? "" : " (library)";

        lines.push(`  at ${func} (${location}${line}${col})${inApp}`);

        // Add context if available (the actual code)
        if (frame.context && frame.lineno) {
          for (const [lineNo, code] of frame.context) {
            const marker = lineNo === frame.lineno ? "→ " : "  ";
            lines.push(`    ${marker}${lineNo} │ ${code}`);
          }
        }
      }
      lines.push("```");
    }
  }

  return lines.join("\n");
}

/**
 * Extract tags as a formatted string
 */
export function extractTags(event: SentryEventDetails): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const tag of event.tags || []) {
    tags[tag.key] = tag.value;
  }
  return tags;
}

/**
 * Extract request info from Sentry event
 */
export function extractRequestInfo(event: SentryEventDetails): {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
} | null {
  const requestEntry = event.entries?.find((e) => e.type === "request") as
    | {
        data?: SentryRequest;
      }
    | undefined;

  if (!requestEntry?.data) {
    return event.request || null;
  }

  return requestEntry.data;
}

/**
 * Extract user info from Sentry event
 */
export function extractUserInfo(event: SentryEventDetails): SentryUser | null {
  return event.user || null;
}

/**
 * Extract contexts (device, OS, runtime, etc.)
 */
export function extractContexts(
  event: SentryEventDetails
): Record<string, Record<string, unknown>> {
  return event.contexts || {};
}
