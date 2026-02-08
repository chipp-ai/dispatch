"use client";

import { useState, useEffect } from "react";

interface HistoryEntry {
  id: string;
  issue_id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor_type: string;
  actor_name: string | null;
  created_at: string;
  formatted: string;
}

interface IssueTimelineProps {
  issueId: string;
}

// Icons for different action types
const actionIcons: Record<
  string,
  { icon: JSX.Element; color: string; bgColor: string }
> = {
  created: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm4.5 7.5h-4v-4a.5.5 0 00-1 0v4h-4a.5.5 0 000 1h4v4a.5.5 0 001 0v-4h4a.5.5 0 000-1z" />
      </svg>
    ),
    color: "#4ade80",
    bgColor: "#4ade8015",
  },
  status_changed: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.5 1.5A1.5 1.5 0 000 3v10a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0016 13V3a1.5 1.5 0 00-1.5-1.5h-13zm2 2h9a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" />
      </svg>
    ),
    color: "#60a5fa",
    bgColor: "#60a5fa15",
  },
  pr_linked: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"
        />
      </svg>
    ),
    color: "#a78bfa",
    bgColor: "#a78bfa15",
  },
  pr_unlinked: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    color: "#f87171",
    bgColor: "#f8717115",
  },
  pr_status_changed: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M5 3.254V3.25v.005a.75.75 0 110-.005v.004zm.45 1.9a2.25 2.25 0 10-1.95.218v5.256a2.25 2.25 0 101.5 0V7.123A5.735 5.735 0 009.25 9h1.378a2.251 2.251 0 100-1.5H9.25a4.25 4.25 0 01-3.8-2.346zM12.75 9a.75.75 0 100-1.5.75.75 0 000 1.5zm-8.5 4.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
        />
      </svg>
    ),
    color: "#a78bfa",
    bgColor: "#a78bfa15",
  },
  edited: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z" />
      </svg>
    ),
    color: "#fb923c",
    bgColor: "#fb923c15",
  },
  priority_changed: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 2v11h1V5.5l2.5 2.5L9 5.5v7.5h1V2H9L6.5 4.5 4 2H3z" />
      </svg>
    ),
    color: "#f87171",
    bgColor: "#f8717115",
  },
  assignee_changed: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z" />
      </svg>
    ),
    color: "#22d3d3",
    bgColor: "#22d3d315",
  },
  label_added: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 010 2.474l-5.026 5.026a1.75 1.75 0 01-2.474 0l-6.25-6.25A1.752 1.752 0 011 7.775zM5 5a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    ),
    color: "#facc15",
    bgColor: "#facc1515",
  },
  label_removed: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 010 2.474l-5.026 5.026a1.75 1.75 0 01-2.474 0l-6.25-6.25A1.752 1.752 0 011 7.775zM5 5a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    ),
    color: "#6b7280",
    bgColor: "#6b728015",
  },
  agent_started: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
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
    ),
    color: "#22d3d3",
    bgColor: "#22d3d315",
  },
  agent_completed: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
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
    ),
    color: "#4ade80",
    bgColor: "#4ade8015",
  },
  comment_added: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.457 1.457 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
      </svg>
    ),
    color: "#94a3b8",
    bgColor: "#94a3b815",
  },
  reconciled: {
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm1.5 4.5a.5.5 0 00-1 0v3.793l-2.146-2.147a.5.5 0 00-.708.708l3 3a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 8.293V4.5z"
        />
      </svg>
    ),
    color: "#5e6ad2",
    bgColor: "#5e6ad215",
  },
};

const defaultIcon = {
  icon: (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="3" />
    </svg>
  ),
  color: "#6b7280",
  bgColor: "#6b728015",
};

// Actor type icons
function ActorIcon({ actorType }: { actorType: string }) {
  switch (actorType) {
    case "github_webhook":
      return (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8z" />
        </svg>
      );
    case "reconciliation":
      return (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm1.5 4.5a.5.5 0 00-1 0v3.793l-2.146-2.147a.5.5 0 00-.708.708l3 3a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 8.293V4.5z"
          />
        </svg>
      );
    case "agent":
      return (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
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
        </svg>
      );
    case "system":
      return (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.068.727c.243-.97 1.62-.97 1.864 0l.071.286a.96.96 0 001.622.434l.205-.211c.695-.719 1.888-.03 1.613.931l-.084.303a.96.96 0 001.187 1.187l.303-.084c.961-.275 1.65.918.931 1.613l-.211.205a.96.96 0 00.434 1.622l.286.071c.97.243.97 1.62 0 1.864l-.286.071a.96.96 0 00-.434 1.622l.211.205c.719.695.03 1.888-.931 1.613l-.303-.084a.96.96 0 00-1.187 1.187l.084.303c.275.961-.918 1.65-1.613.931l-.205-.211a.96.96 0 00-1.622.434l-.071.286c-.243.97-1.62.97-1.864 0l-.071-.286a.96.96 0 00-1.622-.434l-.205.211c-.695.719-1.888.03-1.613-.931l.084-.303a.96.96 0 00-1.187-1.187l-.303.084c-.961.275-1.65-.918-.931-1.613l.211-.205a.96.96 0 00-.434-1.622l-.286-.071c-.97-.243-.97-1.62 0-1.864l.286-.071a.96.96 0 00.434-1.622l-.211-.205c-.719-.695-.03-1.888.931-1.613l.303.084a.96.96 0 001.187-1.187l-.084-.303c-.275-.961.918-1.65 1.613-.931l.205.211a.96.96 0 001.622-.434l.071-.286zM12.973 8.5H8.25l-2.834 3.779A4.998 4.998 0 0012.973 8.5zm0-1a4.998 4.998 0 00-7.557-3.779l2.834 3.78h4.723zM5.048 3.967c-.03.021-.058.043-.087.065l.087-.065zm-.431.355A4.995 4.995 0 003.002 8c0 1.455.622 2.765 1.615 3.678L7.375 8 4.617 4.322zm.344 7.646l.087.065-.087-.065z" />
        </svg>
      );
    default:
      return (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z" />
        </svg>
      );
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function IssueTimeline({ issueId }: IssueTimelineProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/issues/${issueId}/history`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (error) {
        console.error("Failed to fetch issue history:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [issueId]);

  if (loading) {
    return (
      <div className="py-4 flex items-center justify-center">
        <div className="w-4 h-4 border border-[#303030] border-t-[#5e6ad2] rounded-full animate-spin" />
      </div>
    );
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-[#1f1f1f] pt-4 mt-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        <svg
          className="w-4 h-4 text-[#5e6ad2]"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
        </svg>
        <span className="text-[13px] font-medium text-[#e0e0e0]">History</span>
        <span className="text-[11px] text-[#505050]">
          {history.length} events
        </span>
        <svg
          className={`w-4 h-4 text-[#505050] ml-auto transition-transform ${expanded ? "" : "-rotate-90"}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Timeline */}
      {expanded && (
        <div className="relative pl-5">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[#252525]" />

          {/* Events */}
          <div className="space-y-3">
            {history.map((entry) => {
              const iconConfig = actionIcons[entry.action] || defaultIcon;

              return (
                <div key={entry.id} className="relative flex gap-3">
                  {/* Icon */}
                  <div
                    className="absolute left-[-13px] w-5 h-5 rounded-full flex items-center justify-center z-10"
                    style={{ backgroundColor: iconConfig.bgColor }}
                  >
                    <span style={{ color: iconConfig.color }}>
                      {iconConfig.icon}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pl-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      {/* Actor icon */}
                      <span className="text-[#505050]">
                        <ActorIcon actorType={entry.actor_type} />
                      </span>
                      {/* Actor name */}
                      <span className="text-[11px] font-medium text-[#808080]">
                        {entry.actor_name || entry.actor_type}
                      </span>
                      {/* Timestamp */}
                      <span className="text-[10px] text-[#404040]">
                        {formatRelativeTime(entry.created_at)}
                      </span>
                    </div>
                    {/* Event description */}
                    <p className="text-[12px] text-[#909090]">
                      {entry.formatted}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
