/**
 * Dev console log endpoint - receives browser console logs and writes to file.
 * Only available in development mode.
 *
 * POST /api/dev/console-log - Write logs
 * DELETE /api/dev/console-log - Clear log file
 *
 * Logs written to: .scratch/logs/browser-console.log
 */
import { Hono } from "hono";
import { join, dirname } from "node:path";

const app = new Hono();

// Get monorepo root (apps/chipp-deno -> monorepo root)
const MONOREPO_ROOT = join(Deno.cwd(), "../..");
const LOG_FILE = join(MONOREPO_ROOT, ".scratch/logs/browser-console.log");

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    },
    2
  );
}

app.post("/", async (c) => {
  // Only in development
  if (Deno.env.get("DENO_ENV") === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  try {
    const { logs } = await c.req.json();

    // Ensure directory exists
    const dir = dirname(LOG_FILE);
    try {
      await Deno.mkdir(dir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    // Format logs
    const formattedLogs = logs
      .map((log: { level: string; args: unknown[]; timestamp?: string }) => {
        const timestamp = log.timestamp || new Date().toISOString();
        const argsStr = log.args
          .map((arg: unknown) => {
            if (typeof arg === "object" && arg !== null) {
              try {
                return safeStringify(arg);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join(" ");
        return `[${timestamp}] [${log.level.toUpperCase()}] ${argsStr}`;
      })
      .join("\n");

    // Append to file
    await Deno.writeTextFile(LOG_FILE, formattedLogs + "\n", { append: true });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error writing browser logs:", error);
    return c.json({ error: "Failed to write logs" }, 500);
  }
});

app.delete("/", async (c) => {
  if (Deno.env.get("DENO_ENV") === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  try {
    await Deno.writeTextFile(LOG_FILE, "");
    return c.json({ success: true });
  } catch (error) {
    console.error("Error clearing browser logs:", error);
    return c.json({ error: "Failed to clear logs" }, 500);
  }
});

export default app;
