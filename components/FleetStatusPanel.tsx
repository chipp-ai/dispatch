"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SpawnStats {
  active: number;
  budget: {
    error_fix: { used: number; max: number };
    prd: { used: number; max: number };
  };
  dailyCost: number;
  staleCount?: number;
  outcomes: Record<string, number>;
}

interface ActiveSpawn {
  id: string;
  identifier: string;
  title: string;
  spawn_type: string | null;
  spawn_started_at: string | null;
  agent_status: string | null;
  cost_usd: number | null;
}

export default function FleetStatusPanel() {
  const [stats, setStats] = useState<SpawnStats | null>(null);
  const [activeSpawns, setActiveSpawns] = useState<ActiveSpawn[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<number | null>(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const [statsRes, activeRes] = await Promise.all([
        fetch("/api/spawns/stats"),
        fetch("/api/spawns/active"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (activeRes.ok) setActiveSpawns(await activeRes.json());
    } catch {
      // Silently fail - panel is informational
    }
  }

  async function handleCleanup() {
    setCleaningUp(true);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/spawns/cleanup", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCleanupResult(data.cleaned);
        fetchStats(); // Refresh stats after cleanup
      }
    } catch {
      // Silently fail
    } finally {
      setCleaningUp(false);
    }
  }

  if (!stats) return null;

  const totalBudgetUsed =
    stats.budget.error_fix.used + stats.budget.prd.used;
  const totalBudgetMax =
    stats.budget.error_fix.max + stats.budget.prd.max;

  return (
    <div className="px-2 mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 rounded-md text-left hover:bg-[#1a1a1a] transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FleetIcon />
            <span className="text-[12px] font-medium text-[#888] group-hover:text-[#ccc]">
              Fleet
            </span>
          </div>
          <div className="flex items-center gap-2">
            {stats.active > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[11px] text-green-400 font-medium">
                  {stats.active}
                </span>
              </span>
            )}
            <span className="text-[10px] text-[#555]">
              {totalBudgetUsed}/{totalBudgetMax}
            </span>
          </div>
        </div>

        {/* Budget bars */}
        <div className="mt-1.5 flex gap-1">
          <BudgetBar
            label="EF"
            used={stats.budget.error_fix.used}
            max={stats.budget.error_fix.max}
            color="#60a5fa"
          />
          <BudgetBar
            label="PRD"
            used={stats.budget.prd.used}
            max={stats.budget.prd.max}
            color="#a78bfa"
          />
        </div>

        {stats.dailyCost > 0 && (
          <div className="mt-1 text-[10px] text-[#555]">
            ${stats.dailyCost.toFixed(2)} today
          </div>
        )}
      </button>

      {/* Expanded: show active spawns */}
      {expanded && activeSpawns.length > 0 && (
        <div className="mt-1 space-y-0.5 px-1">
          {activeSpawns.map((spawn) => (
            <Link
              key={spawn.id}
              href={`/issue/${spawn.identifier}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-[#1a1a1a] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <span className="text-[#666] font-mono flex-shrink-0">
                {spawn.identifier}
              </span>
              <span className="text-[#888] truncate flex-1">
                {spawn.title}
              </span>
              {spawn.spawn_started_at && (
                <span className="text-[10px] text-[#555] flex-shrink-0">
                  {formatDuration(spawn.spawn_started_at)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {expanded && activeSpawns.length === 0 && stats.active === 0 && (
        <div className="mt-1 px-3 py-2 text-[11px] text-[#555]">
          No agents running
        </div>
      )}

      {/* Stale run cleanup */}
      {expanded && (stats.staleCount ?? 0) > 0 && (
        <div className="mt-1.5 px-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCleanup();
            }}
            disabled={cleaningUp}
            className="w-full px-2 py-1.5 rounded text-[11px] font-medium text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
          >
            {cleaningUp
              ? "Cleaning up..."
              : `Clean up ${stats.staleCount} stale run${stats.staleCount === 1 ? "" : "s"}`}
          </button>
          {cleanupResult !== null && (
            <div className="mt-1 text-[10px] text-[#888]">
              Cleaned {cleanupResult} run{cleanupResult === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}

      {/* Outcome summary for today */}
      {expanded && Object.keys(stats.outcomes).length > 0 && (
        <div className="mt-1.5 px-3 pb-1">
          <div className="text-[10px] text-[#555] mb-1">Today</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(stats.outcomes).map(([outcome, count]) => (
              <span
                key={outcome}
                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  color: outcomeColor(outcome),
                  backgroundColor: `${outcomeColor(outcome)}15`,
                }}
              >
                {count} {outcomeShortLabel(outcome)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetBar({
  label,
  used,
  max,
  color,
}: {
  label: string;
  used: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const isExhausted = used >= max;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-[#555]">{label}</span>
        <span
          className="text-[9px]"
          style={{ color: isExhausted ? "#f87171" : "#555" }}
        >
          {used}/{max}
        </span>
      </div>
      <div className="h-1 rounded-full bg-[#252525] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: isExhausted ? "#f87171" : color,
          }}
        />
      </div>
    </div>
  );
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60}m`;
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

function outcomeShortLabel(outcome: string): string {
  const labels: Record<string, string> = {
    completed: "done",
    no_changes_needed: "no-op",
    blocked: "blocked",
    needs_human_decision: "decision",
    investigation_complete: "investigated",
    failed: "failed",
  };
  return labels[outcome] || outcome;
}

function FleetIcon() {
  return (
    <svg
      className="w-4 h-4 text-[#666]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}
