/**
 * Streaming Test Endpoint
 *
 * Debug endpoint to test streaming markdown with various content patterns.
 * Useful for isolating issues with newlines, formatting, etc.
 *
 * Usage:
 *   GET /api/dev/streaming-test?delay=50&pattern=newlines
 *
 * Patterns:
 *   - newlines: Text with single newlines (should collapse in markdown)
 *   - paragraphs: Text with double newlines (proper paragraph breaks)
 *   - softbreaks: Text with two spaces + newline (markdown soft breaks)
 *   - mixed: Combination of all patterns
 *   - poem: Multi-line poem with single newlines
 */

import { Hono } from "hono";

const router = new Hono();

// Test content patterns
const patterns: Record<string, string[]> = {
  newlines: [
    "This is line 1",
    "\n",
    "This is line 2",
    "\n",
    "This is line 3",
    "\n\n",
    "This is a new paragraph after double newline.",
  ],
  paragraphs: [
    "First paragraph.",
    "\n\n",
    "Second paragraph.",
    "\n\n",
    "Third paragraph.",
  ],
  softbreaks: [
    "Line with soft break  ",
    "\n",
    "Continues on next line  ",
    "\n",
    "And another line.",
  ],
  mixed: [
    "# Heading\n\n",
    "First paragraph with normal text.\n\n",
    "Second paragraph with:\n",
    "- single newline inside (should collapse)\n",
    "- another line\n\n",
    "Third paragraph.  \n",
    "This line uses soft break (two spaces).  \n",
    "And another soft break line.\n\n",
    "Final paragraph.",
  ],
  poem: [
    "Roses are red,\n",
    "Violets are blue,\n",
    "Single newlines in markdown,\n",
    "Collapse into one view.",
  ],
  code: [
    "Here's some code:\n\n",
    "```javascript\n",
    "function hello() {\n",
    '  console.log("Hello!");\n',
    "}\n",
    "```\n\n",
    "That was the code.",
  ],
};

// SSE streaming endpoint
router.get("/streaming-test", async (c) => {
  const delay = parseInt(c.req.query("delay") || "50");
  const pattern = c.req.query("pattern") || "mixed";
  const chunks = patterns[pattern] || patterns.mixed;

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send session ID first
      const sessionEvent = `data: ${JSON.stringify({ sessionId: "test-session-" + Date.now() })}\n\n`;
      controller.enqueue(encoder.encode(sessionEvent));

      // Stream each chunk
      for (const chunk of chunks) {
        // Split into characters for more granular streaming
        for (const char of chunk) {
          const event = `data: ${JSON.stringify({ type: "text-delta", delta: char })}\n\n`;
          controller.enqueue(encoder.encode(event));
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // Send done
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// Info endpoint to list available patterns
router.get("/streaming-test/patterns", (c) => {
  const info = Object.entries(patterns).map(([name, chunks]) => ({
    name,
    preview: chunks.join("").slice(0, 100) + "...",
    chunkCount: chunks.length,
  }));

  return c.json({
    patterns: info,
    usage: "GET /api/dev/streaming-test?pattern=<name>&delay=<ms>",
  });
});

export default router;
