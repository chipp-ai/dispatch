"use client";

import { useState, useRef, useEffect } from "react";

interface RetrySpawnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    type: "investigate" | "implement";
    additional_context?: string;
    force?: boolean;
  }) => Promise<void>;
  issueIdentifier: string;
  hasApprovedPlan: boolean;
  lastOutcome?: string | null;
  outcomeSummary?: string | null;
}

export default function RetrySpawnDialog({
  isOpen,
  onClose,
  onSubmit,
  issueIdentifier,
  hasApprovedPlan,
  lastOutcome,
  outcomeSummary,
}: RetrySpawnDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [type, setType] = useState<"investigate" | "implement">("investigate");
  const [context, setContext] = useState("");
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContext("");
      setForce(false);
      setLoading(false);
      setType(hasApprovedPlan ? "implement" : "investigate");
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen, hasApprovedPlan]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        type,
        additional_context: context.trim() || undefined,
        force,
      });
      onClose();
    } catch {
      // Error handling is done by parent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-end md:items-start justify-center md:pt-[15vh] p-0 md:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#1a1a1a] border border-[#333] rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#252525]">
          <div className="flex items-center gap-2">
            <RetryIcon />
            <span className="text-[13px] font-medium text-[#f5f5f5]">
              Retry {issueIdentifier}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#666] hover:text-[#888] transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Previous outcome context */}
          {lastOutcome && (
            <div className="px-5 pt-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#151515] border border-[#252525]">
                <span className="text-[11px] text-[#666]">Last run:</span>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: outcomeColor(lastOutcome) }}
                >
                  {outcomeLabel(lastOutcome)}
                </span>
                {outcomeSummary && (
                  <span className="text-[11px] text-[#555] truncate">
                    - {outcomeSummary}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Workflow type */}
          <div className="px-5 pt-3">
            <label className="text-[11px] text-[#666] mb-1.5 block">
              Workflow
            </label>
            <div className="flex gap-2">
              <TypeButton
                selected={type === "investigate"}
                onClick={() => setType("investigate")}
                label="Investigate"
                description="Explore and plan"
              />
              <TypeButton
                selected={type === "implement"}
                onClick={() => setType("implement")}
                label="Implement"
                description="Write code"
                disabled={!hasApprovedPlan}
              />
            </div>
          </div>

          {/* Additional context */}
          <div className="px-5 pt-3 pb-2">
            <label className="text-[11px] text-[#666] mb-1.5 block">
              Additional instructions (optional)
            </label>
            <textarea
              ref={textareaRef}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Try a different approach... Focus on the error in routes/health.ts... Consider using the existing helper..."
              rows={3}
              className="w-full text-[13px] text-[#ccc] bg-[#151515] border border-[#252525] rounded-lg px-3 py-2 placeholder-[#444] outline-none focus:border-[#5e6ad2] resize-none"
            />
          </div>

          {/* Force override */}
          <div className="px-5 pb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded border-[#333] bg-[#151515] text-[#5e6ad2] focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-[11px] text-[#666]">
                Force (bypass budget/concurrency limits)
              </span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#252525]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-[#888] hover:text-[#ccc] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-[12px] font-medium text-white bg-[#5e6ad2] hover:bg-[#6b74db] disabled:bg-[#333] disabled:text-[#666] rounded-md transition-colors"
            >
              {loading ? "Spawning..." : "Spawn Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TypeButton({
  selected,
  onClick,
  label,
  description,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-3 py-2 rounded-lg border text-left transition-all ${
        selected
          ? "border-[#5e6ad2] bg-[#5e6ad215]"
          : disabled
          ? "border-[#252525] opacity-40 cursor-not-allowed"
          : "border-[#252525] hover:border-[#333]"
      }`}
    >
      <div
        className={`text-[12px] font-medium ${
          selected ? "text-[#8b95e6]" : "text-[#888]"
        }`}
      >
        {label}
      </div>
      <div className="text-[10px] text-[#555]">{description}</div>
    </button>
  );
}

function outcomeColor(outcome: string): string {
  const colors: Record<string, string> = {
    completed: "#4ade80",
    no_changes_needed: "#60a5fa",
    blocked: "#f87171",
    needs_human_decision: "#facc15",
    investigation_complete: "#a78bfa",
    failed: "#f87171",
  };
  return colors[outcome] || "#666";
}

function outcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    completed: "Completed",
    no_changes_needed: "No Changes Needed",
    blocked: "Blocked",
    needs_human_decision: "Needs Decision",
    investigation_complete: "Investigation Done",
    failed: "Failed",
  };
  return labels[outcome] || outcome;
}

function RetryIcon() {
  return (
    <svg
      className="w-4 h-4 text-[#888]"
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
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
