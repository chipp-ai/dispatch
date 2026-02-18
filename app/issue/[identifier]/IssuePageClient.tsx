"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import TerminalViewer from "@/components/TerminalViewer";
import IssueTimeline from "@/components/IssueTimeline";
import PRCard from "@/components/PRCard";
import RunCard, { type AgentRunSummary } from "@/components/RunCard";
import RunDetailPanel from "@/components/RunDetailPanel";
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

interface ExternalLink {
  id: string;
  issue_id: string;
  source: string;
  external_id: string;
  external_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface InvestigationContextRun {
  run_number: number;
  date: string;
  outcome: string | null;
  outcome_summary: string | null;
  files_changed: string[];
  pr_number: number | null;
  pr_status: string | null;
  pr_merged: boolean;
  cost_usd: number;
  num_turns: number;
}

interface InvestigationContext {
  previous_runs: InvestigationContextRun[];
  total_runs: number;
  total_cost_usd: number;
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
  external_links?: ExternalLink[];
  created_at: string;
  updated_at: string;
  // Agent fields
  agent_status:
    | "idle"
    | "investigating"
    | "implementing"
    | "testing"
    | "researching"
    | "triaging"
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
  const isActive = status === "investigating" || status === "implementing" || status === "testing" || status === "researching" || status === "triaging";

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

// Investigation context card - shows what was injected into the latest run
function InvestigationContextCard({ context }: { context: InvestigationContext }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] overflow-hidden shrink-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-[#111111] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-[#a78bfa]" viewBox="0 0 16 16" fill="none">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.25" />
          </svg>
          <span className="text-[12px] font-medium text-[#a78bfa]">
            Agent Context
          </span>
          <span className="text-[10px] text-[#505050]">
            {context.total_runs} prior run{context.total_runs !== 1 ? "s" : ""} | ${context.total_cost_usd.toFixed(2)} total
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-[#505050] transition-transform ${expanded ? "" : "-rotate-90"}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-[#1f1f1f] p-3 space-y-2">
          <p className="text-[11px] text-[#606060] mb-2">
            This context was injected into the latest investigation prompt:
          </p>
          {context.previous_runs.map((run, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded bg-[#111111] border border-[#1a1a1a]">
              <span className="text-[10px] text-[#505050] font-mono shrink-0 mt-0.5">#{run.run_number}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-medium ${
                    run.outcome === "completed" ? "text-[#4ade80]" :
                    run.outcome === "failed" ? "text-[#f87171]" :
                    "text-[#a0a0a0]"
                  }`}>
                    {run.outcome || "unknown"}
                  </span>
                  {run.pr_number && (
                    <span className={`text-[10px] px-1 py-0.5 rounded font-mono ${
                      run.pr_merged
                        ? "bg-[#4ade80]/10 text-[#4ade80]"
                        : "bg-[#5e6ad2]/10 text-[#5e6ad2]"
                    }`}>
                      PR #{run.pr_number} {run.pr_merged ? "(merged)" : `(${run.pr_status})`}
                    </span>
                  )}
                </div>
                {run.outcome_summary && (
                  <p className="text-[11px] text-[#808080] mt-0.5 line-clamp-2">{run.outcome_summary}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-[#404040]">
                  <span>{run.date}</span>
                  <span>${run.cost_usd.toFixed(2)}</span>
                  <span>{run.num_turns} turns</span>
                  {run.files_changed.length > 0 && (
                    <span className="truncate max-w-[200px]" title={run.files_changed.join(", ")}>
                      {run.files_changed.length} file{run.files_changed.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Previous run block with lazy-loaded transcript
function PreviousRunBlock({
  run,
  issueId,
  isExpanded,
  onToggle,
}: {
  run: AgentRunSummary;
  issueId: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const outcomeColors: Record<string, string> = {
    completed: "#4ade80",
    no_changes_needed: "#60a5fa",
    blocked: "#f87171",
    needs_human_decision: "#facc15",
    investigation_complete: "#a78bfa",
    failed: "#f87171",
  };

  const workflowLabels: Record<string, string> = {
    error_fix: "Error Fix",
    prd_investigate: "Investigate",
    prd_implement: "Implement",
    qa: "QA Test",
    deep_research: "Research",
  };

  useEffect(() => {
    if (!isExpanded || transcript !== null) return;
    setLoadingTranscript(true);
    fetch(`/api/issues/${issueId}/runs/${run.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setTranscript(data?.transcript || "No transcript available."))
      .catch(() => setTranscript("Failed to load transcript."))
      .finally(() => setLoadingTranscript(false));
  }, [isExpanded, issueId, run.id, transcript]);

  const outcomeColor = run.outcome ? (outcomeColors[run.outcome] || "#808080") : "#808080";
  const duration = run.duration_seconds != null
    ? run.duration_seconds < 60
      ? `${run.duration_seconds}s`
      : `${Math.floor(run.duration_seconds / 60)}m ${run.duration_seconds % 60}s`
    : "--";

  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] overflow-hidden shrink-0">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-[#111111] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <OutcomeIcon outcome={run.outcome || "failed"} className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[12px] font-medium text-[#c0c0c0] truncate">
            {workflowLabels[run.workflow_type] || run.workflow_type}
          </span>
          {run.outcome && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
              style={{ backgroundColor: outcomeColor + "20", color: outcomeColor }}
            >
              {run.outcome.replace(/_/g, " ")}
            </span>
          )}
          {run.pr_number && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 bg-[#5e6ad2]/10 text-[#5e6ad2]">
              PR #{run.pr_number}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[10px] text-[#404040]">{duration}</span>
          {Number(run.cost_usd) > 0 && (
            <span className="text-[10px] text-[#404040]">${Number(run.cost_usd).toFixed(2)}</span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-[#505050] transition-transform ${isExpanded ? "" : "-rotate-90"}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>
      {run.outcome_summary && !isExpanded && (
        <div className="px-3 pb-2 -mt-1">
          <p className="text-[11px] text-[#606060] line-clamp-1">{run.outcome_summary}</p>
        </div>
      )}
      {isExpanded && (
        <div className="border-t border-[#1f1f1f]">
          {run.outcome_summary && (
            <div className="px-3 py-2 border-b border-[#1a1a1a] bg-[#0d0d0d]">
              <p className="text-[12px] text-[#a0a0a0] leading-relaxed">{run.outcome_summary}</p>
            </div>
          )}
          {run.github_run_url && (
            <div className="px-3 py-1.5 border-b border-[#1a1a1a]">
              <a
                href={run.github_run_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-[#5e6ad2] hover:text-[#7c8aff] transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                View on GitHub Actions
              </a>
            </div>
          )}
          <div className="p-3 max-h-[500px] overflow-y-auto">
            {loadingTranscript ? (
              <div className="flex items-center gap-2 text-[11px] text-[#505050]">
                <div className="w-3 h-3 border border-[#404040] border-t-[#a78bfa] rounded-full animate-spin" />
                Loading transcript...
              </div>
            ) : transcript ? (
              <pre className="text-[11px] text-[#808080] leading-relaxed whitespace-pre-wrap font-mono">
                {transcript}
              </pre>
            ) : (
              <p className="text-[11px] text-[#404040]">No transcript available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IssuePageClient() {
  const router = useRouter();
  const params = useParams();
  const identifier = params.identifier as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");

  // Linked PRs
  const [linkedPRs, setLinkedPRs] = useState<LinkedPR[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);

  // Agent activity tracking
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // Live terminal output from CI
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  // Agent runs (provenance)
  const [agentRuns, setAgentRuns] = useState<AgentRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showRunsSection, setShowRunsSection] = useState(true);

  // Investigation context for previous runs
  const [investigationContext, setInvestigationContext] = useState<InvestigationContext | null>(null);
  const prevAgentStatusRef = useRef<string | null>(null);
  const [expandedPrevRunId, setExpandedPrevRunId] = useState<string | null>(null);

  // Plan review
  const [planRejectFeedback, setPlanRejectFeedback] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [spawnLoading, setSpawnLoading] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [autoSpawnOnApprove, setAutoSpawnOnApprove] = useState(true);

  const issueJsonRef = useRef<string>("");

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
      // Only update state if data actually changed to prevent cascading re-renders
      const json = JSON.stringify(data);
      if (json !== issueJsonRef.current) {
        issueJsonRef.current = json;
        setIssue(data);
        setTitleValue(data.title);
        setDescriptionValue(data.description || "");
      }
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
        // Load persisted log into terminal when no live lines exist.
        // When agent is active, load from current run's transcript (avoids stale agent_full_log).
        // When idle, prefer agent_full_log (complete), fall back to latest run transcript.
        if (terminalLines.length === 0) {
          const isActive = issue.agent_status === "investigating" || issue.agent_status === "implementing";

          if (isActive) {
            // Active investigation: load current run's partial transcript
            try {
              const runRes = await fetch(`/api/issues/${issue.id}/runs/current`);
              if (runRes.ok) {
                const runData = await runRes.json();
                if (runData.transcript) {
                  setTerminalLines(runData.transcript.split("\n"));
                }
              }
            } catch {
              // Non-fatal
            }
          } else {
            // Completed: try agent_full_log first, then latest run transcript
            const fullLog = [...data]
              .reverse()
              .find((a: AgentActivity) => a.type === "agent_full_log");
            if (fullLog?.content) {
              setTerminalLines(fullLog.content.split("\n"));
            } else {
              try {
                const runRes = await fetch(`/api/issues/${issue.id}/runs/current`);
                if (runRes.ok) {
                  const runData = await runRes.json();
                  if (runData.transcript) {
                    setTerminalLines(runData.transcript.split("\n"));
                  }
                }
              } catch {
                // Non-fatal
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch agent activity:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, issue?.agent_status, terminalLines.length]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  const fetchRuns = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/runs`);
      if (res.ok) {
        const data = await res.json();
        setAgentRuns(data);
      }
    } catch (err) {
      console.error("Failed to fetch agent runs:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  const fetchInvestigationContext = useCallback(async () => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}/investigation-context`);
      if (res.ok) {
        const data = await res.json();
        setInvestigationContext(data);
      }
    } catch {
      // Non-fatal
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  useEffect(() => {
    fetchIssue().finally(() => setLoading(false));
  }, [fetchIssue]);

  useEffect(() => {
    if (issue) {
      fetchAgentActivity();
      fetchLinkedPRs();
      fetchRuns();
      fetchInvestigationContext();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, fetchAgentActivity, fetchLinkedPRs, fetchRuns, fetchInvestigationContext]);

  // Clear terminal when a new investigation starts (avoids stale output from previous run)
  useEffect(() => {
    if (!issue) return;
    const prev = prevAgentStatusRef.current;
    const curr = issue.agent_status;
    prevAgentStatusRef.current = curr;
    if (prev && prev !== curr && (curr === "investigating" || curr === "implementing")) {
      setTerminalLines([]);
    }
  }, [issue?.agent_status]);

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

  async function handleSpawn(type: "investigate" | "implement" | "triage" | "qa" | "research") {
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
    type: "investigate" | "implement" | "triage" | "qa" | "research";
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

  // Parse Loki metadata from external links
  const lokiLink = issue.external_links?.find((l) => l.source === "loki");
  const lokiMeta = lokiLink?.metadata as Record<string, string> | null;

  // Parse source/feature from title pattern [source/feature]
  const titleMatch = issue.title.match(/^\[([^\]]+)\]\s*/);
  const parsedSource = lokiMeta?.source || titleMatch?.[1]?.split("/")[0] || null;
  const parsedFeature = lokiMeta?.feature || titleMatch?.[1]?.split("/")[1] || null;
  const cleanTitle = titleMatch ? issue.title.slice(titleMatch[0].length) : issue.title;

  const hasTerminalOutput = isAgentActive || terminalLines.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[#0d0d0d]">
      {/* Compact Header */}
      <header className="h-11 border-b border-[#1f1f1f] flex items-center px-3 md:px-4 bg-[#0d0d0d] shrink-0 z-10">
        {/* Left: breadcrumb */}
        <div className="flex items-center gap-2 text-[13px] shrink-0">
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
            <span className="hidden md:inline">Board</span>
          </Link>
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

        {/* Right: status + actions + sidebar toggle + delete */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Agent status badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{ backgroundColor: agentConfig.bgColor }}
          >
            <span style={{ color: agentConfig.color }}>
              <AgentStatusIcon status={issue.agent_status} animate={isAgentActive} />
            </span>
            <span className="text-[11px] font-medium hidden md:inline" style={{ color: agentConfig.color }}>
              {agentConfig.label}
            </span>
          </div>

          {/* Action buttons */}
          {issue.agent_status === "idle" && (
            <>
              {(issue.run_outcome || (issue.spawn_attempt_count != null && issue.spawn_attempt_count > 0)) && (
                <button
                  onClick={() => setShowRetryDialog(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#1a1a1a] border border-[#252525] hover:border-[#404040] text-[#808080] hover:text-[#e0e0e0] text-[11px] rounded-md transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden md:inline">Retry</span>
                </button>
              )}
              <button
                onClick={() => handleSpawn("investigate")}
                disabled={spawnLoading}
                className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[11px] font-medium rounded-md transition-all shadow-lg shadow-[#5e6ad2]/20 disabled:opacity-50"
              >
                {spawnLoading ? (
                  <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <AgentStatusIcon status="investigating" />
                )}
                {issue.run_outcome || (issue.spawn_attempt_count != null && issue.spawn_attempt_count > 0)
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
                onClick={handleCancel}
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

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded transition-colors ${sidebarOpen ? "text-[#e0e0e0] bg-[#1a1a1a]" : "text-[#606060] hover:text-[#e0e0e0]"}`}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
              <path d="M10 2v12" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={handleDeleteIssue}
            className="p-1.5 text-[#606060] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            title="Delete mission"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Spawn error toast */}
      {spawnError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-[12px] text-red-400">{spawnError}</p>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 flex min-h-0">
        {/* Main area: Terminal + Previous Runs */}
        <main className="flex-1 flex flex-col min-w-0 p-3 overflow-y-auto gap-3">
          {hasTerminalOutput ? (
            <TerminalViewer
              issueIdentifier={issue.identifier}
              isAgentActive={isAgentActive}
              sseLines={terminalLines}
              className={agentRuns.filter(r => r.status !== "running").length > 0 ? "shrink-0" : "flex-1 min-h-0"}
            />
          ) : (
            /* Empty state: Mission details + Action Panel */
            <div className="flex-1 flex flex-col rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] overflow-y-auto">
              {/* Mission info */}
              <div className="px-6 pt-6 pb-4 border-b border-[#1f1f1f]">
                {/* Identifier + metadata row */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[11px] font-mono text-[#505050]">{issue.identifier}</span>
                  {parsedSource && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#1a1a2e] text-[#a78bfa] border border-[#a78bfa]/20">
                      {parsedSource}{parsedFeature ? ` / ${parsedFeature}` : ""}
                    </span>
                  )}
                  {lokiMeta?.level && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      lokiMeta.level === "error"
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : lokiMeta.level === "warn"
                          ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          : "bg-[#1a1a1a] text-[#808080] border-[#252525]"
                    }`}>
                      {lokiMeta.level}
                    </span>
                  )}
                  {lokiMeta?.event_count && Number(lokiMeta.event_count) > 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#1a1a1a] text-[#808080] border border-[#252525]">
                      {lokiMeta.event_count} occurrences
                    </span>
                  )}
                  {issue.labels.map((il) => (
                    <span
                      key={il.label.id}
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded border"
                      style={{
                        backgroundColor: `${il.label.color}15`,
                        color: il.label.color,
                        borderColor: `${il.label.color}30`,
                      }}
                    >
                      {il.label.name}
                    </span>
                  ))}
                </div>

                {/* Title */}
                <h1 className="text-[18px] font-semibold text-[#e0e0e0] leading-snug mb-1">
                  {cleanTitle}
                </h1>

                {/* Created date */}
                <span className="text-[11px] text-[#404040]">
                  Created {new Date(issue.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {lokiLink ? " via Loki" : ""}
                </span>
              </div>

              {/* Description */}
              {issue.description && (
                <div className="px-6 py-4 border-b border-[#1f1f1f]">
                  <div className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                    prose-h1:text-[14px] prose-h2:text-[13px] prose-h3:text-[12px]
                    prose-p:text-[#a0a0a0] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-1.5
                    prose-strong:text-[#d0d0d0]
                    prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
                    prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg prose-pre:text-[11px]
                    prose-ul:text-[#a0a0a0] prose-ul:my-1 prose-li:my-0
                    prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                  ">
                    <ReactMarkdown>{issue.description}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Action panel or waiting state */}
              <div className="flex-1 flex flex-col items-center justify-center">
                {issue.agent_status === "idle" ? (
                  <ActionPanel
                    hasApprovedPlan={issue.plan_status === "approved"}
                    onAction={handleSpawn}
                    loading={spawnLoading}
                  />
                ) : (
                  <div className="text-center">
                    <div className="mb-3 text-[#303030]">
                      <svg className="w-10 h-10 mx-auto" viewBox="0 0 16 16" fill="none">
                        <path d="M4 6l2 2-2 2M7 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <p className="text-[13px] text-[#505050]">Waiting for agent output...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Investigation Context - what was injected into the latest run */}
          {investigationContext && investigationContext.total_runs > 0 && (
            <InvestigationContextCard context={investigationContext} />
          )}

          {/* Previous Runs - reverse chronological, below live terminal */}
          {agentRuns.filter(r => r.status !== "running").length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <svg className="w-3.5 h-3.5 text-[#505050]" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.37.65l2.5 1.5a.75.75 0 10.76-1.3L8.5 7.94V4.75z" />
                </svg>
                <span className="text-[12px] font-medium text-[#606060]">
                  Previous Runs ({agentRuns.filter(r => r.status !== "running").length})
                </span>
              </div>
              {agentRuns
                .filter(r => r.status !== "running")
                .map((run) => (
                  <PreviousRunBlock
                    key={run.id}
                    run={run}
                    issueId={issue.id}
                    isExpanded={expandedPrevRunId === run.id}
                    onToggle={() => setExpandedPrevRunId(expandedPrevRunId === run.id ? null : run.id)}
                  />
                ))}
            </div>
          )}
        </main>

        {/* Right sidebar */}
        {sidebarOpen && (
          <aside className="w-[380px] border-l border-[#1f1f1f] overflow-y-auto shrink-0 hidden md:block">
            <div className="p-3 space-y-3">

              {/* Overview Card */}
              {(parsedSource || lokiMeta || issue.labels.length > 0) && (
                <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                  <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-2">
                    Overview
                  </div>
                  <div className="space-y-2">
                    {parsedSource && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#505050]">Source</span>
                        <span className="text-[12px] text-[#a0a0a0] font-mono">{parsedSource}</span>
                      </div>
                    )}
                    {parsedFeature && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#505050]">Feature</span>
                        <span className="text-[12px] text-[#a0a0a0] font-mono">{parsedFeature}</span>
                      </div>
                    )}
                    {lokiMeta?.level && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#505050]">Level</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                          lokiMeta.level === "error" ? "text-[#f87171] bg-[#f87171]/10" :
                          lokiMeta.level === "fatal" ? "text-[#f87171] bg-[#f87171]/10" :
                          lokiMeta.level === "warn" ? "text-[#facc15] bg-[#facc15]/10" :
                          "text-[#60a5fa] bg-[#60a5fa]/10"
                        }`}>
                          {lokiMeta.level}
                        </span>
                      </div>
                    )}
                    {lokiMeta?.event_count && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#505050]">Events</span>
                        <span className="text-[12px] text-[#a0a0a0] font-mono">{lokiMeta.event_count}</span>
                      </div>
                    )}
                    {issue.priority && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#505050]">Priority</span>
                        <span className="text-[12px] text-[#a0a0a0]">{issue.priority}</span>
                      </div>
                    )}
                    {issue.labels.length > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#505050]">Labels</span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {issue.labels.map((l) => (
                            <span
                              key={l.label.id}
                              className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${l.label.color}20`,
                                color: l.label.color,
                              }}
                            >
                              {l.label.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {lokiLink?.external_url && (
                      <a
                        href={lokiLink.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] text-[#5e6ad2] hover:text-[#7c8aff] transition-colors mt-1"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                          <path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        View in Grafana
                      </a>
                    )}
                    <div className="pt-1 border-t border-[#1f1f1f] mt-1">
                      <span className="text-[10px] text-[#404040]">
                        Created {new Date(issue.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {lokiLink ? " by Loki Webhook" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Title (editable) */}
              <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-2">
                  Title
                </div>
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
                    className="w-full text-[13px] font-medium bg-transparent text-[#f0f0f0] outline-none"
                    autoFocus
                  />
                ) : (
                  <p
                    className="text-[13px] font-medium text-[#e0e0e0] cursor-text hover:text-white transition-colors"
                    onClick={() => setEditingTitle(true)}
                  >
                    {issue.title}
                  </p>
                )}
              </div>

              {/* Description (editable, collapsible) */}
              <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-2">
                  Description
                </div>
                {editingDescription ? (
                  <div>
                    <textarea
                      value={descriptionValue}
                      onChange={(e) => setDescriptionValue(e.target.value)}
                      placeholder="Add a description..."
                      rows={8}
                      className="w-full bg-transparent text-[12px] text-[#c0c0c0] outline-none resize-none leading-relaxed"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleSaveDescription}
                        className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#5e6ad2] hover:bg-[#6b74db] rounded transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setDescriptionValue(issue.description || "");
                          setEditingDescription(false);
                        }}
                        className="px-2.5 py-1 text-[11px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="cursor-text min-h-[32px]"
                    onClick={() => setEditingDescription(true)}
                  >
                    {issue.description ? (
                      <div className="prose prose-invert prose-sm max-w-none max-h-[200px] overflow-y-auto
                        prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                        prose-h1:text-[14px] prose-h2:text-[13px] prose-h3:text-[12px]
                        prose-p:text-[#a0a0a0] prose-p:text-[12px] prose-p:leading-relaxed prose-p:my-1
                        prose-strong:text-[#d0d0d0]
                        prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
                        prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg
                        prose-ul:text-[#a0a0a0] prose-ul:my-1 prose-li:my-0
                        prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                      ">
                        <ReactMarkdown>{issue.description}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#505050] hover:text-[#707070] transition-colors">
                        Add a description...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Blocked Indicator */}
              {issue.agent_status === "blocked" && issue.blocked_reason && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1.5l6.5 11.25H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                      <path d="M8 6v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                      <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                    </svg>
                    <h3 className="text-[12px] font-semibold text-red-400">Blocked</h3>
                  </div>
                  <p className="text-[11px] text-red-300/80 leading-relaxed mb-2">
                    {issue.blocked_reason}
                  </p>
                  <button
                    onClick={() => handleSpawn("implement")}
                    disabled={spawnLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-medium rounded-md transition-colors disabled:opacity-50"
                  >
                    {spawnLoading ? (
                      <div className="w-3 h-3 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                        <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    Unblock & Re-run
                  </button>
                </div>
              )}

              {/* Plan Review Section */}
              {issue.plan_content &&
                (issue.plan_status === "awaiting_review" ||
                  issue.plan_status === "approved" ||
                  issue.plan_status === "needs_revision") && (
                  <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-3.5 h-3.5 text-[#5e6ad2]" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
                        <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                      </svg>
                      <h3 className="text-[12px] font-semibold text-[#e0e0e0]">
                        Plan
                      </h3>
                      {issue.plan_status === "awaiting_review" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#facc15]/15 text-[#facc15] uppercase tracking-wide">
                          Review
                        </span>
                      )}
                      {issue.plan_status === "approved" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#4ade80]/15 text-[#4ade80] uppercase tracking-wide">
                          Approved
                        </span>
                      )}
                      {issue.plan_status === "needs_revision" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#fb923c]/15 text-[#fb923c] uppercase tracking-wide">
                          Revise
                        </span>
                      )}
                    </div>

                    {/* Plan content preview */}
                    <div
                      className="bg-[#080808] border border-[#1a1a1a] rounded p-3 mb-2 max-h-[200px] overflow-hidden relative cursor-pointer group"
                      onClick={() => setIsPlanExpanded(true)}
                    >
                      <div className="prose prose-invert prose-sm max-w-none
                        prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                        prose-h1:text-[15px] prose-h2:text-[13px] prose-h3:text-[12px] prose-h4:text-[11px]
                        prose-p:text-[#a0a0a0] prose-p:text-[12px] prose-p:leading-relaxed prose-p:my-1
                        prose-strong:text-[#d0d0d0]
                        prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
                        prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg
                        prose-ul:text-[#a0a0a0] prose-ul:my-1 prose-li:my-0 prose-li:text-[12px]
                        prose-ol:text-[#a0a0a0] prose-ol:my-1
                        prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                      ">
                        <ReactMarkdown>{issue.plan_content}</ReactMarkdown>
                      </div>
                      {/* Fade gradient overlay */}
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#080808] to-transparent pointer-events-none" />
                      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
                        <span className="text-[11px] text-[#5e6ad2] group-hover:text-[#7c8af2] transition-colors">
                          View full plan
                        </span>
                      </div>
                    </div>

                    {/* Compact inline actions */}
                    {issue.plan_status === "awaiting_review" && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handlePlanApprove}
                          disabled={planActionLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 border border-[#4ade80]/30 text-[#4ade80] text-[11px] font-medium rounded-md transition-colors disabled:opacity-50"
                        >
                          {planActionLoading ? (
                            <div className="w-3 h-3 border border-[#4ade80]/40 border-t-[#4ade80] rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          Approve
                        </button>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoSpawnOnApprove}
                            onChange={(e) => setAutoSpawnOnApprove(e.target.checked)}
                            className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0 w-3 h-3"
                          />
                          <span className="text-[10px] text-[#666]">Auto-implement</span>
                        </label>
                        <button
                          onClick={() => setIsPlanExpanded(true)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] border border-[#303030] text-[#808080] hover:text-[#e0e0e0] text-[11px] font-medium rounded-md transition-colors ml-auto"
                        >
                          Changes
                        </button>
                      </div>
                    )}

                    {/* Re-investigate button for needs_revision */}
                    {issue.plan_status === "needs_revision" && (
                      <>
                        {issue.plan_feedback && (
                          <div className="mb-2 p-2 bg-[#fb923c]/5 border border-[#fb923c]/20 rounded">
                            <div className="text-[10px] font-medium text-[#fb923c] mb-0.5">Feedback</div>
                            <p className="text-[11px] text-[#fb923c]/80 leading-relaxed">
                              {issue.plan_feedback}
                            </p>
                          </div>
                        )}
                        <button
                          onClick={() => handleSpawn("investigate")}
                          disabled={spawnLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[11px] font-medium rounded-md transition-all disabled:opacity-50"
                        >
                          {spawnLoading ? (
                            <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                              <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                              <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          Re-investigate
                        </button>
                      </>
                    )}

                    {/* Spawn implementation for approved plans */}
                    {issue.plan_status === "approved" &&
                      issue.agent_status !== "implementing" && (
                        <button
                          onClick={() => handleSpawn("implement")}
                          disabled={spawnLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#22d3d3] to-[#5e6ad2] hover:from-[#2dd4bf] hover:to-[#6b74db] text-white text-[11px] font-medium rounded-md transition-all disabled:opacity-50"
                        >
                          {spawnLoading ? (
                            <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          )}
                          Implement
                        </button>
                      )}
                  </div>
                )}

              {/* Agent Output */}
              {issue.agent_output && (
                <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                  <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider mb-2">
                    Agent Output
                  </div>

                  {issue.agent_output.phase && (
                    <div className="text-[11px] text-[#a78bfa] mb-1.5">
                      Phase: {issue.agent_output.phase}
                    </div>
                  )}

                  {issue.agent_output.summary && (
                    <div className="text-[12px] text-[#a0a0a0] leading-relaxed mb-2">
                      {issue.agent_output.summary}
                    </div>
                  )}

                  {issue.agent_output.findings && issue.agent_output.findings.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] text-[#505050] mb-0.5">Findings</div>
                      <ul className="space-y-0.5">
                        {issue.agent_output.findings.map((finding, i) => (
                          <li key={i} className="text-[11px] text-[#808080] flex items-start gap-1">
                            <span className="text-[#404040] mt-0.5">•</span>
                            {finding}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {issue.agent_output.recommendation && (
                    <div className="p-2 bg-[#1a1a1a] border border-[#252525] rounded text-[11px] text-[#a0a0a0]">
                      <span className="text-[#606060]">Rec:</span>{" "}
                      {issue.agent_output.recommendation}
                    </div>
                  )}

                  {issue.agent_output.pr_url && (
                    <a
                      href={issue.agent_output.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1.5 text-[11px] text-[#5e6ad2] hover:text-[#7b83dc] transition-colors"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8z" />
                      </svg>
                      View Pull Request
                    </a>
                  )}

                  {issue.agent_output.error && (
                    <div className="mt-1.5 p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-400">
                      {issue.agent_output.error}
                    </div>
                  )}
                </div>
              )}

              {/* Confidence bar + outcome */}
              {(issue.agent_confidence !== null || issue.run_outcome) && (
                <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                  {issue.run_outcome && (() => {
                    const oc = outcomeConfig[issue.run_outcome] || outcomeConfig.failed;
                    return (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span style={{ color: oc.color }} className="flex-shrink-0">
                          <OutcomeIcon outcome={issue.run_outcome} className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-[12px] font-medium" style={{ color: oc.color }}>
                          {oc.label}
                        </span>
                      </div>
                    );
                  })()}
                  {issue.agent_confidence !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#505050]">Confidence</span>
                      <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
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
                      <span className="text-[10px] text-[#808080] tabular-nums">
                        {Number(issue.agent_confidence)}%
                      </span>
                    </div>
                  )}
                  {issue.outcome_summary && (
                    <p className="text-[11px] text-[#707070] mt-1.5 leading-relaxed">
                      {issue.outcome_summary}
                    </p>
                  )}
                  {issue.cost_usd != null && Number(issue.cost_usd) > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#505050]">
                      <span className="font-mono text-[#22d3d3]">
                        ${Number(issue.cost_usd) < 0.01 ? "<0.01" : Number(issue.cost_usd).toFixed(2)}
                      </span>
                      {issue.num_turns != null && issue.num_turns > 0 && (
                        <span>{issue.num_turns} turns</span>
                      )}
                      {issue.model && (
                        <span className="font-mono text-[#404040]">
                          {issue.model.replace("claude-", "").replace(/-/g, " ")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Linked Pull Requests */}
              {(linkedPRs.length > 0 || loadingPRs) && (
                <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-3.5 h-3.5 text-[#606060]" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                    </svg>
                    <h3 className="text-[12px] font-medium text-[#e0e0e0]">
                      Pull Requests
                    </h3>
                    {linkedPRs.length > 0 && (
                      <span className="text-[10px] text-[#505050]">({linkedPRs.length})</span>
                    )}
                  </div>
                  {loadingPRs ? (
                    <div className="flex items-center gap-2 text-[10px] text-[#505050]">
                      <div className="w-3 h-3 border border-[#404040] border-t-[#5e6ad2] rounded-full animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {linkedPRs.map((pr) => (
                        <PRCard key={pr.id} pr={pr} onUnlink={handleUnlinkPR} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Agent Runs */}
              {agentRuns.length > 0 && (
                <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-[#606060]" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.37.65l2.5 1.5a.75.75 0 10.76-1.3L8.5 7.94V4.75z" />
                      </svg>
                      <h3 className="text-[12px] font-medium text-[#e0e0e0]">
                        Agent Runs
                      </h3>
                      <span className="text-[10px] text-[#505050]">({agentRuns.length})</span>
                    </div>
                    <button
                      onClick={() => setShowRunsSection(!showRunsSection)}
                      className="p-0.5 text-[#505050] hover:text-[#808080] transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${showRunsSection ? "" : "-rotate-90"}`}
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {showRunsSection && (
                    <div className="space-y-1.5">
                      {agentRuns.map((run) => (
                        <div key={run.id}>
                          <RunCard
                            run={run}
                            isSelected={selectedRunId === run.id}
                            onClick={() =>
                              setSelectedRunId(selectedRunId === run.id ? null : run.id)
                            }
                          />
                          {selectedRunId === run.id && issue && (
                            <RunDetailPanel
                              issueId={issue.id}
                              runId={run.id}
                              onClose={() => setSelectedRunId(null)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Agent Activity Feed */}
              {(agentActivities.length > 0 || isAgentActive) && (
                <div className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <svg className="w-3.5 h-3.5 text-[#22d3d3]" viewBox="0 0 16 16" fill="none">
                          <rect x="3" y="4" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.25" />
                          <circle cx="6" cy="8" r="1" fill="currentColor" />
                          <circle cx="10" cy="8" r="1" fill="currentColor" />
                          <path d="M8 4V2M8 2L6 1M8 2L10 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                        </svg>
                        {isAgentActive && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22d3d3] opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#22d3d3]" />
                          </span>
                        )}
                      </div>
                      <h3 className="text-[12px] font-medium text-[#e0e0e0]">
                        Activity
                      </h3>
                      {isAgentActive && (
                        <span className="text-[9px] px-1 py-0.5 rounded-full bg-[#22d3d320] text-[#22d3d3] uppercase font-medium tracking-wide animate-pulse">
                          Live
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowActivityFeed(!showActivityFeed)}
                      className="p-0.5 text-[#505050] hover:text-[#808080] transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${showActivityFeed ? "" : "-rotate-90"}`}
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
                      className="relative max-h-[300px] overflow-y-auto"
                    >
                      {agentActivities.length > 0 && (
                        <div className="absolute left-[14px] top-0 bottom-0 w-px bg-gradient-to-b from-[#22d3d3] via-[#a78bfa] to-[#1f1f1f]" />
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
                        <div className="text-center py-4 text-[#505050] text-[11px]">
                          No activity yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Issue History Timeline */}
              <IssueTimeline issueId={issue.id} />
            </div>
          </aside>
        )}
      </div>

      {/* Plan Full-Screen Modal */}
      {isPlanExpanded && issue.plan_content && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsPlanExpanded(false); }}
        >
          <div className="relative w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f] shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#5e6ad2]" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
                <h2 className="text-[14px] font-semibold text-[#e0e0e0]">Plan</h2>
                {issue.plan_status === "awaiting_review" && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#facc15]/15 text-[#facc15] uppercase tracking-wide">
                    Review
                  </span>
                )}
                {issue.plan_status === "approved" && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#4ade80]/15 text-[#4ade80] uppercase tracking-wide">
                    Approved
                  </span>
                )}
                {issue.plan_status === "needs_revision" && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-[#fb923c]/15 text-[#fb923c] uppercase tracking-wide">
                    Revise
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsPlanExpanded(false)}
                className="p-1 text-[#505050] hover:text-[#e0e0e0] transition-colors rounded"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Scrollable plan content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {issue.plan_status === "needs_revision" && issue.plan_feedback && (
                <div className="mb-4 p-3 bg-[#fb923c]/5 border border-[#fb923c]/20 rounded-lg">
                  <div className="text-[11px] font-medium text-[#fb923c] mb-1">Feedback</div>
                  <p className="text-[12px] text-[#fb923c]/80 leading-relaxed">
                    {issue.plan_feedback}
                  </p>
                </div>
              )}
              <div className="prose prose-invert prose-sm max-w-none
                prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-h1:text-[16px] prose-h2:text-[14px] prose-h3:text-[13px] prose-h4:text-[12px]
                prose-p:text-[#a0a0a0] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-1.5
                prose-strong:text-[#d0d0d0]
                prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px]
                prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg prose-pre:my-2
                prose-ul:text-[#a0a0a0] prose-ul:my-1.5 prose-li:my-0.5 prose-li:text-[13px]
                prose-ol:text-[#a0a0a0] prose-ol:my-1.5
                prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
                prose-table:text-[12px]
                prose-th:text-[#c0c0c0] prose-th:font-medium prose-th:px-2 prose-th:py-1 prose-th:border-[#252525]
                prose-td:text-[#a0a0a0] prose-td:px-2 prose-td:py-1 prose-td:border-[#252525]
              ">
                <ReactMarkdown>{issue.plan_content}</ReactMarkdown>
              </div>
            </div>

            {/* Modal footer with actions */}
            <div className="px-5 py-3 border-t border-[#1f1f1f] shrink-0">
              {issue.plan_status === "awaiting_review" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { handlePlanApprove(); setIsPlanExpanded(false); }}
                      disabled={planActionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 border border-[#4ade80]/30 text-[#4ade80] text-[12px] font-medium rounded-md transition-colors disabled:opacity-50"
                    >
                      {planActionLoading ? (
                        <div className="w-3 h-3 border border-[#4ade80]/40 border-t-[#4ade80] rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      Approve
                    </button>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSpawnOnApprove}
                        onChange={(e) => setAutoSpawnOnApprove(e.target.checked)}
                        className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                      />
                      <span className="text-[11px] text-[#666]">Auto-implement</span>
                    </label>
                    <button
                      onClick={() => setShowRejectForm(!showRejectForm)}
                      disabled={planActionLoading}
                      className="flex items-center gap-1 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-[#303030] text-[#808080] hover:text-[#e0e0e0] text-[12px] font-medium rounded-md transition-colors disabled:opacity-50 ml-auto"
                    >
                      Request Changes
                    </button>
                  </div>
                  {showRejectForm && (
                    <div className="p-3 bg-[#141414] border border-[#252525] rounded-lg">
                      <textarea
                        value={planRejectFeedback}
                        onChange={(e) => setPlanRejectFeedback(e.target.value)}
                        placeholder="Describe what changes are needed..."
                        rows={3}
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#252525] rounded text-[13px] text-[#e0e0e0] placeholder-[#505050] outline-none focus:border-[#404040] resize-none transition-colors mb-2"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { handlePlanReject(); setIsPlanExpanded(false); }}
                          disabled={planActionLoading || !planRejectFeedback.trim()}
                          className="px-3 py-1.5 bg-[#fb923c]/10 hover:bg-[#fb923c]/20 border border-[#fb923c]/30 text-[#fb923c] text-[12px] font-medium rounded transition-colors disabled:opacity-50"
                        >
                          Submit Feedback
                        </button>
                        <button
                          onClick={() => { setShowRejectForm(false); setPlanRejectFeedback(""); }}
                          className="px-3 py-1.5 text-[12px] text-[#808080] hover:text-[#c0c0c0] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {issue.plan_status === "needs_revision" && (
                <button
                  onClick={() => { handleSpawn("investigate"); setIsPlanExpanded(false); }}
                  disabled={spawnLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#5e6ad2] to-[#7c3aed] hover:from-[#6b74db] hover:to-[#8b5cf6] text-white text-[12px] font-medium rounded-md transition-all disabled:opacity-50"
                >
                  {spawnLoading ? (
                    <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 0110.89-3.48M14 8a6 6 0 01-10.89 3.48" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                      <path d="M14 2v4h-4M2 14v-4h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  Re-investigate
                </button>
              )}
              {issue.plan_status === "approved" && (
                <div className="text-[12px] text-[#4ade80]/70">Plan approved</div>
              )}
            </div>
          </div>
        </div>
      )}

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

// --- Action Panel ---

type SpawnType = "investigate" | "implement" | "triage" | "qa" | "research";

interface ActionCardDef {
  type: SpawnType;
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  requiresPlan?: boolean;
}

const primaryActions: ActionCardDef[] = [
  {
    type: "investigate",
    label: "Investigate",
    description: "Explore the codebase and produce an implementation plan. Read-only, no changes made.",
    color: "#a78bfa",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "triage",
    label: "Triage",
    description: "Quick assessment: close if stale/duplicate, fix if simple, or escalate.",
    color: "#ec4899",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "research",
    label: "Research",
    description: "Deep research using internet + codebase. Produces a report with findings and recommendations.",
    color: "#8b5cf6",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
        <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
];

const postPlanActions: ActionCardDef[] = [
  {
    type: "implement",
    label: "Implement",
    description: "Execute the approved plan. Creates a branch, writes code, opens a PR.",
    color: "#22d3d3",
    requiresPlan: true,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l2 2-2 2M8 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    type: "qa",
    label: "QA Test",
    description: "Test the implementation end-to-end in a browser. Produces a QA report with screenshots.",
    color: "#f59e0b",
    requiresPlan: true,
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function ActionPanel({
  hasApprovedPlan,
  onAction,
  loading,
}: {
  hasApprovedPlan: boolean;
  onAction: (type: SpawnType) => void;
  loading: boolean;
}) {
  const actions = hasApprovedPlan
    ? [...postPlanActions, ...primaryActions]
    : primaryActions;

  return (
    <div className="w-full max-w-md px-6 py-8">
      <div className="text-center mb-5">
        <div className="mb-2 text-[#303030]">
          <svg className="w-8 h-8 mx-auto" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="4" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="6" cy="8" r="1" fill="currentColor" />
            <circle cx="10" cy="8" r="1" fill="currentColor" />
            <path d="M8 4V2M8 2L6 1M8 2L10 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[12px] text-[#505050]">Choose an action to begin</p>
      </div>
      <div className="space-y-2">
        {actions.map((action) => {
          const isGated = action.requiresPlan && !hasApprovedPlan;
          return (
            <button
              key={action.type}
              onClick={() => onAction(action.type)}
              disabled={loading || isGated}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all group ${
                isGated
                  ? "border-[#1a1a1a] opacity-40 cursor-not-allowed"
                  : "border-[#1f1f1f] hover:border-[#333] hover:bg-[#111]"
              }`}
            >
              <div
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md"
                style={{ backgroundColor: `${action.color}15`, color: action.color }}
              >
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: isGated ? "#505050" : action.color }}
                  >
                    {action.label}
                  </span>
                  {isGated && (
                    <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[#1a1a1a] text-[#505050] border border-[#252525]">
                      Requires plan
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#505050] leading-relaxed mt-0.5 line-clamp-2">
                  {action.description}
                </p>
              </div>
              {!isGated && (
                <svg
                  className="w-4 h-4 shrink-0 text-[#333] group-hover:text-[#555] transition-colors"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
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
