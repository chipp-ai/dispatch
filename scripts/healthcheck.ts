/**
 * Health Check Script
 *
 * Used by Docker to verify container health.
 */

const PORT = Deno.env.get("PORT") ?? "8000";
const url = `http://localhost:${PORT}/health`;

try {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });

  if (response.ok) {
    const data = await response.json();
    if (data.status === "ok") {
      console.log("Health check passed");
      Deno.exit(0);
    }
  }

  console.error("Health check failed:", response.status);
  Deno.exit(1);
} catch (error) {
  console.error("Health check error:", error);
  Deno.exit(1);
}
