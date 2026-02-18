"use client";

import ReactMarkdown from "react-markdown";
import type { ActivityReportEntry as ActivityReportEntryType } from "@/lib/timeline/types";
import { TimelineEntryWrapper } from "./shared";

const reportConfig: Record<
  string,
  { label: string; color: string; icon: JSX.Element }
> = {
  investigation_complete: {
    label: "Investigation Report",
    color: "#a78bfa",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  implementation_complete: {
    label: "Implementation Report",
    color: "#22d3d3",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l2 2-2 2M8 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  investigation_failed: {
    label: "Investigation Failed",
    color: "#f87171",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  implementation_failed: {
    label: "Implementation Failed",
    color: "#f87171",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  qa_complete: {
    label: "QA Report",
    color: "#f59e0b",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  qa_failed: {
    label: "QA Failed",
    color: "#f87171",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  research_complete: {
    label: "Research Report",
    color: "#60a5fa",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
        <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  research_failed: {
    label: "Research Failed",
    color: "#f87171",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
};

export default function ActivityReportEntry({
  entry,
}: {
  entry: ActivityReportEntryType;
}) {
  const config = reportConfig[entry.reportType] || {
    label: "Report",
    color: "#808080",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="3" />
      </svg>
    ),
  };

  return (
    <TimelineEntryWrapper
      icon={config.icon}
      iconColor={config.color}
      iconBgColor={config.color + "15"}
      timestamp={entry.timestamp}
    >
      <div className="text-[13px] font-medium text-[#e0e0e0] mb-2">
        {config.label}
      </div>
      <div
        className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 max-h-[500px] overflow-y-auto
          prose prose-invert prose-sm max-w-none
          prose-headings:text-[#c0c0c0] prose-headings:text-[13px] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
          prose-p:text-[#909090] prose-p:text-[12px] prose-p:my-1
          prose-strong:text-[#c0c0c0]
          prose-li:text-[#909090] prose-li:text-[12px] prose-li:my-0
          prose-ul:my-1 prose-ol:my-1
          prose-code:text-[#a78bfa] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
          prose-pre:bg-[#080808] prose-pre:border prose-pre:border-[#1f1f1f] prose-pre:rounded-md prose-pre:text-[11px]
          prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
        "
      >
        <ReactMarkdown>{entry.content || ""}</ReactMarkdown>
      </div>
      {(entry.metadata?.run_url || entry.metadata?.pr_url) && (
        <div className="flex gap-3 mt-2">
          {entry.metadata.run_url && (
            <a
              href={entry.metadata.run_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#5e6ad2] hover:text-[#7c8aff] transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              View Logs
            </a>
          )}
          {entry.metadata.pr_url && (
            <a
              href={entry.metadata.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#22d3d3] hover:text-[#2dd4bf] transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
              </svg>
              View PR
            </a>
          )}
        </div>
      )}
    </TimelineEntryWrapper>
  );
}
