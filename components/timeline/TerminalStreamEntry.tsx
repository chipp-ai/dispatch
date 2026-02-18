"use client";

import { useState } from "react";
import type { TerminalStreamEntry as TerminalStreamEntryType } from "@/lib/timeline/types";
import TerminalViewer from "@/components/TerminalViewer";

export default function TerminalStreamEntry({
  entry,
}: {
  entry: TerminalStreamEntryType;
}) {
  const [collapsed, setCollapsed] = useState(!entry.isLive);

  if (collapsed) {
    return (
      <div className="py-1 pl-10">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] hover:border-[#303030] transition-colors w-full text-left group"
        >
          <svg className="w-3.5 h-3.5 text-[#4ade80]" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l2 2-2 2M7 10h4"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[11px] font-mono text-[#606060] group-hover:text-[#808080] transition-colors">
            Terminal output ({entry.lines.length} lines)
          </span>
          <svg className="w-3 h-3 text-[#404040] ml-auto -rotate-90" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="py-1 pl-10">
      {!entry.isLive && (
        <button
          onClick={() => setCollapsed(true)}
          className="flex items-center gap-1 text-[10px] text-[#505050] hover:text-[#808080] transition-colors mb-1"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Collapse terminal
        </button>
      )}
      <TerminalViewer
        issueIdentifier={entry.issueIdentifier}
        isAgentActive={entry.isLive}
        sseLines={entry.lines}
        className={entry.isLive ? "min-h-[200px]" : ""}
      />
    </div>
  );
}
