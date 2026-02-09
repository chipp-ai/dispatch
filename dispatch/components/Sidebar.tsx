"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FleetStatusPanel from "./FleetStatusPanel";

interface SidebarProps {
  onOpenGuide?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  viewType?: "terminal" | "board";
  onViewTypeChange?: (viewType: "terminal" | "board") => void;
}

export default function Sidebar({ onOpenGuide, isOpen, onClose, viewType, onViewTypeChange }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop - always rendered, controlled via CSS to avoid React event timing issues */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-200 ${
          isOpen ? "bg-black/60 pointer-events-auto" : "bg-transparent pointer-events-none"
        }`}
        onClick={onClose}
      />

      <div className={`
        fixed inset-y-0 left-0 z-50 w-[260px] bg-[#101010] border-r border-[#252525] flex flex-col
        transform transition-transform duration-200 ease-out
        md:relative md:translate-x-0 md:w-[220px] md:z-auto
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
      {/* Workspace header */}
      <div className="p-3">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1a1a1a] cursor-pointer">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
            C
          </div>
          <span className="text-[13px] font-medium text-[#f5f5f5]">Chipp</span>
          <svg
            className="w-3 h-3 text-[#666] ml-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#666] bg-[#1a1a1a] border border-[#252525] rounded-md cursor-pointer hover:border-[#333]">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Search
          <kbd className="ml-auto text-[10px] bg-[#252525] px-1 py-0.5 rounded">
            /
          </kbd>
        </div>
      </div>

      {/* View toggle */}
      {onViewTypeChange && (
        <div className="px-3 mb-3">
          <div className="flex items-center bg-[#1a1a1a] border border-[#252525] rounded-md p-0.5">
            <button
              onClick={() => { onViewTypeChange("terminal"); onClose?.(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12px] rounded transition-colors ${
                viewType === "terminal"
                  ? "bg-[#252525] text-[#f5f5f5]"
                  : "text-[#666] hover:text-[#888]"
              }`}
            >
              <TerminalIcon />
              Terminal
            </button>
            <button
              onClick={() => { onViewTypeChange("board"); onClose?.(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12px] rounded transition-colors ${
                viewType === "board"
                  ? "bg-[#252525] text-[#f5f5f5]"
                  : "text-[#666] hover:text-[#888]"
              }`}
            >
              <BoardIcon />
              Board
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        <NavItem
          href="/board"
          icon={<CommandIcon />}
          label="Command"
          active={pathname === "/board"}
          onClick={onClose}
        />

        <div className="pt-4 pb-2">
          <span className="px-3 text-[11px] font-medium text-[#666] uppercase tracking-wider">
            Fleet
          </span>
        </div>

        <NavItem
          href="/board"
          icon={<MissionsIcon />}
          label="Missions"
          active={pathname === "/board"}
          count={0}
          onClick={onClose}
        />
        <NavItem
          href="/board"
          icon={<ActiveIcon />}
          label="Active Agents"
          active={false}
          onClick={onClose}
        />
        <NavItem
          href="/board"
          icon={<CompletedIcon />}
          label="Completed"
          active={false}
          onClick={onClose}
        />
      </nav>

      {/* Fleet status */}
      <FleetStatusPanel />

      {/* Guide button */}
      {onOpenGuide && (
        <div className="px-2 pb-1">
          <button
            onClick={() => { onOpenGuide(); onClose?.(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-[#666] hover:text-[#ccc] hover:bg-[#1a1a1a] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Guide
          </button>
        </div>
      )}

      {/* Bottom section */}
      <div className="p-3 border-t border-[#252525]">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1a1a1a] cursor-pointer">
          <div className="w-5 h-5 rounded-full bg-[#333] flex items-center justify-center text-[10px] font-medium text-[#888]">
            A
          </div>
          <span className="text-[12px] text-[#888]">Agent</span>
        </div>
      </div>
    </div>
    </>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick?: () => void;
}

function NavItem({ href, icon, label, active, count, onClick }: NavItemProps) {
  return (
    <Link href={href} onClick={onClick}>
      <div
        className={`flex items-center gap-2 px-3 py-2 md:py-1.5 rounded-md text-[14px] md:text-[13px] transition-colors ${
          active
            ? "bg-[#1f1f1f] text-[#f5f5f5]"
            : "text-[#888] hover:bg-[#1a1a1a] hover:text-[#ccc]"
        }`}
      >
        <span className="w-5 h-5 md:w-4 md:h-4">{icon}</span>
        <span>{label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-[11px] text-[#666]">{count}</span>
        )}
      </div>
    </Link>
  );
}

function CommandIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M4 6l2 2-2 2M7 10h4"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MissionsIcon() {
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
        strokeWidth={1.5}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

function ActiveIcon() {
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
        strokeWidth={1.5}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}

function CompletedIcon() {
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
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M4 6l2 2-2 2M7 10h4"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
