"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FleetStatusPanel from "./FleetStatusPanel";

interface SidebarProps {
  onCreateIssue: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ onCreateIssue, isOpen, onClose }: SidebarProps) {
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

      {/* Create button */}
      <div className="px-3 mb-2">
        <button
          onClick={() => { onCreateIssue(); onClose?.(); }}
          className="w-full flex items-center gap-2 px-3 py-2 md:py-1.5 text-[14px] md:text-[13px] text-[#f5f5f5] bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded-md transition-colors"
        >
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Issue
          <kbd className="ml-auto text-[10px] text-[#666] bg-[#252525] px-1 py-0.5 rounded">
            C
          </kbd>
        </button>
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

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        <NavItem
          href="/board"
          icon={<InboxIcon />}
          label="Inbox"
          active={pathname === "/board"}
          onClick={onClose}
        />
        <NavItem
          href="/board"
          icon={<IssuesIcon />}
          label="My Issues"
          active={false}
          onClick={onClose}
        />

        <div className="pt-4 pb-2">
          <span className="px-3 text-[11px] font-medium text-[#666] uppercase tracking-wider">
            Your Team
          </span>
        </div>

        <NavItem
          href="/board"
          icon={<BoardIcon />}
          label="Issues"
          active={pathname === "/board"}
          count={0}
          onClick={onClose}
        />
        <NavItem
          href="/customers"
          icon={<CustomersIcon />}
          label="Customers"
          active={pathname === "/customers"}
          onClick={onClose}
        />
        <NavItem
          href="/board"
          icon={<ActiveIcon />}
          label="Active"
          active={false}
          onClick={onClose}
        />
        <NavItem
          href="/board"
          icon={<BacklogIcon />}
          label="Backlog"
          active={false}
          onClick={onClose}
        />
      </nav>

      {/* Fleet status */}
      <FleetStatusPanel />

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

function InboxIcon() {
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
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}

function IssuesIcon() {
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
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );
}

function BoardIcon() {
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

function BacklogIcon() {
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
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function CustomersIcon() {
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
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
