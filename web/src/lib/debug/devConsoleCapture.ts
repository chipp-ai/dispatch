/**
 * Browser console capture for development debugging.
 * Sends console logs to the Deno API which writes them to a file.
 *
 * Usage in Svelte:
 *   import { initDevConsoleCapture } from '$lib/debug/devConsoleCapture';
 *   onMount(() => initDevConsoleCapture({ filterPatterns: ['[StreamingMarkdown]'] }));
 *
 * Logs written to: .scratch/logs/browser-console.log
 * View logs: tail -f .scratch/logs/browser-console.log
 * Clear logs: curl -X DELETE http://localhost:8000/api/dev/console-log
 */

let isPatched = false;
let logsBuffer: Array<{ level: string; args: unknown[]; timestamp: string }> =
  [];
let flushIntervalId: number | null = null;

interface CaptureOptions {
  /** Only capture logs matching these patterns */
  filterPatterns?: (string | RegExp)[];
  /** Batch size before sending (default: 5) */
  batchSize?: number;
  /** Flush interval in ms (default: 500) */
  flushInterval?: number;
}

async function flushLogs() {
  if (logsBuffer.length === 0) return;

  const logsToSend = [...logsBuffer];
  logsBuffer = [];

  try {
    await fetch("/api/dev/console-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: logsToSend }),
    });
  } catch {
    // Silently fail
  }
}

function shouldCapture(
  args: unknown[],
  filterPatterns?: (string | RegExp)[]
): boolean {
  if (!filterPatterns || filterPatterns.length === 0) {
    return true;
  }

  const message = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.message;
      try {
        const seen = new WeakSet();
        return JSON.stringify(a, (_key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          return value;
        });
      } catch {
        return String(a);
      }
    })
    .join(" ");

  return filterPatterns.some((pattern) => {
    if (typeof pattern === "string") {
      return message.includes(pattern);
    }
    return pattern.test(message);
  });
}

function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack };
  }
  if (typeof arg === "object" && arg !== null) {
    // Check for DOM elements
    if (typeof Element !== "undefined" && arg instanceof Element) {
      return `[${arg.constructor.name}]`;
    }
    if (typeof Node !== "undefined" && arg instanceof Node) {
      return `[${arg.constructor.name}]`;
    }
    try {
      const seen = new WeakSet();
      JSON.stringify(arg, (_key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      });
      return arg;
    } catch {
      return String(arg);
    }
  }
  return arg;
}

export function initDevConsoleCapture(options?: CaptureOptions): () => void {
  if (isPatched) {
    return () => {};
  }

  const { filterPatterns, batchSize = 5, flushInterval = 500 } = options || {};

  isPatched = true;

  const originals = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  const patchMethod = (level: "log" | "warn" | "error" | "info" | "debug") => {
    const original = originals[level];

    console[level] = (...args: unknown[]) => {
      // Call original first
      original(...args);

      if (shouldCapture(args, filterPatterns)) {
        logsBuffer.push({
          level,
          timestamp: new Date().toISOString(),
          args: args.map(serializeArg),
        });

        if (logsBuffer.length >= batchSize) {
          flushLogs();
        }
      }
    };
  };

  patchMethod("log");
  patchMethod("warn");
  patchMethod("error");
  patchMethod("info");
  patchMethod("debug");

  flushIntervalId = window.setInterval(flushLogs, flushInterval);

  // Return cleanup function
  return () => {
    if (flushIntervalId) {
      clearInterval(flushIntervalId);
      flushIntervalId = null;
    }
    flushLogs();

    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
    console.info = originals.info;
    console.debug = originals.debug;

    isPatched = false;
  };
}
