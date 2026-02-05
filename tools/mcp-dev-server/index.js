#!/usr/bin/env node

/**
 * MCP Dev Server Management for chipp-deno
 *
 * Tools for managing development servers and searching logs:
 * - Restart/stop dev servers (Deno API + Svelte SPA)
 * - Search logs for errors and patterns
 * - Get server status
 * - Tail recent logs
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, execFileSync } from "child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

// Configuration
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const LOGS_DIR = join(REPO_ROOT, ".scratch", "logs");

// App state file path
const APP_STATE_FILE = join(REPO_ROOT, ".scratch", "app-state.md");

// API base URL for dev server
const API_BASE_URL = process.env.DEV_API_URL || "http://localhost:8000";

// Helper to make authenticated API calls
async function callDevApi(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        // Note: In dev mode, we bypass auth for these endpoints
        // or use a dev token. The API checks ENVIRONMENT !== 'production'
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || `API returned ${response.status}`, status: response.status };
    }

    return data;
  } catch (error) {
    return { error: `Failed to call API: ${error.message}`, url };
  }
}

// Tool definitions
const tools = [
  {
    name: "dev_app_state",
    description:
      "Get the current state of the running SPA. Returns route, user, organization, subscription tier, workspace, and other context. Useful for understanding what page Claude is looking at.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "dev_set_tier",
    description:
      "Set the subscription tier for an organization. Useful for testing tier-gated features. Use dev_app_state first to get the organizationId of the logged-in user.",
    inputSchema: {
      type: "object",
      properties: {
        tier: {
          type: "string",
          enum: ["FREE", "PRO", "TEAM", "BUSINESS", "ENTERPRISE"],
          description: "The subscription tier to set",
        },
        organizationId: {
          type: "string",
          description: "The organization ID to update. If not specified, updates the first organization in the database.",
        },
      },
      required: ["tier"],
    },
  },
  {
    name: "dev_reset_credits",
    description:
      "Reset consumer credits for testing credit exhaustion flows. Sets the credit balance to the specified amount.",
    inputSchema: {
      type: "object",
      properties: {
        credits: {
          type: "number",
          description: "Number of credits to set (default: 100)",
        },
      },
    },
  },
  {
    name: "dev_trigger_ws_event",
    description:
      "Trigger WebSocket events to test real-time UI updates. Events are sent to connected browser clients.",
    inputSchema: {
      type: "object",
      properties: {
        event: {
          type: "string",
          enum: [
            "message.new",
            "typing.start",
            "typing.stop",
            "credits.updated",
            "subscription.changed",
          ],
          description: "The event type to trigger",
        },
        payload: {
          type: "object",
          description:
            "Optional payload data. For message.new: {content, sessionId}. For credits.updated: {balance, threshold}. For subscription.changed: {tier}.",
        },
        userId: {
          type: "string",
          description:
            "Target user ID. If not provided, uses the authenticated user.",
        },
      },
      required: ["event"],
    },
  },
  {
    name: "dev_simulate_webhook",
    description:
      "Simulate Stripe webhook events without going through Stripe. Calls the same handlers that real webhooks trigger.",
    inputSchema: {
      type: "object",
      properties: {
        event: {
          type: "string",
          enum: [
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "invoice.payment_failed",
            "invoice.paid",
            "checkout.session.completed",
            "billing.alert.triggered",
            "charge.dispute.created",
            "charge.dispute.closed",
            "charge.refunded",
          ],
          description: "The Stripe webhook event to simulate",
        },
        customerId: {
          type: "string",
          description:
            "Stripe customer ID (e.g., 'cus_xxx'). If provided, uses this real customer ID to find the organization in the database.",
        },
        data: {
          type: "object",
          description:
            "Optional event data. Can include: subscriptionId, status, amountPaid, currency, priceId, tier, metadata.",
        },
      },
      required: ["event"],
    },
  },
  {
    name: "dev_inject_error",
    description:
      "Inject errors for testing error handling UI. The injected error affects API calls for the specified duration.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["rate_limit", "auth_failure", "network_timeout", "server_error"],
          description:
            "Error type: rate_limit (429), auth_failure (401), network_timeout (30s delay), server_error (500)",
        },
        duration: {
          type: "number",
          description: "Duration in milliseconds (default: 5000, max: 60000)",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "dev_clear_errors",
    description: "Clear all injected errors immediately.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "dev_server_restart",
    description:
      "Restart the development server (Deno API on port 8000 + Svelte SPA on port 5173).",
    inputSchema: {
      type: "object",
      properties: {
        component: {
          type: "string",
          enum: ["all", "api", "web", "worker"],
          description:
            "Which component to restart: all (default), api (Deno on 8000), web (Svelte on 5173), worker (Cloudflare on 8788)",
        },
      },
    },
  },
  {
    name: "dev_server_stop",
    description: "Stop all development server processes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "dev_server_status",
    description:
      "Check if development servers are running and what ports are in use.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "dev_logs_search",
    description:
      "Search development server logs for a pattern. Returns matching lines with context.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (case-insensitive regex)",
        },
        file: {
          type: "string",
          enum: ["server", "browser", "all"],
          description: "Which log file to search: server, browser, or all (default: server)",
        },
        limit: {
          type: "number",
          description: "Maximum number of matches to return (default: 50)",
        },
        context: {
          type: "number",
          description: "Lines of context around each match (default: 2)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "dev_logs_errors",
    description:
      "Get recent errors from development server logs. Finds ERROR, Error, error, exception, failed, etc.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          enum: ["server", "browser", "all"],
          description: "Which log file to check: server, browser, or all (default: all)",
        },
        limit: {
          type: "number",
          description: "Maximum number of errors to return (default: 20)",
        },
        since: {
          type: "string",
          description:
            "Only show errors from logs modified after this time (e.g., '1h', '30m', '2d')",
        },
      },
    },
  },
  {
    name: "dev_logs_tail",
    description:
      "Get the last N lines from a log file. Good for seeing current activity.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          enum: ["server", "browser"],
          description: "Which log file to tail: server (default) or browser",
        },
        lines: {
          type: "number",
          description: "Number of lines to return (default: 100)",
        },
      },
    },
  },
  {
    name: "dev_logs_list",
    description: "List available log files with sizes and modification times.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of files to list (default: 20)",
        },
      },
    },
  },
];

// Helper functions - using execFileSync for safety (no shell injection)
function safeExec(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
  } catch {
    return null;
  }
}

function getPortPids(port) {
  // lsof -ti:PORT returns PIDs using that port
  return safeExec("lsof", ["-ti", `:${port}`]);
}

function killProcess(pattern) {
  // pkill -f pattern
  try {
    execFileSync("pkill", ["-f", pattern], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function killPid(pid) {
  try {
    execFileSync("kill", ["-9", pid], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function pgrepPattern(pattern) {
  return safeExec("pgrep", ["-f", pattern]);
}

function getLogFiles() {
  if (!existsSync(LOGS_DIR)) {
    return [];
  }

  const files = readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith(".log"))
    .map((f) => {
      const fullPath = join(LOGS_DIR, f);
      const stat = statSync(fullPath);
      return {
        name: f,
        path: fullPath,
        size: stat.size,
        modified: stat.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified);

  return files;
}

function parseTimeAgo(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d+)([mhd])$/);
  if (!match) return null;

  const [, num, unit] = match;
  const ms = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }[unit];

  return new Date(Date.now() - parseInt(num) * ms);
}

function searchInFile(filePath, pattern, contextLines = 2, limit = 50) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const regex = new RegExp(pattern, "i");
    const matches = [];

    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      if (regex.test(lines[i])) {
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length - 1, i + contextLines);
        const context = lines.slice(start, end + 1).map((line, idx) => ({
          lineNum: start + idx + 1,
          text: line,
          isMatch: start + idx === i,
        }));
        matches.push({
          lineNumber: i + 1,
          context,
        });
      }
    }

    return matches;
  } catch {
    return [];
  }
}

function findErrors(filePath, limit = 20) {
  const errorPatterns = [
    /\bERROR\b/i,
    /\bError:/,
    /\bException\b/i,
    /\bFailed\b/i,
    /\bCRASH\b/i,
    /\bFATAL\b/i,
    /\bUnhandled\b/i,
    /\b500\b.*error/i,
    /\b4\d{2}\b.*error/i,
  ];

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const errors = [];

    for (let i = 0; i < lines.length && errors.length < limit; i++) {
      const line = lines[i];
      if (errorPatterns.some((p) => p.test(line))) {
        // Get some context
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(lines.length - 1, i + 3);
        errors.push({
          lineNumber: i + 1,
          line: line.slice(0, 500), // Truncate long lines
          context: lines.slice(contextStart, contextEnd + 1).join("\n"),
        });
      }
    }

    return errors;
  } catch {
    return [];
  }
}

// Tool handlers
async function handleTool(name, args) {
  switch (name) {
    case "dev_set_tier": {
      const { tier, organizationId } = args;
      if (!tier) {
        return { error: "tier is required" };
      }

      const body = { tier };
      if (organizationId) body.organizationId = organizationId;

      const result = await callDevApi("/api/dev/set-tier", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result.error) {
        return result;
      }

      return {
        success: true,
        tier,
        organization: result.data,
        message: result.message,
      };
    }

    case "dev_reset_credits": {
      const credits = args.credits ?? 100;

      const result = await callDevApi("/api/dev/reset-credits", {
        method: "POST",
        body: JSON.stringify({ credits }),
      });

      if (result.error) {
        return result;
      }

      return {
        success: true,
        credits,
        data: result.data,
        message: result.message,
      };
    }

    case "dev_trigger_ws_event": {
      const { event, payload, userId } = args;
      if (!event) {
        return { error: "event is required" };
      }

      const body = { event };
      if (payload) body.payload = payload;
      if (userId) body.userId = userId;

      const result = await callDevApi("/api/dev/trigger-ws-event", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result.error) {
        return result;
      }

      return {
        success: true,
        event,
        data: result.data,
        message: result.message,
      };
    }

    case "dev_simulate_webhook": {
      const { event, customerId, data } = args;
      if (!event) {
        return { error: "event is required" };
      }

      const body = { event };
      if (customerId) body.customerId = customerId;
      if (data) body.data = data;

      const result = await callDevApi("/api/dev/simulate-webhook", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result.error) {
        return result;
      }

      return {
        success: true,
        event,
        customerId: customerId || result.data?.customerId,
        data: result.data,
        message: result.message,
      };
    }

    case "dev_inject_error": {
      const { type, duration } = args;
      if (!type) {
        return { error: "type is required" };
      }

      const body = { type };
      if (duration !== undefined) body.duration = duration;

      const result = await callDevApi("/api/dev/inject-error", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result.error) {
        return result;
      }

      return {
        success: true,
        type,
        data: result.data,
        message: result.message,
      };
    }

    case "dev_clear_errors": {
      const result = await callDevApi("/api/dev/inject-error", {
        method: "DELETE",
      });

      if (result.error) {
        return result;
      }

      return {
        success: true,
        data: result.data,
        message: result.message,
      };
    }

    case "dev_app_state": {
      // Read the app state file written by the SPA
      if (!existsSync(APP_STATE_FILE)) {
        return {
          error: "App state file not found",
          hint: "Open the SPA in a browser to populate app state. The SPA writes its state to .scratch/app-state.md",
          file: APP_STATE_FILE,
        };
      }

      try {
        const stat = statSync(APP_STATE_FILE);
        const content = readFileSync(APP_STATE_FILE, "utf-8");
        const ageMs = Date.now() - stat.mtime.getTime();
        const ageSeconds = Math.floor(ageMs / 1000);

        // Add staleness warning if file is old
        let staleness = "";
        if (ageSeconds > 60) {
          const ageMinutes = Math.floor(ageSeconds / 60);
          staleness = `\n\n> **Warning:** State is ${ageMinutes} minute${ageMinutes > 1 ? "s" : ""} old. The SPA may not be running or state tracking may not be initialized.`;
        } else if (ageSeconds > 10) {
          staleness = `\n\n> State updated ${ageSeconds} seconds ago.`;
        }

        return {
          markdown: content + staleness,
          lastModified: stat.mtime.toISOString(),
          ageSeconds,
        };
      } catch (e) {
        return { error: `Failed to read app state: ${e.message}` };
      }
    }

    case "dev_server_restart": {
      const component = args.component || "all";
      const results = { components: [], success: true };

      // Kill existing processes based on component
      if (component === "all" || component === "api") {
        killProcess("deno.*main.ts");
        const pids8000 = getPortPids(8000);
        if (pids8000)
          pids8000
            .split("\n")
            .forEach((pid) => pid.trim() && killPid(pid.trim()));
      }

      if (component === "all" || component === "web") {
        killProcess("vite.*5173");
        const pids5173 = getPortPids(5173);
        if (pids5173)
          pids5173
            .split("\n")
            .forEach((pid) => pid.trim() && killPid(pid.trim()));
      }

      if (component === "all" || component === "worker") {
        killProcess("wrangler.*8788");
        const pids8788 = getPortPids(8788);
        if (pids8788)
          pids8788
            .split("\n")
            .forEach((pid) => pid.trim() && killPid(pid.trim()));
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Start the dev server using scripts/dev.sh
      const devScript = join(REPO_ROOT, "scripts", "dev.sh");

      if (existsSync(devScript)) {
        const scriptArgs = [];
        if (component === "api") scriptArgs.push("--api-only");
        if (component === "web") scriptArgs.push("--no-worker");

        const child = spawn("bash", [devScript, ...scriptArgs], {
          cwd: REPO_ROOT,
          detached: true,
          stdio: "pipe",
        });

        let output = "";
        child.stdout.on("data", (data) => (output += data.toString()));
        child.stderr.on("data", (data) => (output += data.toString()));

        await new Promise((resolve) => setTimeout(resolve, 5000));

        results.components.push({
          name: "chipp-deno",
          success: true,
          ports: {
            api: 8000,
            web: 5173,
            worker: 8788,
          },
          port8000InUse: !!getPortPids(8000),
          port5173InUse: !!getPortPids(5173),
          port8788InUse: !!getPortPids(8788),
          output: output.slice(0, 500),
          logFile: getLogFiles()[0]?.name || "check .scratch/logs/",
        });
      } else {
        results.components.push({
          name: "chipp-deno",
          success: false,
          error: "scripts/dev.sh not found",
        });
        results.success = false;
      }

      results.message = `Dev server restart initiated for ${component}`;
      return results;
    }

    case "dev_server_stop": {
      // Kill all dev processes
      const patterns = [
        "deno.*main.ts",
        "vite",
        "wrangler",
        "npm run dev",
      ];

      patterns.forEach((pattern) => killProcess(pattern));

      // Kill anything on dev ports
      const ports = [8000, 5173, 8788];
      for (const port of ports) {
        const pids = getPortPids(port);
        if (pids) {
          pids.split("\n").forEach((pid) => {
            if (pid.trim()) killPid(pid.trim());
          });
        }
      }

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const port8000 = getPortPids(8000);
      const port5173 = getPortPids(5173);
      const port8788 = getPortPids(8788);

      return {
        success: !port8000 && !port5173 && !port8788,
        message:
          !port8000 && !port5173 && !port8788
            ? "All dev servers stopped"
            : "Some processes may still be running",
        ports: {
          8000: port8000 ? "still in use" : "free",
          5173: port5173 ? "still in use" : "free",
          8788: port8788 ? "still in use" : "free",
        },
      };
    }

    case "dev_server_status": {
      const port8000 = getPortPids(8000);
      const port5173 = getPortPids(5173);
      const port8788 = getPortPids(8788);

      const denoProcess = pgrepPattern("deno.*main.ts");
      const viteProcess = pgrepPattern("vite");
      const wranglerProcess = pgrepPattern("wrangler");

      const recentLogs = getLogFiles().slice(0, 3);

      return {
        ports: {
          8000: port8000 ? "in use (Deno API)" : "free",
          5173: port5173 ? "in use (Vite/Svelte)" : "free",
          8788: port8788 ? "in use (Cloudflare Worker)" : "free",
        },
        processes: {
          deno: !!denoProcess,
          vite: !!viteProcess,
          wrangler: !!wranglerProcess,
        },
        recentLogs: recentLogs.map((f) => ({
          name: f.name,
          size: `${Math.round(f.size / 1024)}KB`,
          modified: f.modified.toISOString(),
        })),
      };
    }

    case "dev_logs_search": {
      const pattern = args.pattern;
      const limit = args.limit || 50;
      const context = args.context || 2;
      const fileFilter = args.file || "server";

      // Get files based on filter
      let files = getLogFiles();
      if (fileFilter === "server") {
        files = files.filter(f => f.name === "server.log");
      } else if (fileFilter === "browser") {
        files = files.filter(f => f.name === "browser.log");
      }
      // "all" uses all files

      if (files.length === 0) {
        return { error: `No ${fileFilter} log files found`, logsDir: LOGS_DIR };
      }

      const results = [];
      let totalMatches = 0;

      for (const file of files) {
        if (totalMatches >= limit) break;

        const matches = searchInFile(
          file.path,
          pattern,
          context,
          limit - totalMatches
        );
        if (matches.length > 0) {
          results.push({
            file: file.name,
            modified: file.modified.toISOString(),
            matches,
          });
          totalMatches += matches.length;
        }
      }

      return {
        pattern,
        totalMatches,
        filesSearched: files.length,
        results,
      };
    }

    case "dev_logs_errors": {
      const limit = args.limit || 20;
      const since = parseTimeAgo(args.since);
      const fileFilter = args.file || "all";

      let files = getLogFiles();

      // Filter by file type
      if (fileFilter === "server") {
        files = files.filter(f => f.name === "server.log");
      } else if (fileFilter === "browser") {
        files = files.filter(f => f.name === "browser.log");
      }
      // "all" uses all files

      if (since) {
        files = files.filter((f) => f.modified >= since);
      }

      if (files.length === 0) {
        return { error: `No matching ${fileFilter} log files found`, logsDir: LOGS_DIR };
      }

      const allErrors = [];

      for (const file of files) {
        if (allErrors.length >= limit) break;

        const errors = findErrors(file.path, limit - allErrors.length);
        errors.forEach((err) => {
          allErrors.push({
            file: file.name,
            ...err,
          });
        });
      }

      return {
        totalErrors: allErrors.length,
        filesSearched: files.length,
        errors: allErrors,
      };
    }

    case "dev_logs_tail": {
      const lines = args.lines || 100;
      const fileType = args.file || "server";
      const fileName = fileType === "browser" ? "browser.log" : "server.log";
      const filePath = join(LOGS_DIR, fileName);

      if (!existsSync(filePath)) {
        return { error: `Log file not found: ${fileName}`, logsDir: LOGS_DIR };
      }

      try {
        const stat = statSync(filePath);
        const content = readFileSync(filePath, "utf-8");
        const allLines = content.split("\n");
        const tailLines = allLines.slice(-lines);

        return {
          file: fileName,
          modified: stat.mtime.toISOString(),
          totalLines: allLines.length,
          showing: tailLines.length,
          content: tailLines.join("\n"),
        };
      } catch (e) {
        return { error: `Failed to read log: ${e.message}` };
      }
    }

    case "dev_logs_list": {
      const limit = args.limit || 20;
      const files = getLogFiles().slice(0, limit);

      return {
        logsDir: LOGS_DIR,
        count: files.length,
        files: files.map((f) => ({
          name: f.name,
          size: `${Math.round(f.size / 1024)}KB`,
          modified: f.modified.toISOString(),
        })),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run the server
const server = new Server(
  {
    name: "mcp-dev-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args || {});
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
          text: JSON.stringify({ error: error.message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-dev-server] Server started");
}

main().catch((error) => {
  console.error("[mcp-dev-server] Fatal error:", error);
  process.exit(1);
});
