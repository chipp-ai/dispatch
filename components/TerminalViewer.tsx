"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

interface TerminalMessage {
  type: "output" | "status" | "error";
  issueIdentifier: string;
  timestamp: string;
  data: string;
}

interface TerminalViewerProps {
  issueIdentifier: string;
  isAgentActive: boolean;
  sseLines?: string[];
}

// Strip ANSI escape codes
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// Insert line breaks before [TOOL], [RESULT], [COMPLETED] markers and
// between tool calls and prose so ReactMarkdown treats each as a
// separate paragraph instead of one contiguous block.
function splitToolMarkers(text: string): string {
  return text
    // Break before every [TOOL], [RESULT], [COMPLETED] tag
    .replace(/\s*(\[TOOL\])/g, "\n\n$1")
    .replace(/\s*(\[RESULT\])/g, "\n\n$1")
    .replace(/\s*(\[COMPLETED\])/g, "\n\n$1")
    // Break after a tool call closing paren followed by prose text
    // e.g. "Read(file_path=...) Now let me..." → newline before "Now"
    .replace(/\)\s+(?=[A-Z])/g, ")\n\n")
    .trim();
}

// Custom markdown components for terminal aesthetic
const terminalComponents: Partial<Components> = {
  // Headings get a green terminal prefix
  h1: ({ children }) => (
    <div className="mt-4 mb-2 flex items-center gap-2">
      <span className="text-[#4ade80] text-[10px] font-mono select-none shrink-0">{">>"}</span>
      <span className="text-[#e0e0e0] text-[13px] font-bold font-mono">{children}</span>
    </div>
  ),
  h2: ({ children }) => (
    <div className="mt-3 mb-1.5 flex items-center gap-2">
      <span className="text-[#4ade80] text-[10px] font-mono select-none shrink-0">{">"}</span>
      <span className="text-[#e0e0e0] text-[13px] font-semibold font-mono">{children}</span>
    </div>
  ),
  h3: ({ children }) => (
    <div className="mt-2.5 mb-1 text-[#c0c0c0] text-[12px] font-semibold font-mono">{children}</div>
  ),
  // Paragraphs - check for [TOOL] and [RESULT] prefixes
  p: ({ children }) => {
    const text = String(children);
    if (text.startsWith("[TOOL]")) {
      const rest = text.slice(6).trim();
      return (
        <div className="flex items-start gap-1.5 my-0.5 font-mono">
          <span className="text-[#60a5fa] text-[11px] shrink-0 select-none">[TOOL]</span>
          <span className="text-[#93c5fd] text-[11px] break-all">{rest}</span>
        </div>
      );
    }
    if (text.startsWith("[RESULT]")) {
      const rest = text.slice(8).trim();
      return (
        <div className="flex items-start gap-1.5 my-0.5 font-mono">
          <span className="text-[#6b7280] text-[11px] shrink-0 select-none">[RESULT]</span>
          <span className="text-[#6b7280] text-[11px] break-all">{rest}</span>
        </div>
      );
    }
    if (text.startsWith("[COMPLETED]")) {
      const rest = text.slice(11).trim();
      return (
        <div className="flex items-center gap-1.5 mt-3 mb-1 py-1.5 px-2 bg-[#4ade80]/5 border border-[#4ade80]/20 rounded font-mono">
          <span className="text-[#4ade80] text-[11px] shrink-0">[COMPLETED]</span>
          <span className="text-[#4ade80] text-[11px]">{rest}</span>
        </div>
      );
    }
    return <p className="text-[#b0b0b0] text-[12px] leading-relaxed my-1 font-mono">{children}</p>;
  },
  // Strong text
  strong: ({ children }) => (
    <strong className="text-[#e0e0e0] font-semibold">{children}</strong>
  ),
  // Emphasis
  em: ({ children }) => (
    <em className="text-[#a0a0a0] italic">{children}</em>
  ),
  // Inline code - purple on dark bg
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className || ""} text-[11px]`}>{children}</code>
      );
    }
    return (
      <code className="text-[#c4b5fd] bg-[#1a1a2e] px-1 py-0.5 rounded text-[11px] font-mono">
        {children}
      </code>
    );
  },
  // Code blocks - deep dark with green border accent
  pre: ({ children }) => (
    <pre className="my-2 bg-[#050510] border border-[#1a2a1a] rounded-md p-3 overflow-x-auto text-[11px] leading-relaxed font-mono">
      {children}
    </pre>
  ),
  // Lists
  ul: ({ children }) => (
    <ul className="my-1 pl-4 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 pl-4 space-y-0.5 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[#b0b0b0] text-[12px] font-mono marker:text-[#4ade80]">{children}</li>
  ),
  // Horizontal rules
  hr: () => (
    <div className="my-3 border-t border-dashed border-[#252525]" />
  ),
  // Links
  a: ({ href, children }) => (
    <a href={href} className="text-[#60a5fa] hover:text-[#93c5fd] underline underline-offset-2" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 pl-3 border-l-2 border-[#4ade80]/30 text-[#808080]">
      {children}
    </blockquote>
  ),
};

export default function TerminalViewer({
  issueIdentifier,
  isAgentActive,
  sseLines = [],
}: TerminalViewerProps) {
  const [wsLines, setWsLines] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  const [isExpanded, setIsExpanded] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Combine WebSocket lines and SSE lines
  const allLines = [...wsLines, ...sseLines];

  // Determine connection status: SSE lines mean CI is streaming even without WebSocket
  const hasSSEData = sseLines.length > 0;
  const effectiveStatus = hasSSEData && !isConnected ? "connected" : connectionStatus;

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll when new SSE lines arrive
  useEffect(() => {
    scrollToBottom();
  }, [sseLines.length, scrollToBottom]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/terminal?issue=${encodeURIComponent(issueIdentifier)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const message: TerminalMessage = JSON.parse(event.data);
        if (message.type === "output") {
          setWsLines((prev) => [...prev, message.data]);
          scrollToBottom();
        } else if (message.type === "status") {
          setWsLines((prev) => [...prev, `[Status] ${message.data}\n`]);
        } else if (message.type === "error") {
          setWsLines((prev) => [...prev, `[Error] ${message.data}\n`]);
        }
      } catch {
        setWsLines((prev) => [...prev, event.data]);
      }
      scrollToBottom();
    };

    ws.onclose = () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
      if (isAgentActive) {
        reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };
  }, [issueIdentifier, isAgentActive, scrollToBottom]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isAgentActive) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isAgentActive, connect, disconnect]);

  const clearTerminal = () => setWsLines([]);

  // Combine all lines into markdown, stripping ANSI codes and splitting tool markers
  const terminalMarkdown = useMemo(() => {
    if (allLines.length === 0) return "";
    return splitToolMarkers(allLines.map(stripAnsi).join("\n"));
  }, [allLines]);

  // Don't render if agent is idle and no lines
  if (!isAgentActive && allLines.length === 0) {
    return null;
  }

  const statusColor =
    effectiveStatus === "connected"
      ? "#4ade80"
      : effectiveStatus === "connecting"
        ? "#facc15"
        : effectiveStatus === "error"
          ? "#f87171"
          : "#6b7280";

  const statusLabel =
    effectiveStatus === "connected"
      ? "Live"
      : effectiveStatus === "connecting"
        ? "Connecting..."
        : effectiveStatus === "error"
          ? "Error"
          : "Disconnected";

  return (
    <div className="mb-8">
      {/* Terminal window */}
      <div className="rounded-lg border border-[#1f1f1f] overflow-hidden bg-[#0a0a0a]">
        {/* Title bar - macOS terminal style */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#141414] border-b border-[#1f1f1f]">
          <div className="flex items-center gap-3">
            {/* Traffic light dots */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={clearTerminal}
                className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all"
                title="Clear"
              />
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 transition-all"
                title={isExpanded ? "Minimize" : "Expand"}
              />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>

            {/* Terminal title */}
            <div className="flex items-center gap-2">
              <svg
                className="w-3.5 h-3.5 text-[#606060]"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M4 6l2 2-2 2M7 10h4"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11px] font-mono text-[#606060]">
                agent@dispatch ~ {issueIdentifier.toLowerCase()}
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${effectiveStatus === "connecting" ? "animate-pulse" : ""}`}
              style={{ backgroundColor: statusColor }}
            />
            <span className="text-[10px] font-mono text-[#505050]">
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Terminal body */}
        {isExpanded && (
          <div
            ref={terminalRef}
            className="p-4 overflow-auto max-h-[500px] min-h-[60px]"
            style={{
              fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Courier New', monospace",
            }}
          >
            {allLines.length === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-[#4ade80] text-[12px]">$</span>
                <span className="text-[#505050] text-[12px] italic font-mono">
                  {isAgentActive
                    ? "Waiting for terminal output..."
                    : "No terminal output."}
                </span>
                {isAgentActive && (
                  <span className="w-2 h-4 bg-[#4ade80] animate-pulse" />
                )}
              </div>
            ) : (
              <ReactMarkdown components={terminalComponents}>
                {terminalMarkdown}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
