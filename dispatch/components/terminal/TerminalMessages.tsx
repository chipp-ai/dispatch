"use client";

import { useRef, useEffect } from "react";
import TerminalMessage from "./TerminalMessage";
import type { OrchestratorMessage } from "./useOrchestrator";

interface TerminalMessagesProps {
  messages: OrchestratorMessage[];
  isStreaming: boolean;
}

const CHIPPY_BRAILLE = `⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡶⠛⠛⠳⣦
⠀⠀⠀⠀⠀⠀⢀⣀⣀⣸⣧⡤⠆⠀⢸⡇
⠀⠀⠀⣠⡴⣛⣩⣭⣭⣭⣤⣤⣤⣤⣭⣛⠶⣄
⠀⠀⣼⢫⣾⣿⣿⣿⣿⠋⢹⣿⣿⡟⠉⣿⣷⣌⢷⡀
⢀⡾⢡⣿⣿⣿⣿⣿⣿⠀⢾⣿⣿⡇⠰⣿⣿⣿⡎⣷
⣾⠁⠸⣿⣿⣿⣿⣿⣿⣄⣸⣿⣿⣧⣀⣿⣿⣿⡇⣿
⣿⠀⠀⢻⣿⣿⣿⣿⣿⣿⣏⠙⠻⠛⢉⣿⣿⡿⣱⠏
⠹⡆⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣶⣾⣿⠿⠋⣴⠋
⢸⡇⠀⠈⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⠾⠁
⠈⠷⣤⡤⠶⠒⠶⠶⠶⠶⠶⠶⠶⠚⠋⠁`;

export default function TerminalMessages({
  messages,
  isStreaming,
}: TerminalMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages and during streaming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Use requestAnimationFrame to ensure DOM has painted
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, isStreaming]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-3"
      style={{
        fontFamily:
          "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Courier New', monospace",
      }}
    >
      {/* Chippy banner -- always at top, like Claude Code */}
      <div className="flex items-start gap-4 mb-4">
        <pre className="text-[11px] text-[#f9db00] leading-[1.15] opacity-50 shrink-0">
          {CHIPPY_BRAILLE}
        </pre>
        <div className="pt-1 text-[12px] font-mono space-y-0.5">
          <div>
            <span className="text-[#f9db00] font-semibold">Chippy Dispatch</span>{" "}
            <span className="text-[#665e00]">v0.1</span>
          </div>
          <div className="text-[#665e00]">
            {process.env.NEXT_PUBLIC_ORCHESTRATOR_MODEL || "sonnet-4.5"} · dispatch orchestrator
          </div>
          <div className="text-[#4a4400] text-[11px]">
            Issue tracker + autonomous agents
          </div>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="text-[#444] text-[11px] space-y-1 ml-1">
          <p>
            <span className="text-[#f9db00]">{">"}</span>{" "}
            {"what's on the board?"}
          </p>
          <p>
            <span className="text-[#f9db00]">{">"}</span>{" "}
            {"plan the notifications feature"}
          </p>
          <p>
            <span className="text-[#f9db00]">{">"}</span>{" "}
            {"search for billing issues"}
          </p>
          <p>
            <span className="text-[#f9db00]">{">"}</span>{" "}
            {"spawn an agent on CHIPP-42"}
          </p>
        </div>
      ) : (
        <>
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            return (
              <TerminalMessage
                key={msg.id}
                message={msg}
                isStreaming={isLast && isStreaming && msg.role === "assistant"}
              />
            );
          })}
        </>
      )}
      <div className="shrink-0 h-1" />
    </div>
  );
}
