"use client";

import type { Issue, LinkedPR } from "@/lib/timeline/types";

// Agent status config
const agentStatusConfig: Record<
  string,
  { label: string; color: string; bgColor: string; pulseColor?: string }
> = {
  idle: { label: "Idle", color: "#6b7280", bgColor: "#6b728020" },
  investigating: {
    label: "Investigating",
    color: "#a78bfa",
    bgColor: "#a78bfa20",
    pulseColor: "#a78bfa",
  },
  implementing: {
    label: "Implementing",
    color: "#22d3d3",
    bgColor: "#22d3d320",
    pulseColor: "#22d3d3",
  },
  testing: {
    label: "Testing",
    color: "#f59e0b",
    bgColor: "#f59e0b20",
    pulseColor: "#f59e0b",
  },
  researching: {
    label: "Researching",
    color: "#8b5cf6",
    bgColor: "#8b5cf620",
    pulseColor: "#8b5cf6",
  },
  triaging: {
    label: "Triaging",
    color: "#ec4899",
    bgColor: "#ec489920",
    pulseColor: "#ec4899",
  },
  blocked: { label: "Blocked", color: "#f87171", bgColor: "#f8717120" },
  awaiting_review: {
    label: "Awaiting Review",
    color: "#facc15",
    bgColor: "#facc1520",
  },
};

function AgentStatusIcon({
  status,
  animate = false,
}: {
  status: string;
  animate?: boolean;
}) {
  const isActive =
    status === "investigating" ||
    status === "implementing" ||
    status === "testing" ||
    status === "researching" ||
    status === "triaging";

  return (
    <div className="relative">
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <rect
          x="3"
          y="4"
          width="10"
          height="8"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <circle cx="6" cy="8" r="1" fill="currentColor" />
        <circle cx="10" cy="8" r="1" fill="currentColor" />
        <path
          d="M8 4V2M8 2L6 1M8 2L10 1"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
      {animate && isActive && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
    </div>
  );
}

export interface IssueHeaderProps {
  issue: Issue;
  linkedPRs: LinkedPR[];
  cleanTitle: string;
  parsedSource: string | null;
  parsedFeature: string | null;
  isAgentActive: boolean;
  workflowLogsUrl: string | null;
  spawnLoading: boolean;
  cancelLoading: boolean;
  onGoBack: () => void;
  onSpawn: (type: "investigate" | "implement" | "triage" | "qa" | "research") => void;
  onCancel: () => void;
  onClose: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

export default function IssueHeader({
  issue,
  linkedPRs,
  cleanTitle,
  parsedSource,
  parsedFeature,
  isAgentActive,
  workflowLogsUrl,
  spawnLoading,
  cancelLoading,
  onGoBack,
  onSpawn,
  onCancel,
  onClose,
  onDelete,
  onRetry,
}: IssueHeaderProps) {
  const agentConfig =
    agentStatusConfig[issue.agent_status] || agentStatusConfig.idle;

  return (
    <header className="h-11 border-b border-[#1f1f1f] flex items-center px-3 md:px-4 bg-[#0d0d0d] shrink-0 z-10">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] shrink-0">
        <button
          onClick={onGoBack}
          className="flex items-center gap-1.5 text-[#808080] hover:text-[#e0e0e0] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
          </svg>
          <span className="hidden md:inline">Board</span>
        </button>
        <svg className="w-3 h-3 text-[#404040]" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[#e0e0e0] font-medium">{issue.identifier}</span>
      </div>

      {/* Center: truncated title + source tag */}
      <div className="flex items-center gap-2 ml-4 min-w-0 flex-1 overflow-hidden">
        <span className="text-[13px] text-[#808080] truncate hidden md:inline">
          {cleanTitle}
        </span>
        {parsedSource && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#1a1a2e] text-[#a78bfa] border border-[#a78bfa]/20">
            {parsedSource}{parsedFeature ? ` / ${parsedFeature}` : ""}
          </span>
        )}
      </div>

      {/* PR link badge */}
      {(() => {
        const primaryPR =
          linkedPRs.find((pr) => pr.pr_status === "open") ||
          linkedPRs.find((pr) => pr.pr_status === "merged") ||
          linkedPRs[0];
        if (!primaryPR) return null;
        const statusColor =
          primaryPR.pr_status === "merged"
            ? "text-[#a371f7] bg-[#a371f7]/10 border-[#a371f7]/20"
            : primaryPR.pr_status === "open"
              ? "text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/20"
              : "text-[#f85149] bg-[#f85149]/10 border-[#f85149]/20";
        return (
          <a
            href={primaryPR.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-opacity hover:opacity-80 ${statusColor}`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
            </svg>
            #{primaryPR.pr_number}
            <span className="hidden md:inline capitalize">{primaryPR.pr_status}</span>
          </a>
        );
      })()}

      {/* Right: status + actions */}
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {/* Agent status badge */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md"
          style={{ backgroundColor: agentConfig.bgColor }}
        >
          <span style={{ color: agentConfig.color }}>
            <AgentStatusIcon status={issue.agent_status} animate={isAgentActive} />
          </span>
          <span
            className="text-[11px] font-medium hidden md:inline"
            style={{ color: agentConfig.color }}
          >
            {agentConfig.label}
          </span>
        </div>

        {/* Action buttons - idle state */}
        {issue.agent_status === "idle" && (
          <>
            {(issue.run_outcome ||
              (issue.spawn_attempt_count != null &&
                issue.spawn_attempt_count > 0)) && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[11px] rounded-md transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden md:inline">Retry</span>
              </button>
            )}
            <button
              onClick={() => onSpawn("investigate")}
              disabled={spawnLoading}
              className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[11px] font-medium rounded-md transition-all shadow-lg shadow-[#5e6ad2]/20 disabled:opacity-50"
            >
              {spawnLoading ? (
                <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <AgentStatusIcon status="investigating" />
              )}
              {issue.run_outcome ||
              (issue.spawn_attempt_count != null &&
                issue.spawn_attempt_count > 0)
                ? "Reinvestigate"
                : "Investigate"}
            </button>
          </>
        )}

        {/* Cancel button when running */}
        {issue.spawn_status === "running" && (
          <>
            {workflowLogsUrl && (
              <a
                href={workflowLogsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[11px] rounded-md transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span className="hidden md:inline">Logs</span>
              </a>
            )}
            <button
              onClick={onCancel}
              disabled={cancelLoading}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#1a1a1a] border border-red-900/30 hover:bg-red-950/20 hover:border-red-800/40 text-red-400/80 hover:text-red-400 text-[11px] rounded-md transition-colors disabled:opacity-50"
            >
              {cancelLoading ? (
                <div className="w-3 h-3 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="4" y="4" width="8" height="8" rx="1" />
                </svg>
              )}
              {cancelLoading ? "..." : "Cancel"}
            </button>
          </>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[11px] rounded-md transition-colors"
          title="Close as not relevant"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
            <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <span className="hidden md:inline">Close</span>
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1.5 text-[#606060] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
          title="Delete mission"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export { agentStatusConfig, AgentStatusIcon };
