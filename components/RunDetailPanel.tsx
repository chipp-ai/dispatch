"use client";

import { useState, useEffect, useCallback } from "react";

interface AgentRunDetail {
  id: string;
  issue_id: string;
  github_run_id: string | null;
  github_run_url: string | null;
  workflow_type: string;
  status: string;
  prompt_text: string | null;
  transcript: string | null;
  report_content: string | null;
  outcome: string | null;
  outcome_summary: string | null;
  cost_usd: number;
  num_turns: number;
  model: string | null;
  tokens_used: number | null;
  pr_number: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

interface RunDetailPanelProps {
  issueId: string;
  runId: string;
  onClose: () => void;
}

export default function RunDetailPanel({
  issueId,
  runId,
  onClose,
}: RunDetailPanelProps) {
  const [run, setRun] = useState<AgentRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    report: true,
    prompt: false,
    transcript: false,
  });

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${issueId}/runs/${runId}`);
      if (res.ok) {
        setRun(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch run:", err);
    } finally {
      setLoading(false);
    }
  }, [issueId, runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4 mt-2">
        <div className="text-[12px] text-[#505050] animate-pulse">
          Loading run details...
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4 mt-2">
        <div className="text-[12px] text-[#f87171]">
          Failed to load run details
        </div>
      </div>
    );
  }

  const startDate = new Date(run.started_at);
  const endDate = run.completed_at ? new Date(run.completed_at) : null;

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4 mt-2 space-y-3">
      {/* Header with close button */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium text-[#606060] uppercase tracking-wider">
          Run Details
        </div>
        <button
          onClick={onClose}
          className="text-[#505050] hover:text-[#a0a0a0] transition-colors"
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

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-[#505050]">Started</span>
          <span className="text-[#a0a0a0] font-mono">
            {startDate.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#505050]">Completed</span>
          <span className="text-[#a0a0a0] font-mono">
            {endDate ? endDate.toLocaleString() : "--"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#505050]">Model</span>
          <span className="text-[#a0a0a0] font-mono">
            {run.model || "--"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#505050]">Tokens</span>
          <span className="text-[#a0a0a0] font-mono">
            {run.tokens_used ? run.tokens_used.toLocaleString() : "--"}
          </span>
        </div>
      </div>

      {/* GitHub link */}
      {run.github_run_url && (
        <a
          href={run.github_run_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-[#5e6ad2] hover:text-[#7b83dc] transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          View on GitHub Actions
        </a>
      )}

      {/* Report section */}
      {run.report_content && (
        <CollapsibleSection
          title="Report"
          expanded={expandedSections.report}
          onToggle={() => toggleSection("report")}
        >
          <div className="text-[12px] text-[#c0c0c0] leading-relaxed whitespace-pre-wrap font-mono bg-[#141414] rounded-md p-3 max-h-[400px] overflow-y-auto">
            {run.report_content}
          </div>
        </CollapsibleSection>
      )}

      {/* Prompt section */}
      {run.prompt_text && (
        <CollapsibleSection
          title="Prompt"
          expanded={expandedSections.prompt}
          onToggle={() => toggleSection("prompt")}
        >
          <div className="text-[12px] text-[#a0a0a0] leading-relaxed whitespace-pre-wrap font-mono bg-[#141414] rounded-md p-3 max-h-[300px] overflow-y-auto">
            {run.prompt_text}
          </div>
        </CollapsibleSection>
      )}

      {/* Transcript section */}
      {run.transcript && (
        <CollapsibleSection
          title="Transcript"
          expanded={expandedSections.transcript}
          onToggle={() => toggleSection("transcript")}
        >
          <div className="text-[11px] text-[#808080] leading-relaxed whitespace-pre-wrap font-mono bg-[#141414] rounded-md p-3 max-h-[500px] overflow-y-auto">
            {run.transcript}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#1f1f1f] pt-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-medium text-[#606060] hover:text-[#a0a0a0] transition-colors w-full text-left mb-2"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
        </svg>
        {title}
      </button>
      {expanded && children}
    </div>
  );
}
