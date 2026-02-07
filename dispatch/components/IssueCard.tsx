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
}

interface IssueCardProps {
  issue: Issue;
  statusColor?: string;
  onDragStart?: (e: React.DragEvent, issue: Issue) => void;
}

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
