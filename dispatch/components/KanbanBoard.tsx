"use client";

import { useState } from "react";
import IssueCard from "./IssueCard";

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
  is_closed: boolean;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_id: string;
  assignee: { name: string } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  created_at: string;
}

interface KanbanBoardProps {
  statuses: Status[];
  issues: Issue[];
  onMoveIssue: (issueId: string, newStatusId: string) => void;
}

// Status icons based on Linear's design
function getStatusIcon(statusName: string, color: string) {
  const name = statusName.toLowerCase();

  // Backlog - dashed circle
  if (name === "backlog") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle
          cx="7"
          cy="7"
          r="6"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />
      </svg>
    );
  }

  // Todo - empty circle
  if (name === "todo" || name === "triage") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }

  // In Progress - half filled circle
  if (name === "in progress") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
        <path d="M7 1A6 6 0 0 1 7 13" fill={color} />
      </svg>
    );
  }

  // In Review - 3/4 filled circle
  if (name === "in review") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
        <path d="M7 1A6 6 0 1 1 1 7" fill={color} />
      </svg>
    );
  }

  // Done - filled circle with checkmark
  if (name === "done") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" fill={color} />
        <path
          d="M4.5 7L6.5 9L9.5 5"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Canceled - crossed circle
  if (name === "canceled" || name === "cancelled") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
        <path
          d="M4 4L10 10M10 4L4 10"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Default - simple circle
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function KanbanBoard({
  statuses,
  issues,
  onMoveIssue,
}: KanbanBoardProps) {
  const [draggedIssue, setDraggedIssue] = useState<Issue | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, issue: Issue) {
    setDraggedIssue(issue);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    setDragOverColumn(statusId);
  }

  function handleDragLeave() {
    setDragOverColumn(null);
  }

  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedIssue && draggedIssue.status_id !== statusId) {
      onMoveIssue(draggedIssue.id, statusId);
    }

    setDraggedIssue(null);
  }

  const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-4">
      {sortedStatuses.map((status) => {
        const columnIssues = issues.filter((i) => i.status_id === status.id);
        const isDragOver = dragOverColumn === status.id;

        return (
          <div
            key={status.id}
            className={`flex-shrink-0 w-[280px] flex flex-col rounded-lg transition-colors h-full ${
              isDragOver ? "bg-[#5e6ad2]/5" : "bg-transparent"
            }`}
            onDragOver={(e) => handleDragOver(e, status.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status.id)}
          >
            {/* Column header - fixed at top */}
            <div className="flex items-center gap-2 px-2 py-2 mb-1 flex-shrink-0">
              {getStatusIcon(status.name, status.color)}
              <span className="text-[13px] font-medium text-[#f5f5f5]">
                {status.name}
              </span>
              <span className="text-[12px] text-[#555] ml-1">
                {columnIssues.length}
              </span>
            </div>

            {/* Issues - independently scrollable */}
            <div className="flex-1 overflow-y-auto px-1 min-h-0">
              <div className="flex flex-col gap-2 pb-4">
                {columnIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    statusColor={status.color}
                    onDragStart={handleDragStart}
                  />
                ))}

                {columnIssues.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-[12px] text-[#444] border border-dashed border-[#252525] rounded-md">
                    No issues
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
