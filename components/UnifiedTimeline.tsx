"use client";

import { useState, useMemo } from "react";
import type { TimelineEntry } from "@/lib/timeline/types";
import {
  RunStartedEntry,
  TerminalStreamEntry,
  ActivityReportEntry,
  PRLinkedEntry,
  RunCompletedEntry,
  StatusChangedEntry,
  IssueCreatedEntry,
  PlanSubmittedEntryComponent,
  BlockedEntryComponent,
  HistoryMiscEntry,
} from "@/components/timeline";

interface UnifiedTimelineProps {
  entries: TimelineEntry[];
  // Action handlers passed through to entry components
  isIdle: boolean;
  spawnLoading: boolean;
  planActionLoading: boolean;
  autoSpawnOnApprove: boolean;
  onSpawn: (type: "investigate" | "implement" | "triage" | "qa" | "research") => void;
  onCancel: () => void;
  onClose: () => void;
  onPlanApprove: () => void;
  onPlanReject: (feedback: string) => void;
  onSetAutoSpawn: (val: boolean) => void;
  onExpandPlan: () => void;
  onUnlinkPR: (prId: string) => void;
  onEditTitle: () => void;
  onEditDescription: () => void;
}

export default function UnifiedTimeline({
  entries,
  isIdle,
  spawnLoading,
  planActionLoading,
  autoSpawnOnApprove,
  onSpawn,
  onClose,
  onPlanApprove,
  onPlanReject,
  onSetAutoSpawn,
  onExpandPlan,
  onUnlinkPR,
  onEditTitle,
  onEditDescription,
}: UnifiedTimelineProps) {
  // Track which past run groups are collapsed
  const [collapsedRunIds, setCollapsedRunIds] = useState<Set<string>>(new Set());

  // Identify run groups and determine which are active vs past
  const { runGroups, activeRunId } = useMemo(() => {
    const groups = new Map<string, TimelineEntry[]>();
    for (const entry of entries) {
      if (entry.runId) {
        const group = groups.get(entry.runId) || [];
        group.push(entry);
        groups.set(entry.runId, group);
      }
    }

    // Active run is one with a run_started entry marked isActive
    let activeId: string | undefined;
    for (const entry of entries) {
      if (entry.kind === "run_started" && entry.isActive) {
        activeId = entry.runId;
        break;
      }
    }

    return { runGroups: groups, activeRunId: activeId };
  }, [entries]);

  // Initialize collapsed state for past runs on first render
  useMemo(() => {
    const pastRunIds = new Set<string>();
    for (const [runId] of runGroups) {
      if (runId !== activeRunId) {
        pastRunIds.add(runId);
      }
    }
    setCollapsedRunIds(pastRunIds);
  // Only run once when runGroups change shape
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runGroups.size, activeRunId]);

  function toggleRunCollapse(runId: string) {
    setCollapsedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }

  // Render the timeline
  let currentRunId: string | null = null;
  let runGroupOpen = false;

  const rendered: JSX.Element[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryRunId = entry.runId || null;

    // Check if we're entering a new run group
    if (entryRunId && entryRunId !== currentRunId) {
      // Close previous run group if open
      if (runGroupOpen) {
        rendered.push(<div key={`run-end-${currentRunId}`} className="mb-2" />);
        runGroupOpen = false;
      }

      currentRunId = entryRunId;
      const isActive = entryRunId === activeRunId;
      const isCollapsed = collapsedRunIds.has(entryRunId);

      // Open run group wrapper
      const accentColor = isActive ? "#a78bfa" : "#252525";
      rendered.push(
        <div
          key={`run-group-${entryRunId}`}
          className="relative mb-3"
          style={{
            borderLeft: `2px solid ${accentColor}`,
            paddingLeft: "12px",
            marginLeft: "12px",
          }}
        >
          {/* Render entries within this group */}
          {renderRunGroupEntries(
            entries,
            i,
            entryRunId,
            isCollapsed,
            isActive,
            () => toggleRunCollapse(entryRunId)
          )}
        </div>
      );

      // Skip ahead past all entries in this group
      while (
        i + 1 < entries.length &&
        entries[i + 1].runId === entryRunId
      ) {
        i++;
      }
      runGroupOpen = false;
      currentRunId = null;
      continue;
    }

    // Close run group if we've left one
    if (runGroupOpen && !entryRunId) {
      rendered.push(<div key={`run-end-${currentRunId}`} className="mb-2" />);
      runGroupOpen = false;
      currentRunId = null;
    }

    // Render ungrouped entries
    // Separator between run groups and ungrouped entries
    if (
      rendered.length > 0 &&
      !entryRunId &&
      i > 0 &&
      entries[i - 1].runId
    ) {
      rendered.push(
        <div
          key={`separator-${i}`}
          className="my-4 border-t border-dashed border-[#1f1f1f]"
        />
      );
    }

    rendered.push(
      <div key={entry.id}>{renderEntry(entry)}</div>
    );
  }

  return (
    <div className="space-y-0">
      {rendered}
    </div>
  );

  function renderRunGroupEntries(
    allEntries: TimelineEntry[],
    startIdx: number,
    runId: string,
    isCollapsed: boolean,
    isActive: boolean,
    onToggle: () => void
  ) {
    // Collect all entries for this run
    const groupEntries: TimelineEntry[] = [];
    for (let j = startIdx; j < allEntries.length; j++) {
      if (allEntries[j].runId === runId) {
        groupEntries.push(allEntries[j]);
      } else {
        break;
      }
    }

    if (isCollapsed) {
      // Show only run_started and run_completed as a compact row
      const startEntry = groupEntries.find((e) => e.kind === "run_started");
      const endEntry = groupEntries.find((e) => e.kind === "run_completed");

      return (
        <div>
          {startEntry && renderEntry(startEntry)}
          {endEntry && renderEntry(endEntry)}
          {groupEntries.length > 2 && (
            <button
              onClick={onToggle}
              className="ml-10 mt-1 flex items-center gap-1 text-[10px] text-[#505050] hover:text-[#808080] transition-colors"
            >
              <svg className="w-3 h-3 -rotate-90" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Show {groupEntries.length - 2} more events
            </button>
          )}
        </div>
      );
    }

    return (
      <div>
        {groupEntries.map((entry) => (
          <div key={entry.id}>{renderEntry(entry)}</div>
        ))}
        {!isActive && groupEntries.length > 2 && (
          <button
            onClick={onToggle}
            className="ml-10 mt-1 flex items-center gap-1 text-[10px] text-[#505050] hover:text-[#808080] transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Collapse run
          </button>
        )}
      </div>
    );
  }

  function renderEntry(entry: TimelineEntry): JSX.Element {
    switch (entry.kind) {
      case "run_started":
        return <RunStartedEntry entry={entry} />;
      case "terminal_stream":
        return <TerminalStreamEntry entry={entry} />;
      case "activity_report":
        return <ActivityReportEntry entry={entry} />;
      case "pr_linked":
        return <PRLinkedEntry entry={entry} onUnlink={onUnlinkPR} />;
      case "run_completed":
        return <RunCompletedEntry entry={entry} />;
      case "status_changed":
        return <StatusChangedEntry entry={entry} />;
      case "issue_created":
        return (
          <IssueCreatedEntry
            entry={entry}
            isIdle={isIdle}
            spawnLoading={spawnLoading}
            onSpawn={onSpawn}
            onClose={onClose}
            onEditTitle={onEditTitle}
            onEditDescription={onEditDescription}
          />
        );
      case "plan_submitted":
        return (
          <PlanSubmittedEntryComponent
            entry={entry}
            autoSpawnOnApprove={autoSpawnOnApprove}
            planActionLoading={planActionLoading}
            spawnLoading={spawnLoading}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
            onSetAutoSpawn={onSetAutoSpawn}
            onExpandPlan={onExpandPlan}
            onSpawnImplement={() => onSpawn("implement")}
            onSpawnInvestigate={() => onSpawn("investigate")}
          />
        );
      case "blocked":
        return (
          <BlockedEntryComponent
            entry={entry}
            spawnLoading={spawnLoading}
            onUnblock={() => onSpawn("implement")}
          />
        );
      case "history_misc":
        return <HistoryMiscEntry entry={entry} />;
      default:
        return <div />;
    }
  }
}
