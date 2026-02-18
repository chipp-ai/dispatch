"use client";

import type { HistoryMiscEntry as HistoryMiscEntryType } from "@/lib/timeline/types";
import { TimelineEntryWrapper } from "./shared";

// Action icon configs (extracted from IssueTimeline.tsx)
const actionIcons: Record<string, { color: string; bgColor: string }> = {
  edited: { color: "#fb923c", bgColor: "#fb923c15" },
  priority_changed: { color: "#f87171", bgColor: "#f8717115" },
  assignee_changed: { color: "#22d3d3", bgColor: "#22d3d315" },
  label_added: { color: "#facc15", bgColor: "#facc1515" },
  label_removed: { color: "#6b7280", bgColor: "#6b728015" },
  pr_unlinked: { color: "#f87171", bgColor: "#f8717115" },
  pr_status_changed: { color: "#a78bfa", bgColor: "#a78bfa15" },
  comment_added: { color: "#94a3b8", bgColor: "#94a3b815" },
  reconciled: { color: "#5e6ad2", bgColor: "#5e6ad215" },
};

const defaultColors = { color: "#6b7280", bgColor: "#6b728015" };

export default function HistoryMiscEntry({
  entry,
}: {
  entry: HistoryMiscEntryType;
}) {
  const colors = actionIcons[entry.action] || defaultColors;

  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="3" />
        </svg>
      }
      iconColor={colors.color}
      iconBgColor={colors.bgColor}
      timestamp={entry.timestamp}
      compact
    >
      <div className="flex items-center gap-2 text-[12px]">
        {entry.actorName && (
          <span className="text-[#606060] text-[11px]">{entry.actorName}</span>
        )}
        <span className="text-[#909090]">{entry.formatted}</span>
      </div>
    </TimelineEntryWrapper>
  );
}
