"use client";

import type { StatusChangedEntry as StatusChangedEntryType } from "@/lib/timeline/types";
import { TimelineEntryWrapper } from "./shared";

export default function StatusChangedEntry({
  entry,
}: {
  entry: StatusChangedEntryType;
}) {
  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 1.5A1.5 1.5 0 000 3v10a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0016 13V3a1.5 1.5 0 00-1.5-1.5h-13zm2 2h9a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" />
        </svg>
      }
      iconColor="#60a5fa"
      iconBgColor="#60a5fa15"
      timestamp={entry.timestamp}
      compact
    >
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-[#808080]">Status:</span>
        {entry.oldValue && (
          <>
            <span className="text-[#606060]">{entry.oldValue}</span>
            <svg className="w-3 h-3 text-[#404040]" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
        <span className="text-[#e0e0e0] font-medium">{entry.newValue}</span>
        {entry.actorName && (
          <span className="text-[#404040] text-[10px]">
            by {entry.actorName}
          </span>
        )}
      </div>
    </TimelineEntryWrapper>
  );
}
