import type { AgentRunSummary } from "@/components/RunCard";

// --- Shared interfaces (re-exported from IssuePageClient) ---

export interface Status {
  id: string;
  name: string;
  color: string;
}

export interface AgentOutput {
  phase?: string;
  summary?: string;
  findings?: string[];
  recommendation?: string;
  pr_url?: string;
  error?: string;
}

export interface LinkedPR {
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

export interface AgentActivity {
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

export interface ExternalLink {
  id: string;
  issue_id: string;
  source: string;
  external_id: string;
  external_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface HistoryEntry {
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

export interface Issue {
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
  cost_usd?: number | null;
  model?: string | null;
  num_turns?: number | null;
  run_outcome?: string | null;
  outcome_summary?: string | null;
}

// --- Timeline entry discriminated union ---

interface BaseEntry {
  id: string;
  timestamp: string;
  runId?: string; // For visual grouping of entries within the same run
}

export interface RunStartedEntry extends BaseEntry {
  kind: "run_started";
  workflowType: string;
  githubRunUrl: string | null;
  isActive: boolean;
}

export interface TerminalStreamEntry extends BaseEntry {
  kind: "terminal_stream";
  issueIdentifier: string;
  lines: string[];
  isLive: boolean;
}

export interface ActivityReportEntry extends BaseEntry {
  kind: "activity_report";
  reportType:
    | "investigation_complete"
    | "implementation_complete"
    | "investigation_failed"
    | "implementation_failed"
    | "qa_complete"
    | "qa_failed"
    | "research_complete"
    | "research_failed";
  content: string;
  metadata?: AgentActivity["metadata"];
}

export interface PRLinkedEntry extends BaseEntry {
  kind: "pr_linked";
  pr: LinkedPR;
}

export interface RunCompletedEntry extends BaseEntry {
  kind: "run_completed";
  run: AgentRunSummary;
}

export interface StatusChangedEntry extends BaseEntry {
  kind: "status_changed";
  oldValue: string | null;
  newValue: string;
  actorName: string | null;
}

export interface IssueCreatedEntry extends BaseEntry {
  kind: "issue_created";
  issue: Issue;
}

export interface PlanSubmittedEntry extends BaseEntry {
  kind: "plan_submitted";
  planContent: string;
  planStatus: string;
  planFeedback: string | null;
}

export interface BlockedEntry extends BaseEntry {
  kind: "blocked";
  reason: string;
}

export interface HistoryMiscEntry extends BaseEntry {
  kind: "history_misc";
  action: string;
  formatted: string;
  actorType: string;
  actorName: string | null;
}

export type TimelineEntry =
  | RunStartedEntry
  | TerminalStreamEntry
  | ActivityReportEntry
  | PRLinkedEntry
  | RunCompletedEntry
  | StatusChangedEntry
  | IssueCreatedEntry
  | PlanSubmittedEntry
  | BlockedEntry
  | HistoryMiscEntry;
