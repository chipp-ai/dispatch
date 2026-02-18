"use client";

import type { PRLinkedEntry as PRLinkedEntryType } from "@/lib/timeline/types";
import PRCard from "@/components/PRCard";
import { TimelineEntryWrapper } from "./shared";

export default function PRLinkedEntry({
  entry,
  onUnlink,
}: {
  entry: PRLinkedEntryType;
  onUnlink?: (prId: string) => void;
}) {
  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
        </svg>
      }
      iconColor="#5e6ad2"
      iconBgColor="#5e6ad215"
      timestamp={entry.timestamp}
    >
      <div className="text-[13px] font-medium text-[#e0e0e0] mb-2">
        PR #{entry.pr.pr_number} created
        <span className="ml-2 capitalize text-[11px] font-normal" style={{
          color: entry.pr.pr_status === "merged" ? "#a78bfa"
            : entry.pr.pr_status === "open" ? "#4ade80"
            : "#f87171"
        }}>
          {entry.pr.pr_status}
        </span>
      </div>
      <PRCard pr={entry.pr} onUnlink={onUnlink} />
    </TimelineEntryWrapper>
  );
}
