<script lang="ts">
  /**
   * AnimatedMarkdown
   *
   * Wrapper around Markdown that provides smooth line-by-line intro animations.
   * Tracks block count (not DOM classes) to detect new blocks, since the Markdown
   * component recreates DOM elements on each render.
   *
   * Animation approach:
   * - Track how many blocks have been animated by index
   * - Only animate blocks beyond that index
   * - During streaming, skip the last block (still being typed)
   * - When streaming ends, animate the final block
   */
  import { onMount, onDestroy, tick } from "svelte";
  import Markdown from "./Markdown.svelte";
  import type { FileDownloadInfo } from "../utils/fileUtils";
  import type { CitationMetadata } from "./chat/types";

  export let content: string = "";
  export let streaming: boolean = false;
  export let onFileDownload: ((fileInfo: FileDownloadInfo) => void) | undefined = undefined;
  export let citationMetadata: CitationMetadata | undefined = undefined;
  export let applicationId: number | undefined = undefined;
  export let isBuilder: boolean = false;
  export let enableEnhancedTables: boolean = true;
  export let forceDarkMode: boolean = false;
  export let enableMathRendering: boolean = true;

  // Animation configuration
  const ANIMATION_DURATION = 300; // ms
  const ANIMATION_DISTANCE = 12; // px
  const BLOCK_SELECTORS = "p, li, pre, blockquote, h1, h2, h3, h4, h5, h6, hr, table, .video-player, .file-card, .math-block";

  let containerRef: HTMLDivElement;

  // Track if component is ready for animations (after initial mount)
  let isReady = false;

  // Track how many blocks have been animated (survives DOM recreation)
  let animatedBlockCount = 0;

  // Track previous streaming state to detect when streaming ends
  let wasStreaming = false;

  /**
   * Animate a single block element
   */
  function animateBlock(el: HTMLElement) {
    // Set initial state
    el.style.opacity = "0";
    el.style.transform = `translateY(${ANIMATION_DISTANCE}px)`;

    // Force reflow
    void el.offsetHeight;

    // Apply transition and animate to final state
    el.style.transition = `opacity ${ANIMATION_DURATION}ms ease-out, transform ${ANIMATION_DURATION}ms ease-out`;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";

    // Clean up after animation
    setTimeout(() => {
      el.style.opacity = "";
      el.style.transform = "";
      el.style.transition = "";
    }, ANIMATION_DURATION);
  }

  /**
   * Animate new blocks based on block count tracking
   */
  function animateNewBlocks() {
    if (!containerRef || !isReady) return;

    const markdownContent = containerRef.querySelector(".markdown-content");
    if (!markdownContent) return;

    const blocks = Array.from(markdownContent.querySelectorAll(BLOCK_SELECTORS)) as HTMLElement[];
    const currentBlockCount = blocks.length;

    // Determine how many blocks to animate
    // During streaming: animate all except the last (still being typed)
    // After streaming: animate all remaining
    const animateUpTo = streaming ? currentBlockCount - 1 : currentBlockCount;

    // Animate blocks from animatedBlockCount to animateUpTo
    for (let i = animatedBlockCount; i < animateUpTo; i++) {
      if (blocks[i]) {
        animateBlock(blocks[i]);
      }
    }

    // Update our count to prevent re-animating
    animatedBlockCount = Math.max(animatedBlockCount, animateUpTo);
  }

  // Watch for content changes and animate new blocks
  $: if (content && containerRef && isReady) {
    tick().then(animateNewBlocks);
  }

  // When streaming ends, animate the final block
  $: {
    if (wasStreaming && !streaming && containerRef && isReady) {
      tick().then(animateNewBlocks);
    }
    wasStreaming = streaming;
  }

  onMount(async () => {
    // Wait for initial render
    await tick();

    // Count initial blocks (don't animate them)
    const markdownContent = containerRef?.querySelector(".markdown-content");
    if (markdownContent) {
      const blocks = markdownContent.querySelectorAll(BLOCK_SELECTORS);
      animatedBlockCount = blocks.length;
    }

    wasStreaming = streaming;

    // Now ready to animate future changes
    isReady = true;
  });

  onDestroy(() => {
    // Ensure all blocks are visible (clean up any in-progress animations)
    if (containerRef) {
      const markdownContent = containerRef.querySelector(".markdown-content");
      if (markdownContent) {
        const blocks = markdownContent.querySelectorAll(BLOCK_SELECTORS);
        blocks.forEach((block) => {
          const el = block as HTMLElement;
          el.style.opacity = "";
          el.style.transform = "";
          el.style.transition = "";
        });
      }
    }
  });
</script>

<div
  class="animated-markdown-wrapper"
  class:streaming
  bind:this={containerRef}
>
  <Markdown
    {content}
    {streaming}
    {onFileDownload}
    {citationMetadata}
    {applicationId}
    {isBuilder}
    {enableEnhancedTables}
    {forceDarkMode}
    {enableMathRendering}
  />
</div>

<style>
  .animated-markdown-wrapper {
    /* Animation timing custom property */
    --block-animation-duration: 300ms;
    --block-animation-easing: ease-out;
  }

  /* Optimize during streaming */
  .animated-markdown-wrapper.streaming :global(.markdown-content) {
    contain: layout style;
  }
</style>
