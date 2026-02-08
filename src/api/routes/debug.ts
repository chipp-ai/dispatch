/**
 * Debug Routes
 *
 * Development-only routes for debugging.
 * Captures browser console logs and writes to file.
 *
 * Log location: .scratch/logs/browser-console.log
 * (Same directory as server logs for easy access)
 */

import { Hono } from "hono";
import { join } from "jsr:@std/path";

// Store browser logs alongside server logs in .scratch/logs/
const LOGS_DIR = ".scratch/logs";
const LOG_FILE = join(LOGS_DIR, "browser.log");

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

    // Ensure logs directory exists
    try {
      await Deno.mkdir(LOGS_DIR, { recursive: true });
    } catch {
      // Directory may already exist
    }

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
