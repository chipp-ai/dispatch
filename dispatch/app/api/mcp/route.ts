import { NextRequest, NextResponse } from "next/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getMcpServer } from "@/lib/mcp/server";
import { randomUUID } from "crypto";

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

// API key authentication (optional for development)
function authenticate(request: NextRequest): boolean {
  const apiKey = process.env.CHIPP_ISSUES_API_KEY;

  // Skip auth if no API key configured (development mode)
  if (!apiKey) return true;

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.substring(7);
  return token === apiKey;
}

// POST /api/mcp - Handle MCP requests with streaming support
export async function POST(request: NextRequest) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessionId = request.headers.get("mcp-session-id") || randomUUID();
    let transport = transports.get(sessionId);

    if (!transport) {
      // Create new transport for this session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
      });

      // Connect the MCP server to this transport
      const server = getMcpServer();
      await server.connect(transport);

      transports.set(sessionId, transport);
    }

    // Parse the request body
    const body = await request.json();

    // Create a streaming response using ReadableStream
    let streamController: ReadableStreamDefaultController<Uint8Array> | null =
      null;
    const encoder = new TextEncoder();

    const state = {
      statusCode: 200,
      headersSent: false,
      finished: false,
      isStreaming: false,
    };
    const responseHeaders = new Map<string, string>();

    // Create the mock response that writes to the stream
    const mockRes = {
      get statusCode() {
        return state.statusCode;
      },
      set statusCode(code: number) {
        state.statusCode = code;
      },
      get headersSent() {
        return state.headersSent;
      },
      get finished() {
        return state.finished;
      },
      get writableEnded() {
        return state.finished;
      },
      get writableFinished() {
        return state.finished;
      },

      setHeader(name: string, value: string) {
        responseHeaders.set(name.toLowerCase(), value);
        return this;
      },
      getHeader(name: string) {
        return responseHeaders.get(name.toLowerCase());
      },
      removeHeader(name: string) {
        responseHeaders.delete(name.toLowerCase());
        return this;
      },
      writeHead(
        code: number,
        reasonOrHeaders?: string | Record<string, string>,
        maybeHeaders?: Record<string, string>
      ) {
        state.statusCode = code;
        const h =
          typeof reasonOrHeaders === "object" ? reasonOrHeaders : maybeHeaders;
        if (h) {
          Object.entries(h).forEach(([k, v]) =>
            responseHeaders.set(k.toLowerCase(), v)
          );
        }
        state.headersSent = true;
        // Check if this is SSE streaming
        if (
          responseHeaders.get("content-type")?.includes("text/event-stream")
        ) {
          state.isStreaming = true;
        }
        return this;
      },
      write(
        chunk: string | Buffer,
        encoding?: string | Function,
        callback?: Function
      ) {
        if (typeof encoding === "function") {
          callback = encoding;
        }
        if (streamController) {
          try {
            if (typeof chunk === "string") {
              streamController.enqueue(encoder.encode(chunk));
            } else if (Buffer.isBuffer(chunk)) {
              streamController.enqueue(new Uint8Array(chunk));
            }
          } catch (e) {
            // Stream might be closed
          }
        }
        if (typeof callback === "function") callback();
        return true;
      },
      end(
        chunk?: string | Buffer | Function,
        encoding?: string | Function,
        callback?: Function
      ) {
        if (typeof chunk === "function") {
          callback = chunk;
          chunk = undefined;
        } else if (typeof encoding === "function") {
          callback = encoding;
          encoding = undefined;
        }

        if (chunk && streamController) {
          try {
            if (typeof chunk === "string") {
              streamController.enqueue(encoder.encode(chunk));
            } else if (Buffer.isBuffer(chunk)) {
              streamController.enqueue(new Uint8Array(chunk));
            }
          } catch (e) {
            // Stream might be closed
          }
        }
        state.finished = true;
        if (streamController) {
          try {
            streamController.close();
          } catch (e) {
            // Already closed
          }
        }
        if (typeof callback === "function") callback();
        return this;
      },
      on() {
        return this;
      },
      once() {
        return this;
      },
      removeListener() {
        return this;
      },
      emit() {
        return false;
      },
      flushHeaders() {
        state.headersSent = true;
      },
    };

    const mockReq = {
      method: "POST",
      url: "/api/mcp",
      headers: Object.fromEntries(request.headers.entries()),
      body,
      on() {
        return this;
      },
      once() {
        return this;
      },
      removeListener() {
        return this;
      },
    };

    // Create the stream and handle the request
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
      cancel() {
        state.finished = true;
      },
    });

    // Start handling the request (don't await - it runs in background for SSE)
    transport
      .handleRequest(mockReq as any, mockRes as any, body)
      .catch((error) => {
        console.error("[MCP] Error in handleRequest:", error);
        if (streamController && !state.finished) {
          try {
            const errorEvent = `data: ${JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: error.message },
            })}\n\n`;
            streamController.enqueue(encoder.encode(errorEvent));
            streamController.close();
          } catch {
            // Ignore if stream already closed
          }
        }
      });

    // Wait a tick for the SDK to set headers
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Build response headers
    const headers = new Headers();
    responseHeaders.forEach((v, k) => headers.set(k, v));
    headers.set("mcp-session-id", sessionId);

    return new NextResponse(stream, {
      status: state.statusCode,
      headers,
    });
  } catch (error) {
    console.error("[MCP] Error handling request:", error);
    return NextResponse.json(
      { error: "Failed to handle MCP request" },
      { status: 500 }
    );
  }
}

// GET /api/mcp - Handle SSE streaming for responses
export async function GET(request: NextRequest) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.headers.get("mcp-session-id");
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing mcp-session-id header" },
      { status: 400 }
    );
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "mcp-session-id": sessionId,
    },
  });
}

// DELETE /api/mcp - Clean up session
export async function DELETE(request: NextRequest) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.headers.get("mcp-session-id");
  if (sessionId && transports.has(sessionId)) {
    transports.delete(sessionId);
  }

  return NextResponse.json({ success: true });
}
