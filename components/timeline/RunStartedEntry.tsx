"use client";

import type { RunStartedEntry as RunStartedEntryType } from "@/lib/timeline/types";
import { TimelineEntryWrapper, workflowLabels } from "./shared";

export default function RunStartedEntry({
  entry,
}: {
  entry: RunStartedEntryType;
}) {
  const workflow = workflowLabels[entry.workflowType] || {
    label: entry.workflowType,
    color: "#808080",
  };

  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <path
            d="M5 3l6 5-6 5V3z"
            fill="currentColor"
          />
        </svg>
      }
      iconColor={workflow.color}
      iconBgColor={workflow.color + "15"}
      pulsing={entry.isActive}
      timestamp={entry.timestamp}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-medium text-[#e0e0e0]">
          Run started
        </span>
        <span
          className="px-1.5 py-0.5 text-[10px] font-medium rounded"
          style={{
            backgroundColor: workflow.color + "20",
            color: workflow.color,
          }}
        >
          {workflow.label}
        </span>
        {entry.isActive && (
          <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#a78bfa]/15 text-[#a78bfa] uppercase tracking-wide animate-pulse">
            Live
          </span>
        )}
        {entry.githubRunUrl && (
          <a
            href={entry.githubRunUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-[#5e6ad2] hover:text-[#7c8aff] transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub Actions
          </a>
        )}
      </div>
    </TimelineEntryWrapper>
  );
}
