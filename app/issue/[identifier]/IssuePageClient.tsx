"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import TerminalViewer from "@/components/TerminalViewer";
import PRCard from "@/components/PRCard";
import RetrySpawnDialog from "@/components/RetrySpawnDialog";

interface Status {
  id: string;
  name: string;
  color: string;
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
    | "agent_full_log"
    | "investigation_complete"
    | "implementation_complete"
    | "investigation_failed"
    | "implementation_failed"
    | "blocker_reported"
    | "qa_complete"
    | "qa_failed"
    | "research_complete"
    | "research_failed";
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
  labels: { label: { id: string; name: string; color: string } }[];
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

// Agent activity item component with entrance animation
function AgentActivityItem({
  activity,
  isLatest,
  isAgentActive,
}: {
  activity: AgentActivity;
  isLatest: boolean;
  isAgentActive: boolean;
}) {
  const config = activityTypeConfig[activity.type] || activityTypeConfig.action;

  return (
    <div
      className={`flex gap-3 p-2.5 rounded-lg transition-all duration-300 relative ${isLatest ? "animate-slide-in" : ""}`}
      style={{ backgroundColor: isLatest ? config.bgColor : "transparent" }}
    >
      {/* Icon with pulse effect for latest - only when agent is actively running */}
      <div className="relative flex-shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ backgroundColor: config.bgColor }}
        >
          {config.icon}
        </div>
        {isLatest && isAgentActive && (
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
        ) : activity.type === "investigation_complete" ||
          activity.type === "implementation_complete" ||
          activity.type === "blocker_reported" ? (
          <div
            className="mt-1 text-[12px] text-[#909090] leading-relaxed max-h-[400px] overflow-y-auto
              prose prose-invert prose-sm max-w-none
              prose-headings:text-[#c0c0c0] prose-headings:text-[13px] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
              prose-p:text-[#909090] prose-p:text-[12px] prose-p:my-1
              prose-strong:text-[#c0c0c0]
              prose-li:text-[#909090] prose-li:text-[12px] prose-li:my-0
              prose-ul:my-1 prose-ol:my-1
              prose-code:text-[#a78bfa] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
              prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-[#1f1f1f] prose-pre:rounded-md prose-pre:text-[11px]
              prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
            "
          >
            <ReactMarkdown>{activity.content || ""}</ReactMarkdown>
          </div>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");

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

  const fetchAgentActivity = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/activity`);
      if (res.ok) {
        const data = await res.json();
        setAgentActivities(data);
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
    fetchIssue().finally(() => setLoading(false));
  }, [fetchIssue]);

  useEffect(() => {
    if (issue) {
      fetchAgentActivity();
      fetchLinkedPRs();
    }
  }, [issue, fetchAgentActivity, fetchLinkedPRs]);

  // SSE connection for real-time activity streaming
  useEffect(() => {
    if (!issue?.id) return;

    const isAgentActive =
      issue.agent_status === "investigating" ||
      issue.agent_status === "implementing";

    if (!isAgentActive) return;

    const eventSource = new EventSource(
      `/api/issues/${issue.id}/activity/stream`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "activity") {
          setAgentActivities((prev) => {
            if (prev.some((a) => a.id === data.data.id)) return prev;
            const updated = [...prev, data.data];
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
          setTerminalLines((prev) => [...prev, data.data.content]);
        } else if (data.type === "status_update") {
          fetchIssue();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      console.log("SSE connection lost, will reconnect...");
    };

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

  async function handleDeleteIssue() {
    if (!issue) return;
    if (!confirm("Are you sure you want to delete this mission?")) return;

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

  const isAgentActive =
    issue.agent_status === "investigating" ||
    issue.agent_status === "implementing";
  const agentConfig =
    agentStatusConfig[issue.agent_status] || agentStatusConfig.idle;

  // Build workflow logs URL
  const workflowLogsUrl = (() => {
    const activityWithUrl = [...agentActivities]
      .reverse()
      .find((a) => a.metadata?.run_url);
    if (activityWithUrl?.metadata?.run_url)
      return activityWithUrl.metadata.run_url;
    const workflow =
      issue.spawn_type === "implement"
        ? "prd-implement.yml"
        : "prd-investigate.yml";
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || "";
    return repo ? `https://github.com/${repo}/actions/workflows/${workflow}` : null;
  })();

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
              <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
            </svg>
            <span>Dispatch</span>
          </Link>
          <svg className="w-4 h-4 text-[#404040]" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[#e0e0e0] font-medium">{issue.identifier}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-[#505050]">
            {new Date(issue.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <button
            onClick={handleDeleteIssue}
            className="p-1.5 text-[#606060] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            title="Delete mission"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Single-column content */}
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-8 md:py-8">
        {/* Title */}
        <div className="mb-4">
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
              className="cursor-text min-h-[60px]"
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

        {/* Agent Controls Bar */}
        <div className="mb-8 p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status badge */}
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
              style={{ backgroundColor: agentConfig.bgColor }}
            >
              <span style={{ color: agentConfig.color }}>
                <AgentStatusIcon status={issue.agent_status} animate={isAgentActive} />
              </span>
              <span className="text-[13px] font-medium" style={{ color: agentConfig.color }}>
                {agentConfig.label}
              </span>
              {isAgentActive && issue.agent_started_at && (
                <span className="text-[11px] text-[#505050]">
                  {formatRelativeTime(issue.agent_started_at)}
                </span>
              )}
            </div>

            {/* Last run outcome badge */}
            {issue.run_outcome && (() => {
              const oc = outcomeConfig[issue.run_outcome] || outcomeConfig.failed;
              return (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
                  style={{
                    backgroundColor: `${oc.color}15`,
                    border: `1px solid ${oc.color}25`,
                  }}
                >
                  <span style={{ color: oc.color }} className="flex-shrink-0">
                    <OutcomeIcon outcome={issue.run_outcome} />
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: oc.color }}>
                    {oc.shortLabel}
                  </span>
                </div>
              );
            })()}

            {/* Cost info */}
            {issue.cost_usd != null && Number(issue.cost_usd) > 0 && (
              <div className="flex items-center gap-2 text-[12px] text-[#505050]">
                <span className="font-mono text-[#22d3d3]">
                  ${Number(issue.cost_usd) < 0.01 ? "<0.01" : Number(issue.cost_usd).toFixed(2)}
                </span>
                {issue.num_turns != null && issue.num_turns > 0 && (
                  <span>{issue.num_turns} turns</span>
                )}
                {issue.model && (
                  <span className="font-mono text-[10px] text-[#404040]">
                    {issue.model.replace("claude-", "").replace(/-/g, " ")}
                  </span>
                )}
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons */}
            {issue.agent_status === "idle" && (
              <div className="flex items-center gap-2">
                {(issue.run_outcome || (issue.spawn_attempt_count != null && issue.spawn_attempt_count > 0)) && (
                  <button
                    onClick={() => setShowRetryDialog(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[12px] rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                  </button>
                )}
                <button
                  onClick={() => handleSpawn("investigate")}
                  disabled={spawnLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[13px] font-medium rounded-lg transition-all shadow-lg shadow-[#5e6ad2]/20 disabled:opacity-50"
                >
                  {spawnLoading ? (
                    <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <AgentStatusIcon status="investigating" />
                  )}
                  {issue.run_outcome || (issue.spawn_attempt_count != null && issue.spawn_attempt_count > 0)
                    ? "Reinvestigate"
                    : "Investigate"}
                </button>
              </div>
            )}

            {/* Cancel button when running */}
            {issue.spawn_status === "running" && (
              <div className="flex items-center gap-2">
                {workflowLogsUrl && (
                  <a
                    href={workflowLogsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[12px] rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    Logs
                  </a>
                )}
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-red-900/30 hover:bg-red-950/20 hover:border-red-800/40 text-red-400/80 hover:text-red-400 text-[12px] rounded-lg transition-colors disabled:opacity-50"
                >
                  {cancelLoading ? (
                    <div className="w-3.5 h-3.5 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="4" y="4" width="8" height="8" rx="1" />
                    </svg>
                  )}
                  {cancelLoading ? "Cancelling..." : "Cancel"}
                </button>
              </div>
            )}
          </div>

          {/* Spawn error */}
          {spawnError && (
            <p className="text-[12px] text-red-400 mt-2">{spawnError}</p>
          )}

          {/* Confidence bar */}
          {issue.agent_confidence !== null && (
            <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#505050]">Confidence</span>
                <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Number(issue.agent_confidence)}%`,
                      backgroundColor:
                        Number(issue.agent_confidence) >= 80
                          ? "#4ade80"
                          : Number(issue.agent_confidence) >= 50
                            ? "#facc15"
                            : "#f87171",
                    }}
                  />
                </div>
                <span className="text-[11px] text-[#808080] tabular-nums">
                  {Number(issue.agent_confidence)}%
                </span>
              </div>
            </div>
          )}

          {/* Outcome summary */}
          {issue.outcome_summary && (
            <p className="text-[12px] text-[#707070] mt-2 leading-relaxed">
              {issue.outcome_summary}
            </p>
          )}
        </div>

        {/* Blocked Indicator */}
        {issue.agent_status === "blocked" && issue.blocked_reason && (
          <div className="mb-8 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5l6.5 11.25H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                <path d="M8 6v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                <circle cx="8" cy="11" r="0.75" fill="currentColor" />
              </svg>
              <h3 className="text-[14px] font-semibold text-red-400">Agent Blocked</h3>
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
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              Unblock & Re-run
            </button>
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
                  <svg className="w-4 h-4 text-[#5e6ad2]" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
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
              {issue.plan_status === "needs_revision" && issue.plan_feedback && (
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
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    Approve Plan
                  </button>
                  <label className="flex items-center gap-1.5 px-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSpawnOnApprove}
                      onChange={(e) => setAutoSpawnOnApprove(e.target.checked)}
                      className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-[11px] text-[#666]">Auto-implement</span>
                  </label>
                  <button
                    onClick={() => setShowRejectForm(!showRejectForm)}
                    disabled={planActionLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-[#303030] text-[#808080] hover:text-[#e0e0e0] text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                      <path d="M12 4l-8 8M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
                      disabled={planActionLoading || !planRejectFeedback.trim()}
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
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                      <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
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
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                    Start Implementation
                  </button>
                )}
            </div>
          )}

        {/* Agent Output */}
        {issue.agent_output && (
          <div className="mb-8 p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
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

            {issue.agent_output.findings && issue.agent_output.findings.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] text-[#505050] mb-1">Findings</div>
                <ul className="space-y-1">
                  {issue.agent_output.findings.map((finding, i) => (
                    <li key={i} className="text-[12px] text-[#808080] flex items-start gap-1.5">
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
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8z" />
                </svg>
                View Pull Request
              </a>
            )}

            {issue.agent_output.error && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[12px] text-red-400">
                <span className="font-medium">Error:</span> {issue.agent_output.error}
              </div>
            )}
          </div>
        )}

        {/* Linked Pull Requests */}
        {(linkedPRs.length > 0 || loadingPRs) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-[#606060]" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
              </svg>
              <h3 className="text-[13px] font-medium text-[#e0e0e0]">
                Pull Requests
              </h3>
              {linkedPRs.length > 0 && (
                <span className="text-[11px] text-[#505050]">({linkedPRs.length})</span>
              )}
            </div>
            {loadingPRs ? (
              <div className="flex items-center gap-2 text-[11px] text-[#505050]">
                <div className="w-3 h-3 border border-[#404040] border-t-[#5e6ad2] rounded-full animate-spin" />
                Loading PRs...
              </div>
            ) : (
              <div className="space-y-2">
                {linkedPRs.map((pr) => (
                  <PRCard key={pr.id} pr={pr} onUnlink={handleUnlinkPR} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Terminal Output */}
        <TerminalViewer
          issueIdentifier={issue.identifier}
          isAgentActive={isAgentActive}
          sseLines={terminalLines}
        />

        {/* Agent Activity Feed */}
        {(agentActivities.length > 0 || isAgentActive) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <svg className="w-4 h-4 text-[#22d3d3]" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="4" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.25" />
                    <circle cx="6" cy="8" r="1" fill="currentColor" />
                    <circle cx="10" cy="8" r="1" fill="currentColor" />
                    <path d="M8 4V2M8 2L6 1M8 2L10 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                  {isAgentActive && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22d3d3] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22d3d3]" />
                    </span>
                  )}
                </div>
                <h3 className="text-[13px] font-medium text-[#e0e0e0]">
                  Agent Activity
                </h3>
                {isAgentActive && (
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
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {showActivityFeed && (
              <div
                ref={activityFeedRef}
                className="relative max-h-[400px] overflow-y-auto rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] p-3"
              >
                {agentActivities.length > 0 && (
                  <div className="absolute left-[26px] top-0 bottom-0 w-px bg-gradient-to-b from-[#22d3d3] via-[#a78bfa] to-[#1f1f1f]" />
                )}

                <div className="relative space-y-1">
                  {agentActivities.map((activity, index) => (
                    <AgentActivityItem
                      key={activity.id}
                      activity={activity}
                      isLatest={index === agentActivities.length - 1}
                      isAgentActive={isAgentActive}
                    />
                  ))}

                  {isAgentActive && <AgentThinkingIndicator />}
                </div>

                {agentActivities.length === 0 && issue.agent_status === "idle" && (
                  <div className="text-center py-8 text-[#505050] text-[12px]">
                    No agent activity yet. Click &quot;Investigate&quot; to start.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
