"use client";

export interface AgentRunSummary {
  id: string;
  issue_id: string;
  github_run_id: string | null;
  github_run_url: string | null;
  workflow_type: string;
  status: string;
  outcome: string | null;
  outcome_summary: string | null;
  cost_usd: number;
  num_turns: number;
  model: string | null;
  pr_number: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  duration_seconds: number | null;
}

const workflowConfig: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  error_fix: { label: "Error Fix", color: "#f87171", icon: "bug" },
  prd_investigate: {
    label: "Investigate",
    color: "#a78bfa",
    icon: "search",
  },
  prd_implement: { label: "Implement", color: "#22d3d3", icon: "code" },
  qa: { label: "QA Test", color: "#facc15", icon: "test" },
  deep_research: { label: "Research", color: "#60a5fa", icon: "book" },
};

const statusConfig: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  running: { label: "Running", color: "#a78bfa", bgColor: "#a78bfa20" },
  completed: { label: "Completed", color: "#4ade80", bgColor: "#4ade8020" },
  failed: { label: "Failed", color: "#f87171", bgColor: "#f8717120" },
  cancelled: { label: "Cancelled", color: "#808080", bgColor: "#80808020" },
};

const outcomeConfig: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "#4ade80" },
  no_changes_needed: { label: "No Changes", color: "#60a5fa" },
  blocked: { label: "Blocked", color: "#f87171" },
  needs_human_decision: { label: "Needs Human", color: "#facc15" },
  investigation_complete: { label: "Investigated", color: "#a78bfa" },
  failed: { label: "Failed", color: "#f87171" },
};

function WorkflowIcon({ type }: { type: string }) {
  const config = workflowConfig[type];
  if (!config) return null;

  switch (config.icon) {
    case "bug":
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.355.522a.5.5 0 01.623.333l.291.956A4.979 4.979 0 018 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5 0 11.957.29l-.41 1.352A4.985 4.985 0 0113 6h.5a.5.5 0 01.5.5V7a.5.5 0 01-.5.5H13v1h.5a.5.5 0 01.5.5v.5a.5.5 0 01-.5.5H13a5 5 0 01-10 0h-.5a.5.5 0 01-.5-.5V9a.5.5 0 01.5-.5H3V7h-.5A.5.5 0 012 6.5V6a.5.5 0 01.5-.5H3c0-1.149.15-2 1.568-3.633l-.41-1.352a.5.5 0 01.332-.623z" />
        </svg>
      );
    case "search":
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"
          />
        </svg>
      );
    case "code":
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z"
          />
        </svg>
      );
    case "test":
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z"
          />
        </svg>
      );
    case "book":
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75zm7.251 10.324V2.922A2.25 2.25 0 005.003 2.5H1.5v9h3.757a3.75 3.75 0 011.994.574zM8.755 12.074A3.75 3.75 0 0110.748 11.5H14.5v-9h-3.495a2.25 2.25 0 00-2.25 2.25v7.324z" />
        </svg>
      );
    default:
      return null;
  }
}

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

function formatCost(costUsd: number): string {
  if (!costUsd || costUsd === 0) return "--";
  if (costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

interface RunCardProps {
  run: AgentRunSummary;
  isSelected: boolean;
  onClick: () => void;
}

export default function RunCard({ run, isSelected, onClick }: RunCardProps) {
  const workflow = workflowConfig[run.workflow_type] || {
    label: run.workflow_type,
    color: "#808080",
    icon: "code",
  };
  const status = statusConfig[run.status] || statusConfig.completed;
  const outcome = run.outcome ? outcomeConfig[run.outcome] : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-[#141414] border rounded-lg p-3 transition-colors ${
        isSelected
          ? "border-[#5e6ad2]"
          : "border-[#252525] hover:border-[#303030]"
      }`}
    >
      {/* Top row: workflow type + status */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-1.5 text-[12px] font-medium"
          style={{ color: workflow.color }}
        >
          <WorkflowIcon type={run.workflow_type} />
          {workflow.label}
        </div>
        <div className="flex items-center gap-2">
          {run.status === "running" && (
            <span
              className="relative flex h-2 w-2"
              style={{ color: status.color }}
            >
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: status.color }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: status.color }}
              />
            </span>
          )}
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: status.bgColor, color: status.color }}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Outcome summary if present */}
      {run.outcome_summary && (
        <div className="text-[12px] text-[#a0a0a0] mb-2 line-clamp-2 leading-relaxed">
          {run.outcome_summary}
        </div>
      )}

      {/* Bottom row: metrics */}
      <div className="flex items-center gap-3 text-[11px] text-[#505050]">
        {/* Duration */}
        <span>{formatDuration(run.duration_seconds)}</span>

        {/* Cost */}
        <span>{formatCost(Number(run.cost_usd))}</span>

        {/* Turns */}
        {run.num_turns > 0 && <span>{run.num_turns} turns</span>}

        {/* PR badge */}
        {run.pr_number && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{ backgroundColor: "#5e6ad220", color: "#5e6ad2" }}
          >
            PR #{run.pr_number}
          </span>
        )}

        {/* Outcome badge */}
        {outcome && run.outcome !== "completed" && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium ml-auto"
            style={{
              backgroundColor: outcome.color + "20",
              color: outcome.color,
            }}
          >
            {outcome.label}
          </span>
        )}

        {/* Time */}
        <span className="ml-auto">{formatRelativeTime(run.started_at)}</span>
      </div>
    </button>
  );
}
