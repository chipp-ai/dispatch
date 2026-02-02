#!/usr/bin/env node

/**
 * MCP Browser DevTools Server
 *
 * Connects to Chrome via DevTools Protocol to provide:
 * - Console log access (live buffer)
 * - Network request monitoring
 * - Screenshot capture
 * - JavaScript execution
 * - Page information
 * - Multi-tab management
 * - Computed styles extraction
 * - Screenshot comparison
 * - Style diffing between pages
 * - Design token extraction
 *
 * Usage:
 * 1. Start Chrome with: chrome --remote-debugging-port=9222
 * 2. Run this MCP server
 * 3. Use tools via Claude Code
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import CDP from "chrome-remote-interface";
import { spawn, execFileSync } from "child_process";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { platform, homedir } from "os";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Configuration
const CDP_HOST = process.env.CDP_HOST || "localhost";
const CDP_PORT = parseInt(process.env.CDP_PORT || "9222");
const MAX_LOGS = parseInt(process.env.MAX_LOGS || "500");
const MAX_REQUESTS = parseInt(process.env.MAX_REQUESTS || "200");

// State - buffers for logs and network requests
let consoleLogs = [];
let networkRequests = [];
let isConnected = false;

// Multi-tab state
let tabs = new Map(); // tabId -> { client, targetInfo }
let activeTabId = null;

// Session state for rich context
let sessionState = {
  currentUrl: null,
  currentTitle: null,
  lastAction: null,
  actionsPerformed: [],
  errorsEncountered: [],
};

// Helper to get current page state
async function getPageState(cdp) {
  try {
    const { Runtime } = cdp;
    const [urlResult, titleResult] = await Promise.all([
      Runtime.evaluate({
        expression: "window.location.href",
        returnByValue: true,
      }),
      Runtime.evaluate({ expression: "document.title", returnByValue: true }),
    ]);
    return {
      url: urlResult.result.value,
      title: titleResult.result.value,
    };
  } catch {
    return { url: null, title: null };
  }
}

// Helper to detect recent errors in console
function getRecentErrors(since = 5000) {
  const cutoff = Date.now() - since;
  return consoleLogs
    .filter(
      (l) => l.type === "error" && new Date(l.timestamp).getTime() > cutoff
    )
    .map((l) => l.args.join(" "))
    .slice(-3);
}

// Helper to detect recent network failures
function getRecentNetworkFailures(since = 5000) {
  const cutoff = Date.now() - since;
  return networkRequests
    .filter((r) => {
      const reqTime = new Date(r.timestamp).getTime();
      return (
        reqTime > cutoff &&
        (r.status === "failed" ||
          (typeof r.status === "number" && r.status >= 400))
      );
    })
    .map(
      (r) =>
        `${r.method} ${new URL(r.url).pathname} → ${r.status}${r.error ? ` (${r.error})` : ""}`
    )
    .slice(-3);
}

// Track action for context
function recordAction(action, details) {
  sessionState.lastAction = {
    action,
    details,
    timestamp: new Date().toISOString(),
  };
  sessionState.actionsPerformed.push(sessionState.lastAction);
  if (sessionState.actionsPerformed.length > 20) {
    sessionState.actionsPerformed = sessionState.actionsPerformed.slice(-20);
  }
}

// Get all available targets (tabs)
async function getTargets() {
  try {
    const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
    return targets.filter((t) => t.type === "page");
  } catch (error) {
    throw new Error(
      `Failed to list Chrome targets at ${CDP_HOST}:${CDP_PORT}. Make sure Chrome is running with --remote-debugging-port=${CDP_PORT}`
    );
  }
}

// Connect to a specific tab by target ID
async function connectToTab(targetId) {
  if (tabs.has(targetId)) {
    return tabs.get(targetId).client;
  }

  try {
    const client = await CDP({
      host: CDP_HOST,
      port: CDP_PORT,
      target: targetId,
    });

    const { Runtime, Network, Page, Console } = client;

    // Enable domains
    await Promise.all([
      Runtime.enable(),
      Network.enable(),
      Page.enable(),
      Console.enable(),
    ]);

    // Get target info
    const targets = await getTargets();
    const targetInfo = targets.find((t) => t.id === targetId);

    tabs.set(targetId, { client, targetInfo });

    // Handle disconnect
    client.on("disconnect", () => {
      tabs.delete(targetId);
      if (activeTabId === targetId) {
        activeTabId = null;
      }
      console.error(`[mcp-browser-devtools] Disconnected from tab ${targetId}`);
    });

    // Set up event listeners for the first connected tab
    if (tabs.size === 1) {
      setupEventListeners(client);
    }

    isConnected = true;
    console.error(`[mcp-browser-devtools] Connected to tab ${targetId}`);

    return client;
  } catch (error) {
    throw new Error(`Failed to connect to tab ${targetId}: ${error.message}`);
  }
}

// Setup event listeners for a CDP client
function setupEventListeners(client) {
  const { Runtime, Network } = client;

  // Listen for console messages
  Runtime.on("consoleAPICalled", (params) => {
    const log = {
      timestamp: new Date().toISOString(),
      type: params.type,
      args: params.args.map((arg) => {
        if (arg.type === "string") return arg.value;
        if (arg.type === "number") return arg.value;
        if (arg.type === "boolean") return arg.value;
        if (arg.type === "undefined") return "undefined";
        if (arg.type === "object") {
          if (arg.preview) {
            return JSON.stringify(
              arg.preview.properties?.reduce((acc, p) => {
                acc[p.name] = p.value;
                return acc;
              }, {}) || arg.description
            );
          }
          return arg.description || "[object]";
        }
        return arg.description || String(arg.value);
      }),
      stackTrace: params.stackTrace?.callFrames
        ?.slice(0, 3)
        .map(
          (f) =>
            `${f.functionName || "(anonymous)"} at ${f.url}:${f.lineNumber}`
        ),
    };

    consoleLogs.push(log);
    if (consoleLogs.length > MAX_LOGS) {
      consoleLogs = consoleLogs.slice(-MAX_LOGS);
    }
  });

  // Listen for exceptions
  Runtime.on("exceptionThrown", (params) => {
    const log = {
      timestamp: new Date().toISOString(),
      type: "error",
      args: [params.exceptionDetails?.text || "Exception thrown"],
      exception: params.exceptionDetails?.exception?.description,
      stackTrace: params.exceptionDetails?.stackTrace?.callFrames
        ?.slice(0, 5)
        .map(
          (f) =>
            `${f.functionName || "(anonymous)"} at ${f.url}:${f.lineNumber}`
        ),
    };
    consoleLogs.push(log);
    if (consoleLogs.length > MAX_LOGS) {
      consoleLogs = consoleLogs.slice(-MAX_LOGS);
    }
  });

  // Listen for network requests
  Network.on("requestWillBeSent", (params) => {
    networkRequests.push({
      id: params.requestId,
      timestamp: new Date().toISOString(),
      method: params.request.method,
      url: params.request.url,
      type: params.type,
      status: "pending",
    });
    if (networkRequests.length > MAX_REQUESTS) {
      networkRequests = networkRequests.slice(-MAX_REQUESTS);
    }
  });

  Network.on("responseReceived", (params) => {
    const req = networkRequests.find((r) => r.id === params.requestId);
    if (req) {
      req.status = params.response.status;
      req.statusText = params.response.statusText;
      req.mimeType = params.response.mimeType;
    }
  });

  Network.on("loadingFailed", (params) => {
    const req = networkRequests.find((r) => r.id === params.requestId);
    if (req) {
      req.status = "failed";
      req.error = params.errorText;
    }
  });
}

// Connect to the first available tab (backwards compatible)
async function connectToBrowser() {
  if (activeTabId && tabs.has(activeTabId)) {
    return tabs.get(activeTabId).client;
  }

  const targets = await getTargets();
  if (targets.length === 0) {
    throw new Error("No browser tabs available");
  }

  const targetId = targets[0].id;
  const client = await connectToTab(targetId);
  activeTabId = targetId;

  return client;
}

// Get active CDP client
function getActiveClient() {
  if (activeTabId && tabs.has(activeTabId)) {
    return tabs.get(activeTabId).client;
  }
  return null;
}

// Tool definitions
const tools = [
  // ============ Multi-Tab Management ============
  {
    name: "browser_list_tabs",
    description:
      "List all open browser tabs with their IDs, URLs, and titles. Use tab IDs with other tools to operate on specific tabs.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_open_tab",
    description:
      "Open a new browser tab with the specified URL. Returns the tab ID for use with other tools.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to open in the new tab",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_switch_tab",
    description:
      "Switch the active tab to the specified tab ID. Subsequent operations will target this tab.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: {
          type: "string",
          description: "Tab ID to switch to (from browser_list_tabs)",
        },
      },
      required: ["tabId"],
    },
  },
  {
    name: "browser_close_tab",
    description: "Close a browser tab by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: {
          type: "string",
          description: "Tab ID to close",
        },
      },
      required: ["tabId"],
    },
  },

  // ============ Style Comparison Tools ============
  {
    name: "browser_get_computed_styles",
    description:
      "Get computed CSS styles for an element. Returns actual rendered values (after browser resolves inheritance, specificity, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific CSS properties to get (e.g., ['color', 'font-size']). Use 'all' or omit for common properties.",
        },
        pseudoElement: {
          type: "string",
          enum: ["::before", "::after", "::first-line", "::first-letter"],
          description: "Optional pseudo-element to get styles for",
        },
        tabId: {
          type: "string",
          description: "Optional tab ID (defaults to active tab)",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_compare_screenshots",
    description:
      "Compare screenshots between two tabs or URLs. Returns a visual diff highlighting differences.",
    inputSchema: {
      type: "object",
      properties: {
        reference: {
          type: "object",
          properties: {
            tabId: { type: "string" },
            url: { type: "string" },
          },
          description:
            "Reference page - either { tabId } or { url } to navigate to",
        },
        compare: {
          type: "object",
          properties: {
            tabId: { type: "string" },
            url: { type: "string" },
          },
          description:
            "Comparison page - either { tabId } or { url } to navigate to",
        },
        threshold: {
          type: "number",
          description:
            "Pixel difference tolerance (0-1, default: 0.1). Higher = more tolerant.",
        },
        fullPage: {
          type: "boolean",
          description: "Capture full page instead of viewport (default: false)",
        },
        saveDiff: {
          type: "string",
          description:
            "Path to save diff image (optional, e.g., '.scratch/diff.png')",
        },
      },
      required: ["reference", "compare"],
    },
  },
  {
    name: "browser_style_diff",
    description:
      "Compare computed styles between two pages/tabs for matching elements. Shows which CSS properties differ.",
    inputSchema: {
      type: "object",
      properties: {
        url1: {
          type: "string",
          description: "First URL or tab ID for comparison",
        },
        url2: {
          type: "string",
          description: "Second URL or tab ID for comparison",
        },
        selector: {
          type: "string",
          description: "CSS selector for element to compare",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description:
            "CSS properties to compare (default: common visual properties)",
        },
      },
      required: ["url1", "url2", "selector"],
    },
  },
  {
    name: "browser_extract_design_tokens",
    description:
      "Extract design tokens (colors, fonts, spacing, etc.) from a page. Useful for understanding the visual language.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to extract tokens from (optional if tab active)",
        },
        tabId: {
          type: "string",
          description: "Tab ID to extract from (optional)",
        },
      },
    },
  },
  {
    name: "browser_batch_style_compare",
    description:
      "Compare multiple elements between two pages at once. Useful for systematic page comparison.",
    inputSchema: {
      type: "object",
      properties: {
        referenceUrl: {
          type: "string",
          description:
            "Reference page URL (e.g., https://app.chipp.ai/dashboard)",
        },
        compareUrl: {
          type: "string",
          description:
            "Comparison page URL (e.g., http://localhost:5174/dashboard)",
        },
        selectors: {
          type: "array",
          items: { type: "string" },
          description: "Array of CSS selectors to compare",
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description: "CSS properties to compare (default: visual properties)",
        },
      },
      required: ["referenceUrl", "compareUrl", "selectors"],
    },
  },

  // ============ Original Tools ============
  {
    name: "browser_get_console_logs",
    description:
      "Get recent browser console logs (console.log, console.error, console.warn, etc.). Returns the most recent logs from the buffer.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of logs to return (default: 50)",
        },
        type: {
          type: "string",
          enum: ["all", "log", "warn", "error", "info", "debug"],
          description: "Filter by log type (default: all)",
        },
        search: {
          type: "string",
          description: "Search string to filter logs",
        },
        clear: {
          type: "boolean",
          description: "Clear the log buffer after reading (default: false)",
        },
      },
    },
  },
  {
    name: "browser_get_network_requests",
    description:
      "Get recent network requests made by the browser. Shows URLs, methods, status codes, and errors.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of requests to return (default: 50)",
        },
        status: {
          type: "string",
          enum: ["all", "pending", "success", "error"],
          description:
            "Filter by status (default: all). 'success' = 2xx/3xx, 'error' = 4xx/5xx/failed",
        },
        search: {
          type: "string",
          description: "Search string to filter URLs",
        },
        clear: {
          type: "boolean",
          description:
            "Clear the request buffer after reading (default: false)",
        },
      },
    },
  },
  {
    name: "browser_take_screenshot",
    description:
      "Take a screenshot of the current browser tab. Returns base64-encoded PNG image.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description:
            "Capture full scrollable page (default: false, captures viewport only)",
        },
        quality: {
          type: "number",
          description: "Image quality 0-100 for JPEG (default: PNG format)",
        },
        tabId: {
          type: "string",
          description: "Optional tab ID (defaults to active tab)",
        },
      },
    },
  },
  {
    name: "browser_execute_js",
    description:
      "Execute JavaScript code in the browser context. Use for debugging or inspecting page state.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript code to execute",
        },
        awaitPromise: {
          type: "boolean",
          description:
            "Wait for promise to resolve if code returns a promise (default: true)",
        },
        tabId: {
          type: "string",
          description: "Optional tab ID (defaults to active tab)",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "browser_get_page_info",
    description:
      "Get information about the current page: URL, title, and document state.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: {
          type: "string",
          description: "Optional tab ID (defaults to active tab)",
        },
      },
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate to a URL in the current tab.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to",
        },
        tabId: {
          type: "string",
          description: "Optional tab ID (defaults to active tab)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_reload",
    description: "Reload the current page.",
    inputSchema: {
      type: "object",
      properties: {
        ignoreCache: {
          type: "boolean",
          description: "Ignore cache when reloading (default: false)",
        },
      },
    },
  },
  {
    name: "browser_connection_status",
    description:
      "Check if connected to Chrome DevTools and get connection info.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_start_chrome",
    description:
      "Start Chrome with DevTools debugging enabled. Required before using other browser tools.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Optional URL to open on startup",
        },
      },
    },
  },
  {
    name: "browser_click",
    description:
      "Click an element on the page by CSS selector or text content. Use this to interact with UI elements you've created.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector (e.g., 'button.submit', '#my-id', '[data-testid=\"save\"]')",
        },
        text: {
          type: "string",
          description:
            "Find element containing this text (searches buttons, links, and common interactive elements)",
        },
        index: {
          type: "number",
          description:
            "If multiple elements match, click the nth one (0-indexed, default: 0)",
        },
      },
    },
  },
  {
    name: "browser_type",
    description:
      "Type text into an input field. Finds the element by selector and types the given text.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector for the input element (e.g., 'input[name=\"email\"]', '#username')",
        },
        text: {
          type: "string",
          description: "Text to type into the field",
        },
        clear: {
          type: "boolean",
          description: "Clear the field before typing (default: true)",
        },
        pressEnter: {
          type: "boolean",
          description: "Press Enter after typing (default: false)",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_wait_for",
    description:
      "Wait for an element to appear on the page. Useful after navigation or dynamic content loading.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector to wait for",
        },
        text: {
          type: "string",
          description: "Wait for element containing this text",
        },
        timeout: {
          type: "number",
          description: "Maximum time to wait in milliseconds (default: 5000)",
        },
        visible: {
          type: "boolean",
          description:
            "Wait for element to be visible, not just present (default: true)",
        },
      },
    },
  },
  {
    name: "browser_get_element",
    description:
      "Get information about an element: text content, attributes, visibility, dimensions. Use to verify UI elements exist and have correct content.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element",
        },
        attributes: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific attributes to retrieve (e.g., ['href', 'data-id']). Default: common attributes.",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_select",
    description:
      "Select an option from a <select> dropdown by value, text, or index.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the <select> element",
        },
        value: {
          type: "string",
          description: "Option value to select",
        },
        text: {
          type: "string",
          description: "Option text to select (visible label)",
        },
        index: {
          type: "number",
          description: "Option index to select (0-indexed)",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_hover",
    description:
      "Hover over an element to trigger hover states, tooltips, or dropdown menus.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to hover",
        },
      },
      required: ["selector"],
    },
  },
];

// Common CSS properties for style comparison
const COMMON_STYLE_PROPERTIES = [
  // Typography
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "color",
  // Box Model
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  // Layout
  "display",
  "position",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "gap",
  // Background
  "background-color",
  "background-image",
  // Effects
  "box-shadow",
  "opacity",
  "overflow",
  "z-index",
];

// Helper to find Chrome path
function getChromePath() {
  const os = platform();
  if (os === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  } else if (os === "linux") {
    try {
      return (
        execFileSync("which", ["google-chrome"], {
          encoding: "utf-8",
        }).trim() ||
        execFileSync("which", ["chromium-browser"], {
          encoding: "utf-8",
        }).trim() ||
        execFileSync("which", ["chromium"], { encoding: "utf-8" }).trim()
      );
    } catch {
      return null;
    }
  }
  return null;
}

// Helper to check if port is in use
function isPortInUse(port) {
  try {
    const result = execFileSync("lsof", ["-ti", `:${port}`], {
      encoding: "utf-8",
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// Helper to check if Chrome is running (without debug port)
function isChromeRunning() {
  try {
    if (platform() === "darwin") {
      const result = execFileSync("pgrep", ["-x", "Google Chrome"], {
        encoding: "utf-8",
      });
      return result.trim().length > 0;
    } else {
      const result = execFileSync("pgrep", ["-f", "chrome"], {
        encoding: "utf-8",
      });
      return result.trim().length > 0;
    }
  } catch {
    return false;
  }
}

// Helper to quit Chrome (macOS only for now)
function quitChrome() {
  try {
    if (platform() === "darwin") {
      execFileSync("osascript", [
        "-e",
        'tell application "Google Chrome" to quit',
      ]);
      return true;
    } else {
      execFileSync("pkill", ["-f", "chrome"]);
      return true;
    }
  } catch {
    return false;
  }
}

// Helper to get CDP client for a tab
async function getTabClient(tabId) {
  if (tabId) {
    if (tabs.has(tabId)) {
      return tabs.get(tabId).client;
    }
    return await connectToTab(tabId);
  }
  return await connectToBrowser();
}

// Take screenshot from a specific tab
async function captureScreenshot(tabId, fullPage = false) {
  const cdp = await getTabClient(tabId);
  const { Page } = cdp;

  const params = {
    format: "png",
    captureBeyondViewport: fullPage,
  };

  const { data } = await Page.captureScreenshot(params);
  return Buffer.from(data, "base64");
}

// Tool handlers
async function handleTool(name, args) {
  // Connection status doesn't require connection
  if (name === "browser_connection_status") {
    return {
      connected: isConnected,
      host: CDP_HOST,
      port: CDP_PORT,
      logsBuffered: consoleLogs.length,
      requestsBuffered: networkRequests.length,
      activeTabs: tabs.size,
      activeTabId,
      instructions: isConnected
        ? "Connected and monitoring browser activity."
        : `Not connected. Start Chrome with: chrome --remote-debugging-port=${CDP_PORT}`,
    };
  }

  // ============ Multi-Tab Management ============
  if (name === "browser_list_tabs") {
    try {
      const targets = await getTargets();
      const tabList = targets.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        isActive: t.id === activeTabId,
        isConnected: tabs.has(t.id),
      }));

      return {
        summary: `Found ${tabList.length} tab(s). Active: ${activeTabId ? tabList.find((t) => t.isActive)?.title || "unknown" : "none"}`,
        tabs: tabList,
        activeTabId,
      };
    } catch (error) {
      return {
        error: error.message,
        hint: `Make sure Chrome is running with --remote-debugging-port=${CDP_PORT}`,
      };
    }
  }

  if (name === "browser_open_tab") {
    const cdp = await connectToBrowser();
    const { Target } = cdp;

    // Create new target
    const { targetId } = await Target.createTarget({ url: args.url });

    // Wait for page to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Connect to the new tab
    await connectToTab(targetId);
    activeTabId = targetId;

    return {
      summary: `Opened new tab with URL: ${args.url}`,
      tabId: targetId,
      url: args.url,
    };
  }

  if (name === "browser_switch_tab") {
    const { tabId } = args;

    // Verify tab exists
    const targets = await getTargets();
    const target = targets.find((t) => t.id === tabId);

    if (!target) {
      return {
        error: `Tab not found: ${tabId}`,
        availableTabs: targets.map((t) => ({ id: t.id, title: t.title })),
      };
    }

    // Connect if not already
    await connectToTab(tabId);
    activeTabId = tabId;

    return {
      summary: `Switched to tab: "${target.title}" (${new URL(target.url).pathname})`,
      tabId,
      url: target.url,
      title: target.title,
    };
  }

  if (name === "browser_close_tab") {
    const { tabId } = args;
    const cdp = await connectToBrowser();
    const { Target } = cdp;

    await Target.closeTarget({ targetId: tabId });

    // Clean up
    if (tabs.has(tabId)) {
      const { client } = tabs.get(tabId);
      await client.close().catch(() => {});
      tabs.delete(tabId);
    }

    if (activeTabId === tabId) {
      activeTabId = null;
      // Switch to another tab if available
      const targets = await getTargets();
      if (targets.length > 0) {
        activeTabId = targets[0].id;
      }
    }

    return {
      summary: `Closed tab: ${tabId}`,
      newActiveTab: activeTabId,
    };
  }

  // ============ Style Comparison Tools ============
  if (name === "browser_get_computed_styles") {
    const cdp = await getTabClient(args.tabId);
    const { Runtime } = cdp;

    const properties = args.properties || COMMON_STYLE_PROPERTIES;
    const propsToGet =
      properties === "all" ? COMMON_STYLE_PROPERTIES : properties;
    const pseudoElement = args.pseudoElement || null;

    const code = `
      (() => {
        const el = document.querySelector(${JSON.stringify(args.selector)});
        if (!el) return { error: 'Element not found: ' + ${JSON.stringify(args.selector)} };

        const styles = window.getComputedStyle(el, ${JSON.stringify(pseudoElement)});
        const result = {};

        ${JSON.stringify(propsToGet)}.forEach(prop => {
          result[prop] = styles.getPropertyValue(prop);
        });

        return {
          found: true,
          selector: ${JSON.stringify(args.selector)},
          tag: el.tagName.toLowerCase(),
          styles: result,
          dimensions: {
            width: el.offsetWidth,
            height: el.offsetHeight
          }
        };
      })()
    `;

    const result = await Runtime.evaluate({
      expression: code,
      returnByValue: true,
    });

    if (result.result.value?.error) {
      return { error: result.result.value.error };
    }

    return result.result.value;
  }

  if (name === "browser_compare_screenshots") {
    const {
      reference,
      compare,
      threshold = 0.1,
      fullPage = false,
      saveDiff,
    } = args;

    // Get or create tabs for both pages
    let refTabId, cmpTabId;

    if (reference.tabId) {
      refTabId = reference.tabId;
    } else if (reference.url) {
      // Open reference URL in a new tab
      const cdp = await connectToBrowser();
      const { Target } = cdp;
      const { targetId } = await Target.createTarget({ url: reference.url });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await connectToTab(targetId);
      refTabId = targetId;
    }

    if (compare.tabId) {
      cmpTabId = compare.tabId;
    } else if (compare.url) {
      // Open compare URL in a new tab
      const cdp = await connectToBrowser();
      const { Target } = cdp;
      const { targetId } = await Target.createTarget({ url: compare.url });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await connectToTab(targetId);
      cmpTabId = targetId;
    }

    // Capture screenshots
    const refScreenshot = await captureScreenshot(refTabId, fullPage);
    const cmpScreenshot = await captureScreenshot(cmpTabId, fullPage);

    // Parse PNGs
    const refPng = PNG.sync.read(refScreenshot);
    const cmpPng = PNG.sync.read(cmpScreenshot);

    // Ensure same dimensions (use smaller)
    const width = Math.min(refPng.width, cmpPng.width);
    const height = Math.min(refPng.height, cmpPng.height);

    // Create diff image
    const diff = new PNG({ width, height });

    // Compare pixels
    const diffPixels = pixelmatch(
      refPng.data,
      cmpPng.data,
      diff.data,
      width,
      height,
      { threshold }
    );

    const totalPixels = width * height;
    const matchPercentage = ((totalPixels - diffPixels) / totalPixels) * 100;

    // Save diff if requested
    if (saveDiff) {
      const dir = saveDiff.substring(0, saveDiff.lastIndexOf("/"));
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(saveDiff, PNG.sync.write(diff));
    }

    // Convert diff to base64
    const diffBase64 = PNG.sync.write(diff).toString("base64");

    return {
      summary: `Screenshots are ${matchPercentage.toFixed(1)}% similar. ${diffPixels} pixels differ.`,
      matchPercentage: parseFloat(matchPercentage.toFixed(2)),
      diffPixels,
      totalPixels,
      dimensions: { width, height },
      diffImage: diffBase64,
      savedTo: saveDiff || null,
      referenceTabId: refTabId,
      compareTabId: cmpTabId,
    };
  }

  if (name === "browser_style_diff") {
    const { url1, url2, selector, properties } = args;
    const propsToCompare = properties || COMMON_STYLE_PROPERTIES;

    // Helper to get styles from a URL/tab
    async function getStylesFromSource(source) {
      let tabId;
      let needsCleanup = false;

      // Check if source is a tab ID (short hex string) or URL
      if (source.startsWith("http") || source.startsWith("localhost")) {
        // It's a URL - open a new tab
        const cdp = await connectToBrowser();
        const { Target } = cdp;
        const { targetId } = await Target.createTarget({
          url: source.startsWith("http") ? source : `http://${source}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await connectToTab(targetId);
        tabId = targetId;
        needsCleanup = true;
      } else {
        tabId = source;
      }

      const cdp = await getTabClient(tabId);
      const { Runtime } = cdp;

      const code = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'Element not found: ' + ${JSON.stringify(selector)} };

          const styles = window.getComputedStyle(el);
          const result = {};

          ${JSON.stringify(propsToCompare)}.forEach(prop => {
            result[prop] = styles.getPropertyValue(prop);
          });

          return {
            found: true,
            url: window.location.href,
            styles: result
          };
        })()
      `;

      const result = await Runtime.evaluate({
        expression: code,
        returnByValue: true,
      });

      return { ...result.result.value, tabId, needsCleanup };
    }

    // Get styles from both sources
    const [styles1, styles2] = await Promise.all([
      getStylesFromSource(url1),
      getStylesFromSource(url2),
    ]);

    if (styles1.error) return { error: `Source 1: ${styles1.error}` };
    if (styles2.error) return { error: `Source 2: ${styles2.error}` };

    // Compare styles
    const matching = [];
    const different = [];

    for (const prop of propsToCompare) {
      const val1 = styles1.styles[prop];
      const val2 = styles2.styles[prop];

      if (val1 === val2) {
        matching.push(prop);
      } else {
        different.push({
          property: prop,
          reference: val1,
          compare: val2,
        });
      }
    }

    return {
      summary: `${matching.length} properties match, ${different.length} differ`,
      selector,
      referenceUrl: styles1.url,
      compareUrl: styles2.url,
      matchingCount: matching.length,
      differentCount: different.length,
      matching,
      different,
    };
  }

  if (name === "browser_extract_design_tokens") {
    const cdp = await getTabClient(args.tabId);
    const { Runtime } = cdp;

    // Navigate if URL provided
    if (args.url) {
      const { Page } = cdp;
      await Page.navigate({ url: args.url });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const code = `
      (() => {
        const tokens = {
          cssVariables: {},
          colors: new Set(),
          fontSizes: new Set(),
          fontFamilies: new Set(),
          spacing: new Set(),
          borderRadius: new Set(),
          shadows: new Set(),
        };

        // Extract CSS variables from :root
        const rootStyles = getComputedStyle(document.documentElement);
        for (const name of document.documentElement.style) {
          if (name.startsWith('--')) {
            tokens.cssVariables[name] = rootStyles.getPropertyValue(name).trim();
          }
        }

        // Also check stylesheets for CSS variables
        try {
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.selectorText === ':root' && rule.style) {
                  for (let i = 0; i < rule.style.length; i++) {
                    const name = rule.style[i];
                    if (name.startsWith('--')) {
                      tokens.cssVariables[name] = rule.style.getPropertyValue(name).trim();
                    }
                  }
                }
              }
            } catch (e) {
              // Cross-origin stylesheet, skip
            }
          }
        } catch (e) {}

        // Sample elements to extract used values
        const elements = document.querySelectorAll('*');
        const sampleSize = Math.min(elements.length, 200);

        for (let i = 0; i < sampleSize; i++) {
          const el = elements[Math.floor(i * elements.length / sampleSize)];
          const styles = getComputedStyle(el);

          // Colors
          const color = styles.color;
          const bgColor = styles.backgroundColor;
          const borderColor = styles.borderColor;

          if (color && color !== 'rgba(0, 0, 0, 0)') tokens.colors.add(color);
          if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') tokens.colors.add(bgColor);
          if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') tokens.colors.add(borderColor);

          // Font sizes
          const fontSize = styles.fontSize;
          if (fontSize) tokens.fontSizes.add(fontSize);

          // Font families
          const fontFamily = styles.fontFamily;
          if (fontFamily) tokens.fontFamilies.add(fontFamily);

          // Spacing (padding/margin)
          ['padding', 'margin'].forEach(prop => {
            ['Top', 'Right', 'Bottom', 'Left'].forEach(side => {
              const val = styles[prop + side];
              if (val && val !== '0px') tokens.spacing.add(val);
            });
          });

          // Border radius
          const radius = styles.borderRadius;
          if (radius && radius !== '0px') tokens.borderRadius.add(radius);

          // Box shadow
          const shadow = styles.boxShadow;
          if (shadow && shadow !== 'none') tokens.shadows.add(shadow);
        }

        return {
          url: window.location.href,
          cssVariables: tokens.cssVariables,
          colors: [...tokens.colors].sort(),
          fontSizes: [...tokens.fontSizes].sort((a, b) => parseFloat(a) - parseFloat(b)),
          fontFamilies: [...tokens.fontFamilies],
          spacing: [...tokens.spacing].sort((a, b) => parseFloat(a) - parseFloat(b)),
          borderRadius: [...tokens.borderRadius].sort((a, b) => parseFloat(a) - parseFloat(b)),
          shadows: [...tokens.shadows],
        };
      })()
    `;

    const result = await Runtime.evaluate({
      expression: code,
      returnByValue: true,
    });

    const tokens = result.result.value;

    return {
      summary: `Extracted ${Object.keys(tokens.cssVariables).length} CSS vars, ${tokens.colors.length} colors, ${tokens.fontSizes.length} font sizes`,
      ...tokens,
    };
  }

  if (name === "browser_batch_style_compare") {
    const { referenceUrl, compareUrl, selectors, properties } = args;
    const propsToCompare = properties || COMMON_STYLE_PROPERTIES;

    // Open both pages
    const cdp = await connectToBrowser();
    const { Target } = cdp;

    const { targetId: refTabId } = await Target.createTarget({
      url: referenceUrl,
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await connectToTab(refTabId);

    const { targetId: cmpTabId } = await Target.createTarget({
      url: compareUrl,
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await connectToTab(cmpTabId);

    // Compare each selector
    const results = [];

    for (const selector of selectors) {
      // Get styles from reference
      const refCdp = await getTabClient(refTabId);
      const cmpCdp = await getTabClient(cmpTabId);

      const code = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'not found' };

          const styles = window.getComputedStyle(el);
          const result = {};

          ${JSON.stringify(propsToCompare)}.forEach(prop => {
            result[prop] = styles.getPropertyValue(prop);
          });

          return { styles: result };
        })()
      `;

      const [refResult, cmpResult] = await Promise.all([
        refCdp.Runtime.evaluate({ expression: code, returnByValue: true }),
        cmpCdp.Runtime.evaluate({ expression: code, returnByValue: true }),
      ]);

      const refStyles = refResult.result.value;
      const cmpStyles = cmpResult.result.value;

      if (refStyles.error || cmpStyles.error) {
        results.push({
          selector,
          error: refStyles.error || cmpStyles.error,
          foundInReference: !refStyles.error,
          foundInCompare: !cmpStyles.error,
        });
        continue;
      }

      // Compare
      const different = [];
      for (const prop of propsToCompare) {
        const val1 = refStyles.styles[prop];
        const val2 = cmpStyles.styles[prop];
        if (val1 !== val2) {
          different.push({ property: prop, reference: val1, compare: val2 });
        }
      }

      results.push({
        selector,
        matches: different.length === 0,
        differentCount: different.length,
        differences: different.length > 0 ? different : undefined,
      });
    }

    // Summary
    const matchingSelectors = results.filter((r) => r.matches).length;
    const notFoundSelectors = results.filter((r) => r.error).length;

    return {
      summary: `${matchingSelectors}/${selectors.length} selectors match perfectly. ${notFoundSelectors} not found.`,
      referenceUrl,
      compareUrl,
      referenceTabId: refTabId,
      compareTabId: cmpTabId,
      results,
    };
  }

  // Start Chrome doesn't require existing connection
  if (name === "browser_start_chrome") {
    // Check if debug port already available
    if (isPortInUse(CDP_PORT)) {
      // Try to connect
      try {
        await connectToBrowser();
        return {
          success: true,
          message: `Chrome already running with DevTools on port ${CDP_PORT}`,
          connected: true,
        };
      } catch {
        return {
          success: false,
          error: `Port ${CDP_PORT} is in use but cannot connect. Close Chrome and try again.`,
        };
      }
    }

    const chromePath = getChromePath();
    if (!chromePath) {
      return {
        success: false,
        error: "Chrome not found. Please install Google Chrome.",
      };
    }

    // If Chrome is running without debug port, quit it first
    if (isChromeRunning()) {
      quitChrome();
      // Wait for Chrome to fully quit
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const chromeArgs = [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=/tmp/chrome-debug-profile`,
    ];

    if (args.url) {
      chromeArgs.push(args.url);
    }

    // Start Chrome in background
    const child = spawn(chromePath, chromeArgs, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Wait for Chrome to start
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Try to connect
    try {
      await connectToBrowser();
      return {
        success: true,
        message: `Chrome started with DevTools on port ${CDP_PORT}`,
        connected: true,
      };
    } catch {
      return {
        success: true,
        message: `Chrome started but connection pending. Try again in a moment.`,
        connected: false,
      };
    }
  }

  // All other tools require connection
  const cdp = await connectToBrowser();

  switch (name) {
    case "browser_get_console_logs": {
      const limit = args.limit || 50;
      const typeFilter = args.type || "all";
      const search = args.search?.toLowerCase();

      let logs = [...consoleLogs];

      if (typeFilter !== "all") {
        logs = logs.filter((l) => l.type === typeFilter);
      }

      if (search) {
        logs = logs.filter((l) =>
          l.args.some((a) => String(a).toLowerCase().includes(search))
        );
      }

      const result = logs.slice(-limit);

      if (args.clear) {
        consoleLogs = [];
      }

      // Count by type for summary
      const errorCount = result.filter((l) => l.type === "error").length;
      const warnCount = result.filter(
        (l) => l.type === "warning" || l.type === "warn"
      ).length;
      const logCount = result.filter((l) => l.type === "log").length;

      // Build summary
      let summary;
      if (result.length === 0) {
        summary = search
          ? `No console logs matching "${search}"`
          : "No console logs captured";
      } else {
        const parts = [];
        if (errorCount > 0)
          parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
        if (warnCount > 0)
          parts.push(`${warnCount} warning${warnCount > 1 ? "s" : ""}`);
        if (logCount > 0)
          parts.push(`${logCount} log${logCount > 1 ? "s" : ""}`);
        summary = `Console has ${parts.join(", ")} (${result.length} total shown)`;

        // Highlight first error if any
        if (errorCount > 0) {
          const firstError = result.find((l) => l.type === "error");
          if (firstError) {
            summary += `. First error: "${firstError.args.join(" ").slice(0, 100)}"`;
          }
        }
      }

      return {
        summary,
        count: result.length,
        errorCount,
        warnCount,
        totalBuffered: consoleLogs.length,
        logs: result,
      };
    }

    case "browser_get_network_requests": {
      const limit = args.limit || 50;
      const statusFilter = args.status || "all";
      const search = args.search?.toLowerCase();

      let requests = [...networkRequests];

      if (statusFilter !== "all") {
        requests = requests.filter((r) => {
          if (statusFilter === "pending") return r.status === "pending";
          if (statusFilter === "success")
            return (
              typeof r.status === "number" && r.status >= 200 && r.status < 400
            );
          if (statusFilter === "error")
            return (
              r.status === "failed" ||
              (typeof r.status === "number" && r.status >= 400)
            );
          return true;
        });
      }

      if (search) {
        requests = requests.filter((r) => r.url.toLowerCase().includes(search));
      }

      const result = requests.slice(-limit);

      if (args.clear) {
        networkRequests = [];
      }

      // Count by status for summary
      const failedRequests = result.filter(
        (r) =>
          r.status === "failed" ||
          (typeof r.status === "number" && r.status >= 400)
      );
      const pendingRequests = result.filter((r) => r.status === "pending");
      const successRequests = result.filter(
        (r) => typeof r.status === "number" && r.status >= 200 && r.status < 400
      );

      // Build summary
      let summary;
      if (result.length === 0) {
        summary = search
          ? `No network requests matching "${search}"`
          : "No network requests captured";
      } else {
        const parts = [];
        if (successRequests.length > 0)
          parts.push(`${successRequests.length} successful`);
        if (failedRequests.length > 0)
          parts.push(`${failedRequests.length} failed`);
        if (pendingRequests.length > 0)
          parts.push(`${pendingRequests.length} pending`);
        summary = `Network: ${parts.join(", ")} (${result.length} total shown)`;

        // Highlight failures
        if (failedRequests.length > 0) {
          const failures = failedRequests.slice(0, 2).map((r) => {
            const path = new URL(r.url).pathname;
            return `${r.method} ${path} → ${r.status}${r.error ? ` (${r.error})` : ""}`;
          });
          summary += `. Failed: ${failures.join("; ")}`;
        }
      }

      return {
        summary,
        count: result.length,
        failedCount: failedRequests.length,
        pendingCount: pendingRequests.length,
        totalBuffered: networkRequests.length,
        requests: result,
      };
    }

    case "browser_take_screenshot": {
      const targetCdp = await getTabClient(args.tabId);
      const { Page, Runtime } = targetCdp;

      // Get page context for summary
      const pageState = await getPageState(targetCdp);

      // Get visible element summary
      const contextCode = `
        (() => {
          const headings = [...document.querySelectorAll('h1, h2')].map(h => h.textContent?.trim().slice(0, 40)).slice(0, 3);
          const buttons = document.querySelectorAll('button, [role="button"]').length;
          const inputs = document.querySelectorAll('input, textarea').length;
          const hasModal = !!document.querySelector('[role="dialog"], .modal, [class*="modal"]');
          const hasError = !!document.querySelector('[class*="error"], [class*="Error"], .alert-danger');
          return { headings, buttons, inputs, hasModal, hasError };
        })()
      `;

      const contextResult = await Runtime.evaluate({
        expression: contextCode,
        returnByValue: true,
      });
      const context = contextResult.result.value;

      const params = {
        format: args.quality ? "jpeg" : "png",
        captureBeyondViewport: args.fullPage || false,
      };

      if (args.quality) {
        params.quality = args.quality;
      }

      const { data } = await Page.captureScreenshot(params);

      // Build summary
      const urlPath =
        new URL(pageState.url).pathname + new URL(pageState.url).hash;
      let summary = `Screenshot of ${urlPath}`;
      if (pageState.title) summary += ` ("${pageState.title}")`;
      if (context.headings.length > 0) {
        summary += `. Visible: "${context.headings[0]}"`;
      }
      if (context.hasModal) summary += ". Modal/dialog is open.";
      if (context.hasError) summary += " Error message visible on page.";
      if (args.fullPage) summary += " (full page capture)";

      recordAction("screenshot", { url: urlPath, hasError: context.hasError });

      return {
        summary,
        format: params.format,
        url: pageState.url,
        title: pageState.title,
        pageContext: {
          headings: context.headings,
          buttons: context.buttons,
          inputs: context.inputs,
          hasModal: context.hasModal,
          hasVisibleError: context.hasError,
        },
        data: data, // base64 encoded
      };
    }

    case "browser_execute_js": {
      const targetCdp = await getTabClient(args.tabId);
      const { Runtime } = targetCdp;

      const result = await Runtime.evaluate({
        expression: args.code,
        awaitPromise: args.awaitPromise !== false,
        returnByValue: true,
      });

      if (result.exceptionDetails) {
        return {
          success: false,
          error: result.exceptionDetails.text,
          exception: result.exceptionDetails.exception?.description,
        };
      }

      return {
        success: true,
        result: result.result.value,
        type: result.result.type,
      };
    }

    case "browser_get_page_info": {
      const targetCdp = await getTabClient(args.tabId);
      const { Runtime } = targetCdp;

      const pageInfoCode = `
        (() => {
          const forms = document.querySelectorAll('form').length;
          const inputs = document.querySelectorAll('input, textarea, select').length;
          const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]').length;
          const links = document.querySelectorAll('a[href]').length;
          const images = document.querySelectorAll('img').length;
          const headings = [...document.querySelectorAll('h1, h2, h3')].map(h => h.textContent?.trim().slice(0, 50));

          return {
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            forms,
            inputs,
            buttons,
            links,
            images,
            headings: headings.slice(0, 5),
            hasErrors: document.querySelectorAll('[class*="error"], [class*="Error"], .alert-danger').length > 0,
          };
        })()
      `;

      const result = await Runtime.evaluate({
        expression: pageInfoCode,
        returnByValue: true,
      });

      const info = result.result.value;
      sessionState.currentUrl = info.url;
      sessionState.currentTitle = info.title;

      // Build summary
      const urlPath = new URL(info.url).pathname + new URL(info.url).hash;
      let summary = `Currently on ${urlPath}`;
      if (info.title) summary += ` ("${info.title}")`;
      summary += `. Page has ${info.buttons} buttons, ${info.inputs} inputs, ${info.links} links.`;
      if (info.headings.length > 0) {
        summary += ` Main headings: "${info.headings[0]}"`;
        if (info.headings.length > 1)
          summary += ` and ${info.headings.length - 1} more`;
      }
      if (info.hasErrors) summary += ` Error elements visible on page.`;

      return {
        summary,
        url: info.url,
        title: info.title,
        readyState: info.readyState,
        elements: {
          forms: info.forms,
          inputs: info.inputs,
          buttons: info.buttons,
          links: info.links,
          images: info.images,
        },
        headings: info.headings,
        hasVisibleErrors: info.hasErrors,
        connected: true,
      };
    }

    case "browser_navigate": {
      const targetCdp = await getTabClient(args.tabId);
      const { Page } = targetCdp;
      const beforeState = await getPageState(targetCdp);

      await Page.navigate({ url: args.url });
      // Wait for navigation to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const afterState = await getPageState(targetCdp);
      const recentErrors = getRecentErrors(2000);

      recordAction("navigate", { from: beforeState.url, to: afterState.url });
      sessionState.currentUrl = afterState.url;
      sessionState.currentTitle = afterState.title;

      let summary = `Navigated to ${afterState.url}`;
      if (afterState.title) summary += ` ("${afterState.title}")`;
      if (beforeState.url && beforeState.url !== args.url) {
        summary = `Navigated from ${new URL(beforeState.url).pathname} to ${new URL(afterState.url).pathname}`;
        if (afterState.title) summary += ` ("${afterState.title}")`;
      }
      if (recentErrors.length > 0) {
        summary += `. Console errors detected: ${recentErrors[0]}`;
      }

      return {
        summary,
        navigated: true,
        from: beforeState.url,
        to: afterState.url,
        title: afterState.title,
        errorsAfterNav: recentErrors,
      };
    }

    case "browser_reload": {
      const { Page } = cdp;
      await Page.reload({ ignoreCache: args.ignoreCache || false });
      return { reloaded: true };
    }

    case "browser_click": {
      const { Runtime, DOM, Input } = cdp;
      const beforeState = await getPageState(cdp);

      // Build the JavaScript to find and click the element
      let findElementCode;
      if (args.selector) {
        const index = args.index || 0;
        findElementCode = `
          (() => {
            const elements = document.querySelectorAll(${JSON.stringify(args.selector)});
            if (elements.length === 0) return { error: 'No elements found matching selector' };
            if (${index} >= elements.length) return { error: 'Index out of bounds, found ' + elements.length + ' elements' };
            const el = elements[${index}];
            const rect = el.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              tag: el.tagName,
              text: el.textContent?.slice(0, 50),
              href: el.href || null,
              isLink: el.tagName === 'A'
            };
          })()
        `;
      } else if (args.text) {
        findElementCode = `
          (() => {
            const searchText = ${JSON.stringify(args.text)}.toLowerCase();
            const selectors = 'button, a, [role="button"], input[type="submit"], input[type="button"], [onclick]';
            const elements = [...document.querySelectorAll(selectors)];
            const el = elements.find(e => e.textContent?.toLowerCase().includes(searchText));
            if (!el) return { error: 'No clickable element found with text: ' + ${JSON.stringify(args.text)} };
            const rect = el.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              tag: el.tagName,
              text: el.textContent?.slice(0, 50),
              href: el.href || null,
              isLink: el.tagName === 'A'
            };
          })()
        `;
      } else {
        return {
          summary: "Error: Must provide either 'selector' or 'text' to click",
          error: "Must provide either 'selector' or 'text' to click",
        };
      }

      const findResult = await Runtime.evaluate({
        expression: findElementCode,
        returnByValue: true,
      });

      // Check if evaluation failed or returned no value
      if (!findResult.result?.value) {
        const errorMsg =
          findResult.exceptionDetails?.text ||
          "Element evaluation returned no value";
        return {
          summary: `Could not click: ${errorMsg}`,
          success: false,
          error: errorMsg,
        };
      }

      if (findResult.result.value.error) {
        const errorMsg = findResult.result.value.error;
        return {
          summary: `Could not click: ${errorMsg}`,
          success: false,
          error: errorMsg,
        };
      }

      const { x, y, tag, text, href, isLink } = findResult.result.value;

      // Dispatch mouse events to click
      await Input.dispatchMouseEvent({
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
      await Input.dispatchMouseEvent({
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
      });

      // Wait a moment for any navigation or state changes
      await new Promise((resolve) => setTimeout(resolve, 300));

      const afterState = await getPageState(cdp);
      const recentErrors = getRecentErrors(2000);
      const recentFailures = getRecentNetworkFailures(2000);

      // Build rich summary
      const elementDesc = text?.trim()
        ? `"${text.trim()}"`
        : `<${tag.toLowerCase()}>`;
      let summary = `Clicked ${elementDesc}`;

      // Detect navigation
      const urlChanged = beforeState.url !== afterState.url;
      if (urlChanged) {
        const fromPath =
          new URL(beforeState.url).pathname + new URL(beforeState.url).hash;
        const toPath =
          new URL(afterState.url).pathname + new URL(afterState.url).hash;
        summary += ` → navigated from ${fromPath} to ${toPath}`;
        if (afterState.title && afterState.title !== beforeState.title) {
          summary += ` ("${afterState.title}")`;
        }
        sessionState.currentUrl = afterState.url;
        sessionState.currentTitle = afterState.title;
      }

      // Report errors
      if (recentErrors.length > 0) {
        summary += `. Console error: ${recentErrors[0].slice(0, 100)}`;
      }
      if (recentFailures.length > 0) {
        summary += `. Network failure: ${recentFailures[0]}`;
      }

      recordAction("click", {
        element: elementDesc,
        urlChanged,
        newUrl: urlChanged ? afterState.url : null,
      });

      return {
        summary,
        success: true,
        clicked: {
          tag,
          text: text?.trim(),
          x: Math.round(x),
          y: Math.round(y),
        },
        navigation: urlChanged
          ? {
              from: beforeState.url,
              to: afterState.url,
              newTitle: afterState.title,
            }
          : null,
        recentErrors: recentErrors.length > 0 ? recentErrors : undefined,
        recentNetworkFailures:
          recentFailures.length > 0 ? recentFailures : undefined,
      };
    }

    case "browser_type": {
      const { Runtime, Input } = cdp;

      // Focus the element and get info
      const focusCode = `
        (() => {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          if (!el) return { error: 'Element not found: ' + ${JSON.stringify(args.selector)} };
          el.focus();
          const prevValue = el.value;
          if (${args.clear !== false}) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return {
            found: true,
            tag: el.tagName,
            name: el.name || el.id || el.placeholder || null,
            prevValue: prevValue?.slice(0, 50)
          };
        })()
      `;

      const focusResult = await Runtime.evaluate({
        expression: focusCode,
        returnByValue: true,
      });

      if (focusResult.result.value?.error) {
        return {
          summary: `Could not type: ${focusResult.result.value.error}`,
          success: false,
          error: focusResult.result.value.error,
        };
      }

      const { tag, name, prevValue } = focusResult.result.value;

      // Type each character
      for (const char of args.text) {
        await Input.dispatchKeyEvent({ type: "keyDown", text: char });
        await Input.dispatchKeyEvent({ type: "keyUp", text: char });
      }

      // Optionally press Enter
      if (args.pressEnter) {
        await Input.dispatchKeyEvent({
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        await Input.dispatchKeyEvent({
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
      }

      // Build summary
      const fieldDesc = name ? `"${name}"` : `<${tag.toLowerCase()}>`;
      const displayText =
        args.text.length > 30 ? args.text.slice(0, 30) + "..." : args.text;
      let summary = `Typed "${displayText}" into ${fieldDesc} field`;
      if (args.pressEnter) summary += " and pressed Enter";
      if (prevValue && args.clear !== false)
        summary += ` (cleared previous: "${prevValue}")`;

      recordAction("type", {
        field: fieldDesc,
        text: args.text,
        pressedEnter: !!args.pressEnter,
      });

      return {
        summary,
        success: true,
        typed: args.text,
        field: fieldDesc,
        pressedEnter: !!args.pressEnter,
      };
    }

    case "browser_wait_for": {
      const { Runtime } = cdp;
      const timeout = args.timeout || 5000;
      const checkVisible = args.visible !== false;
      const startTime = Date.now();
      const waitTarget = args.selector || args.text;

      let waitCode;
      if (args.selector) {
        waitCode = `
          (() => {
            const el = document.querySelector(${JSON.stringify(args.selector)});
            if (!el) return { found: false };
            if (${checkVisible}) {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) {
                return { found: false };
              }
            }
            return { found: true, tag: el.tagName, text: el.textContent?.slice(0, 50) };
          })()
        `;
      } else if (args.text) {
        waitCode = `
          (() => {
            const searchText = ${JSON.stringify(args.text)}.toLowerCase();
            const found = document.body.innerText.toLowerCase().includes(searchText);
            return { found };
          })()
        `;
      } else {
        return {
          summary:
            "Error: Must provide either 'selector' or 'text' to wait for",
          error: "Must provide either 'selector' or 'text' to wait for",
        };
      }

      // Poll until found or timeout
      while (Date.now() - startTime < timeout) {
        const result = await Runtime.evaluate({
          expression: waitCode,
          returnByValue: true,
        });

        if (result.result.value?.found) {
          const elapsed = Date.now() - startTime;
          const elementInfo = result.result.value;
          let summary = args.selector
            ? `Found element "${args.selector}"`
            : `Found text "${args.text}"`;
          if (elapsed > 100) summary += ` after ${elapsed}ms`;
          if (elementInfo.text)
            summary += ` (contains: "${elementInfo.text.trim().slice(0, 30)}")`;

          recordAction("wait", { target: waitTarget, elapsed, found: true });

          return {
            summary,
            success: true,
            found: true,
            elapsed,
            element: elementInfo,
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const summary = `Timeout waiting for ${args.selector ? `element "${args.selector}"` : `text "${args.text}"`} after ${timeout}ms`;
      recordAction("wait", { target: waitTarget, timeout: true, found: false });

      return {
        summary,
        success: false,
        found: false,
        error: `Timeout after ${timeout}ms waiting for ${waitTarget}`,
      };
    }

    case "browser_get_element": {
      const { Runtime } = cdp;

      const defaultAttrs = [
        "id",
        "class",
        "href",
        "src",
        "data-testid",
        "name",
        "type",
        "value",
        "placeholder",
      ];
      const attrsToGet = args.attributes || defaultAttrs;

      const getElementCode = `
        (() => {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          if (!el) return { error: 'Element not found: ' + ${JSON.stringify(args.selector)} };

          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);

          const attrs = {};
          ${JSON.stringify(attrsToGet)}.forEach(attr => {
            const val = el.getAttribute(attr);
            if (val) attrs[attr] = val;
          });

          // Determine element type/purpose
          let elementType = el.tagName.toLowerCase();
          if (el.tagName === 'INPUT') elementType = 'input[' + (el.type || 'text') + ']';
          if (el.tagName === 'A') elementType = 'link';
          if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') elementType = 'button';

          return {
            found: true,
            tag: el.tagName.toLowerCase(),
            elementType,
            text: el.textContent?.trim().slice(0, 200),
            innerText: el.innerText?.trim().slice(0, 200),
            attributes: attrs,
            visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0,
            enabled: !el.disabled,
            dimensions: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            childCount: el.children.length
          };
        })()
      `;

      const result = await Runtime.evaluate({
        expression: getElementCode,
        returnByValue: true,
      });

      if (result.result.value?.error) {
        return {
          summary: `Element not found: "${args.selector}"`,
          success: false,
          error: result.result.value.error,
        };
      }

      const el = result.result.value;

      // Build human-readable summary
      let summary = `Found ${el.elementType}`;
      if (el.text && el.text.length > 0) {
        summary += ` with text "${el.text.slice(0, 50)}${el.text.length > 50 ? "..." : ""}"`;
      }
      if (el.attributes.placeholder) {
        summary += ` (placeholder: "${el.attributes.placeholder}")`;
      }
      if (!el.visible) summary += " [hidden]";
      if (!el.enabled) summary += " [disabled]";
      summary += ` at (${el.dimensions.x}, ${el.dimensions.y}), ${el.dimensions.width}x${el.dimensions.height}px`;

      return {
        summary,
        success: true,
        element: el,
      };
    }

    case "browser_select": {
      const { Runtime } = cdp;

      let selectCode;
      if (args.value !== undefined) {
        selectCode = `
          (() => {
            const el = document.querySelector(${JSON.stringify(args.selector)});
            if (!el || el.tagName !== 'SELECT') return { error: 'Select element not found' };
            const prevValue = el.options[el.selectedIndex]?.text;
            el.value = ${JSON.stringify(args.value)};
            el.dispatchEvent(new Event('change', { bubbles: true }));
            const newText = el.options[el.selectedIndex]?.text;
            return { success: true, selected: el.value, selectedText: newText, prevValue };
          })()
        `;
      } else if (args.text !== undefined) {
        selectCode = `
          (() => {
            const el = document.querySelector(${JSON.stringify(args.selector)});
            if (!el || el.tagName !== 'SELECT') return { error: 'Select element not found' };
            const prevValue = el.options[el.selectedIndex]?.text;
            const option = [...el.options].find(o => o.text === ${JSON.stringify(args.text)});
            if (!option) return { error: 'Option not found with text: ' + ${JSON.stringify(args.text)} };
            el.value = option.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, selected: option.value, selectedText: option.text, prevValue };
          })()
        `;
      } else if (args.index !== undefined) {
        selectCode = `
          (() => {
            const el = document.querySelector(${JSON.stringify(args.selector)});
            if (!el || el.tagName !== 'SELECT') return { error: 'Select element not found' };
            const prevValue = el.options[el.selectedIndex]?.text;
            if (${args.index} >= el.options.length) return { error: 'Index out of bounds' };
            el.selectedIndex = ${args.index};
            el.dispatchEvent(new Event('change', { bubbles: true }));
            const newText = el.options[el.selectedIndex]?.text;
            return { success: true, selected: el.value, selectedText: newText, prevValue };
          })()
        `;
      } else {
        return {
          summary: "Error: Must provide 'value', 'text', or 'index' to select",
          error: "Must provide 'value', 'text', or 'index' to select",
        };
      }

      const result = await Runtime.evaluate({
        expression: selectCode,
        returnByValue: true,
      });

      const data = result.result.value;
      if (data.error) {
        return {
          summary: `Could not select: ${data.error}`,
          success: false,
          error: data.error,
        };
      }

      let summary = `Selected "${data.selectedText}" from dropdown`;
      if (data.prevValue && data.prevValue !== data.selectedText) {
        summary += ` (was: "${data.prevValue}")`;
      }

      recordAction("select", {
        selector: args.selector,
        selected: data.selectedText,
      });

      return {
        summary,
        success: true,
        selected: data.selected,
        selectedText: data.selectedText,
        previousValue: data.prevValue,
      };
    }

    case "browser_hover": {
      const { Runtime, Input } = cdp;

      const findCode = `
        (() => {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          if (!el) return { error: 'Element not found: ' + ${JSON.stringify(args.selector)} };
          const rect = el.getBoundingClientRect();
          return {
            found: true,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 50)
          };
        })()
      `;

      const findResult = await Runtime.evaluate({
        expression: findCode,
        returnByValue: true,
      });

      // Check if evaluation failed or returned no value
      if (!findResult.result?.value) {
        const errorMsg =
          findResult.exceptionDetails?.text ||
          "Element evaluation returned no value";
        return {
          summary: `Could not hover: ${errorMsg}`,
          success: false,
          error: errorMsg,
        };
      }

      if (findResult.result.value.error) {
        return {
          summary: `Could not hover: ${findResult.result.value.error}`,
          success: false,
          error: findResult.result.value.error,
        };
      }

      const { x, y, tag, text } = findResult.result.value;
      await Input.dispatchMouseEvent({ type: "mouseMoved", x, y });

      const elementDesc = text ? `"${text}"` : `<${tag.toLowerCase()}>`;
      const summary = `Hovered over ${elementDesc} at (${Math.round(x)}, ${Math.round(y)})`;

      recordAction("hover", {
        element: elementDesc,
        x: Math.round(x),
        y: Math.round(y),
      });

      return {
        summary,
        success: true,
        hoveredElement: {
          tag,
          text: text?.trim(),
        },
        hoveredAt: { x: Math.round(x), y: Math.round(y) },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run the server
const server = new Server(
  {
    name: "mcp-browser-devtools",
    version: "2.0.0",
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

    // Special handling for screenshots - return as image content type
    if (name === "browser_take_screenshot" && result.data) {
      const { data, format, ...metadata } = result;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(metadata, null, 2),
          },
          {
            type: "image",
            data: data,
            mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
          },
        ],
      };
    }

    // Special handling for screenshot comparison - include diff image
    if (name === "browser_compare_screenshots" && result.diffImage) {
      const { diffImage, ...metadata } = result;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(metadata, null, 2),
          },
          {
            type: "image",
            data: diffImage,
            mimeType: "image/png",
          },
        ],
      };
    }

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
              error: error.message,
              hint: error.message.includes("connect")
                ? `Start Chrome with: chrome --remote-debugging-port=${CDP_PORT}`
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[mcp-browser-devtools] Server started (v2.0.0 with style comparison tools)"
  );
}

main().catch((error) => {
  console.error("[mcp-browser-devtools] Fatal error:", error);
  process.exit(1);
});
