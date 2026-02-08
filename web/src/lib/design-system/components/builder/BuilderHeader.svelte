<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Button } from "$lib/design-system";
  import { fade, scale } from "svelte/transition";
  import { onDestroy, onMount, tick } from "svelte";

  export let appName: string = "App Name";
  export let appId: string = "";
  export let appLogoUrl: string = "";
  export let currentPage: string = "Build";
  export let onShare: () => void = () => {};
  export let onPublish: () => void = () => {};
  export let onSave: () => void = () => {};
  export let isSaving: boolean = false;
  export let isPublishing: boolean = false;
  // lastSaved can be used for displaying "Last saved: X minutes ago" if needed
  export let lastSaved: Date | null = null;
  export let hasUnsavedChanges: boolean = false;
  export let hidePublish: boolean = false;

  // Mobile tab definitions
  const mobileTabs = [
    { label: "Build", slug: "build" },
    { label: "Share", slug: "share" },
    { label: "Access", slug: "access" },
    { label: "Metrics", slug: "metrics" },
    { label: "Chats", slug: "chats" },
    { label: "Tags", slug: "tags" },
    { label: "Settings", slug: "settings" },
  ];

  // Scroll fade state
  let mobileNavEl: HTMLElement;
  let showLeftFade = false;
  let showRightFade = false;

  function updateScrollFades() {
    if (!mobileNavEl) return;
    const { scrollLeft, scrollWidth, clientWidth } = mobileNavEl;
    showLeftFade = scrollLeft > 4;
    showRightFade = scrollLeft + clientWidth < scrollWidth - 4;
  }

  async function scrollActiveTabIntoView() {
    await tick();
    if (!mobileNavEl) return;
    const activeEl = mobileNavEl.querySelector(".mobile-nav-item.active");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    updateScrollFades();
  }

  $: if (currentPage && mobileNavEl) {
    scrollActiveTabIntoView();
  }

  onMount(() => {
    if (mobileNavEl) {
      updateScrollFades();
    }
  });
  $: void lastSaved; // Mark as used to avoid Svelte warning
  $: void hasUnsavedChanges; // Mark as used to avoid Svelte warning
  $: void onSave; // Mark as used to avoid Svelte warning

  const defaultLogo = "/assets/default-app-image.png";

  // Autosave indicator state
  type SaveStage = "saving" | "saved" | null;
  let stage: SaveStage = null;
  let visible = false;
  let dots = "";
  let dotsInterval: ReturnType<typeof setInterval> | null = null;
  let toSavedTimeout: ReturnType<typeof setTimeout> | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const MIN_SAVING_DURATION = 800;
  let saveStartTime: number | null = null;

  // Watch isSaving changes
  $: {
    if (isSaving) {
      saveStartTime = Date.now();
      stage = "saving";
      visible = true;
      startDotsAnimation();
    } else if (stage === "saving") {
      const elapsed = Date.now() - (saveStartTime ?? 0);
      const remaining = Math.max(0, MIN_SAVING_DURATION - elapsed);

      toSavedTimeout = setTimeout(() => {
        stage = "saved";
        stopDotsAnimation();

        hideTimeout = setTimeout(() => {
          visible = false;
          stage = null;
        }, 1200);
      }, remaining);
    }
  }

  function startDotsAnimation() {
    stopDotsAnimation();
    dots = "";
    dotsInterval = setInterval(() => {
      dots = dots.length === 3 ? "" : dots + ".";
    }, 300);
  }

  function stopDotsAnimation() {
    if (dotsInterval) {
      clearInterval(dotsInterval);
      dotsInterval = null;
    }
    dots = "";
  }

  onDestroy(() => {
    stopDotsAnimation();
    if (toSavedTimeout) clearTimeout(toSavedTimeout);
    if (hideTimeout) clearTimeout(hideTimeout);
  });
</script>

<header class="header">
  <div class="header-content desktop">
    <div class="left-section">
      <a href="/apps" use:link class="back-button" title="Back to applications">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
      </a>
      <div class="divider"></div>
      <div class="app-info">
        <div class="app-logo">
          <img src={appLogoUrl || defaultLogo} alt="App logo" />
        </div>
        <div class="app-text">
          <h1 class="app-name">{appName}</h1>
          <p class="current-page">{currentPage}</p>
        </div>
      </div>
    </div>

    <div class="right-section">
      <div class="autosave-container" class:visible>
        {#if stage === "saving"}
          <span class="autosave-text" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
            Saving{dots}
          </span>
        {:else if stage === "saved"}
          <span class="autosave-text" in:fade={{ duration: 200 }} out:fade={{ duration: 200 }}>
            Saved!
          </span>
        {/if}
      </div>
      <div class="divider"></div>
      {#if !hidePublish}
        <Button variant="outline" on:click={onPublish} loading={isPublishing}>
          <svg
            class="publish-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
          Publish
        </Button>
      {/if}
      <Button variant="primary" on:click={onShare}>Share</Button>
    </div>
  </div>

  <div class="header-content mobile">
    <a href="/apps" use:link class="back-button" title="Back to applications">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    </a>
    <div class="divider"></div>
    <div class="mobile-nav-wrapper">
      {#if showLeftFade}
        <div class="scroll-fade scroll-fade-left"></div>
      {/if}
      <nav class="mobile-nav" bind:this={mobileNavEl} on:scroll={updateScrollFades}>
        {#each mobileTabs as tab}
          <a
            href="/apps/{appId}/{tab.slug}"
            use:link
            class="mobile-nav-item"
            class:active={currentPage === tab.label}
          >
            {tab.label}
          </a>
        {/each}
      </nav>
      {#if showRightFade}
        <div class="scroll-fade scroll-fade-right"></div>
      {/if}
    </div>
  </div>
</header>

<style>
  .header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-primary);
    z-index: 20;
  }

  @media (min-width: 1024px) {
    .header {
      left: 100px;
      height: 72px;
      padding: var(--space-4) var(--space-6);
    }
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
  }

  .desktop {
    display: none;
  }

  .mobile {
    display: flex;
  }

  @media (min-width: 768px) {
    .desktop {
      display: flex;
    }
    .mobile {
      display: none;
    }
  }

  .left-section,
  .right-section {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .back-button {
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    transition: background 0.2s ease;
  }

  .back-button:hover {
    background: var(--bg-secondary);
  }

  .divider {
    width: 1px;
    height: 32px;
    background: var(--border-primary);
  }

  .app-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .app-logo {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-xl);
    overflow: hidden;
    flex-shrink: 0;
  }

  .app-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .app-text {
    display: flex;
    flex-direction: column;
  }

  .app-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    margin: 0;
  }

  .current-page {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    margin: 0;
  }

  .autosave-container {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 60px;
    height: 24px;
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  .autosave-container.visible {
    opacity: 0.6;
  }

  .autosave-text {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    white-space: nowrap;
    user-select: none;
  }

  .mobile-nav-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .scroll-fade {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 24px;
    z-index: 2;
    pointer-events: none;
  }

  .scroll-fade-left {
    left: 0;
    background: linear-gradient(to right, var(--bg-primary), transparent);
  }

  .scroll-fade-right {
    right: 0;
    background: linear-gradient(to left, var(--bg-primary), transparent);
  }

  .mobile-nav {
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 2px 4px;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-nav::-webkit-scrollbar {
    display: none;
  }

  .mobile-nav-item {
    padding: 6px 12px;
    border-radius: var(--radius-xl);
    font-size: var(--text-xs);
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    color: var(--text-secondary);
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-nav-item.active {
    font-weight: 700;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    box-shadow:
      0px 0.48px 1.25px -1.17px rgba(0, 0, 0, 0.1),
      0px 1.83px 4.76px -2.33px rgba(0, 0, 0, 0.09),
      0px 8px 20.8px -3.5px rgba(0, 0, 0, 0.05),
      inset 0px -2px 9px 0px rgba(255, 255, 255, 0.49),
      0px 0px 0px 2px rgba(0, 0, 0, 0.2);
  }

  .mobile-nav-item:hover {
    text-decoration: none;
  }

  .publish-icon {
    margin-right: var(--space-2);
    flex-shrink: 0;
  }
</style>
