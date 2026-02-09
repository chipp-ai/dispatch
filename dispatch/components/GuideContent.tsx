"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { guideContent } from "@/lib/guide-content";
import { docsMarkdownComponents } from "@/components/docsMarkdownComponents";

interface TocItem {
  id: string;
  text: string;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Extract H2 headings from markdown source for the table of contents. */
function extractHeadings(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const match = line.match(/^## (.+)$/);
    if (match) {
      const text = match[1].trim();
      headings.push({ id: slugify(text), text });
    }
  }
  return headings;
}

export default function GuideContent() {
  const headings = useMemo(() => extractHeadings(guideContent), []);
  const [activeId, setActiveId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    // Wait for markdown to render
    const timer = setTimeout(() => {
      const headingElements = container.querySelectorAll("h2[id]");
      if (headingElements.length === 0) return;

      const observer = new IntersectionObserver(
        (entries) => {
          // Find the topmost visible heading
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

          if (visible.length > 0) {
            setActiveId(visible[0].target.id);
          }
        },
        {
          root: container,
          rootMargin: "-10% 0px -70% 0px",
          threshold: 0,
        }
      );

      headingElements.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  function scrollToHeading(id: string) {
    const container = contentRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Prose content -- centered */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-6 md:px-10 py-8"
      >
        <div className="max-w-3xl mx-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={docsMarkdownComponents}
          >
            {guideContent}
          </ReactMarkdown>
          {/* Bottom padding so last section can scroll into view */}
          <div className="h-40" />
        </div>
      </div>

      {/* Table of Contents -- right side, desktop only */}
      <nav className="hidden lg:block w-[220px] flex-shrink-0 border-l border-[#1f1f1f] overflow-y-auto py-6 px-4">
        <div className="sticky top-0">
          <span className="text-[11px] font-medium text-[#555] uppercase tracking-wider">
            On this page
          </span>
          <ul className="mt-3 space-y-0.5">
            {headings.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => scrollToHeading(h.id)}
                  className={`w-full text-left px-2 py-1.5 text-[12px] rounded transition-colors leading-snug ${
                    activeId === h.id
                      ? "text-[#e0e0e0] bg-[#1a1a1a]"
                      : "text-[#666] hover:text-[#aaa] hover:bg-[#141414]"
                  }`}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
