"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { IssueCreatedEntry as IssueCreatedEntryType } from "@/lib/timeline/types";
import type { Issue } from "@/lib/timeline/types";
import { TimelineEntryWrapper } from "./shared";

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
    description: "Explore the codebase and produce an implementation plan.",
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
    description: "Quick assessment: close if stale/duplicate, fix if simple.",
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
    description: "Deep research using internet + codebase.",
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
    description: "Test the implementation end-to-end in a browser.",
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

export default function IssueCreatedEntry({
  entry,
  isIdle,
  spawnLoading,
  onSpawn,
  onClose,
  onEditTitle,
  onEditDescription,
}: {
  entry: IssueCreatedEntryType;
  isIdle: boolean;
  spawnLoading: boolean;
  onSpawn: (type: SpawnType) => void;
  onClose: () => void;
  onEditTitle: () => void;
  onEditDescription: () => void;
}) {
  const { issue } = entry;

  // Parse Loki metadata
  const lokiLink = issue.external_links?.find((l) => l.source === "loki");
  const lokiMeta = lokiLink?.metadata as Record<string, string> | null;
  const titleMatch = issue.title.match(/^\[([^\]]+)\]\s*/);
  const parsedSource = lokiMeta?.source || titleMatch?.[1]?.split("/")[0] || null;
  const parsedFeature = lokiMeta?.feature || titleMatch?.[1]?.split("/")[1] || null;
  const cleanTitle = titleMatch ? issue.title.slice(titleMatch[0].length) : issue.title;

  const hasApprovedPlan = issue.plan_status === "approved";
  const actions = hasApprovedPlan
    ? [...postPlanActions, ...primaryActions]
    : primaryActions;

  return (
    <TimelineEntryWrapper
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm4.5 7.5h-4v-4a.5.5 0 00-1 0v4h-4a.5.5 0 000 1h4v4a.5.5 0 001 0v-4h4a.5.5 0 000-1z" />
        </svg>
      }
      iconColor="#4ade80"
      iconBgColor="#4ade8015"
      timestamp={entry.timestamp}
    >
      {/* Metadata tags */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
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
      <h2
        className="text-[16px] font-semibold text-[#e0e0e0] leading-snug mb-1 cursor-text hover:text-white transition-colors"
        onClick={onEditTitle}
      >
        {cleanTitle}
      </h2>

      {/* Created date */}
      <span className="text-[11px] text-[#404040] block mb-3">
        Created {new Date(issue.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
        {lokiLink ? " via Loki" : ""}
      </span>

      {/* Description */}
      {issue.description && (
        <div
          className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 mb-3 cursor-text
            prose prose-invert prose-sm max-w-none
            prose-headings:text-[#e0e0e0] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
            prose-h1:text-[14px] prose-h2:text-[13px] prose-h3:text-[12px]
            prose-p:text-[#a0a0a0] prose-p:text-[13px] prose-p:leading-relaxed prose-p:my-1.5
            prose-strong:text-[#d0d0d0]
            prose-code:text-[#c792ea] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px]
            prose-pre:bg-[#141414] prose-pre:border prose-pre:border-[#252525] prose-pre:rounded-lg prose-pre:text-[11px]
            prose-ul:text-[#a0a0a0] prose-ul:my-1 prose-li:my-0
            prose-a:text-[#5e6ad2] prose-a:no-underline hover:prose-a:underline
          "
          onClick={onEditDescription}
        >
          <ReactMarkdown>{issue.description}</ReactMarkdown>
        </div>
      )}

      {/* Action panel (only shown in idle state) */}
      {isIdle && (
        <div className="mt-3">
          <div className="space-y-2 max-w-lg">
            {actions.map((action) => {
              const isGated = action.requiresPlan && !hasApprovedPlan;
              return (
                <button
                  key={action.type}
                  onClick={() => onSpawn(action.type)}
                  disabled={spawnLoading || isGated}
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
                    <svg className="w-4 h-4 shrink-0 text-[#333] group-hover:text-[#555] transition-colors" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-[12px] text-[#505050] hover:text-[#808080] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
              Dismiss as not relevant or duplicate
            </button>
          </div>
        </div>
      )}
    </TimelineEntryWrapper>
  );
}
