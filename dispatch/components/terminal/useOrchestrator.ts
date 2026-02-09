"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface ToolCallEvent {
  id: string;
  name: string;
  result?: string;
  isRunning: boolean;
}

export interface OrchestratorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
}

export interface TurnMetrics {
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  apiCalls: number;
}

interface SSEEvent {
  type:
    | "text_delta"
    | "tool_start"
    | "tool_result"
    | "usage"
    | "error"
    | "done"
    | "session_id";
  data: string;
}

export function useOrchestrator() {
  const [messages, setMessages] = useState<OrchestratorMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dispatch_orchestrator_session");
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [turnMetrics, setTurnMetrics] = useState<TurnMetrics | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const msgIdCounter = useRef(0);

  const nextId = () => `msg_${++msgIdCounter.current}_${Date.now()}`;

  // Restore session history on mount
  useEffect(() => {
    if (!sessionId) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/orchestrator?sessionId=${encodeURIComponent(sessionId)}`
        );
        if (!res.ok) {
          // Session expired or not found — clear it
          if (res.status === 404) {
            setSessionId(null);
            localStorage.removeItem("dispatch_orchestrator_session");
          }
          return;
        }
        const { messages: rawMessages } = await res.json();
        if (!Array.isArray(rawMessages) || rawMessages.length === 0) return;

        // Convert Anthropic-format messages to our display format
        const restored: OrchestratorMessage[] = [];
        for (const msg of rawMessages) {
          if (msg.role === "user") {
            // User messages: content can be string or array of content blocks
            if (typeof msg.content === "string") {
              restored.push({
                id: nextId(),
                role: "user",
                content: msg.content,
              });
            } else if (Array.isArray(msg.content)) {
              // Could be tool_result blocks (from tool loop) — skip those
              const textParts = msg.content.filter(
                (b: { type: string }) => b.type === "text"
              );
              if (textParts.length > 0) {
                restored.push({
                  id: nextId(),
                  role: "user",
                  content: textParts.map((b: { text: string }) => b.text).join(""),
                });
              }
            }
          } else if (msg.role === "assistant") {
            const blocks = Array.isArray(msg.content)
              ? msg.content
              : [{ type: "text", text: msg.content }];

            const textContent = blocks
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { text: string }) => b.text)
              .join("");

            const toolCalls: ToolCallEvent[] = blocks
              .filter((b: { type: string }) => b.type === "tool_use")
              .map((b: { id: string; name: string }) => ({
                id: b.id,
                name: b.name,
                isRunning: false,
                // We don't store results in the assistant content blocks
              }));

            if (textContent || toolCalls.length > 0) {
              restored.push({
                id: nextId(),
                role: "assistant",
                content: textContent,
                toolCalls,
              });
            }
          }
        }

        if (restored.length > 0) {
          setMessages(restored);
        }
      } catch {
        // Silently fail — empty conversation is fine
      }
    })();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;
      setError(null);
      setTurnMetrics({
        startedAt: Date.now(),
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        apiCalls: 0,
      });

      // Add user message
      const userMsg: OrchestratorMessage = {
        id: nextId(),
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Create assistant placeholder
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", toolCalls: [] },
      ]);

      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, sessionId }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`HTTP ${res.status}: ${errBody}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);

            let event: SSEEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            switch (event.type) {
              case "session_id": {
                setSessionId(event.data);
                localStorage.setItem(
                  "dispatch_orchestrator_session",
                  event.data
                );
                break;
              }

              case "text_delta": {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.data }
                      : m
                  )
                );
                break;
              }

              case "tool_start": {
                const toolInfo = JSON.parse(event.data);
                setActiveToolName(toolInfo.name);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            {
                              id: toolInfo.id,
                              name: toolInfo.name,
                              isRunning: true,
                            },
                          ],
                        }
                      : m
                  )
                );
                break;
              }

              case "tool_result": {
                const resultInfo = JSON.parse(event.data);
                setActiveToolName(null);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          toolCalls: (m.toolCalls || []).map((tc) =>
                            tc.id === resultInfo.tool_use_id
                              ? {
                                  ...tc,
                                  result: resultInfo.result,
                                  isRunning: false,
                                }
                              : tc
                          ),
                        }
                      : m
                  )
                );
                break;
              }

              case "usage": {
                const usageInfo = JSON.parse(event.data);
                setTurnMetrics((prev) =>
                  prev
                    ? {
                        ...prev,
                        inputTokens:
                          prev.inputTokens + (usageInfo.input_tokens || 0),
                        outputTokens:
                          prev.outputTokens + (usageInfo.output_tokens || 0),
                        cacheReadTokens:
                          prev.cacheReadTokens +
                          (usageInfo.cache_read_input_tokens || 0),
                        cacheCreationTokens:
                          prev.cacheCreationTokens +
                          (usageInfo.cache_creation_input_tokens || 0),
                        apiCalls: prev.apiCalls + 1,
                      }
                    : prev
                );
                break;
              }

              case "error": {
                setError(event.data);
                break;
              }

              case "done": {
                // Stream complete
                break;
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;

        // Clean up empty trailing assistant messages
        setMessages((prev) => {
          const cleaned = prev.filter(
            (m) =>
              m.role !== "assistant" ||
              m.content.trim() !== "" ||
              (m.toolCalls && m.toolCalls.length > 0)
          );
          return cleaned;
        });
      }
    },
    [isStreaming, sessionId]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    localStorage.removeItem("dispatch_orchestrator_session");
  }, []);

  return {
    messages,
    isStreaming,
    sessionId,
    error,
    activeToolName,
    turnMetrics,
    sendMessage,
    cancelStream,
    clearConversation,
  };
}
