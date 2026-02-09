"use client";

import ReactMarkdown from "react-markdown";
import { terminalMarkdownComponents } from "./markdownComponents";
import TerminalToolCall from "./TerminalToolCall";
import type { OrchestratorMessage } from "./useOrchestrator";

interface TerminalMessageProps {
  message: OrchestratorMessage;
  isStreaming?: boolean;
}

export default function TerminalMessage({
  message,
  isStreaming,
}: TerminalMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex items-start gap-2 py-2">
        <span className="text-[#f9db00] text-[13px] font-mono select-none shrink-0">
          {">"}
        </span>
        <span className="text-[#e0e0e0] text-[13px] font-mono whitespace-pre-wrap">
          {message.content}
        </span>
      </div>
    );
  }

  // Assistant message
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasContent = message.content.trim().length > 0;

  // Don't render empty assistant messages with no tool calls
  if (!hasContent && !hasToolCalls) return null;

  // Tool-only messages get minimal padding so consecutive tool calls stack tight
  const isToolOnly = hasToolCalls && !hasContent;

  return (
    <div className={isToolOnly ? "py-0" : "py-2"}>
      {/* Tool calls grouped tight */}
      {hasToolCalls && (
        <div className="flex flex-col">
          {message.toolCalls!.map((tc) => (
            <TerminalToolCall key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Text content */}
      {hasContent && (
        <div className={`terminal-markdown${hasToolCalls ? " mt-1" : ""}`}>
          <ReactMarkdown components={terminalMarkdownComponents}>
            {message.content}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-[#f9db00] animate-pulse align-middle ml-0.5" />
          )}
        </div>
      )}
    </div>
  );
}
