/**
 * Debug Logger - Captures browser console logs and sends to server
 *
 * Usage: Import and call initDebugLogger() in main.ts
 */

// Use the Deno API server directly (Vite proxy may not forward correctly)
const LOG_ENDPOINT = "http://localhost:8000/debug/log";

interface LogEntry {
  timestamp: string;
  level: "log" | "warn" | "error" | "info" | "debug";
  args: unknown[];
  url: string;
}

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

function sendLog(level: LogEntry["level"], args: unknown[]) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    args: args.map((arg) => {
      try {
        if (arg instanceof Error) {
          return { error: arg.message, stack: arg.stack };
        }
        return JSON.parse(JSON.stringify(arg));
      } catch {
        return String(arg);
      }
    }),
    url: window.location.href,
  };

  // Send to server (fire and forget)
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
    credentials: "include",
  }).catch(() => {
    // Ignore errors sending logs
  });
}

export function initDebugLogger() {
  // Override console methods
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    sendLog("log", args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    sendLog("warn", args);
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    sendLog("error", args);
  };

  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    sendLog("info", args);
  };

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    sendLog("debug", args);
  };

  // Capture unhandled errors
  window.addEventListener("error", (event) => {
    sendLog("error", [
      "Uncaught Error:",
      event.message,
      `at ${event.filename}:${event.lineno}:${event.colno}`,
    ]);
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    sendLog("error", ["Unhandled Promise Rejection:", event.reason]);
  });

  originalConsole.log(
    "[DebugLogger] Initialized - logs will be sent to server"
  );
}
