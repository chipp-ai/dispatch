<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { TaskItem } from "../stores/appGenerator.ts";

  export let items: TaskItem[] = [];
  export let title: string = "Building Your App";
  export let subtitle: string = "Watch as we bring your idea to life";

  let scrollContainerRef: HTMLDivElement;

  // Derive task groups
  $: completedItems = items.filter((item) => item.status === "completed");
  $: activeItem = items.find((item) => item.status === "active");
  $: pendingItems = items.filter((item) => item.status === "pending");

  // Auto-scroll to keep active item visible
  $: if (scrollContainerRef && items.length > 0) {
    tick().then(() => {
      if (!scrollContainerRef) return;

      const container = scrollContainerRef;

      if (completedItems.length > 0) {
        // Calculate total height of completed section
        let totalHeight = 0;

        const headerElement = container.querySelector('[data-completed-header]');
        if (headerElement) {
          totalHeight += headerElement.getBoundingClientRect().height;
        }

        const completedElements = container.querySelectorAll('[data-completed-item]');
        completedElements.forEach((element) => {
          totalHeight += element.getBoundingClientRect().height + 12;
        });

        const containerHeight = container.clientHeight;
        const activeItemHeight = 100;
        const centerOffset = (containerHeight - activeItemHeight) / 2;
        const topPadding = 96;

        container.scrollTo({
          top: totalHeight + topPadding - centerOffset,
          behavior: "smooth",
        });
      } else {
        const containerHeight = container.clientHeight;
        const activeItemHeight = 100;
        const centerOffset = (containerHeight - activeItemHeight) / 2;
        const topPadding = 96;

        container.scrollTo({
          top: Math.max(0, topPadding - centerOffset),
          behavior: "smooth",
        });
      }
    });
  }

  function formatTime(date: Date): string {
    const minutes = Math.floor((new Date().getTime() - date.getTime()) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
</script>

<div class="progress-container">
  <div class="header">
    <h1 class="title">{title}</h1>
    <p class="subtitle">{subtitle}</p>
  </div>

  <div class="progress-wrapper">
    <!-- Scrollable container -->
    <div class="scroll-container" bind:this={scrollContainerRef}>
      <div class="items-container">
        <!-- Completed items -->
        {#if completedItems.length > 0}
          {#each completedItems.sort((a, b) => (a.completedAt?.getTime() || 0) - (b.completedAt?.getTime() || 0)) as item (item.id)}
            <div class="task-item completed" data-completed-item>
              <div class="task-content">
                <div class="icon-wrapper completed">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <div class="task-info">
                  <h3 class="task-name">{item.completedName || item.name}</h3>
                  {#if item.completedAt}
                    <p class="task-time">{formatTime(item.completedAt)}</p>
                  {/if}
                </div>
                <span class="task-status done">Done</span>
              </div>
            </div>
          {/each}
        {/if}

        <!-- Active item -->
        {#if activeItem}
          <div class="task-item active-wrapper">
            <div class="active-glow"></div>
            <div class="active-card">
              <div class="shimmer"></div>
              <div class="task-content active-content">
                <div class="icon-wrapper active">
                  <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <div class="pulse-dot"></div>
                  <div class="pulse-dot-ping"></div>
                </div>
                <div class="task-info">
                  <h3 class="task-name active-name">{activeItem.activeName || activeItem.name}</h3>
                  <p class="task-time">In progress...</p>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Pending items -->
        {#if pendingItems.length > 0}
          {#each pendingItems as item, index (item.id)}
            <div
              class="task-item pending"
              style="animation-delay: {index * 50}ms"
            >
              <div class="task-content">
                <div class="icon-wrapper pending">
                  <span class="emoji">{item.icon}</span>
                </div>
                <div class="task-info">
                  <h3 class="task-name pending-name">{item.pendingName || item.name}</h3>
                  <p class="task-time">Waiting...</p>
                </div>
                <span class="task-status pending-status">Up next</span>
              </div>
            </div>
          {/each}
        {/if}

        <!-- Empty state -->
        {#if !activeItem && pendingItems.length === 0}
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <p class="empty-title">Your AI assistant is ready!</p>
            <p class="empty-subtitle">All tasks completed successfully</p>
          </div>
        {/if}

        <!-- Bottom padding for scroll -->
        <div class="scroll-padding"></div>
      </div>
    </div>

    <!-- Fade overlays -->
    <div class="fade-top"></div>
    <div class="fade-bottom"></div>
  </div>
</div>

<style>
  .progress-container {
    max-width: 48rem;
    margin: 0 auto;
    padding: var(--space-4);
  }

  @media (min-width: 640px) {
    .progress-container {
      padding: var(--space-6);
    }
  }

  .header {
    margin-bottom: var(--space-6);
    margin-top: var(--space-12);
  }

  @media (min-width: 640px) {
    .header {
      margin-bottom: var(--space-8);
      margin-top: 0;
    }
  }

  .title {
    font-size: var(--text-2xl);
    font-family: var(--font-serif);
    color: hsl(var(--foreground));
    letter-spacing: -0.025em;
    line-height: 1.2;
    margin: 0;
  }

  @media (min-width: 640px) {
    .title {
      font-size: var(--text-4xl);
    }
  }

  @media (min-width: 1024px) {
    .title {
      font-size: var(--text-5xl);
    }
  }

  .subtitle {
    margin-top: var(--space-2);
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    font-weight: 400;
    line-height: 1.6;
  }

  @media (min-width: 640px) {
    .subtitle {
      margin-top: var(--space-3);
      font-size: var(--text-lg);
    }
  }

  .progress-wrapper {
    background: transparent;
    border-radius: var(--radius);
    overflow: hidden;
    position: relative;
  }

  .scroll-container {
    height: calc(100dvh - 240px);
    overflow-y: auto;
    position: relative;
    background: transparent;
    scroll-behavior: smooth;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scroll-container::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 640px) {
    .scroll-container {
      height: calc(100vh - 280px);
    }
  }

  .items-container {
    position: relative;
    padding-top: var(--space-12);
  }

  @media (min-width: 640px) {
    .items-container {
      padding-top: var(--space-24);
    }
  }

  .task-item {
    position: relative;
    border-radius: var(--radius-xl);
    padding: var(--space-3);
    margin-bottom: var(--space-2);
    transition: all 0.5s ease;
    width: 100%;
    min-height: 60px;
  }

  @media (min-width: 640px) {
    .task-item {
      border-radius: var(--radius-2xl);
      padding: var(--space-5);
      margin-bottom: var(--space-3);
      min-height: 100px;
    }
  }

  .task-item.completed {
    background: hsl(var(--background) / 0.4);
    backdrop-filter: blur(8px);
    border: 1px solid hsl(var(--border) / 0.3);
  }

  .task-item.completed:hover {
    background: hsl(var(--background) / 0.5);
  }

  .task-item.pending {
    background: hsl(var(--background) / 0.2);
    backdrop-filter: blur(8px);
    border: 1px solid hsl(var(--border) / 0.2);
  }

  .task-item.pending:hover {
    background: hsl(var(--background) / 0.3);
    border-color: hsl(var(--border) / 0.3);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }

  .active-wrapper {
    position: sticky;
    top: 0;
    z-index: 10;
    margin-bottom: var(--space-2);
    min-height: 70px;
    animation: slideInFromBottom 0.5s ease;
  }

  @media (min-width: 640px) {
    .active-wrapper {
      margin-bottom: var(--space-3);
      min-height: 100px;
    }
  }

  .active-glow {
    position: absolute;
    inset: -4px;
    background: linear-gradient(to right, #60a5fa, #a78bfa, #60a5fa);
    border-radius: var(--radius-xl);
    filter: blur(12px);
    opacity: 0.7;
    animation: gradientPulse 2s ease-in-out infinite;
  }

  @media (min-width: 640px) {
    .active-glow {
      border-radius: var(--radius-2xl);
      filter: blur(16px);
    }
  }

  .active-card {
    position: relative;
    background: hsl(var(--background) / 0.9);
    backdrop-filter: blur(8px);
    border-radius: var(--radius-xl);
    border: 1px solid hsl(var(--border) / 0.5);
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    overflow: hidden;
  }

  @media (min-width: 640px) {
    .active-card {
      border-radius: var(--radius-2xl);
    }
  }

  .shimmer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .shimmer::before {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    animation: shimmer 3s infinite;
    background: linear-gradient(to right, transparent, hsl(var(--background) / 0.2), transparent);
  }

  .task-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
  }

  @media (min-width: 640px) {
    .task-content {
      gap: var(--space-4);
    }
  }

  .active-content {
    position: relative;
    padding: var(--space-3);
  }

  @media (min-width: 640px) {
    .active-content {
      padding: var(--space-5);
    }
  }

  .icon-wrapper {
    position: relative;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @media (min-width: 640px) {
    .icon-wrapper {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-xl);
    }
  }

  .icon-wrapper.completed {
    background: linear-gradient(to bottom right, #4ade80, #22c55e);
    box-shadow: 0 10px 15px -3px rgb(34 197 94 / 0.2);
    color: white;
  }

  .icon-wrapper.active {
    background: hsl(var(--background));
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    border: 1px solid hsl(var(--border));
    color: hsl(var(--muted-foreground));
  }

  .icon-wrapper.pending {
    background: linear-gradient(to bottom right, hsl(var(--muted)), hsl(var(--muted) / 0.8));
    transition: all 0.3s ease;
  }

  .task-item.pending:hover .icon-wrapper.pending {
    background: linear-gradient(to bottom right, hsl(var(--muted) / 0.8), hsl(var(--muted) / 0.6));
  }

  .spinner {
    animation: spin 1s linear infinite;
    width: 16px;
    height: 16px;
  }

  @media (min-width: 640px) {
    .spinner {
      width: 20px;
      height: 20px;
    }
  }

  .pulse-dot,
  .pulse-dot-ping {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 10px;
    height: 10px;
    background: #22c55e;
    border-radius: 50%;
  }

  @media (min-width: 640px) {
    .pulse-dot,
    .pulse-dot-ping {
      bottom: -4px;
      right: -4px;
      width: 12px;
      height: 12px;
    }
  }

  .pulse-dot-ping {
    background: #4ade80;
    animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  .emoji {
    font-size: var(--text-base);
    transition: transform 0.3s ease;
  }

  @media (min-width: 640px) {
    .emoji {
      font-size: var(--text-xl);
    }
  }

  .task-item.pending:hover .emoji {
    transform: scale(1.1);
  }

  .task-info {
    flex: 1;
    min-width: 0;
  }

  .task-name {
    font-weight: 500;
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    margin: 0;
  }

  .task-name.active-name {
    font-weight: 600;
  }

  @media (min-width: 640px) {
    .task-name.active-name {
      font-size: var(--text-base);
    }
  }

  .task-name.pending-name {
    color: hsl(var(--muted-foreground));
    transition: color 0.3s ease;
  }

  .task-item.pending:hover .task-name.pending-name {
    color: hsl(var(--foreground));
  }

  .task-time {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin-top: 2px;
  }

  .task-status {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-family: ui-monospace, monospace;
  }

  .task-status.done {
    color: hsl(var(--muted-foreground));
  }

  .task-status.pending-status {
    color: hsl(var(--muted-foreground));
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .task-item.pending:hover .task-status.pending-status {
    opacity: 1;
  }

  .empty-state {
    padding: var(--space-8);
    text-align: center;
    animation: fadeIn 1s ease;
  }

  @media (min-width: 640px) {
    .empty-state {
      padding: var(--space-12);
    }
  }

  .empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: linear-gradient(to bottom right, #4ade80, #22c55e);
    border-radius: var(--radius-xl);
    box-shadow: 0 10px 15px -3px rgb(34 197 94 / 0.25);
    margin-bottom: var(--space-3);
    color: white;
  }

  @media (min-width: 640px) {
    .empty-icon {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-2xl);
      margin-bottom: var(--space-4);
    }
  }

  .empty-title {
    color: hsl(var(--foreground));
    font-weight: 600;
    font-size: var(--text-base);
    margin: 0;
  }

  @media (min-width: 640px) {
    .empty-title {
      font-size: var(--text-lg);
    }
  }

  .empty-subtitle {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin-top: var(--space-1);
  }

  @media (min-width: 640px) {
    .empty-subtitle {
      margin-top: var(--space-2);
    }
  }

  .scroll-padding {
    height: 12rem;
  }

  @media (min-width: 640px) {
    .scroll-padding {
      height: 24rem;
    }
  }

  .fade-top,
  .fade-bottom {
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 200;
  }

  .fade-top {
    top: 0;
    height: 60px;
    background: linear-gradient(
      to bottom,
      hsl(var(--background)),
      hsl(var(--background) / 0.8),
      hsl(var(--background) / 0.3),
      transparent
    );
  }

  @media (min-width: 640px) {
    .fade-top {
      height: 80px;
    }
  }

  .fade-bottom {
    bottom: 0;
    height: 80px;
    background: linear-gradient(
      to top,
      hsl(var(--background)),
      hsl(var(--background) / 0.6),
      transparent
    );
  }

  @media (min-width: 640px) {
    .fade-bottom {
      height: 120px;
    }
  }

  @keyframes shimmer {
    to {
      transform: translateX(200%);
    }
  }

  @keyframes gradientPulse {
    0%, 100% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes slideInFromBottom {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes ping {
    75%, 100% {
      transform: scale(2);
      opacity: 0;
    }
  }
</style>
