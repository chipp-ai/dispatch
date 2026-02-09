/**
 * Documentation-style markdown component overrides for react-markdown.
 * Designed for the /guide page -- sans-serif body text, proper heading
 * hierarchy with id anchors, dark-themed table styling, and generous spacing.
 */

import type { Components } from "react-markdown";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractText((children as React.ReactElement).props.children);
  }
  return "";
}

export const docsMarkdownComponents: Partial<Components> = {
  h1: ({ children }) => {
    const id = slugify(extractText(children));
    return (
      <h1
        id={id}
        className="text-[24px] font-bold text-[#f5f5f5] mt-10 mb-4 pb-3 border-b border-[#252525] scroll-mt-8"
      >
        {children}
      </h1>
    );
  },

  h2: ({ children }) => {
    const id = slugify(extractText(children));
    return (
      <h2
        id={id}
        className="text-[18px] font-semibold text-[#e8e8e8] mt-10 mb-3 pb-2 border-b border-[#1f1f1f] scroll-mt-8"
      >
        {children}
      </h2>
    );
  },

  h3: ({ children }) => {
    const id = slugify(extractText(children));
    return (
      <h3
        id={id}
        className="text-[15px] font-semibold text-[#d0d0d0] mt-6 mb-2 scroll-mt-8"
      >
        {children}
      </h3>
    );
  },

  h4: ({ children }) => (
    <h4 className="text-[14px] font-semibold text-[#c0c0c0] mt-4 mb-1.5">
      {children}
    </h4>
  ),

  p: ({ children }) => (
    <p className="text-[14px] text-[#a0a0a0] leading-[1.7] my-3">
      {children}
    </p>
  ),

  strong: ({ children }) => (
    <strong className="text-[#e0e0e0] font-semibold">{children}</strong>
  ),

  em: ({ children }) => (
    <em className="text-[#b0b0b0] italic">{children}</em>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[#7b83dc] hover:text-[#9ba1e8] underline underline-offset-2 transition-colors"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  ),

  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className || ""} text-[13px]`}>{children}</code>
      );
    }
    return (
      <code className="text-[#c4b5fd] bg-[#1a1a2e] px-1.5 py-0.5 rounded text-[13px] font-mono">
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="my-4 bg-[#0a0a0f] border border-[#1f1f2f] rounded-lg p-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
      {children}
    </pre>
  ),

  ul: ({ children }) => (
    <ul className="my-3 pl-5 space-y-1.5">{children}</ul>
  ),

  ol: ({ children }) => (
    <ol className="my-3 pl-5 space-y-1.5 list-decimal">{children}</ol>
  ),

  li: ({ children }) => (
    <li className="text-[14px] text-[#a0a0a0] leading-[1.6] marker:text-[#555]">
      {children}
    </li>
  ),

  hr: () => <div className="my-8 border-t border-[#1f1f1f]" />,

  blockquote: ({ children }) => (
    <blockquote className="my-4 pl-4 border-l-2 border-[#5e6ad2]/40 text-[#808080] italic">
      {children}
    </blockquote>
  ),

  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-[#1f1f1f]">
      <table className="w-full text-[13px]">{children}</table>
    </div>
  ),

  thead: ({ children }) => (
    <thead className="bg-[#141414] border-b border-[#252525]">
      {children}
    </thead>
  ),

  tbody: ({ children }) => <tbody>{children}</tbody>,

  tr: ({ children }) => (
    <tr className="border-b border-[#1a1a1a] last:border-0">{children}</tr>
  ),

  th: ({ children }) => (
    <th className="text-left px-3 py-2 text-[12px] font-semibold text-[#888] uppercase tracking-wide">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="px-3 py-2 text-[13px] text-[#a0a0a0]">{children}</td>
  ),
};
