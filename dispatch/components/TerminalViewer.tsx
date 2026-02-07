"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface TerminalMessage {
  type: "output" | "status" | "error";
  issueIdentifier: string;
  timestamp: string;
  data: string;
}

interface TerminalViewerProps {
  issueIdentifier: string;
  isAgentActive: boolean;
}

export default function TerminalViewer({
  issueIdentifier,
  isAgentActive,
}: TerminalViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  const [isExpanded, setIsExpanded] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus("connecting");

    // Determine WebSocket URL based on environment
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/terminal?issue=${encodeURIComponent(issueIdentifier)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("connected");
      setLines((prev) => [
        ...prev,
        "\x1b[32m[Terminal] Connected to agent stream\x1b[0m\n",
      ]);
    };

    ws.onmessage = (event) => {
      try {
        const message: TerminalMessage = JSON.parse(event.data);

        if (message.type === "output") {
          setLines((prev) => [...prev, message.data]);
          scrollToBottom();
        } else if (message.type === "status") {
          setLines((prev) => [
            ...prev,
            `\x1b[33m[Status] ${message.data}\x1b[0m\n`,
          ]);
        } else if (message.type === "error") {
          setLines((prev) => [
            ...prev,
            `\x1b[31m[Error] ${message.data}\x1b[0m\n`,
          ]);
        }
      } catch {
        // Raw text message
        setLines((prev) => [...prev, event.data]);
      }
      scrollToBottom();
    };

    ws.onclose = () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
      setLines((prev) => [
        ...prev,
        "\x1b[33m[Terminal] Disconnected from agent stream\x1b[0m\n",
      ]);

      // Auto-reconnect if agent is still active
      if (isAgentActive) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };
  }, [issueIdentifier, isAgentActive, scrollToBottom]);

  // Disconnect from WebSocket
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

  // Connect when agent becomes active
  useEffect(() => {
    if (isAgentActive) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAgentActive, connect, disconnect]);

  // Clear terminal
  const clearTerminal = () => {
    setLines([]);
  };

  // Parse ANSI codes for display (simplified)
  const parseAnsi = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;

    // Simple ANSI color regex
    const ansiRegex = /\x1b\[(\d+)m/g;
    let match;
    let currentColor = "";

    const colorMap: Record<string, string> = {
      "0": "", // Reset
      "30": "#1e1e1e", // Black
      "31": "#f87171", // Red
      "32": "#4ade80", // Green
      "33": "#facc15", // Yellow
      "34": "#60a5fa", // Blue
      "35": "#a78bfa", // Magenta
      "36": "#22d3d3", // Cyan
      "37": "#e0e0e0", // White
      "90": "#6b7280", // Bright black (gray)
      "91": "#fca5a5", // Bright red
      "92": "#86efac", // Bright green
      "93": "#fde047", // Bright yellow
      "94": "#93c5fd", // Bright blue
      "95": "#c4b5fd", // Bright magenta
      "96": "#67e8f9", // Bright cyan
      "97": "#ffffff", // Bright white
    };

    while ((match = ansiRegex.exec(text)) !== null) {
      // Add text before the code
      if (match.index > currentIndex) {
        const segment = text.slice(currentIndex, match.index);
        parts.push(
          <span key={parts.length} style={{ color: currentColor || "#c0c0c0" }}>
            {segment}
          </span>
        );
      }

      // Update color
      currentColor = colorMap[match[1]] || "";
      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(
        <span key={parts.length} style={{ color: currentColor || "#c0c0c0" }}>
          {text.slice(currentIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : [<span key="0">{text}</span>];
  };

  // Don't render if agent is idle and no lines
  if (!isAgentActive && lines.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Terminal icon */}
          <svg
            className="w-4 h-4 text-[#4ade80]"
            viewBox="0 0 16 16"
            fill="none"
          >
            <rect
              x="1"
              y="2"
              width="14"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.25"
            />
            <path
              d="M4 6l2 2-2 2M7 10h4"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 className="text-[13px] font-medium text-[#e0e0e0]">
            Terminal Output
          </h3>

          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-[#4ade80]"
                  : connectionStatus === "connecting"
                    ? "bg-[#facc15] animate-pulse"
                    : connectionStatus === "error"
                      ? "bg-[#f87171]"
                      : "bg-[#6b7280]"
              }`}
            />
            <span className="text-[10px] text-[#606060]">
              {connectionStatus === "connected"
                ? "Live"
                : connectionStatus === "connecting"
                  ? "Connecting..."
                  : connectionStatus === "error"
                    ? "Error"
                    : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear button */}
          <button
            onClick={clearTerminal}
            className="p-1 text-[#505050] hover:text-[#808080] transition-colors"
            title="Clear terminal"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Expand/collapse button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-[#505050] hover:text-[#808080] transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal content */}
      {isExpanded && (
        <div
          ref={terminalRef}
          className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3 font-mono text-[12px] leading-relaxed overflow-auto max-h-[500px] whitespace-pre-wrap"
          style={{
            fontFamily:
              "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', monospace",
          }}
        >
          {lines.length === 0 ? (
            <div className="text-[#505050] italic">
              {isAgentActive
                ? "Waiting for terminal output..."
                : "No terminal output yet."}
            </div>
          ) : (
            lines.map((line, index) => <div key={index}>{parseAnsi(line)}</div>)
          )}
        </div>
      )}
    </div>
  );
}
