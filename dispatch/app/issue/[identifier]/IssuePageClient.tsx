"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import TerminalViewer from "@/components/TerminalViewer";
import PRCard from "@/components/PRCard";
import IssueTimeline from "@/components/IssueTimeline";
import RetrySpawnDialog from "@/components/RetrySpawnDialog";

interface Status {
  id: string;
  name: string;
  color: string;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Comment {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
}

interface SimilarIssue {
  id: string;
  identifier: string;
  title: string;
  similarity: number;
  status_name: string;
  status_color: string;
}

interface AgentOutput {
  phase?: string;
  summary?: string;
  findings?: string[];
  recommendation?: string;
  pr_url?: string;
  error?: string;
}

interface LinkedPR {
  id: string;
  pr_number: number;
  pr_url: string;
  pr_title: string;
  pr_status: "open" | "merged" | "closed";
  branch_name: string | null;
  author: string | null;
  base_branch: string | null;
  ai_summary: string | null;
  match_confidence: number | null;
  created_at: string;
}

interface AgentActivity {
  id: string;
  timestamp: string;
  type:
    | "thought"
    | "action"
    | "observation"
    | "tool_call"
    | "file_read"
    | "file_write"
    | "search"
    | "complete"
    | "error"
    | "agent_heartbeat"
    | "agent_full_log";
  content: string;
  metadata?: {
    tool?: string;
    file?: string;
    tokens?: number;
    duration_ms?: number;
    run_url?: string;
    run_id?: string;
    workflow_type?: string;
    pr_url?: string;
  };
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  status: Status;
  assignee: { id: string; name: string } | null;
  labels: { label: Label }[];
  created_at: string;
  updated_at: string;
  // Agent fields
  agent_status:
    | "idle"
    | "investigating"
    | "implementing"
    | "blocked"
    | "awaiting_review";
  agent_output: AgentOutput | null;
  agent_confidence: number | null;
  agent_tokens_used: number | null;
  agent_started_at: string | null;
  agent_completed_at: string | null;
  // PRD workflow fields
  workflow_type?: string;
  plan_status?: string | null;
  plan_content?: string | null;
  plan_feedback?: string | null;
  plan_approved_at?: string | null;
  plan_approved_by?: string | null;
  blocked_reason?: string | null;
  spawn_type?: string | null;
  spawn_attempt_count?: number | null;
  spawn_run_id?: string | null;
  spawn_status?: string | null;
  // Cost tracking
  cost_usd?: number | null;
  model?: string | null;
  num_turns?: number | null;
  // Run outcome tracking
  run_outcome?: string | null;
  outcome_summary?: string | null;
}

// Generate consistent color from string
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

// Priority config
const priorityConfig: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  P1: { label: "Urgent", color: "#f87171", icon: "!" },
  P2: { label: "High", color: "#fb923c", icon: "!!" },
  P3: { label: "Normal", color: "#60a5fa", icon: "—" },
  P4: { label: "Low", color: "#6b7280", icon: "..." },
};

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
  blocked: { label: "Blocked", color: "#f87171", bgColor: "#f8717120" },
  awaiting_review: {
    label: "Awaiting Review",
    color: "#facc15",
    bgColor: "#facc1520",
  },
};

// Run outcome config
const outcomeConfig: Record<
  string,
  { label: string; color: string; shortLabel: string }
> = {
  completed: { label: "Completed", color: "#4ade80", shortLabel: "Completed" },
  no_changes_needed: {
    label: "No Changes Needed",
    color: "#60a5fa",
    shortLabel: "No Changes",
  },
  blocked: { label: "Blocked", color: "#f87171", shortLabel: "Blocked" },
  needs_human_decision: {
    label: "Needs Decision",
    color: "#facc15",
    shortLabel: "Needs Decision",
  },
  investigation_complete: {
    label: "Investigation Done",
    color: "#a78bfa",
    shortLabel: "Investigated",
  },
  failed: { label: "Failed", color: "#f87171", shortLabel: "Failed" },
};

function OutcomeIcon({
  outcome,
  className = "w-4 h-4",
}: {
  outcome: string;
  className?: string;
}) {
  const color = outcomeConfig[outcome]?.color || "#6b7280";
  switch (outcome) {
    case "completed":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path
            d="M5 8l2 2 4-4"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "no_changes_needed":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path
            d="M8 5v4"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.5" r="0.75" fill={color} />
        </svg>
      );
    case "blocked":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" fill={color} />
        </svg>
      );
    case "needs_human_decision":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path
            d="M6.5 6a1.5 1.5 0 0 1 3 0c0 1-1.5 1-1.5 2.5"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.5" r="0.75" fill={color} />
        </svg>
      );
    case "investigation_complete":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.5" />
          <path
            d="M10.5 10.5L14 14"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "failed":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <path
            d="M5.5 5.5l5 5M10.5 5.5l-5 5"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

// Agent activity type config
const activityTypeConfig: Record<
  string,
  { icon: string; color: string; bgColor: string; label: string }
> = {
  thought: {
    icon: "💭",
    color: "#a78bfa",
    bgColor: "#a78bfa15",
    label: "Thinking",
  },
  action: {
    icon: "⚡",
    color: "#22d3d3",
    bgColor: "#22d3d315",
    label: "Action",
  },
  observation: {
    icon: "👁",
    color: "#60a5fa",
    bgColor: "#60a5fa15",
    label: "Observation",
  },
  tool_call: {
    icon: "🔧",
    color: "#fb923c",
    bgColor: "#fb923c15",
    label: "Tool",
  },
  file_read: {
    icon: "📄",
    color: "#94a3b8",
    bgColor: "#94a3b815",
    label: "Read",
  },
  file_write: {
    icon: "✏️",
    color: "#4ade80",
    bgColor: "#4ade8015",
    label: "Write",
  },
  search: {
    icon: "🔍",
    color: "#f472b6",
    bgColor: "#f472b615",
    label: "Search",
  },
  complete: {
    icon: "✅",
    color: "#4ade80",
    bgColor: "#4ade8015",
    label: "Complete",
  },
  error: { icon: "❌", color: "#f87171", bgColor: "#f8717115", label: "Error" },
  agent_heartbeat: {
    icon: "📡",
    color: "#6b7280",
    bgColor: "#6b728010",
    label: "Progress",
  },
  agent_full_log: {
    icon: "📋",
    color: "#8b5cf6",
    bgColor: "#8b5cf610",
    label: "Full Log",
  },
};

// Agent status icon component
function AgentStatusIcon({
  status,
  animate = false,
}: {
  status: string;
  animate?: boolean;
}) {
  const isActive = status === "investigating" || status === "implementing";

  return (
    <div className="relative">
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        {/* Robot head */}
        <rect
          x="3"
          y="4"
          width="10"
          height="8"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        {/* Eyes */}
        <circle cx="6" cy="8" r="1" fill="currentColor" />
        <circle cx="10" cy="8" r="1" fill="currentColor" />
        {/* Antenna */}
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

// Status icon component
function StatusIcon({ status }: { status: string }) {
  const name = status.toLowerCase();

  if (name === "backlog") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle
          cx="7"
          cy="7"
          r="6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }
  if (name === "triage") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle
          cx="7"
          cy="7"
          r="6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
      </svg>
    );
  }
  if (name === "todo") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (name === "in progress") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 1 A6 6 0 0 1 7 13" fill="currentColor" />
      </svg>
    );
  }
  if (name === "in review") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 1 A6 6 0 1 1 1 7" fill="currentColor" />
      </svg>
    );
  }
  if (name === "done") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle
          cx="7"
          cy="7"
          r="6"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M4 7l2 2 4-4"
          stroke="#0d0d0d"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "canceled") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 7h6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Agent activity item component with entrance animation
function AgentActivityItem({
  activity,
  isLatest,
}: {
  activity: AgentActivity;
  isLatest: boolean;
}) {
  const config = activityTypeConfig[activity.type] || activityTypeConfig.action;

  return (
    <div
      className={`flex gap-3 p-2.5 rounded-lg transition-all duration-300 relative ${isLatest ? "animate-slide-in" : ""}`}
      style={{ backgroundColor: isLatest ? config.bgColor : "transparent" }}
    >
      {/* Icon with pulse effect for latest */}
      <div className="relative flex-shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ backgroundColor: config.bgColor }}
        >
          {config.icon}
        </div>
        {isLatest && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: config.color }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: config.color }}
            />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-[11px] font-medium"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
          <span className="text-[10px] text-[#404040]">
            {formatActivityTime(activity.timestamp)}
          </span>
          {activity.metadata?.duration_ms && (
            <span className="text-[10px] text-[#303030]">
              {activity.metadata.duration_ms}ms
            </span>
          )}
        </div>
        {activity.type === "agent_heartbeat" ? (
          <pre className="text-[11px] text-[#808080] leading-relaxed font-mono bg-[#0a0a0a] rounded p-2 mt-1 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
            {activity.content}
          </pre>
        ) : activity.type === "agent_full_log" ? (
          <details className="mt-1">
            <summary className="text-[11px] text-[#8b5cf6] cursor-pointer hover:text-[#a78bfa]">
              View full agent log ({Math.round((activity.content?.length || 0) / 1024)}KB)
            </summary>
            <pre className="text-[11px] text-[#808080] leading-relaxed font-mono bg-[#0a0a0a] rounded p-2 mt-1 overflow-x-auto max-h-[600px] overflow-y-auto whitespace-pre-wrap">
              {activity.content}
            </pre>
          </details>
        ) : (
          <p className="text-[12px] text-[#909090] leading-relaxed">
            {activity.content}
          </p>
        )}
        {activity.metadata?.file && (
          <code className="text-[10px] text-[#606060] bg-[#1a1a1a] px-1.5 py-0.5 rounded mt-1 inline-block font-mono">
            {activity.metadata.file}
          </code>
        )}
        {activity.metadata?.tool && (
          <span className="text-[10px] text-[#505050] ml-2">
            using {activity.metadata.tool}
          </span>
        )}
        {(activity.metadata?.run_url || activity.metadata?.pr_url) && (
          <div className="flex gap-3 mt-1.5">
            {activity.metadata.run_url && (
              <a
                href={activity.metadata.run_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#5e6ad2] hover:text-[#7c8aff] transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                View Logs
              </a>
            )}
            {activity.metadata.pr_url && (
              <a
                href={activity.metadata.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#22d3d3] hover:text-[#2dd4bf] transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                </svg>
                View PR
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Typing indicator for when agent is processing
function AgentThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 p-2.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#a78bfa15]">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-bounce" />
        </div>
      </div>
      <span className="text-[12px] text-[#606060] italic">
        Agent is thinking...
      </span>
    </div>
  );
}

// Format activity timestamp
function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 5) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function IssuePageClient() {
  const router = useRouter();
  const params = useParams();
  const identifier = params.identifier as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");

  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Similar issues
  const [similarIssues, setSimilarIssues] = useState<SimilarIssue[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Linked PRs
  const [linkedPRs, setLinkedPRs] = useState<LinkedPR[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);

  // Agent activity tracking
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [showActivityFeed, setShowActivityFeed] = useState(true);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // Live terminal output from CI
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  // Plan review
  const [planRejectFeedback, setPlanRejectFeedback] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [spawnLoading, setSpawnLoading] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [autoSpawnOnApprove, setAutoSpawnOnApprove] = useState(true);

  // Dropdown states
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);

  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(e.target as Node)
      ) {
        setShowStatusDropdown(false);
      }
      if (
        priorityDropdownRef.current &&
        !priorityDropdownRef.current.contains(e.target as Node)
      ) {
        setShowPriorityDropdown(false);
      }
      if (
        labelDropdownRef.current &&
        !labelDropdownRef.current.contains(e.target as Node)
      ) {
        setShowLabelDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchIssue = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${identifier}`);
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Issue not found");
          return;
        }
        throw new Error("Failed to fetch issue");
      }
      const data = await res.json();
      setIssue(data);
      setTitleValue(data.title);
      setDescriptionValue(data.description || "");
    } catch (err) {
      setError("Failed to load issue");
    }
  }, [identifier, router]);

  const fetchComments = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/comments?issueId=${issue.id}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  }, [issue]);

  const fetchMetadata = useCallback(async () => {
    try {
      const [statusesRes, labelsRes] = await Promise.all([
        fetch("/api/statuses"),
        fetch("/api/labels"),
      ]);
      if (statusesRes.ok && labelsRes.ok) {
        setStatuses(await statusesRes.json());
        setLabels(await labelsRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch metadata:", err);
    }
  }, []);

  const fetchSimilarIssues = useCallback(async () => {
    if (!issue) return;
    setLoadingSimilar(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/similar?limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSimilarIssues(data);
      }
    } catch (err) {
      console.error("Failed to fetch similar issues:", err);
    } finally {
      setLoadingSimilar(false);
    }
  }, [issue]);

  const fetchAgentActivity = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/activity`);
      if (res.ok) {
        const data = await res.json();
        setAgentActivities(data);
        // Auto-scroll to latest activity
        if (activityFeedRef.current && data.length > 0) {
          activityFeedRef.current.scrollTop =
            activityFeedRef.current.scrollHeight;
        }
      }
    } catch (err) {
      console.error("Failed to fetch agent activity:", err);
    }
  }, [issue]);

  const fetchLinkedPRs = useCallback(async () => {
    if (!issue) return;
    setLoadingPRs(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/pr`);
      if (res.ok) {
        const data = await res.json();
        setLinkedPRs(data);
      }
    } catch (err) {
      console.error("Failed to fetch linked PRs:", err);
    } finally {
      setLoadingPRs(false);
    }
  }, [issue]);

  useEffect(() => {
    Promise.all([fetchIssue(), fetchMetadata()]).finally(() =>
      setLoading(false)
    );
  }, [fetchIssue, fetchMetadata]);

  useEffect(() => {
    if (issue) {
      fetchComments();
      fetchSimilarIssues();
      fetchAgentActivity();
      fetchLinkedPRs();
    }
  }, [
    issue,
    fetchComments,
    fetchSimilarIssues,
    fetchAgentActivity,
    fetchLinkedPRs,
  ]);

  // SSE connection for real-time activity streaming
  useEffect(() => {
    if (!issue?.id) return;

    const isAgentActive =
      issue.agent_status === "investigating" ||
      issue.agent_status === "implementing";

    // Only connect SSE when agent is active
    if (!isAgentActive) {
      return;
    }

    // Create EventSource for SSE
    const eventSource = new EventSource(
      `/api/issues/${issue.id}/activity/stream`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "activity") {
          // New activity received - add to list
          setAgentActivities((prev) => {
            // Avoid duplicates
            if (prev.some((a) => a.id === data.data.id)) return prev;
            const updated = [...prev, data.data];
            // Auto-scroll
            if (activityFeedRef.current) {
              setTimeout(() => {
                activityFeedRef.current?.scrollTo({
                  top: activityFeedRef.current.scrollHeight,
                  behavior: "smooth",
                });
              }, 100);
            }
            return updated;
          });
        } else if (data.type === "terminal_output") {
          // Live terminal output from CI - feed to TerminalViewer
          setTerminalLines((prev) => [...prev, data.data.content]);
        } else if (data.type === "status_update") {
          // Agent status changed - refresh issue
          fetchIssue();
        } else if (data.type === "heartbeat") {
          // Keep-alive, ignore
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      // Connection error - will auto-reconnect
      console.log("SSE connection lost, will reconnect...");
    };

    // Also poll issue data less frequently for status updates
    const issuePolling = setInterval(() => {
      fetchIssue();
    }, 5000);

    return () => {
      eventSource.close();
      clearInterval(issuePolling);
    };
  }, [issue?.id, issue?.agent_status, fetchIssue]);

  async function updateIssue(updates: Record<string, unknown>) {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.identifier}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchIssue();
      }
    } catch (err) {
      console.error("Failed to update issue:", err);
    }
  }

  async function handleSaveTitle() {
    if (titleValue.trim() && titleValue !== issue?.title) {
      await updateIssue({ title: titleValue.trim() });
    }
    setEditingTitle(false);
  }

  async function handleSaveDescription() {
    if (descriptionValue !== issue?.description) {
      await updateIssue({ description: descriptionValue });
    }
    setEditingDescription(false);
  }

  async function handleAddComment() {
    if (!issue || !newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: issue.id,
          content: newComment.trim(),
          authorName: "User",
        }),
      });
      if (res.ok) {
        setNewComment("");
        await fetchComments();
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteIssue() {
    if (!issue) return;
    if (!confirm("Are you sure you want to delete this issue?")) return;

    try {
      const res = await fetch(`/api/issues/${issue.identifier}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/board");
      }
    } catch (err) {
      console.error("Failed to delete issue:", err);
    }
  }

  async function handlePlanApprove() {
    if (!issue) return;
    setPlanActionLoading(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", auto_spawn: autoSpawnOnApprove }),
      });
      if (res.ok) {
        await fetchIssue();
      }
    } catch (err) {
      console.error("Failed to approve plan:", err);
    } finally {
      setPlanActionLoading(false);
    }
  }

  async function handlePlanReject() {
    if (!issue || !planRejectFeedback.trim()) return;
    setPlanActionLoading(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          feedback: planRejectFeedback.trim(),
        }),
      });
      if (res.ok) {
        setPlanRejectFeedback("");
        setShowRejectForm(false);
        await fetchIssue();
      }
    } catch (err) {
      console.error("Failed to reject plan:", err);
    } finally {
      setPlanActionLoading(false);
    }
  }

  async function handleSpawn(type: "investigate" | "implement") {
    if (!issue) return;
    setSpawnLoading(true);
    setSpawnError(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        await fetchIssue();
      } else {
        const data = await res.json();
        const msg = data.reason || data.error || "Spawn failed";
        setSpawnError(msg);
      }
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSpawnLoading(false);
    }
  }

  async function handleCancel() {
    if (!issue) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/issues/${issue.id}/spawn/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchIssue();
      }
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleRetrySpawn(data: {
    type: "investigate" | "implement";
    additional_context?: string;
    force?: boolean;
  }) {
    if (!issue) return;
    setSpawnLoading(true);
    setSpawnError(null);
    try {
      const res = await fetch(`/api/issues/${issue.id}/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchIssue();
      } else {
        const respData = await res.json();
        const msg = respData.reason || respData.error || "Spawn failed";
        setSpawnError(msg);
        throw new Error(msg);
      }
    } finally {
      setSpawnLoading(false);
    }
  }

  function toggleLabel(labelId: string) {
    if (!issue) return;
    const isSelected = issue.labels.some((l) => l.label.id === labelId);
    const newLabelIds = isSelected
      ? issue.labels
          .filter((l) => l.label.id !== labelId)
          .map((l) => l.label.id)
      : [...issue.labels.map((l) => l.label.id), labelId];
    updateIssue({ labelIds: newLabelIds });
  }

  async function handleUnlinkPR(prId: string) {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/pr`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prId }),
      });
      if (res.ok) {
        await fetchLinkedPRs();
        // IssueTimeline fetches its own data, no need to refresh here
      }
    } catch (err) {
      console.error("Failed to unlink PR:", err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0d0d0d]">
        <div className="text-red-400 text-[14px]">
          {error || "Issue not found"}
        </div>
        <Link
          href="/board"
          className="text-[13px] text-[#5e6ad2] hover:text-[#6b74db]"
        >
          Back to board
        </Link>
      </div>
    );
  }

  const priority = priorityConfig[issue.priority] || priorityConfig.P3;

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* Header */}
      <header className="h-11 border-b border-[#1f1f1f] flex items-center px-3 md:px-4 bg-[#0d0d0d] sticky top-0 z-10">
        <div className="flex items-center gap-2 text-[13px]">
          <Link
            href="/board"
            className="flex items-center gap-1.5 text-[#808080] hover:text-[#e0e0e0] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <rect
                x="2"
                y="2"
                width="5"
                height="5"
                rx="1"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="9"
                y="2"
                width="5"
                height="5"
                rx="1"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="2"
                y="9"
                width="5"
                height="5"
                rx="1"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="9"
                y="9"
                width="5"
                height="5"
                rx="1"
                fill="currentColor"
                opacity="0.6"
              />
            </svg>
            <span>Chipp</span>
          </Link>
          <svg
            className="w-4 h-4 text-[#404040]"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[#e0e0e0] font-medium">{issue.identifier}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleDeleteIssue}
            className="p-1.5 text-[#606060] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            title="Delete issue"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Two-column layout - stacks on mobile */}
      <div className="flex flex-col md:flex-row">
        {/* Main content */}
        <div className="flex-1 max-w-3xl mx-auto px-4 py-6 md:px-8 md:py-8">
          {/* Title */}
          <div className="mb-6">
            {editingTitle ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") {
                    setTitleValue(issue.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full text-[18px] md:text-[22px] font-semibold bg-transparent text-[#f0f0f0] outline-none"
                autoFocus
              />
            ) : (
              <h1
                className="text-[18px] md:text-[22px] font-semibold text-[#f0f0f0] cursor-text hover:text-white transition-colors"
                onClick={() => setEditingTitle(true)}
              >
                {issue.title}
              </h1>
            )}
          </div>

          {/* Description */}
          <div className="mb-8">
            {editingDescription ? (
              <div className="relative">
                <textarea
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  placeholder="Add a description..."
                  rows={12}
                  className="w-full px-0 py-0 bg-transparent text-[14px] text-[#c0c0c0] outline-none resize-none leading-relaxed"
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveDescription}
                    className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#5e6ad2] hover:bg-[#6b74db] rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setDescriptionValue(issue.description || "");
                      setEditingDescription(false);
                    }}
                    className="px-3 py-1.5 text-[12px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="cursor-text min-h-[100px]"
                onClick={() => setEditingDescription(true)}
              >
                {issue.description ? (
                  <div
                    className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-3
                    prose-h1:text-[18px] prose-h2:text-[16px] prose-h3:text-[14px]
                    prose-p:text-[#a0a0a0] prose-p:text-[14px] prose-p:leading-relaxed prose-p:my-3
                    prose-strong:text-[#d0d0d0] prose-strong:font-semibold
                    prose-em:text-[#b0b0b0]
                    prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px]
                    prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg
                    prose-ul:text-[#a0a0a0] prose-ul:my-3 prose-li:my-1
                    prose-ol:text-[#a0a0a0] prose-ol:my-3
                    prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                    prose-blockquote:border-l-[#333] prose-blockquote:text-[#808080] prose-blockquote:italic
                    prose-hr:border-[#252525]
                  "
                  >
                    <ReactMarkdown>{issue.description}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="text-[14px] text-[#505050] hover:text-[#707070] transition-colors">
                    Add a description...
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Blocked Indicator */}
          {issue.agent_status === "blocked" && issue.blocked_reason && (
            <div className="mb-8 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-4 h-4 text-red-400"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M8 1.5l6.5 11.25H1.5L8 1.5z"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 6v3"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
                <h3 className="text-[14px] font-semibold text-red-400">
                  Agent Blocked
                </h3>
              </div>
              <p className="text-[13px] text-red-300/80 leading-relaxed mb-3">
                {issue.blocked_reason}
              </p>
              <button
                onClick={() => handleSpawn("implement")}
                disabled={spawnLoading}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[12px] font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {spawnLoading ? (
                  <div className="w-3 h-3 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path
                      d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                    <path
                      d="M14 2v4h-4M2 14v-4h4"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                Unblock & Re-run
              </button>
              {spawnError && (
                <p className="text-[12px] text-red-400/80 mt-2">{spawnError}</p>
              )}
            </div>
          )}

          {/* Spawn error for non-blocked contexts */}
          {spawnError && issue.agent_status !== "blocked" && (
            <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-[12px] text-red-400">{spawnError}</p>
            </div>
          )}

          {/* Plan Review Section */}
          {issue.plan_content &&
            (issue.plan_status === "awaiting_review" ||
              issue.plan_status === "approved" ||
              issue.plan_status === "needs_revision") && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[#5e6ad2]"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <rect
                        x="2"
                        y="2"
                        width="12"
                        height="12"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.25"
                      />
                      <path
                        d="M5 6h6M5 8h6M5 10h4"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                      />
                    </svg>
                    <h3 className="text-[14px] font-semibold text-[#e0e0e0]">
                      Implementation Plan
                    </h3>
                    {issue.plan_status === "awaiting_review" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#facc15]/15 text-[#facc15] uppercase tracking-wide">
                        Awaiting Review
                      </span>
                    )}
                    {issue.plan_status === "approved" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#4ade80]/15 text-[#4ade80] uppercase tracking-wide">
                        Approved
                      </span>
                    )}
                    {issue.plan_status === "needs_revision" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#fb923c]/15 text-[#fb923c] uppercase tracking-wide">
                        Needs Revision
                      </span>
                    )}
                  </div>
                </div>

                {/* Plan content rendered as markdown */}
                <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-5 mb-4 max-h-[600px] overflow-y-auto">
                  <div
                    className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                    prose-h2:text-[15px] prose-h3:text-[13px]
                    prose-p:text-[#a0a0a0] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-2
                    prose-strong:text-[#d0d0d0]
                    prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px]
                    prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg
                    prose-ul:text-[#a0a0a0] prose-ul:my-2 prose-li:my-0.5 prose-li:text-[13px]
                    prose-ol:text-[#a0a0a0] prose-ol:my-2
                    prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                  "
                  >
                    <ReactMarkdown>{issue.plan_content}</ReactMarkdown>
                  </div>
                </div>

                {/* Previous feedback if needs revision */}
                {issue.plan_status === "needs_revision" &&
                  issue.plan_feedback && (
                    <div className="mb-4 p-3 bg-[#fb923c]/5 border border-[#fb923c]/20 rounded-lg">
                      <div className="text-[11px] font-medium text-[#fb923c] mb-1">
                        Revision Feedback
                      </div>
                      <p className="text-[13px] text-[#fb923c]/80 leading-relaxed">
                        {issue.plan_feedback}
                      </p>
                    </div>
                  )}

                {/* Approval / rejection controls */}
                {issue.plan_status === "awaiting_review" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePlanApprove}
                      disabled={planActionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 border border-[#4ade80]/30 text-[#4ade80] text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {planActionLoading ? (
                        <div className="w-3.5 h-3.5 border border-[#4ade80]/40 border-t-[#4ade80] rounded-full animate-spin" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 8l3.5 3.5L13 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      Approve Plan
                    </button>
                    <label className="flex items-center gap-1.5 px-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSpawnOnApprove}
                        onChange={(e) =>
                          setAutoSpawnOnApprove(e.target.checked)
                        }
                        className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="text-[11px] text-[#666]">
                        Auto-implement
                      </span>
                    </label>
                    <button
                      onClick={() => setShowRejectForm(!showRejectForm)}
                      disabled={planActionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-[#303030] text-[#808080] hover:text-[#e0e0e0] text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M12 4l-8 8M4 4l8 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      Request Changes
                    </button>
                  </div>
                )}

                {/* Reject feedback form */}
                {showRejectForm && issue.plan_status === "awaiting_review" && (
                  <div className="mt-3 p-3 bg-[#141414] border border-[#252525] rounded-lg">
                    <textarea
                      value={planRejectFeedback}
                      onChange={(e) => setPlanRejectFeedback(e.target.value)}
                      placeholder="Describe what changes are needed..."
                      rows={3}
                      className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#252525] rounded-md text-[13px] text-[#e0e0e0] placeholder-[#505050] outline-none focus:border-[#404040] resize-none transition-colors mb-2"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handlePlanReject}
                        disabled={
                          planActionLoading || !planRejectFeedback.trim()
                        }
                        className="px-3 py-1.5 bg-[#fb923c]/10 hover:bg-[#fb923c]/20 border border-[#fb923c]/30 text-[#fb923c] text-[12px] font-medium rounded-md transition-colors disabled:opacity-50"
                      >
                        Submit Feedback
                      </button>
                      <button
                        onClick={() => {
                          setShowRejectForm(false);
                          setPlanRejectFeedback("");
                        }}
                        className="px-3 py-1.5 text-[12px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Re-investigate button for needs_revision */}
                {issue.plan_status === "needs_revision" && (
                  <button
                    onClick={() => handleSpawn("investigate")}
                    disabled={spawnLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[13px] font-medium rounded-lg transition-all shadow-lg shadow-[#5e6ad2]/20 disabled:opacity-50"
                  >
                    {spawnLoading ? (
                      <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                        />
                        <path
                          d="M14 2v4h-4M2 14v-4h4"
                          stroke="currentColor"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    Re-investigate with Feedback
                  </button>
                )}

                {/* Spawn implementation for approved plans */}
                {issue.plan_status === "approved" &&
                  issue.agent_status !== "implementing" && (
                    <button
                      onClick={() => handleSpawn("implement")}
                      disabled={spawnLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#22d3d3] to-[#5e6ad2] hover:from-[#2dd4bf] hover:to-[#6b74db] text-white text-[13px] font-medium rounded-lg transition-all shadow-lg shadow-[#22d3d3]/20 disabled:opacity-50"
                    >
                      {spawnLoading ? (
                        <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M8 3v10M3 8h10"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                      Start Implementation
                    </button>
                  )}
              </div>
            )}

          {/* Similar Issues Section */}
          {(similarIssues.length > 0 || loadingSimilar) && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <svg
                  className="w-4 h-4 text-[#a78bfa]"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <circle
                    cx="6"
                    cy="6"
                    r="4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <h3 className="text-[13px] font-medium text-[#e0e0e0]">
                  Similar Issues
                </h3>
                <span className="text-[11px] text-[#505050]">
                  {!loadingSimilar && `${similarIssues.length} found`}
                </span>
              </div>

              {loadingSimilar ? (
                <div className="flex items-center gap-2 text-[12px] text-[#505050]">
                  <div className="w-3 h-3 border border-[#404040] border-t-[#a78bfa] rounded-full animate-spin" />
                  Finding similar issues...
                </div>
              ) : (
                <div className="space-y-2">
                  {similarIssues.map((similar) => (
                    <Link
                      key={similar.id}
                      href={`/issue/${similar.identifier}`}
                      className="group flex items-center gap-3 p-2.5 -mx-2.5 rounded-lg hover:bg-[#141414] transition-colors"
                    >
                      {/* Status indicator */}
                      <span style={{ color: similar.status_color }}>
                        <StatusIcon status={similar.status_name} />
                      </span>

                      {/* Issue identifier and title */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#606060] font-mono">
                            {similar.identifier}
                          </span>
                          <span className="text-[13px] text-[#c0c0c0] group-hover:text-[#e0e0e0] truncate transition-colors">
                            {similar.title}
                          </span>
                        </div>
                      </div>

                      {/* Similarity score */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#5e6ad2] to-[#a78bfa]"
                            style={{
                              width: `${Math.round(similar.similarity * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-[#606060] tabular-nums w-8">
                          {Math.round(similar.similarity * 100)}%
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Terminal Output - Real-time stream (SSE from CI + WebSocket local) */}
          <TerminalViewer
            issueIdentifier={issue.identifier}
            isAgentActive={
              issue.agent_status === "investigating" ||
              issue.agent_status === "implementing"
            }
            sseLines={terminalLines}
          />

          {/* Agent Activity Feed - Real-time */}
          {(agentActivities.length > 0 ||
            issue.agent_status === "investigating" ||
            issue.agent_status === "implementing") && (
            <div className="mb-8">
              {/* Header with collapse toggle */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <svg
                      className="w-4 h-4 text-[#22d3d3]"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
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
                    {(issue.agent_status === "investigating" ||
                      issue.agent_status === "implementing") && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22d3d3] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22d3d3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="text-[13px] font-medium text-[#e0e0e0]">
                    Agent Activity
                  </h3>
                  {(issue.agent_status === "investigating" ||
                    issue.agent_status === "implementing") && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#22d3d320] text-[#22d3d3] uppercase font-medium tracking-wide animate-pulse">
                      Live
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowActivityFeed(!showActivityFeed)}
                  className="p-1 text-[#505050] hover:text-[#808080] transition-colors"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showActivityFeed ? "" : "-rotate-90"}`}
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
              </div>

              {/* Activity timeline */}
              {showActivityFeed && (
                <div
                  ref={activityFeedRef}
                  className="relative max-h-[400px] overflow-y-auto rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] p-3"
                >
                  {/* Timeline line */}
                  {agentActivities.length > 0 && (
                    <div className="absolute left-[26px] top-0 bottom-0 w-px bg-gradient-to-b from-[#22d3d3] via-[#a78bfa] to-[#1f1f1f]" />
                  )}

                  {/* Activity items */}
                  <div className="relative space-y-1">
                    {agentActivities.map((activity, index) => (
                      <AgentActivityItem
                        key={activity.id}
                        activity={activity}
                        isLatest={index === agentActivities.length - 1}
                      />
                    ))}

                    {/* Thinking indicator when agent is active but no recent activity */}
                    {(issue.agent_status === "investigating" ||
                      issue.agent_status === "implementing") && (
                      <AgentThinkingIndicator />
                    )}
                  </div>

                  {/* Empty state */}
                  {agentActivities.length === 0 &&
                    issue.agent_status === "idle" && (
                      <div className="text-center py-8 text-[#505050] text-[12px]">
                        No agent activity yet. Click &quot;Assign to Agent&quot;
                        to start.
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Activity Section */}
          <div className="border-t border-[#1f1f1f] pt-6">
            <h3 className="text-[13px] font-medium text-[#e0e0e0] mb-4">
              Activity
            </h3>

            {/* Comments */}
            <div className="space-y-4 mb-6">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0"
                    style={{
                      backgroundColor: stringToColor(comment.author_name),
                    }}
                  >
                    {comment.author_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-medium text-[#e0e0e0]">
                        {comment.author_name}
                      </span>
                      <span className="text-[11px] text-[#505050]">
                        {formatRelativeTime(comment.created_at)}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#909090] leading-relaxed">
                      {comment.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#252525] flex items-center justify-center text-[10px] text-[#606060] flex-shrink-0">
                U
              </div>
              <div className="flex-1 relative">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Leave a comment..."
                  rows={1}
                  className="w-full px-3 py-2 bg-[#141414] border border-[#252525] rounded-lg text-[13px] text-[#e0e0e0] placeholder-[#505050] outline-none focus:border-[#404040] resize-none transition-colors"
                />
                {newComment.trim() && (
                  <button
                    onClick={handleAddComment}
                    disabled={submittingComment}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#5e6ad2] hover:text-[#7b83dc] disabled:opacity-50 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Properties sidebar - stacks below on mobile */}
        <div className="w-full md:w-[260px] border-t md:border-t-0 md:border-l border-[#1f1f1f] p-4 bg-[#0a0a0a]">
          <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-3">
            Properties
          </div>

          {/* Status */}
          <div className="mb-4" ref={statusDropdownRef}>
            <div className="text-[11px] text-[#505050] mb-1.5">Status</div>
            <div className="relative">
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors text-left"
              >
                <span style={{ color: issue.status.color }}>
                  <StatusIcon status={issue.status.name} />
                </span>
                <span className="text-[13px] text-[#e0e0e0]">
                  {issue.status.name}
                </span>
              </button>

              {showStatusDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#303030] rounded-lg shadow-xl py-1 z-20">
                  {statuses.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        updateIssue({ statusId: s.id });
                        setShowStatusDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#252525] transition-colors ${
                        s.id === issue.status_id ? "bg-[#252525]" : ""
                      }`}
                    >
                      <span style={{ color: s.color }}>
                        <StatusIcon status={s.name} />
                      </span>
                      <span className="text-[13px] text-[#e0e0e0]">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="mb-4" ref={priorityDropdownRef}>
            <div className="text-[11px] text-[#505050] mb-1.5">Priority</div>
            <div className="relative">
              <button
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors text-left"
              >
                <span
                  className="w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded"
                  style={{
                    backgroundColor: `${priority.color}20`,
                    color: priority.color,
                  }}
                >
                  {priority.icon}
                </span>
                <span className="text-[13px] text-[#e0e0e0]">
                  {priority.label}
                </span>
              </button>

              {showPriorityDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#303030] rounded-lg shadow-xl py-1 z-20">
                  {Object.entries(priorityConfig).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => {
                        updateIssue({ priority: key });
                        setShowPriorityDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#252525] transition-colors ${
                        key === issue.priority ? "bg-[#252525]" : ""
                      }`}
                    >
                      <span
                        className="w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded"
                        style={{
                          backgroundColor: `${p.color}20`,
                          color: p.color,
                        }}
                      >
                        {p.icon}
                      </span>
                      <span className="text-[13px] text-[#e0e0e0]">
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Assignee */}
          <div className="mb-4">
            <div className="text-[11px] text-[#505050] mb-1.5">Assignee</div>
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors text-left">
              {issue.assignee ? (
                <>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
                    style={{
                      backgroundColor: stringToColor(issue.assignee.name),
                    }}
                  >
                    {issue.assignee.name[0].toUpperCase()}
                  </div>
                  <span className="text-[13px] text-[#e0e0e0]">
                    {issue.assignee.name}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-full bg-[#252525] flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-[#505050]"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2z" />
                    </svg>
                  </div>
                  <span className="text-[13px] text-[#505050]">Assign</span>
                </>
              )}
            </button>
          </div>

          {/* Labels */}
          <div className="mb-4" ref={labelDropdownRef}>
            <div className="text-[11px] text-[#505050] mb-1.5">Labels</div>
            <div className="relative">
              {issue.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1 mb-2">
                  {issue.labels.map((l) => (
                    <span
                      key={l.label.id}
                      className="px-2 py-0.5 text-[11px] rounded-full"
                      style={{
                        backgroundColor: `${l.label.color}20`,
                        color: l.label.color,
                      }}
                    >
                      {l.label.name}
                    </span>
                  ))}
                </div>
              ) : null}

              <button
                onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors text-[13px] text-[#505050] hover:text-[#808080]"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <path
                    d="M8 5v6M5 8h6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Add label
              </button>

              {showLabelDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#303030] rounded-lg shadow-xl py-1 z-20 max-h-[240px] overflow-y-auto">
                  {labels.map((label) => {
                    const isSelected = issue.labels.some(
                      (l) => l.label.id === label.id
                    );
                    return (
                      <button
                        key={label.id}
                        onClick={() => toggleLabel(label.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#252525] transition-colors ${
                          isSelected ? "bg-[#252525]" : ""
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="text-[13px] text-[#e0e0e0] flex-1 text-left">
                          {label.name}
                        </span>
                        {isSelected && (
                          <svg
                            className="w-4 h-4 text-[#5e6ad2]"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                          >
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Linked PRs Section */}
          <div className="mb-4 pt-3 border-t border-[#1f1f1f]">
            <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"
                />
              </svg>
              Pull Requests
              {linkedPRs.length > 0 && (
                <span className="text-[10px] text-[#505050]">
                  ({linkedPRs.length})
                </span>
              )}
            </div>
            {loadingPRs ? (
              <div className="flex items-center gap-2 text-[11px] text-[#505050]">
                <div className="w-3 h-3 border border-[#404040] border-t-[#5e6ad2] rounded-full animate-spin" />
                Loading PRs...
              </div>
            ) : linkedPRs.length > 0 ? (
              <div className="space-y-2">
                {linkedPRs.map((pr) => (
                  <PRCard key={pr.id} pr={pr} onUnlink={handleUnlinkPR} />
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-[#404040] italic">
                No linked pull requests
              </div>
            )}
          </div>

          {/* Issue Timeline Section */}
          <IssueTimeline issueId={issue.id} />

          {/* Agent Section */}
          <div className="mb-4 pt-3 border-t border-[#1f1f1f]">
            <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-3">
              AI Agent
            </div>

            {/* Agent Status */}
            <div className="mb-3">
              <div className="text-[11px] text-[#505050] mb-1.5">Status</div>
              {(() => {
                const agentConfig =
                  agentStatusConfig[issue.agent_status] ||
                  agentStatusConfig.idle;
                const isActive =
                  issue.agent_status === "investigating" ||
                  issue.agent_status === "implementing";
                return (
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 rounded"
                    style={{ backgroundColor: agentConfig.bgColor }}
                  >
                    <span style={{ color: agentConfig.color }}>
                      <AgentStatusIcon
                        status={issue.agent_status}
                        animate={isActive}
                      />
                    </span>
                    <span
                      className="text-[13px]"
                      style={{ color: agentConfig.color }}
                    >
                      {agentConfig.label}
                    </span>
                    {isActive && issue.agent_started_at && (
                      <span className="text-[11px] text-[#505050] ml-auto">
                        {formatRelativeTime(issue.agent_started_at)}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Last Run Outcome */}
            {issue.run_outcome && (() => {
              const oc = outcomeConfig[issue.run_outcome] || outcomeConfig.failed;
              return (
                <div className="mb-3">
                  <div className="text-[11px] text-[#505050] mb-1.5">Last Run</div>
                  <div
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                    style={{
                      backgroundColor: `${oc.color}15`,
                      border: `1px solid ${oc.color}25`,
                    }}
                  >
                    <span style={{ color: oc.color }} className="flex-shrink-0">
                      <OutcomeIcon outcome={issue.run_outcome} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[12px] font-medium"
                        style={{ color: oc.color }}
                      >
                        {oc.label}
                      </div>
                      {issue.outcome_summary && (
                        <div className="text-[11px] text-[#888] mt-0.5 leading-relaxed">
                          {issue.outcome_summary}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* View Workflow Logs link */}
            {(issue.agent_status === "investigating" ||
              issue.agent_status === "implementing") &&
              issue.spawn_status === "running" && (
                <a
                  href={(() => {
                    // Find latest activity with a run_url
                    const activityWithUrl = [...agentActivities]
                      .reverse()
                      .find((a) => a.metadata?.run_url);
                    if (activityWithUrl?.metadata?.run_url)
                      return activityWithUrl.metadata.run_url;
                    // Fallback: link to workflow runs page
                    const workflow =
                      issue.spawn_type === "implement"
                        ? "prd-implement.yml"
                        : "prd-investigate.yml";
                    return `https://github.com/BenchmarkAI/chipp-deno/actions/workflows/${workflow}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[12px] rounded-lg transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  View Workflow Logs
                </a>
              )}

            {/* Spawn Investigation Button */}
            {issue.agent_status === "idle" && (
              <button
                onClick={() => handleSpawn("investigate")}
                disabled={spawnLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[13px] font-medium rounded-lg transition-all shadow-lg shadow-[#5e6ad2]/20 disabled:opacity-50"
              >
                {spawnLoading ? (
                  <div className="w-4 h-4 border border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <AgentStatusIcon status="investigating" />
                )}
                Investigate
              </button>
            )}

            {/* Spawn error in sidebar */}
            {spawnError && (
              <p className="text-[11px] text-red-400 mt-1 px-1">{spawnError}</p>
            )}

            {/* Cancel Agent Button */}
            {issue.spawn_status === "running" && (
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-red-900/30 hover:bg-red-950/20 hover:border-red-800/40 text-red-400/80 hover:text-red-400 text-[13px] rounded-lg transition-colors disabled:opacity-50"
              >
                {cancelLoading ? (
                  <div className="w-4 h-4 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <rect x="4" y="4" width="8" height="8" rx="1" />
                  </svg>
                )}
                {cancelLoading ? "Cancelling..." : "Cancel Agent"}
              </button>
            )}

            {/* Retry Button */}
            {issue.agent_status === "idle" &&
              (issue.run_outcome || (issue.spawn_attempt_count != null &&
              issue.spawn_attempt_count > 0)) && (
                <button
                  onClick={() => setShowRetryDialog(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[12px] rounded-lg transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Retry with Context
                </button>
              )}

            {/* Agent Confidence */}
            {issue.agent_confidence !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[#505050]">Confidence</span>
                  <span className="text-[#808080]">
                    {issue.agent_confidence}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${issue.agent_confidence}%`,
                      backgroundColor:
                        issue.agent_confidence >= 80
                          ? "#4ade80"
                          : issue.agent_confidence >= 50
                            ? "#facc15"
                            : "#f87171",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Token Usage */}
            {issue.agent_tokens_used !== null && (
              <div className="mt-2 text-[11px] text-[#505050]">
                <span className="text-[#606060]">
                  {issue.agent_tokens_used.toLocaleString()}
                </span>{" "}
                tokens used
              </div>
            )}

            {/* Cost Tracking */}
            {issue.cost_usd != null && issue.cost_usd > 0 && (
              <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
                <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-2">
                  Cost
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[18px] font-mono font-semibold text-[#22d3d3]">
                    ${issue.cost_usd < 0.01 ? "<0.01" : issue.cost_usd.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#505050]">
                  {issue.num_turns != null && issue.num_turns > 0 && (
                    <span>{issue.num_turns} turns</span>
                  )}
                  {issue.model && (
                    <span className="font-mono text-[10px] text-[#404040]">
                      {issue.model.replace("claude-", "").replace(/-/g, " ")}
                    </span>
                  )}
                </div>
                {issue.spawn_attempt_count != null && issue.spawn_attempt_count > 1 && (
                  <div className="mt-1 text-[10px] text-[#404040]">
                    across {issue.spawn_attempt_count} spawns
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Agent Output */}
          {issue.agent_output && (
            <div className="mb-4 pt-3 border-t border-[#1f1f1f]">
              <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-3">
                Agent Output
              </div>

              {issue.agent_output.phase && (
                <div className="text-[12px] text-[#a78bfa] mb-2">
                  Phase: {issue.agent_output.phase}
                </div>
              )}

              {issue.agent_output.summary && (
                <div className="text-[13px] text-[#a0a0a0] leading-relaxed mb-3">
                  {issue.agent_output.summary}
                </div>
              )}

              {issue.agent_output.findings &&
                issue.agent_output.findings.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[11px] text-[#505050] mb-1">
                      Findings
                    </div>
                    <ul className="space-y-1">
                      {issue.agent_output.findings.map((finding, i) => (
                        <li
                          key={i}
                          className="text-[12px] text-[#808080] flex items-start gap-1.5"
                        >
                          <span className="text-[#404040] mt-1">•</span>
                          {finding}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {issue.agent_output.recommendation && (
                <div className="p-2 bg-[#1a1a1a] border border-[#252525] rounded text-[12px] text-[#a0a0a0]">
                  <span className="text-[#606060]">Recommendation:</span>{" "}
                  {issue.agent_output.recommendation}
                </div>
              )}

              {issue.agent_output.pr_url && (
                <a
                  href={issue.agent_output.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#303030] hover:bg-[#252525] rounded-lg text-[13px] text-[#5e6ad2] hover:text-[#7b83dc] transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8z" />
                  </svg>
                  View Pull Request
                </a>
              )}

              {issue.agent_output.error && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[12px] text-red-400">
                  <span className="font-medium">Error:</span>{" "}
                  {issue.agent_output.error}
                </div>
              )}
            </div>
          )}

          {/* Created date */}
          <div className="mb-4">
            <div className="text-[11px] text-[#505050] mb-1.5">Created</div>
            <div className="text-[13px] text-[#808080] px-2">
              {new Date(issue.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Retry Spawn Dialog */}
      <RetrySpawnDialog
        isOpen={showRetryDialog}
        onClose={() => setShowRetryDialog(false)}
        onSubmit={handleRetrySpawn}
        issueIdentifier={issue.identifier}
        hasApprovedPlan={issue.plan_status === "approved"}
        lastOutcome={issue.run_outcome}
        outcomeSummary={issue.outcome_summary}
      />
    </div>
  );
}

// Helper function for relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

