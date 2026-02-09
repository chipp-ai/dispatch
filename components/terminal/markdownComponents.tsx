/**
 * Shared markdown renderers for terminal-style content.
 * Extracted from TerminalViewer.tsx for reuse in the orchestrator terminal.
 */

import type { Components } from "react-markdown";

export const terminalMarkdownComponents: Partial<Components> = {
  h1: ({ children }) => (
    <div className="mt-4 mb-2 flex items-center gap-2">
      <span className="text-[#4ade80] text-[10px] font-mono select-none shrink-0">
        {">>"}
      </span>
      <span className="text-[#e0e0e0] text-[13px] font-bold font-mono">
        {children}
      </span>
    </div>
  ),
  h2: ({ children }) => (
    <div className="mt-3 mb-1.5 flex items-center gap-2">
      <span className="text-[#4ade80] text-[10px] font-mono select-none shrink-0">
        {">"}
      </span>
      <span className="text-[#e0e0e0] text-[13px] font-semibold font-mono">
        {children}
      </span>
    </div>
  ),
  h3: ({ children }) => (
    <div className="mt-2.5 mb-1 text-[#c0c0c0] text-[12px] font-semibold font-mono">
      {children}
    </div>
  ),
  p: ({ children }) => (
    <p className="text-[#b0b0b0] text-[12px] leading-relaxed my-1 font-mono">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="text-[#e0e0e0] font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-[#a0a0a0] italic">{children}</em>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className || ""} text-[11px]`}>{children}</code>
      );
    }
    return (
      <code className="text-[#c4b5fd] bg-[#1a1a2e] px-1 py-0.5 rounded text-[11px] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 bg-[#050510] border border-[#1a2a1a] rounded-md p-3 overflow-x-auto text-[11px] leading-relaxed font-mono">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="my-1 pl-4 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 pl-4 space-y-0.5 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[#b0b0b0] text-[12px] font-mono marker:text-[#4ade80]">
      {children}
    </li>
  ),
  hr: () => <div className="my-3 border-t border-dashed border-[#252525]" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[#60a5fa] hover:text-[#93c5fd] underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 pl-3 border-l-2 border-[#4ade80]/30 text-[#808080]">
      {children}
    </blockquote>
  ),
};
