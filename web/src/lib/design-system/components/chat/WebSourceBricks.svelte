<script lang="ts">
  /**
   * WebSourceBricks
   *
   * Compact row of source domain "bricks" for web tools (browseWeb, retrieveUrl).
   * Shows shimmer skeleton pills while loading, then staggered fade-in domain pills
   * with favicons when complete.
   *
   * For `retrieveUrl` (single URL), shows a rich site card instead of pills.
   * For `browseWeb` (multiple URLs), shows the pill layout.
   *
   * When `collapsed` is true (text has started streaming after this tool),
   * the bricks collapse into a Dia-style summary line:
   *   "Read weather.com, accuweather.com, and 3 more >"
   * Clicking the chevron expands to show the full brick list (or site card).
   */
  import { onDestroy } from "svelte";
  import type { ToolState } from "./types";

  export let toolName: string;
  export let state: ToolState = "call";
  export let input: unknown = null;
  export let output: unknown = null;
  export let error: string | null = null;
  /** When true, collapses bricks into a summary line */
  export let collapsed: boolean = false;

  interface SourceInfo {
    domain: string;
    url: string;
    faviconUrl: string;
  }

  let expanded = false;

  /** How many domains to show inline in collapsed summary */
  const INLINE_COUNT = 2;

  /** Minimum time (ms) expanded bricks are visible before collapsing */
  const COLLAPSE_DELAY = 500;

  /**
   * Delayed collapse visual state.
   * When `collapsed` becomes true, we wait COLLAPSE_DELAY ms before
   * switching the visual from expanded bricks to collapsed summary.
   * This lets the user briefly see the source bricks before they compress.
   */
  let showCollapsedVisual = false;
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;

  $: {
    const shouldCollapse = collapsed && state === "result" && sources.length > 0;
    if (shouldCollapse && !showCollapsedVisual) {
      if (!collapseTimer) {
        collapseTimer = setTimeout(() => {
          showCollapsedVisual = true;
          collapseTimer = null;
        }, COLLAPSE_DELAY);
      }
    } else if (!shouldCollapse) {
      showCollapsedVisual = false;
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    }
  }

  onDestroy(() => {
    if (collapseTimer) clearTimeout(collapseTimer);
  });

  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  function extractPath(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return path === "/" ? "" : path;
    } catch {
      return "";
    }
  }

  function extractSources(
    toolName: string,
    input: unknown,
    output: unknown
  ): SourceInfo[] {
    const seen = new Set<string>();
    const sources: SourceInfo[] = [];

    if (toolName === "browseWeb" && output) {
      const data = typeof output === "string" ? tryParse(output) : output;
      const organic = (data as Record<string, unknown>)?.organic;
      if (Array.isArray(organic)) {
        for (const item of organic) {
          const link = (item as Record<string, unknown>)?.link;
          if (typeof link === "string") {
            const domain = extractDomain(link);
            if (!seen.has(domain)) {
              seen.add(domain);
              sources.push({
                domain,
                url: link,
                faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
              });
            }
          }
        }
      }
    }

    if (toolName === "retrieveUrl" && input) {
      const data = typeof input === "string" ? tryParse(input) : input;
      const url = (data as Record<string, unknown>)?.url;
      if (typeof url === "string") {
        const domain = extractDomain(url);
        if (!seen.has(domain)) {
          seen.add(domain);
          sources.push({
            domain,
            url,
            faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
          });
        }
      }
    }

    return sources;
  }

  function tryParse(str: string): unknown {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function buildSummary(sources: SourceInfo[]): string {
    if (sources.length === 0) return "";
    if (sources.length <= INLINE_COUNT) {
      return sources.map((s) => s.domain).join(", ");
    }
    const shown = sources.slice(0, INLINE_COUNT).map((s) => s.domain).join(", ");
    const remaining = sources.length - INLINE_COUNT;
    return `${shown}, and ${remaining} more`;
  }

  function toggleExpanded() {
    expanded = !expanded;
  }

  $: isSingleSite = toolName === "retrieveUrl";
  $: isLoading = state === "partial-call" || state === "call";
  $: isComplete = state === "result";
  $: isError = state === "error";
  $: sources = extractSources(toolName, input, output);
  $: label = toolName === "browseWeb" ? "Searching" : "Reading";
  $: completeLabel = "Read";
  $: errorLabel =
    toolName === "browseWeb" ? "Search failed" : "Could not read page";
  $: summary = buildSummary(sources);
  $: siteUrl = sources.length > 0 ? sources[0].url : "";
  $: sitePath = siteUrl ? extractPath(siteUrl) : "";
</script>

<div class="web-sources">
  {#if isLoading}
    {#if isSingleSite && sources.length > 0}
      <!-- retrieveUrl loading: inline text with domain -->
      <span class="site-card loading">
        <img src={sources[0].faviconUrl} alt="" class="site-favicon" width="14" height="14" />
        <span class="site-domain">{sources[0].domain}</span>
        <span class="site-reading">Reading...</span>
      </span>
    {:else if isSingleSite}
      <!-- retrieveUrl loading before input parsed: skeleton -->
      <span class="site-card loading">
        <div class="favicon-skeleton"></div>
        <div class="domain-skeleton"></div>
        <span class="site-reading">Reading...</span>
      </span>
    {:else}
      <!-- browseWeb: existing pill skeletons -->
      <span class="label loading-label">{label}...</span>
      <div class="bricks">
        <div class="brick skeleton"><div class="shimmer"></div></div>
        <div class="brick skeleton"><div class="shimmer"></div></div>
        <div class="brick skeleton"><div class="shimmer"></div></div>
      </div>
    {/if}
  {:else if isError}
    <span class="label error-label">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      {errorLabel}
    </span>
  {:else if showCollapsedVisual}
    <!-- Collapsed Dia-style summary (fades in after brief display) -->
    <button class="summary-toggle" on:click={toggleExpanded}>
      <span class="summary-text">{completeLabel} {summary}</span>
      <svg
        class="chevron"
        class:chevron-open={expanded}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    {#if expanded}
      {#if isSingleSite && sources.length > 0}
        <!-- Single site: expand to compact inline card -->
        <a href={siteUrl} target="_blank" rel="noopener noreferrer" class="site-card complete" title={siteUrl}>
          <img src={sources[0].faviconUrl} alt="" class="site-favicon" width="14" height="14" />
          <span class="site-domain">{sources[0].domain}</span>
          {#if sitePath}
            <span class="site-path">{sitePath}</span>
          {/if}
        </a>
      {:else}
        <!-- browseWeb: expand to pill bricks -->
        <div class="bricks expanded-bricks">
          {#each sources as source, i}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              class="brick source-brick"
              style="animation-delay: {i * 40}ms"
              title={source.url}
            >
              <img
                src={source.faviconUrl}
                alt=""
                class="favicon"
                width="14"
                height="14"
                loading="lazy"
              />
              <span class="domain">{source.domain}</span>
            </a>
          {/each}
        </div>
      {/if}
    {/if}
  {:else if isComplete && sources.length > 0}
    {#if isSingleSite}
      <!-- retrieveUrl complete: compact inline card -->
      <a href={siteUrl} target="_blank" rel="noopener noreferrer" class="site-card complete" title={siteUrl}>
        <img src={sources[0].faviconUrl} alt="" class="site-favicon" width="14" height="14" />
        <span class="site-domain">{sources[0].domain}</span>
        {#if sitePath}
          <span class="site-path">{sitePath}</span>
        {/if}
      </a>
    {:else}
      <!-- browseWeb complete: pill bricks -->
      <span class="label complete-label">{completeLabel}</span>
      <div class="bricks">
        {#each sources as source, i}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            class="brick source-brick"
            style="animation-delay: {i * 80}ms"
            title={source.url}
          >
            <img
              src={source.faviconUrl}
              alt=""
              class="favicon"
              width="14"
              height="14"
              loading="lazy"
            />
            <span class="domain">{source.domain}</span>
          </a>
        {/each}
      </div>
    {/if}
  {:else if isComplete}
    <span class="label complete-label">{completeLabel}</span>
  {/if}
</div>

<style>
  .web-sources {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
  }

  .label {
    font-size: var(--text-xs, 12px);
    font-weight: var(--font-medium, 500);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    flex-shrink: 0;
  }

  .loading-label {
    animation: pulse-opacity 1.5s ease-in-out infinite;
  }

  .error-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: hsl(0 84% 60%);
  }

  .error-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .bricks {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .brick {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border-radius: 14px;
    font-size: var(--text-xs, 12px);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.5);
    overflow: hidden;
    position: relative;
  }

  /* Skeleton shimmer */
  .brick.skeleton {
    width: 90px;
    border-color: transparent;
    background: hsl(var(--muted) / 0.6);
  }

  .shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      hsl(var(--muted-foreground) / 0.08) 50%,
      transparent 100%
    );
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Source brick (completed state) */
  .source-brick {
    text-decoration: none;
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
    animation: brick-appear 300ms ease-out both;
  }

  .source-brick:hover {
    background: hsl(var(--muted));
    border-color: hsl(var(--muted-foreground) / 0.3);
  }

  @keyframes brick-appear {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .favicon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border-radius: 2px;
  }

  .domain {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  /* Collapsed summary toggle */
  .summary-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: var(--text-sm, 14px);
    color: hsl(var(--muted-foreground));
    font-family: inherit;
    transition: color 0.15s ease;
    animation: collapse-in 300ms ease-out;
  }

  @keyframes collapse-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .summary-toggle:hover {
    color: hsl(var(--foreground));
  }

  .summary-text {
    white-space: nowrap;
  }

  .chevron {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  .chevron-open {
    transform: rotate(180deg);
  }

  /* Expanded bricks under collapsed summary */
  .expanded-bricks {
    animation: expand-in 200ms ease-out;
  }

  @keyframes expand-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Single-site compact inline card ── */
  .site-card {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm, 14px);
    line-height: 1;
    max-width: 360px;
    overflow: hidden;
    position: relative;
    animation: brick-appear 300ms ease-out both;
  }

  .site-card.complete {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    padding: 2px 0;
    border-radius: 4px;
  }

  .site-card.complete:hover .site-domain {
    text-decoration: underline;
  }

  .site-card.loading {
    pointer-events: none;
  }

  .site-card.skeleton {
    width: 160px;
  }

  .site-favicon {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .site-domain {
    font-size: inherit;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .site-reading {
    font-size: var(--text-xs, 12px);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    flex-shrink: 0;
    animation: pulse-opacity 1.5s ease-in-out infinite;
  }

  .site-path {
    font-size: var(--text-xs, 12px);
    color: hsl(var(--muted-foreground) / 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  /* Skeleton placeholders for loading before input parsed */
  .favicon-skeleton {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    background: hsl(var(--muted) / 0.6);
    flex-shrink: 0;
  }

  .domain-skeleton {
    width: 100px;
    height: 14px;
    border-radius: 4px;
    background: hsl(var(--muted) / 0.6);
  }
</style>
