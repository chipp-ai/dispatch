import type {
  Issue,
  LinkedPR,
  AgentActivity,
  HistoryEntry,
  TimelineEntry,
} from "./types";
import type { AgentRunSummary } from "@/components/RunCard";

// Activity types that generate report entries in the timeline
const REPORT_TYPES = new Set([
  "investigation_complete",
  "implementation_complete",
  "investigation_failed",
  "implementation_failed",
  "qa_complete",
  "qa_failed",
  "research_complete",
  "research_failed",
]);

// Activity types that are subsumed by the terminal stream
const NOISE_TYPES = new Set([
  "agent_heartbeat",
  "agent_full_log",
  "thought",
  "action",
  "observation",
  "tool_call",
  "file_read",
  "file_write",
  "search",
  "complete",
  "error",
]);

// History actions that map to dedicated timeline entry kinds
const DEDICATED_HISTORY_ACTIONS = new Set([
  "created",
  "status_changed",
  "pr_linked",
  "agent_started",
  "agent_completed",
]);

interface MergeInput {
  issue: Issue;
  runs: AgentRunSummary[];
  activities: AgentActivity[];
  history: HistoryEntry[];
  linkedPRs: LinkedPR[];
  terminalLinesByRun: Record<string, string[]>; // runId -> lines
  activeRunTerminalLines: string[]; // current live terminal
}

export function mergeTimeline(input: MergeInput): TimelineEntry[] {
  const {
    issue,
    runs,
    activities,
    history,
    linkedPRs,
    terminalLinesByRun,
    activeRunTerminalLines,
  } = input;

  const entries: TimelineEntry[] = [];
  const usedPRIds = new Set<string>();

  // 1. Issue created entry (always present, anchors the bottom)
  entries.push({
    kind: "issue_created",
    id: `issue-created-${issue.id}`,
    timestamp: issue.created_at,
    issue,
  });

  // 2. Process runs -> run_started, terminal_stream, run_completed
  const activeRun = runs.find((r) => r.status === "running");

  for (const run of runs) {
    const isActive = run.id === activeRun?.id;

    // run_started
    entries.push({
      kind: "run_started",
      id: `run-started-${run.id}`,
      timestamp: run.started_at,
      runId: run.id,
      workflowType: run.workflow_type,
      githubRunUrl: run.github_run_url,
      isActive,
    });

    // terminal_stream (if there are lines)
    const lines = isActive
      ? activeRunTerminalLines
      : terminalLinesByRun[run.id] || [];
    if (lines.length > 0 || isActive) {
      // Place terminal slightly after run_started
      const termTs = new Date(
        new Date(run.started_at).getTime() + 1000
      ).toISOString();
      entries.push({
        kind: "terminal_stream",
        id: `terminal-${run.id}`,
        timestamp: termTs,
        runId: run.id,
        issueIdentifier: issue.identifier,
        lines,
        isLive: isActive,
      });
    }

    // run_completed (for finished runs)
    if (run.completed_at && !isActive) {
      entries.push({
        kind: "run_completed",
        id: `run-completed-${run.id}`,
        timestamp: run.completed_at,
        runId: run.id,
        run,
      });
    }
  }

  // 3. Process activities -> activity reports only (noise is subsumed by terminal)
  for (const activity of activities) {
    if (NOISE_TYPES.has(activity.type)) continue;

    if (REPORT_TYPES.has(activity.type)) {
      // Find which run this activity belongs to via metadata or timestamp proximity
      const runId = findRunForActivity(activity, runs);
      entries.push({
        kind: "activity_report",
        id: `report-${activity.id}`,
        timestamp: activity.timestamp,
        runId,
        reportType: activity.type as ActivityReportType,
        content: activity.content,
        metadata: activity.metadata,
      });
    }

    // blocker_reported -> blocked entry
    if (activity.type === "blocker_reported") {
      const runId = findRunForActivity(activity, runs);
      entries.push({
        kind: "blocked",
        id: `blocked-${activity.id}`,
        timestamp: activity.timestamp,
        runId,
        reason: activity.content,
      });
    }
  }

  // 4. Process linked PRs -> pr_linked entries
  for (const pr of linkedPRs) {
    usedPRIds.add(pr.id);
    // Find associated run (by PR number match)
    const matchingRun = runs.find((r) => r.pr_number === pr.pr_number);
    entries.push({
      kind: "pr_linked",
      id: `pr-${pr.id}`,
      timestamp: pr.created_at,
      runId: matchingRun?.id,
      pr,
    });
  }

  // 5. Process history -> status_changed, history_misc
  // Skip entries that duplicate dedicated kinds
  for (const entry of history) {
    if (entry.action === "created") continue; // Covered by issue_created
    if (entry.action === "agent_started" || entry.action === "agent_completed")
      continue; // Covered by run entries

    // Deduplicate pr_linked history against actual PR data
    if (entry.action === "pr_linked") {
      const prNumber = (entry.new_value as { pr_number?: number })?.pr_number;
      if (prNumber && linkedPRs.some((p) => p.pr_number === prNumber)) continue;
    }

    if (entry.action === "status_changed") {
      const oldName =
        (entry.old_value as { name?: string })?.name ||
        (entry.old_value as { status?: string })?.status ||
        null;
      const newName =
        (entry.new_value as { name?: string })?.name ||
        (entry.new_value as { status?: string })?.status ||
        "Unknown";
      entries.push({
        kind: "status_changed",
        id: `status-${entry.id}`,
        timestamp: entry.created_at,
        oldValue: oldName,
        newValue: newName,
        actorName: entry.actor_name,
      });
      continue;
    }

    // Everything else -> history_misc
    entries.push({
      kind: "history_misc",
      id: `history-${entry.id}`,
      timestamp: entry.created_at,
      action: entry.action,
      formatted: entry.formatted,
      actorType: entry.actor_type,
      actorName: entry.actor_name,
    });
  }

  // 6. Blocked state from issue (if not already covered by activity)
  if (
    issue.agent_status === "blocked" &&
    issue.blocked_reason &&
    !entries.some((e) => e.kind === "blocked")
  ) {
    entries.push({
      kind: "blocked",
      id: `blocked-issue-${issue.id}`,
      timestamp: issue.updated_at,
      reason: issue.blocked_reason,
    });
  }

  // 7. Plan submitted (if present)
  if (
    issue.plan_content &&
    (issue.plan_status === "awaiting_review" ||
      issue.plan_status === "approved" ||
      issue.plan_status === "needs_revision")
  ) {
    // Place it after the latest run that produced it
    const planTs = issue.plan_approved_at || issue.updated_at;
    const latestRun = runs.length > 0 ? runs[0] : undefined;
    entries.push({
      kind: "plan_submitted",
      id: `plan-${issue.id}`,
      timestamp: planTs,
      runId: latestRun?.id,
      planContent: issue.plan_content,
      planStatus: issue.plan_status!,
      planFeedback: issue.plan_feedback || null,
    });
  }

  // Sort: reverse chronological (newest first)
  // Within the same runId group, keep chronological order
  return sortEntries(entries);
}

type ActivityReportType =
  | "investigation_complete"
  | "implementation_complete"
  | "investigation_failed"
  | "implementation_failed"
  | "qa_complete"
  | "qa_failed"
  | "research_complete"
  | "research_failed";

function findRunForActivity(
  activity: AgentActivity,
  runs: AgentRunSummary[]
): string | undefined {
  // Check metadata first
  if (activity.metadata?.run_id) {
    const match = runs.find(
      (r) =>
        r.id === activity.metadata!.run_id ||
        r.github_run_id === activity.metadata!.run_id
    );
    if (match) return match.id;
  }

  // Fallback: find the run whose time range contains this activity
  const activityTime = new Date(activity.timestamp).getTime();
  for (const run of runs) {
    const startTime = new Date(run.started_at).getTime();
    const endTime = run.completed_at
      ? new Date(run.completed_at).getTime()
      : Date.now();
    if (activityTime >= startTime && activityTime <= endTime) {
      return run.id;
    }
  }
  return undefined;
}

function sortEntries(entries: TimelineEntry[]): TimelineEntry[] {
  // Group entries by runId
  const runGroups = new Map<string, TimelineEntry[]>();
  const ungrouped: TimelineEntry[] = [];

  for (const entry of entries) {
    if (entry.runId) {
      const group = runGroups.get(entry.runId) || [];
      group.push(entry);
      runGroups.set(entry.runId, group);
    } else {
      ungrouped.push(entry);
    }
  }

  // Sort each run group chronologically (oldest first within group)
  for (const [, group] of runGroups) {
    group.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  // Get the "representative timestamp" for each run group (the earliest entry)
  const runTimestamps = new Map<string, number>();
  for (const [runId, group] of runGroups) {
    runTimestamps.set(runId, new Date(group[0].timestamp).getTime());
  }

  // Build final list: interleave run groups and ungrouped entries, newest first
  const allItems: Array<{ type: "group"; runId: string } | { type: "single"; entry: TimelineEntry }> = [];

  for (const [runId] of runGroups) {
    allItems.push({ type: "group", runId });
  }
  for (const entry of ungrouped) {
    allItems.push({ type: "single", entry });
  }

  // Sort all items reverse chronologically
  allItems.sort((a, b) => {
    const tsA =
      a.type === "group"
        ? runTimestamps.get(a.runId)!
        : new Date(a.entry.timestamp).getTime();
    const tsB =
      b.type === "group"
        ? runTimestamps.get(b.runId)!
        : new Date(b.entry.timestamp).getTime();
    return tsB - tsA; // Newest first
  });

  // Flatten
  const result: TimelineEntry[] = [];
  for (const item of allItems) {
    if (item.type === "group") {
      const group = runGroups.get(item.runId)!;
      result.push(...group);
    } else {
      result.push(item.entry);
    }
  }

  return result;
}
