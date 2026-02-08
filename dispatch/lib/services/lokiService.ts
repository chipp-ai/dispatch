/**
 * Loki Service
 *
 * Handles error fingerprinting, message normalization, and context extraction
 * from Grafana alerting webhook payloads. Analogous to sentryService.ts but
 * for Loki-sourced errors.
 */

import crypto from "crypto";

// --- Types ---

export interface LokiErrorContext {
  source: string;
  feature: string;
  msg: string;
  normalizedMsg: string;
  fingerprint: string;
  level: string;
  labels: Record<string, string>;
  sampleLogLines: string[];
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  generatorURL: string | null;
  values: Record<string, string>;
}

export interface GrafanaAlert {
  status: "firing" | "resolved";
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  values: Record<string, string>;
  generatorURL: string;
  fingerprint?: string;
  silenceURL?: string;
  dashboardURL?: string;
  panelURL?: string;
}

export interface GrafanaWebhookPayload {
  receiver: string;
  status: "firing" | "resolved";
  alerts: GrafanaAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  version: string;
  groupKey: string;
  truncatedAlerts: number;
  orgId: number;
  title: string;
  state: string;
  message: string;
}

// --- Normalization ---

/**
 * Normalize an error message by stripping variable parts:
 * - UUIDs (v4 and general hex patterns)
 * - Stripe customer IDs (cus_xxx)
 * - Stripe-style prefixed IDs (sub_xxx, pi_xxx, etc.)
 * - Timestamps (ISO 8601, Unix)
 * - Numeric IDs
 * - Dollar amounts
 * - URL paths after the domain
 * - JWT tokens
 * - IP addresses
 */
export function normalizeErrorMessage(msg: string): string {
  if (!msg) return "";

  let normalized = msg;

  // UUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "*"
  );

  // Stripe-style prefixed IDs: cus_xxx, sub_xxx, pi_xxx, price_xxx, prod_xxx, etc.
  normalized = normalized.replace(
    /\b(cus|sub|pi|pm|price|prod|inv|ch|re|txn|acct|evt|cs|si|seti|plink|whsec|sk|pk|rk)_[A-Za-z0-9]+/g,
    "$1_*"
  );

  // JWT tokens (three dot-separated base64 segments)
  normalized = normalized.replace(
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "JWT_*"
  );

  // ISO 8601 timestamps: 2024-01-15T10:30:00.000Z
  normalized = normalized.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g,
    "*"
  );

  // Date-only patterns: 2024-01-15
  normalized = normalized.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "*");

  // Unix timestamps (10 or 13 digit numbers)
  normalized = normalized.replace(/\b\d{10,13}\b/g, "*");

  // IP addresses
  normalized = normalized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "*");

  // URL paths: replace path segments after domain with *
  normalized = normalized.replace(
    /(https?:\/\/[^/\s]+)(\/[^\s]*)/g,
    "$1/*"
  );

  // Dollar amounts: $12.34, $1,234.56
  normalized = normalized.replace(/\$[\d,]+(\.\d{2})?/g, "$*");

  // Long hex strings (32+ chars, like hashes)
  normalized = normalized.replace(/\b[0-9a-f]{32,}\b/gi, "*");

  // Standalone numeric IDs (5+ digit numbers not already caught)
  normalized = normalized.replace(/\b\d{5,}\b/g, "*");

  // Collapse multiple consecutive * into one
  normalized = normalized.replace(/\*(\s*\*)+/g, "*");

  // Trim whitespace
  normalized = normalized.trim();

  return normalized;
}

/**
 * Generate a stable fingerprint for an error based on source, feature, and normalized message.
 * Returns a hex SHA-256 hash.
 */
export function fingerprint(
  source: string,
  feature: string,
  msg: string
): string {
  const normalizedMsg = normalizeErrorMessage(msg);
  const input = `${source}|${feature}|${normalizedMsg}`;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

// --- Context Extraction ---

/**
 * Extract structured error context from a Grafana alert webhook payload.
 * Grafana sends alerts with labels and annotations that contain the error details.
 *
 * Expected label/annotation mappings from alert rule:
 * - labels.source / annotations.source: the log source field
 * - labels.feature / annotations.feature: the log feature field
 * - annotations.msg / annotations.description: the error message
 * - annotations.log_lines / annotations.summary: sample log lines
 * - values: metric values from the alert evaluation
 */
export function extractContextFromGrafanaAlert(
  alert: GrafanaAlert
): LokiErrorContext {
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};

  // Extract source and feature - check both labels and annotations
  const source =
    labels.source || annotations.source || labels.alertname || "unknown";
  const feature =
    labels.feature || annotations.feature || "unknown";

  // Extract the error message - try multiple annotation keys
  const msg =
    annotations.msg ||
    annotations.description ||
    annotations.summary ||
    annotations.message ||
    labels.msg ||
    `Error from ${source}/${feature}`;

  const normalizedMsg = normalizeErrorMessage(msg);
  const fp = fingerprint(source, feature, msg);

  // Extract sample log lines from annotations
  const sampleLogLines = extractSampleLogLines(annotations);

  // Parse event count from values or annotations
  const eventCount = parseEventCount(alert);

  return {
    source,
    feature,
    msg,
    normalizedMsg,
    fingerprint: fp,
    level: labels.level || labels.severity || "error",
    labels,
    sampleLogLines,
    eventCount,
    firstSeen: alert.startsAt,
    lastSeen: alert.startsAt, // Will be updated on dedup
    generatorURL: alert.generatorURL || null,
    values: alert.values || {},
  };
}

/**
 * Extract sample log lines from Grafana alert annotations.
 * Grafana can include log samples in the annotation template.
 */
function extractSampleLogLines(
  annotations: Record<string, string>
): string[] {
  const raw =
    annotations.log_lines ||
    annotations.sample_logs ||
    annotations.logs ||
    "";

  if (!raw) return [];

  // Split by newlines, filter empties, limit to 10 lines
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 10);
}

/**
 * Parse event count from alert values or annotations.
 * Grafana alert rules typically include the aggregation result in values.
 */
function parseEventCount(alert: GrafanaAlert): number {
  // Check values map (Grafana unified alerting puts metric values here)
  if (alert.values) {
    for (const value of Object.values(alert.values)) {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0) {
        return Math.round(num);
      }
    }
  }

  // Check annotations for explicit count
  const countStr =
    alert.annotations?.event_count ||
    alert.annotations?.count ||
    "";
  if (countStr) {
    const num = parseInt(countStr, 10);
    if (!isNaN(num)) return num;
  }

  return 1;
}

// --- Issue Description Builder ---

/**
 * Build a rich markdown description from Loki error context.
 * Follows the same structure as the Sentry webhook description builder.
 */
export function buildIssueDescription(context: LokiErrorContext): string {
  const lines: string[] = [];

  // Error details
  lines.push("## Error");
  lines.push(`**Source:** \`${context.source}\``);
  lines.push(`**Feature:** \`${context.feature}\``);
  lines.push(`**Message:** ${context.msg}`);
  lines.push(`**Level:** ${context.level}`);
  lines.push("");

  // Normalized message (for dedup transparency)
  if (context.normalizedMsg !== context.msg) {
    lines.push("## Fingerprint");
    lines.push(`**Normalized:** ${context.normalizedMsg}`);
    lines.push(`**Hash:** \`${context.fingerprint.slice(0, 12)}...\``);
    lines.push("");
  }

  // Sample log lines
  if (context.sampleLogLines.length > 0) {
    lines.push("## Sample Log Lines");
    lines.push("```");
    for (const line of context.sampleLogLines) {
      lines.push(line);
    }
    lines.push("```");
    lines.push("");
  }

  // Impact stats
  lines.push("## Impact");
  lines.push(`- **Event count:** ${context.eventCount}`);
  lines.push(
    `- **First seen:** ${new Date(context.firstSeen).toLocaleString()}`
  );
  lines.push(
    `- **Last seen:** ${new Date(context.lastSeen).toLocaleString()}`
  );
  lines.push("");

  // Alert values (metric results)
  const valueEntries = Object.entries(context.values);
  if (valueEntries.length > 0) {
    lines.push("## Alert Metrics");
    for (const [key, value] of valueEntries) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push("");
  }

  // Labels
  const importantLabels = [
    "app",
    "namespace",
    "pod",
    "container",
    "level",
    "env",
    "version",
  ];
  const relevantLabels = Object.entries(context.labels).filter(([key]) =>
    importantLabels.some((l) => key.toLowerCase().includes(l.toLowerCase()))
  );

  if (relevantLabels.length > 0) {
    lines.push("## Environment");
    for (const [key, value] of relevantLabels) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push("");
  }

  // Links
  lines.push("## Links");
  if (context.generatorURL) {
    lines.push(`- [View in Grafana](${context.generatorURL})`);
  }
  lines.push(`- **Source:** Loki / Grafana Alerting`);

  return lines.join("\n");
}
