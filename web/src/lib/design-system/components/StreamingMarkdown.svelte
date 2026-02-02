<script lang="ts">
  /**
   * StreamingMarkdown
   *
   * Drop-in replacement for AnimatedMarkdown using svelte-streamdown.
   * This component uses append-only DOM operations instead of full DOM replacement,
   * which preserves CSS animation state during streaming.
   *
   * svelte-streamdown wraps each token in a <span> with `display: inline-block`
   * for animations. We override to `display: inline` to prevent layout shift,
   * which still works for opacity-based animations (fade).
   *
   * See docs/streaming-animation/README.md for architecture details.
   */
  import { Streamdown } from "svelte-streamdown";
  import type { FileDownloadInfo } from "../utils/fileUtils";
  import type { CitationMetadata, AnimationConfig } from "./chat/types";
  import { DEFAULT_ANIMATION_CONFIG } from "./chat/types";

  export let content: string = "";
  export let streaming: boolean = false;
  // These props are kept for API compatibility but not all are used yet
  export let onFileDownload: ((fileInfo: FileDownloadInfo) => void) | undefined = undefined;
  export let citationMetadata: CitationMetadata | undefined = undefined;
  export let applicationId: number | undefined = undefined;
  export let isBuilder: boolean = false;
  export let enableEnhancedTables: boolean = true;
  export let forceDarkMode: boolean = false;
  export let enableMathRendering: boolean = true;

  /** Animation configuration - uses defaults if not provided */
  export let animationConfig: Partial<AnimationConfig> | undefined = undefined;

  // Merge provided config with defaults
  $: effectiveConfig = {
    enabled: animationConfig?.enabled ?? DEFAULT_ANIMATION_CONFIG.enabled,
    type: animationConfig?.type ?? DEFAULT_ANIMATION_CONFIG.type,
    duration: animationConfig?.duration ?? DEFAULT_ANIMATION_CONFIG.duration,
    tokenize: animationConfig?.tokenize ?? DEFAULT_ANIMATION_CONFIG.tokenize,
    timingFunction: animationConfig?.timingFunction ?? DEFAULT_ANIMATION_CONFIG.timingFunction,
    preserveNewlines: animationConfig?.preserveNewlines ?? DEFAULT_ANIMATION_CONFIG.preserveNewlines,
  };

  // Build the animation config for svelte-streamdown
  $: streamdownAnimation = {
    enabled: effectiveConfig.enabled,
    type: effectiveConfig.type as "fade" | "blur" | "slideUp" | "slideDown",
    duration: effectiveConfig.duration,
    tokenize: effectiveConfig.tokenize as "word" | "char",
    timingFunction: effectiveConfig.timingFunction as "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear",
    animateOnMount: false,
  };

  // Suppress unused variable warnings
  void onFileDownload;
  void citationMetadata;
  void applicationId;
  void isBuilder;
  void enableEnhancedTables;
  void enableMathRendering;

  /**
   * Pre-process content to preserve single newlines as line breaks.
   *
   * Markdown spec: single newlines within a paragraph become spaces.
   * This converts `\n` to `  \n` (soft break = two trailing spaces)
   * EXCEPT when:
   * - Already has two trailing spaces (already a soft break)
   * - Followed by another newline (paragraph break)
   * - Inside code blocks (fenced with ``` or indented)
   */
  function preserveNewlinesTransform(text: string): string {
    if (!text) return text;

    // Simple approach: convert single newlines to soft breaks
    // except for double newlines (paragraph breaks) and code blocks
    const lines = text.split('\n');
    const result: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // Track code block state
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Don't modify lines inside code blocks
      if (inCodeBlock) {
        result.push(line);
        continue;
      }

      // Check if this line already ends with soft break (two spaces)
      const hasSoftBreak = line.endsWith('  ');

      // Check if next line is empty (paragraph break)
      const isParaBreak = nextLine === '' || nextLine === undefined;

      // Check if next line starts with markdown block syntax
      const isBeforeBlock = nextLine && (
        nextLine.startsWith('#') ||    // heading
        nextLine.startsWith('>') ||    // blockquote
        nextLine.startsWith('-') ||    // list
        nextLine.startsWith('*') ||    // list
        nextLine.startsWith('1.') ||   // numbered list
        nextLine.startsWith('```') ||  // code block
        nextLine.trim() === ''         // empty line
      );

      if (!hasSoftBreak && !isParaBreak && !isBeforeBlock && i < lines.length - 1) {
        // Add soft break (two spaces) before the implicit newline
        result.push(line + '  ');
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  // Apply newline preservation to content (only if enabled in config)
  $: processedContent = effectiveConfig.preserveNewlines ? preserveNewlinesTransform(content) : content;

  // === DEBUG: Track streaming state transitions ===
  import { onMount, tick } from "svelte";

  let prevStreaming = streaming;
  let prevContentLength = content.length;
  let wrapperRef: HTMLDivElement;

  // Debug function to inspect DOM structure
  async function debugDOMStructure() {
    await tick();
    if (!wrapperRef) return;

    const spans = wrapperRef.querySelectorAll("span");
    const textNodes: { text: string; parent: string; whiteSpace: string }[] = [];

    const walker = document.createTreeWalker(wrapperRef, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      const style = parent ? window.getComputedStyle(parent) : null;
      textNodes.push({
        text: node.textContent?.slice(0, 20) || "",
        parent: parent?.tagName || "none",
        whiteSpace: style?.whiteSpace || "unknown",
      });
    }

    console.log("[StreamingMarkdown] DOM Structure:", {
      spanCount: spans.length,
      hasInlineBlockSpans: wrapperRef.querySelectorAll('span[style*="inline-block"]').length,
      sampleTextNodes: textNodes.slice(0, 5),
    });
  }

  $: {
    // Log when streaming state changes
    if (prevStreaming !== streaming) {
      console.log(`[StreamingMarkdown] streaming: ${prevStreaming} → ${streaming}`);
      if (prevStreaming && !streaming) {
        // Streaming just ended - log detailed content info
        console.log("[StreamingMarkdown] === STREAMING ENDED ===");
        console.log("[StreamingMarkdown] Final content length:", content.length);
        console.log("[StreamingMarkdown] Newline count:", (content.match(/\n/g) || []).length);
        console.log("[StreamingMarkdown] Double-newline count:", (content.match(/\n\n/g) || []).length);
        console.log("[StreamingMarkdown] Content (first 500 chars, escaped):");
        console.log(content.slice(0, 500).replace(/\n/g, "\\n").replace(/\r/g, "\\r"));

        // Inspect DOM after streaming ends
        setTimeout(() => {
          debugDOMStructure();
        }, 100);
      }
      prevStreaming = streaming;
    }

    // Log significant content changes
    if (Math.abs(content.length - prevContentLength) > 100 || (!streaming && content.length !== prevContentLength)) {
      console.log(`[StreamingMarkdown] content length: ${prevContentLength} → ${content.length} (streaming: ${streaming})`);
      prevContentLength = content.length;
    }
  }

  // Debug DOM structure on mount and when content changes significantly
  onMount(() => {
    console.log("[StreamingMarkdown] Mounted, initial content length:", content.length);
  });
  // === END DEBUG ===
</script>

<div class="streaming-markdown-wrapper" class:streaming class:dark={forceDarkMode} bind:this={wrapperRef}>
  <Streamdown
    content={processedContent}
    parseIncompleteMarkdown={true}
    animation={streamdownAnimation}
    class="markdown-content"
  />
</div>

<style>
  .streaming-markdown-wrapper {
    line-height: 1.6;
    color: inherit;
    word-break: break-word;
  }

  /* Ensure the Streamdown content inherits our styles */
  .streaming-markdown-wrapper :global(.markdown-content) {
    line-height: inherit;
    color: inherit;
  }

  /* Override svelte-streamdown's inline-block to prevent layout shift.
     Opacity-based animations (fade) still work on inline elements. */
  .streaming-markdown-wrapper :global(span[style*="inline-block"]) {
    display: inline !important;
  }

  .streaming-markdown-wrapper :global(p) {
    white-space: normal;
  }

  /* Preserve newlines only while actively streaming */
  .streaming-markdown-wrapper.streaming :global(p) {
    white-space: pre-wrap;
  }


  /* Headers */
  .streaming-markdown-wrapper :global(h1) {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    margin: var(--space-4) 0 var(--space-2) 0;
    color: inherit;
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: var(--space-2);
  }

  .streaming-markdown-wrapper :global(h2) {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin: var(--space-3) 0 var(--space-2) 0;
    color: inherit;
  }

  .streaming-markdown-wrapper :global(h3) {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: var(--space-2) 0;
    color: inherit;
  }

  .streaming-markdown-wrapper :global(h4),
  .streaming-markdown-wrapper :global(h5),
  .streaming-markdown-wrapper :global(h6) {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: var(--space-2) 0;
    color: inherit;
  }

  /* Paragraphs */
  .streaming-markdown-wrapper :global(p) {
    margin: var(--space-2) 0;
  }

  .streaming-markdown-wrapper :global(p:first-child) {
    margin-top: 0;
  }

  .streaming-markdown-wrapper :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Text formatting */
  .streaming-markdown-wrapper :global(strong) {
    font-weight: var(--font-semibold);
    color: inherit;
  }

  .streaming-markdown-wrapper :global(em) {
    font-style: italic;
  }

  .streaming-markdown-wrapper :global(del) {
    text-decoration: line-through;
    color: hsl(var(--muted-foreground));
  }

  /* Inline code */
  .streaming-markdown-wrapper :global(code) {
    padding: 2px 6px;
    background: hsl(var(--muted));
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.875em;
    color: inherit;
  }

  /* Code blocks */
  .streaming-markdown-wrapper :global(pre) {
    margin: var(--space-4) 0;
    padding: var(--space-4);
    background: hsl(var(--muted));
    border-radius: var(--radius-md);
    border: 1px solid hsl(var(--border));
    overflow-x: auto;
  }

  .streaming-markdown-wrapper :global(pre code) {
    padding: 0;
    background: transparent;
    border-radius: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  /* Links */
  .streaming-markdown-wrapper :global(a) {
    color: hsl(var(--primary));
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color var(--transition-fast);
  }

  .streaming-markdown-wrapper :global(a:hover) {
    color: hsl(var(--primary) / 0.8);
  }

  /* Lists */
  .streaming-markdown-wrapper :global(ul),
  .streaming-markdown-wrapper :global(ol) {
    margin: var(--space-2) 0;
    padding-left: var(--space-6);
  }

  .streaming-markdown-wrapper :global(ul) {
    list-style-type: disc;
  }

  .streaming-markdown-wrapper :global(ol) {
    list-style-type: decimal;
  }

  .streaming-markdown-wrapper :global(li) {
    margin: var(--space-1) 0;
  }

  /* Blockquotes */
  .streaming-markdown-wrapper :global(blockquote) {
    border-left: 3px solid hsl(var(--primary) / 0.5);
    padding-left: var(--space-4);
    margin: var(--space-4) 0;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  /* Horizontal rule */
  .streaming-markdown-wrapper :global(hr) {
    border: none;
    border-top: 1px solid hsl(var(--border));
    margin: var(--space-6) 0;
  }

  /* Tables */
  .streaming-markdown-wrapper :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-4) 0;
    font-size: var(--text-sm);
  }

  .streaming-markdown-wrapper :global(th),
  .streaming-markdown-wrapper :global(td) {
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    text-align: left;
  }

  .streaming-markdown-wrapper :global(th) {
    background: hsl(var(--muted));
    font-weight: var(--font-semibold);
  }

  /* Images */
  .streaming-markdown-wrapper :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-md);
    margin: var(--space-4) 0;
  }

  /* Dark mode */
  .streaming-markdown-wrapper.dark {
    color: #e5e5ea;
  }

  .streaming-markdown-wrapper.dark :global(h1),
  .streaming-markdown-wrapper.dark :global(h2),
  .streaming-markdown-wrapper.dark :global(h3),
  .streaming-markdown-wrapper.dark :global(h4),
  .streaming-markdown-wrapper.dark :global(h5),
  .streaming-markdown-wrapper.dark :global(h6) {
    color: #f0f0f0;
  }

  .streaming-markdown-wrapper.dark :global(strong) {
    color: #f0f0f0;
  }

  .streaming-markdown-wrapper.dark :global(code) {
    background: #2a2a2a;
    color: #e5e5ea;
  }

  .streaming-markdown-wrapper.dark :global(pre) {
    background: #2a2a2a;
    border-color: #3a3a3a;
  }

  .streaming-markdown-wrapper.dark :global(blockquote) {
    color: #a0a0a5;
  }

  .streaming-markdown-wrapper.dark :global(th) {
    background: #2a2a2a;
  }

  .streaming-markdown-wrapper.dark :global(th),
  .streaming-markdown-wrapper.dark :global(td) {
    border-color: #3a3a3a;
  }
</style>
