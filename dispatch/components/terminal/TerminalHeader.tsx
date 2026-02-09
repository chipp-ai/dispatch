"use client";

import { useState, useEffect, useCallback } from "react";
import { BRAND_BRAILLE } from "@/lib/brand/logo-braille";

interface BoardStats {
  total_issues: number;
  active_agents: number;
  daily_cost_usd: string;
  daily_spawns: string;
}

interface TerminalHeaderProps {
  sessionId: string | null;
  onClear: () => void;
}

export default function TerminalHeader({
  sessionId,
  onClear,
}: TerminalHeaderProps) {
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [showLogo, setShowLogo] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const [issuesRes, statusesRes] = await Promise.all([
        fetch("/api/issues"),
        fetch("/api/statuses"),
      ]);
      if (!issuesRes.ok || !statusesRes.ok) return;

      const issues = await issuesRes.json();
      const statuses = await statusesRes.json();

      const activeAgents = issues.filter(
        (i: { agent_status?: string }) =>
          i.agent_status === "investigating" ||
          i.agent_status === "implementing" ||
          i.agent_status === "testing" ||
          i.agent_status === "researching"
      ).length;

      const totalCost = issues.reduce(
        (sum: number, i: { cost_usd?: number | null }) =>
          sum + (i.cost_usd || 0),
        0
      );

      setStats({
        total_issues: issues.length,
        active_agents: activeAgents,
        daily_cost_usd: totalCost.toFixed(2),
        daily_spawns: `${statuses.length} statuses`,
      });
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const model = process.env.NEXT_PUBLIC_ORCHESTRATOR_MODEL || "opus-4.6";
  const shortSession = sessionId ? sessionId.slice(0, 8) : "new";

  return (
    <div className="border-b border-[#2a2200] bg-[#0e0d08]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Logo icon */}
          <button
            onClick={() => setShowLogo(!showLogo)}
            className="relative group"
            title={process.env.NEXT_PUBLIC_APP_NAME || "Dispatch"}
          >
            <div className="w-5 h-5 rounded bg-[#f9db00] flex items-center justify-center text-[9px] font-bold text-black leading-none group-hover:brightness-110 transition-all">
              {(process.env.NEXT_PUBLIC_APP_NAME || "Dispatch")[0]}
            </div>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono font-semibold text-[#f9db00]">
              {(process.env.NEXT_PUBLIC_APP_NAME || "Dispatch").toLowerCase()}
            </span>
            <span className="text-[11px] font-mono text-[#665e00]">
              dispatch
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono text-[#665e00]">
          <span>{model}</span>
          <span className="text-[#332f00]">|</span>
          <span>{shortSession}</span>
          <button
            onClick={onClear}
            className="text-[#665e00] hover:text-[#f9db00] transition-colors"
            title="New session"
          >
            new
          </button>
        </div>
      </div>

      {/* ASCII logo (collapsible) */}
      {showLogo && (
        <div className="px-4 py-2 border-t border-[#2a2200]">
          <pre className="text-[11px] text-[#f9db00] leading-[1.1] opacity-60">
            {BRAND_BRAILLE}
          </pre>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-[#1a1800] text-[10px] font-mono text-[#665e00]">
          <span>
            <span className="text-[#f9db00]">{stats.total_issues}</span> missions
          </span>
          <span>
            <span className="text-[#f9db00]">{stats.active_agents}</span> agent{stats.active_agents !== 1 ? "s" : ""}
          </span>
          <span>
            <span className="text-[#f9db00]">${stats.daily_cost_usd}</span> total
          </span>
        </div>
      )}
    </div>
  );
}
