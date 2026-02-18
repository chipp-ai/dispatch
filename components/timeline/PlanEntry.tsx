"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  PlanSubmittedEntry,
  BlockedEntry as BlockedEntryType,
} from "@/lib/timeline/types";
import { TimelineEntryWrapper } from "./shared";

// --- Plan Submitted ---

export function PlanSubmittedEntryComponent({
  entry,
  autoSpawnOnApprove,
  planActionLoading,
  spawnLoading,
  onApprove: handleApprove,
  onReject: handleReject,
  onSetAutoSpawn,
  onExpandPlan,
  onSpawnImplement,
  onSpawnInvestigate,
}: {
  entry: PlanSubmittedEntry;
  autoSpawnOnApprove: boolean;
  planActionLoading: boolean;
  spawnLoading: boolean;
  onApprove: () => void;
  onReject: (feedback: string) => void;
  onSetAutoSpawn: (val: boolean) => void;
  onExpandPlan: () => void;
  onSpawnImplement: () => void;
  onSpawnInvestigate: () => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [feedback, setFeedback] = useState("");

  const statusColor =
    entry.planStatus === "awaiting_review"
      ? "#facc15"
      : entry.planStatus === "approved"
        ? "#4ade80"
        : "#fb923c";
  const statusLabel =
    entry.planStatus === "awaiting_review"
      ? "Awaiting Review"
      : entry.planStatus === "approved"
        ? "Approved"
        : "Needs Revision";

  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
          <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      }
      iconColor={statusColor}
      iconBgColor={statusColor + "15"}
      timestamp={entry.timestamp}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-medium text-[#e0e0e0]">Plan</span>
        <span
          className="px-1.5 py-0.5 text-[9px] font-medium rounded-full uppercase tracking-wide"
          style={{ backgroundColor: statusColor + "15", color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Plan content preview */}
      <div
        className="bg-[#080808] border border-[#1a1a1a] rounded-lg p-4 mb-3 max-h-[250px] overflow-hidden relative cursor-pointer group"
        onClick={onExpandPlan}
      >
        <div className="prose prose-invert prose-sm max-w-none
          prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
          prose-h1:text-[15px] prose-h2:text-[13px] prose-h3:text-[12px] prose-h4:text-[11px]
          prose-p:text-[#a0a0a0] prose-p:text-[12px] prose-p:leading-relaxed prose-p:my-1
          prose-strong:text-[#d0d0d0]
          prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
          prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg
          prose-ul:text-[#a0a0a0] prose-ul:my-1 prose-li:my-0 prose-li:text-[12px]
          prose-ol:text-[#a0a0a0] prose-ol:my-1
          prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
        ">
          <ReactMarkdown>{entry.planContent}</ReactMarkdown>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#080808] to-transparent pointer-events-none" />
        <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
          <span className="text-[11px] text-[#5e6ad2] group-hover:text-[#7c8af2] transition-colors">
            View full plan
          </span>
        </div>
      </div>

      {/* Actions */}
      {entry.planStatus === "awaiting_review" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={planActionLoading}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 border border-[#4ade80]/30 text-[#4ade80] text-[11px] font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {planActionLoading ? (
                <div className="w-3 h-3 border border-[#4ade80]/40 border-t-[#4ade80] rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              Approve
            </button>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSpawnOnApprove}
                onChange={(e) => onSetAutoSpawn(e.target.checked)}
                className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0 w-3 h-3"
              />
              <span className="text-[10px] text-[#666]">Auto-implement</span>
            </label>
            <button
              onClick={() => setShowRejectForm(!showRejectForm)}
              disabled={planActionLoading}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] border border-[#303030] text-[#808080] hover:text-[#e0e0e0] text-[11px] font-medium rounded-md transition-colors disabled:opacity-50 ml-auto"
            >
              Request Changes
            </button>
          </div>
          {showRejectForm && (
            <div className="p-3 bg-[#141414] border border-[#252525] rounded-lg">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what changes are needed..."
                rows={3}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#252525] rounded text-[13px] text-[#e0e0e0] placeholder-[#505050] outline-none focus:border-[#404040] resize-none transition-colors mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleReject(feedback.trim());
                    setFeedback("");
                    setShowRejectForm(false);
                  }}
                  disabled={planActionLoading || !feedback.trim()}
                  className="px-3 py-1.5 bg-[#fb923c]/10 hover:bg-[#fb923c]/20 border border-[#fb923c]/30 text-[#fb923c] text-[12px] font-medium rounded transition-colors disabled:opacity-50"
                >
                  Submit Feedback
                </button>
                <button
                  onClick={() => {
                    setShowRejectForm(false);
                    setFeedback("");
                  }}
                  className="px-3 py-1.5 text-[12px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {entry.planStatus === "needs_revision" && (
        <>
          {entry.planFeedback && (
            <div className="mb-2 p-2 bg-[#fb923c]/5 border border-[#fb923c]/20 rounded">
              <div className="text-[10px] font-medium text-[#fb923c] mb-0.5">Feedback</div>
              <p className="text-[11px] text-[#fb923c]/80 leading-relaxed">{entry.planFeedback}</p>
            </div>
          )}
          <button
            onClick={onSpawnInvestigate}
            disabled={spawnLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[11px] font-medium rounded-md transition-all disabled:opacity-50"
          >
            {spawnLoading ? (
              <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            Re-investigate
          </button>
        </>
      )}

      {entry.planStatus === "approved" && (
        <button
          onClick={onSpawnImplement}
          disabled={spawnLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#22d3d3] to-[#5e6ad2] hover:from-[#2dd4bf] hover:to-[#6b74db] text-white text-[11px] font-medium rounded-md transition-all disabled:opacity-50"
        >
          {spawnLoading ? (
            <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          Implement
        </button>
      )}
    </TimelineEntryWrapper>
  );
}

// --- Blocked ---

export function BlockedEntryComponent({
  entry,
  spawnLoading,
  onUnblock,
}: {
  entry: BlockedEntryType;
  spawnLoading: boolean;
  onUnblock: () => void;
}) {
  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5l6.5 11.25H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
          <path d="M8 6v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
      }
      iconColor="#f87171"
      iconBgColor="#f8717115"
      timestamp={entry.timestamp}
    >
      <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-[12px] font-semibold text-red-400">Blocked</h3>
        </div>
        <p className="text-[11px] text-red-300/80 leading-relaxed mb-2">
          {entry.reason}
        </p>
        <button
          onClick={onUnblock}
          disabled={spawnLoading}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-medium rounded-md transition-colors disabled:opacity-50"
        >
          {spawnLoading ? (
            <div className="w-3 h-3 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          Unblock & Re-run
        </button>
      </div>
    </TimelineEntryWrapper>
  );
}
