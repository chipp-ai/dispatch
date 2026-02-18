"use client";

import { useState, useEffect } from "react";
import type { RunCompletedEntry as RunCompletedEntryType } from "@/lib/timeline/types";
import { TimelineEntryWrapper, outcomeConfig, workflowLabels } from "./shared";

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "--";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

export default function RunCompletedEntry({
  entry,
}: {
  entry: RunCompletedEntryType;
}) {
  const { run } = entry;
  const outcome = run.outcome ? outcomeConfig[run.outcome] : null;
  const outcomeColor = outcome?.color || "#808080";

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    if (!showTranscript || transcript !== null) return;
    setLoadingTranscript(true);
    fetch(`/api/issues/${run.issue_id}/runs/${run.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        setTranscript(data?.transcript || "No transcript available.")
      )
      .catch(() => setTranscript("Failed to load transcript."))
      .finally(() => setLoadingTranscript(false));
  }, [showTranscript, run.issue_id, run.id, transcript]);

  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
          {run.outcome === "completed" || run.outcome === "investigation_complete" ? (
            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          ) : run.outcome === "failed" ? (
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          ) : (
            <rect x="6" y="6" width="4" height="4" rx="0.5" fill="currentColor" />
          )}
        </svg>
      }
      iconColor={outcomeColor}
      iconBgColor={outcomeColor + "15"}
      timestamp={entry.timestamp}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-medium text-[#e0e0e0]">
          Run completed
        </span>
        {outcome && (
          <span
            className="px-1.5 py-0.5 text-[10px] font-medium rounded"
            style={{ backgroundColor: outcomeColor + "20", color: outcomeColor }}
          >
            {outcome.label}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 mt-1 text-[11px] text-[#606060]">
        {Number(run.cost_usd) > 0 && (
          <span className="font-mono text-[#22d3d3]">
            ${Number(run.cost_usd) < 0.01 ? "<0.01" : Number(run.cost_usd).toFixed(2)}
          </span>
        )}
        <span>{formatDuration(run.duration_seconds)}</span>
        {run.num_turns > 0 && <span>{run.num_turns} turns</span>}
        {run.pr_number && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#5e6ad2]/10 text-[#5e6ad2]">
            PR #{run.pr_number}
          </span>
        )}
      </div>

      {run.outcome_summary && (
        <p className="text-[11px] text-[#707070] mt-1.5 leading-relaxed">
          {run.outcome_summary}
        </p>
      )}

      {/* Expandable transcript */}
      <button
        onClick={() => setShowTranscript(!showTranscript)}
        className="mt-2 flex items-center gap-1 text-[10px] text-[#505050] hover:text-[#808080] transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${showTranscript ? "" : "-rotate-90"}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        View transcript
      </button>
      {showTranscript && (
        <div className="mt-1.5 p-3 max-h-[400px] overflow-y-auto bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
          {loadingTranscript ? (
            <div className="flex items-center gap-2 text-[11px] text-[#505050]">
              <div className="w-3 h-3 border border-[#404040] border-t-[#a78bfa] rounded-full animate-spin" />
              Loading transcript...
            </div>
          ) : transcript ? (
            <pre className="text-[11px] text-[#808080] leading-relaxed whitespace-pre-wrap font-mono">
              {transcript}
            </pre>
          ) : (
            <p className="text-[11px] text-[#404040]">No transcript available.</p>
          )}
        </div>
      )}
    </TimelineEntryWrapper>
  );
}
