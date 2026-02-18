"use client";

import type { ReactNode } from "react";

// Format relative time used across all timeline entries
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Wrapper for consistent timeline entry layout
export function TimelineEntryWrapper({
  icon,
  iconColor,
  iconBgColor,
  pulsing,
  timestamp,
  children,
  compact,
}: {
  icon: ReactNode;
  iconColor: string;
  iconBgColor: string;
  pulsing?: boolean;
  timestamp: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`relative flex gap-3 ${compact ? "py-1" : "py-2"}`}>
      {/* Icon dot */}
      <div className="relative flex-shrink-0 z-10">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: iconBgColor }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        {pulsing && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: iconColor }}
            />
            <span
              className="relative inline-flex rounded-full h-2.5 w-2.5"
              style={{ backgroundColor: iconColor }}
            />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {children}
        <span className="text-[10px] text-[#404040] mt-0.5 block">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
    </div>
  );
}

// Workflow type labels and colors
export const workflowLabels: Record<string, { label: string; color: string }> = {
  error_fix: { label: "Error Fix", color: "#f87171" },
  prd_investigate: { label: "Investigate", color: "#a78bfa" },
  prd_implement: { label: "Implement", color: "#22d3d3" },
  qa: { label: "QA Test", color: "#facc15" },
  deep_research: { label: "Research", color: "#60a5fa" },
  auto_triage: { label: "Triage", color: "#ec4899" },
};

// Outcome config
export const outcomeConfig: Record<
  string,
  { label: string; color: string }
> = {
  completed: { label: "Completed", color: "#4ade80" },
  no_changes_needed: { label: "No Changes", color: "#60a5fa" },
  blocked: { label: "Blocked", color: "#f87171" },
  needs_human_decision: { label: "Needs Decision", color: "#facc15" },
  investigation_complete: { label: "Investigated", color: "#a78bfa" },
  failed: { label: "Failed", color: "#f87171" },
};
