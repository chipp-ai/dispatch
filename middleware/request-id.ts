/**
 * Request ID Middleware
 *
 * Assigns a unique ID to each request for tracing and debugging.
 */

import type { Context, Next } from "hono";

export async function requestId(c: Context, next: Next) {
  // Use existing request ID from header or generate new one
  const existingId = c.req.header("X-Request-ID");
  const id = existingId ?? crypto.randomUUID();

  // Store in context for access by other middleware/handlers
  c.set("requestId", id);

  // Add to response headers
  c.header("X-Request-ID", id);

  await next();
}
