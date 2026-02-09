"use client";

import { useState } from "react";
import type { ToolCallEvent } from "./useOrchestrator";

interface TerminalToolCallProps {
  toolCall: ToolCallEvent;
}

export default function TerminalToolCall({ toolCall }: TerminalToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  let parsedResult: Record<string, unknown> | null = null;
  let hasError = false;
  if (toolCall.result) {
    try {
      parsedResult = JSON.parse(toolCall.result);
      hasError = !!parsedResult?.error;
    } catch {
      // raw string result
    }
  }

  // Status: running (yellow), error (red), success (green)
  const status = toolCall.isRunning
    ? "running"
    : hasError
      ? "error"
      : "done";

  const statusConfig = {
    running: {
      dot: "bg-[#f9db00] animate-pulse",
      text: "text-[#f9db00]",
      label: "running",
    },
    error: {
      dot: "bg-[#f87171]",
      text: "text-[#f87171]",
      label: "failed",
    },
    done: {
      dot: "bg-[#4ade80]",
      text: "text-[#4ade80]",
      label: "done",
    },
  }[status];

  return (
    <div className="font-mono leading-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 group w-full text-left py-[3px]"
      >
        {/* Expand/collapse arrow */}
        <svg
          className={`w-3 h-3 text-[#555] transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l4 4-4 4z" />
        </svg>

        {/* Tool indicator */}
        <span className="text-[#f9db00] text-[11px] shrink-0 opacity-70">[TOOL]</span>

        {/* Tool name */}
        <span className="text-[#e0d060] text-[11px]">
          {toolCall.name}
        </span>

        {/* Status dot + label */}
        <span className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
          <span className={`text-[10px] ${statusConfig.text}`}>
            {statusConfig.label}
          </span>
        </span>
      </button>

      {/* Expanded result */}
      {expanded && toolCall.result && (
        <div className="ml-5 mt-1 pl-3 border-l border-[#2a2200]">
          {hasError ? (
            <div className="text-[11px] text-[#f87171] bg-[#f8717110] rounded px-2 py-1">
              Error: {String(parsedResult?.error)}
            </div>
          ) : (
            <pre className="text-[10px] text-[#777] overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
              {parsedResult
                ? JSON.stringify(parsedResult, null, 2)
                : toolCall.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
