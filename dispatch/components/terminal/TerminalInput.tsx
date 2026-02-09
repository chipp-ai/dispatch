"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { TurnMetrics } from "./useOrchestrator";

interface TerminalInputProps {
  onSubmit: (message: string) => void;
  isStreaming: boolean;
  onCancel: () => void;
  activeToolName?: string | null;
  turnMetrics?: TurnMetrics | null;
}

// Chippy-themed verbs for thinking states
const CHIPPY_VERBS = [
  "Crunching chips...",
  "Munching data...",
  "Frying circuits...",
  "Dipping in salsa...",
  "Seasoning response...",
  "Heating up...",
  "Getting crispy...",
  "Chipping away...",
  "Snacking on context...",
  "Flavor-blasting...",
  "Kettle-cooking...",
  "Salt & peppering...",
];

// Tool-specific chippy verbs
const TOOL_VERBS: Record<string, string> = {
  get_fleet_status: "Surveying the fleet...",
  search_missions: "Scanning mission logs...",
  get_mission: "Reading the mission brief...",
  dispatch_investigation: "Deploying investigator...",
  dispatch_implementation: "Deploying implementer...",
  dispatch_qa: "Deploying QA agent...",
  dispatch_research: "Deploying research agent...",
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Rough cost estimate: Opus 4.6 pricing ($5/M input, $25/M output)
function estimateCost(metrics: TurnMetrics): string {
  const inputCost = (metrics.inputTokens / 1_000_000) * 5;
  const outputCost = (metrics.outputTokens / 1_000_000) * 25;
  // Cache reads are 90% cheaper
  const cacheReadCost = (metrics.cacheReadTokens / 1_000_000) * 0.5;
  // Cache creation is 25% more expensive
  const cacheCreateCost = (metrics.cacheCreationTokens / 1_000_000) * 6.25;
  const total = inputCost + outputCost + cacheReadCost + cacheCreateCost;
  if (total < 0.001) return "$0.00";
  if (total < 0.01) return `$${total.toFixed(3)}`;
  return `$${total.toFixed(2)}`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return <>{formatDuration(now - startedAt)}</>;
}

export default function TerminalInput({
  onSubmit,
  isStreaming,
  onCancel,
  activeToolName,
  turnMetrics,
}: TerminalInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Pick a random chippy verb on each streaming start
  const chippyVerb = useMemo(() => {
    if (!isStreaming) return "";
    if (activeToolName && TOOL_VERBS[activeToolName]) {
      return TOOL_VERBS[activeToolName];
    }
    return CHIPPY_VERBS[Math.floor(Math.random() * CHIPPY_VERBS.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, activeToolName]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Re-focus after streaming completes
  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus();
    }
  }, [isStreaming]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue("");
    }
    if (e.key === "Escape" && isStreaming) {
      onCancel();
    }
  }

  const showMetrics = turnMetrics && (isStreaming || turnMetrics.apiCalls > 0);

  return (
    <div className="px-4 py-3 bg-[#0a0a08]">
      {/* Metrics bar - Claude Code style */}
      {showMetrics && turnMetrics && (
        <div className="flex items-center justify-between mb-2 px-1">
          {/* Left: chippy verb with pulse */}
          <div className="flex items-center gap-2">
            {isStreaming && (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f9db00] animate-pulse" />
                <span className="text-[11px] font-mono text-[#f9db00] opacity-70">
                  {chippyVerb}
                </span>
              </>
            )}
            {!isStreaming && (
              <span className="text-[11px] font-mono text-[#4ade80] opacity-70">
                Done in {formatDuration(Date.now() - turnMetrics.startedAt)}
              </span>
            )}
          </div>

          {/* Right: stats */}
          <div className="flex items-center gap-3 text-[10px] font-mono text-[#665e00]">
            {/* Elapsed time */}
            <span>
              {isStreaming ? (
                <ElapsedTimer startedAt={turnMetrics.startedAt} />
              ) : (
                formatDuration(Date.now() - turnMetrics.startedAt)
              )}
            </span>

            <span className="text-[#332f00]">|</span>

            {/* Tokens */}
            <span>
              <span className="text-[#f9db00]">
                {formatTokens(
                  turnMetrics.inputTokens + turnMetrics.outputTokens
                )}
              </span>{" "}
              tokens
            </span>

            <span className="text-[#332f00]">|</span>

            {/* API calls */}
            <span>
              <span className="text-[#f9db00]">{turnMetrics.apiCalls}</span>{" "}
              call{turnMetrics.apiCalls !== 1 ? "s" : ""}
            </span>

            <span className="text-[#332f00]">|</span>

            {/* Cost */}
            <span className="text-[#f9db00]">
              {estimateCost(turnMetrics)}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-[#2a2200] bg-[#0e0d08] px-3 py-2.5 focus-within:border-[#f9db0040]">
        <span className="text-[#f9db00] text-[13px] font-mono select-none pt-[3px] shrink-0">
          {isStreaming ? "..." : ">"}
        </span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "Esc to cancel"
              : "Describe a mission... (Enter to send)"
          }
          disabled={isStreaming}
          rows={1}
          className="flex-1 bg-transparent text-[#e0e0e0] text-[13px] font-mono resize-none outline-none placeholder:text-[#665e00] disabled:text-[#555] leading-relaxed"
          style={{
            fontFamily:
              "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Courier New', monospace",
          }}
        />
        {isStreaming && (
          <button
            onClick={onCancel}
            className="text-[11px] text-[#665e00] hover:text-[#f87171] font-mono transition-colors px-2 py-1 rounded hover:bg-[#1a1800] shrink-0"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
