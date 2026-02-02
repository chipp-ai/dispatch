/**
 * Debug Routes
 *
 * Development-only routes for debugging.
 * Captures browser console logs and writes to file.
 */

import { Hono } from "hono";

const LOG_FILE = "/tmp/browser-console.log";

export const debugRoutes = new Hono();

interface LogEntry {
  timestamp: string;
  level: "log" | "warn" | "error" | "info" | "debug";
  args: unknown[];
  url: string;
}

/**
 * POST /debug/log
 * Receive browser console logs and write to file
 */
debugRoutes.post("/log", async (c) => {
  try {
    const entry: LogEntry = await c.req.json();

    // Format the log line
    const levelIcon =
      {
        log: "📝",
        warn: "⚠️",
        error: "❌",
        info: "ℹ️",
        debug: "🔍",
      }[entry.level] || "📝";

    const argsStr = entry.args
      .map((arg) => {
        if (typeof arg === "object") {
          return JSON.stringify(arg);
        }
        return String(arg);
      })
      .join(" ");

    const logLine = `${entry.timestamp} ${levelIcon} [${entry.level.toUpperCase()}] ${argsStr}\n`;

    // Append to log file
    await Deno.writeTextFile(LOG_FILE, logLine, { append: true });

    return c.json({ ok: true });
  } catch (error) {
    // Don't fail on logging errors
    console.error("[debug] Failed to write log:", error);
    return c.json({ ok: false }, 200);
  }
});

/**
 * GET /debug/logs
 * Read recent browser logs (for debugging)
 */
debugRoutes.get("/logs", async (c) => {
  try {
    const lines = c.req.query("lines") || "100";
    const content = await Deno.readTextFile(LOG_FILE);
    const allLines = content.split("\n").filter(Boolean);
    const recentLines = allLines.slice(-parseInt(lines, 10));
    return c.text(recentLines.join("\n"));
  } catch {
    return c.text("No logs yet");
  }
});

/**
 * DELETE /debug/logs
 * Clear browser logs
 */
debugRoutes.delete("/logs", async (c) => {
  try {
    await Deno.writeTextFile(LOG_FILE, "");
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false });
  }
});
