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
import { processRagJobs } from "./src/services/job-processor.service.ts";
import { log } from "@/lib/logger.ts";

const PORT = parseInt(Deno.env.get("PORT") ?? "8000");
const ENVIRONMENT = Deno.env.get("ENVIRONMENT") ?? "development";

// Initialize Sentry for error tracking
initSentry();

// Global error handlers to prevent server crashes and report to Sentry
globalThis.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", {
    source: "server",
    feature: "global-error",
    type: "unhandled_rejection",
  }, event.reason);
  event.preventDefault();
});

globalThis.addEventListener("error", (event) => {
  log.error("Uncaught error", {
    source: "server",
    feature: "global-error",
    type: "uncaught_error",
  }, event.error);
  event.preventDefault();
});

// Initialize services
async function initServices() {
  log.info("Starting Chipp API", {
    source: "server",
    feature: "init",
    environment: ENVIRONMENT,
  });

  try {
    // Database auto-initializes on import (src/db/client.ts)
    if (isDatabaseConfigured()) {
      log.info("Database connected", { source: "server", feature: "init" });
    } else {
      log.warn("Database not configured (missing DENO_DATABASE_URL)", {
        source: "server",
        feature: "init",
      });
    }

    // Initialize Redis (optional in dev)
    if (Deno.env.get("REDIS_URL")) {
      await initRedis();
      log.info("Redis connected", { source: "server", feature: "init" });
    } else {
      log.info("Redis not configured, skipping", { source: "server", feature: "init" });
    }

    // Initialize WebSocket handler (uses Redis if available)
    await initWebSocket();
    log.info("WebSocket handler ready", { source: "server", feature: "init" });

    // Pre-load embedding model for fast RAG queries (non-blocking in dev)
    if (ENVIRONMENT === "production") {
      await initEmbedder();
      log.info("Embedding model ready", { source: "server", feature: "init" });
    } else {
      // In dev, load lazily to speed up restarts (with error handling)
      initEmbedder()
        .then(() => log.info("Embedding model ready", { source: "server", feature: "init" }))
        .catch((err) =>
          log.warn("Embedding model failed to load", {
            source: "server",
            feature: "init",
            error: err.message,
          })
        );
    }
  } catch (error) {
    log.error("Failed to initialize services", {
      source: "server",
      feature: "init",
    }, error);
    if (ENVIRONMENT === "production") {
      Deno.exit(1);
    }
  }
}

// Start server
async function main() {
  await initServices();

  // Register Deno.cron for RAG job processing (every 30 seconds)
  if (isDatabaseConfigured() && typeof Deno.cron === "function") {
    Deno.cron("process-rag-jobs", "*/30 * * * * *", processRagJobs);
    log.info("RAG job processor cron registered", { source: "server", feature: "startup" });
  } else if (isDatabaseConfigured()) {
    // Deno.cron not available (needs --unstable-cron) -- use setInterval fallback
    setInterval(() => {
      processRagJobs().catch((err) => {
        log.error("RAG job processor tick failed", { source: "server", feature: "job-processor" }, err);
      });
    }, 30_000);
    log.info("RAG job processor registered (setInterval fallback)", { source: "server", feature: "startup" });
  }

  log.info("Server listening", { source: "server", feature: "startup", port: PORT });

  Deno.serve(
    {
      port: PORT,
      onListen: ({ hostname, port }) => {
        log.info("Server running", { source: "server", feature: "startup", hostname, port });
      },
    },
    app.fetch
  );
}

// Handle shutdown gracefully
async function shutdown() {
  log.info("Server shutting down", { source: "server", feature: "shutdown" });
  await shutdownWebSocket();
  Deno.exit(0);
}

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

main();
