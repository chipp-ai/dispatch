/**
 * Chipp API - Deno Entry Point
 *
 * This is the main entry point for the Chipp API server.
 * It initializes services and starts the HTTP server.
 */

import { app } from "./app.ts";
import { initSentry } from "./lib/sentry.ts";
import { initRedis } from "./services/redis/client.ts";
import { isDatabaseConfigured } from "./src/db/client.ts";
import { initWebSocket, shutdownWebSocket } from "./src/websocket/index.ts";
import { initEmbedder } from "./src/services/local-embeddings.service.ts";
import * as Sentry from "@sentry/deno";

const PORT = parseInt(Deno.env.get("PORT") ?? "8000");
const ENVIRONMENT = Deno.env.get("ENVIRONMENT") ?? "development";

// Initialize Sentry for error tracking
initSentry();

// Global error handlers to prevent server crashes and report to Sentry
globalThis.addEventListener("unhandledrejection", (event) => {
  console.error("[server] Unhandled promise rejection:", event.reason);
  Sentry.captureException(event.reason, {
    tags: { type: "unhandled_rejection" },
  });
  event.preventDefault();
});

globalThis.addEventListener("error", (event) => {
  console.error("[server] Uncaught error:", event.error);
  Sentry.captureException(event.error, {
    tags: { type: "uncaught_error" },
  });
  event.preventDefault();
});

// Initialize services
async function initServices() {
  console.log(`[init] Starting Chipp API in ${ENVIRONMENT} mode...`);

  try {
    // Database auto-initializes on import (src/db/client.ts)
    if (isDatabaseConfigured()) {
      console.log("[init] Database connected");
    } else {
      console.warn(
        "[init] Database not configured (missing DENO_DATABASE_URL)"
      );
    }

    // Initialize Redis (optional in dev)
    if (Deno.env.get("REDIS_URL")) {
      await initRedis();
      console.log("[init] Redis connected");
    } else {
      console.log("[init] Redis not configured, skipping...");
    }

    // Initialize WebSocket handler (uses Redis if available)
    await initWebSocket();
    console.log("[init] WebSocket handler ready");

    // Pre-load embedding model for fast RAG queries (non-blocking in dev)
    if (ENVIRONMENT === "production") {
      await initEmbedder();
      console.log("[init] Embedding model ready");
    } else {
      // In dev, load lazily to speed up restarts (with error handling)
      initEmbedder()
        .then(() => console.log("[init] Embedding model ready"))
        .catch((err) =>
          console.warn("[init] Embedding model failed to load:", err.message)
        );
    }
  } catch (error) {
    console.error("[init] Failed to initialize services:", error);
    if (ENVIRONMENT === "production") {
      Deno.exit(1);
    }
  }
}

// Start server
async function main() {
  await initServices();

  console.log(`[server] Listening on http://localhost:${PORT}`);

  Deno.serve(
    {
      port: PORT,
      onListen: ({ hostname, port }) => {
        console.log(`[server] Server running at http://${hostname}:${port}`);
      },
    },
    app.fetch
  );
}

// Handle shutdown gracefully
async function shutdown() {
  console.log("[server] Shutting down...");
  await shutdownWebSocket();
  Deno.exit(0);
}

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

main();
