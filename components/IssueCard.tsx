"use client";

import Link from "next/link";

interface Label {
  label: {
    id: string;
    name: string;
    color: string;
  };
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  assignee: { name: string } | null;
  labels: Label[];
  created_at: string;
  agent_status?: string;
  plan_status?: string;
  blocked_reason?: string | null;
  cost_usd?: number | null;
  run_outcome?: string | null;
  outcome_summary?: string | null;
}

interface IssueCardProps {
  issue: Issue;
  statusColor?: string;
  onDragStart?: (e: React.DragEvent, issue: Issue) => void;
}

// Agent status badge config
const agentBadgeConfig: Record<
  string,
  { label: string; color: string; bgColor: string; pulse?: boolean }
> = {
  investigating: {
    label: "Investigating",
    color: "#a78bfa",
    bgColor: "#a78bfa20",
    pulse: true,
  },
  implementing: {
    label: "Implementing",
    color: "#22d3d3",
    bgColor: "#22d3d320",
    pulse: true,
  },
  blocked: {
    label: "Blocked",
    color: "#f87171",
    bgColor: "#f8717120",
  },
  awaiting_review: {
    label: "Awaiting Review",
    color: "#facc15",
    bgColor: "#facc1520",
  },
};

// Run outcome badge config (only non-completed outcomes shown on cards)
const outcomeBadgeConfig: Record<string, { label: string; color: string }> = {
  no_changes_needed: { label: "No Changes", color: "#60a5fa" },
  blocked: { label: "Blocked", color: "#f87171" },
  needs_human_decision: { label: "Needs Decision", color: "#facc15" },
  investigation_complete: { label: "Investigated", color: "#a78bfa" },
  failed: { label: "Failed", color: "#f87171" },
};

// Linear-style priority indicator (stacked bars)
function PriorityIndicator({ priority }: { priority: string }) {
  const priorityLevel = parseInt(priority.slice(1));
  const colors: Record<string, string> = {
    P1: "#f87171",
    P2: "#fb923c",
    P3: "#60a5fa",
    P4: "#4b5563",
  };
  const color = colors[priority] || colors.P3;

  return (
    <div
      className="flex items-end gap-[2px] h-3"
      title={getPriorityLabel(priority)}
    >
      {[4, 3, 2, 1].map((level) => (
        <div
          key={level}
          className="w-[3px] rounded-[1px] transition-colors"
          style={{
            height: `${3 + (5 - level) * 2}px`,
            backgroundColor: priorityLevel <= level ? color : "#333",
          }}
        />
      ))}
    </div>
  );
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    P1: "Urgent",
    P2: "High",
    P3: "Normal",
    P4: "Low",
  };
  return labels[priority] || "Normal";
}

// Generate consistent color from string (for avatars)
function stringToColor(str: string): string {
  const colors = [
    "#f87171",
    "#fb923c",
    "#facc15",
    "#4ade80",
    "#22d3d3",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
    "#94a3b8",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function IssueCard({
  issue,
  statusColor,
  onDragStart,
}: IssueCardProps) {
  return (
    <Link href={`/issue/${issue.identifier}`}>
      <div
        className="kanban-card group"
        draggable
        onDragStart={(e) => onDragStart?.(e, issue)}
      >
        {/* Top row: Identifier + Priority */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-[#666] font-mono">
            {issue.identifier}
          </span>
          <PriorityIndicator priority={issue.priority} />
        </div>

        {/* Title */}
        <h3 className="text-[13px] font-medium text-[#f5f5f5] leading-snug mb-2 line-clamp-2">
          {issue.title}
        </h3>

        {/* Labels */}
        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {issue.labels.slice(0, 3).map((l) => (
              <span
                key={l.label.id}
                className="label-badge"
                style={{
                  backgroundColor: `${l.label.color}15`,
                  color: l.label.color,
                }}
              >
                {l.label.name}
              </span>
            ))}
            {issue.labels.length > 3 && (
              <span className="text-[11px] text-[#555]">
                +{issue.labels.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Agent status badge */}
        {issue.agent_status &&
          issue.agent_status !== "idle" &&
          agentBadgeConfig[issue.agent_status] && (
            <div className="flex items-center gap-1.5 mb-2">
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor:
                    agentBadgeConfig[issue.agent_status].bgColor,
                  color: agentBadgeConfig[issue.agent_status].color,
                }}
              >
                {agentBadgeConfig[issue.agent_status].pulse && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                      style={{
                        backgroundColor:
                          agentBadgeConfig[issue.agent_status].color,
                      }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-1.5 w-1.5"
                      style={{
                        backgroundColor:
                          agentBadgeConfig[issue.agent_status].color,
                      }}
                    />
                  </span>
                )}
                {agentBadgeConfig[issue.agent_status].label}
              </div>
            </div>
          )}

        {/* Cost badge */}
        {issue.cost_usd != null && Number(issue.cost_usd) > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "#22d3d310",
                color: "#22d3d3",
              }}
            >
              ${Number(issue.cost_usd) < 0.01 ? "<0.01" : Number(issue.cost_usd).toFixed(2)}
            </span>
          </div>
        )}

        {/* Run outcome badge (only show non-completed outcomes) */}
        {issue.run_outcome &&
          issue.run_outcome !== "completed" &&
          outcomeBadgeConfig[issue.run_outcome] && (
            <div className="flex items-center gap-1 mb-2">
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  color: outcomeBadgeConfig[issue.run_outcome].color,
                  backgroundColor: `${outcomeBadgeConfig[issue.run_outcome].color}15`,
                }}
                title={issue.outcome_summary || ""}
              >
                {outcomeBadgeConfig[issue.run_outcome].label}
              </span>
            </div>
          )}

        {/* Bottom row: Assignee */}
        {issue.assignee && (
          <div className="flex items-center gap-1.5 pt-1">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: stringToColor(issue.assignee.name) }}
            >
              {issue.assignee.name[0].toUpperCase()}
            </div>
            <span className="text-[11px] text-[#666] truncate">
              {issue.assignee.name}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
