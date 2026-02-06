<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fly, scale } from "svelte/transition";
  import { adjustColor, getButtonGradientColors } from "../utils/colorUtils";
  import type { AppDetails } from "../stores/appGenerator";
  import confetti from "canvas-confetti";

  export let appDetails: AppDetails = {};
  export let appFacts: string[] = [];
  export let generationTime: string = "";
  export let createdApplicationId: string | null = null;

  const dispatch = createEventDispatcher();

  let isNavigatingToBuilder = false;

  onMount(() => {
    const colors = [
      appDetails.primaryColor || "#8b5cf6",
      "#FFD700", // gold
      "#FF69B4", // hot pink
      "#00CED1", // turquoise
      "#FF6347", // tomato
      "#98FB98", // pale green
    ];

    // Burst 1: center
    setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors,
      });
    }, 100);

    // Burst 2: left
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors,
      });
    }, 250);

    // Burst 3: right
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors,
      });
    }, 400);
  });

  $: buttonColors = getButtonGradientColors(appDetails.primaryColor);
  $: glowGradient = appDetails.primaryColor
    ? `linear-gradient(to right, ${adjustColor(appDetails.primaryColor, 80)}, ${appDetails.primaryColor}, ${adjustColor(appDetails.primaryColor, 60)})`
    : "linear-gradient(to right, #9333ea, #ec4899, #8b5cf6)";

  function handleNavigateToBuilder() {
    isNavigatingToBuilder = true;
    dispatch("navigate", { applicationId: createdApplicationId, appName: appDetails.title });
  }
</script>

<div class="success-container" in:scale={{ duration: 500, start: 0.95 }}>
  <div class="success-card-wrapper">
    <!-- Gradient glow effect -->
    <div class="glow-effect" style="background: {glowGradient}"></div>

    <!-- Main card -->
    <div class="success-card">
      <!-- Logo celebration header -->
      <div class="header" in:fly={{ y: -20, duration: 500, delay: 200 }}>
        {#if appDetails.logoUrl}
          <div class="logo-showcase">
            <div class="logo-wrapper" in:scale={{ duration: 500, delay: 100 }}>
              <!-- Hand-drawn callout -->
              <div class="callout" in:scale={{ duration: 300, delay: 600, start: 0 }}>
                <div class="callout-bubble">Your new logo!</div>
                <svg
                  width="50"
                  height="30"
                  viewBox="0 0 70 35"
                  fill="none"
                  class="callout-arrow"
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="6"
                      markerHeight="4"
                      refX="5"
                      refY="2"
                      orient="auto"
                    >
                      <polygon points="0 0, 6 2, 0 4" fill="rgb(17 24 39)" />
                    </marker>
                  </defs>
                  <path
                    d="M 5 18 Q 25 5 46 28"
                    stroke="rgb(17 24 39)"
                    stroke-width="2"
                    fill="none"
                    stroke-linecap="round"
                    marker-end="url(#arrowhead)"
                  />
                </svg>
              </div>

              <div
                class="logo-container"
                style="background-color: {appDetails.primaryColor || '#8b5cf6'}"
              >
                <img
                  src={appDetails.logoUrl}
                  alt="{appDetails.title} logo"
                  class="logo-image"
                />
              </div>
            </div>
          </div>
        {/if}

        <h1 class="success-title">Your AI Assistant is Ready!</h1>

        {#if generationTime}
          <div class="time-badge" in:fly={{ y: 10, duration: 500, delay: 400 }}>
            <span class="check-icon">&#10003;</span>
            Created in {generationTime} seconds
          </div>
        {/if}
      </div>

      <!-- Features section -->
      <div class="features-section" in:fly={{ y: 0, duration: 600, delay: 500 }}>
        <div
          class="features-card"
          style="background-color: {appDetails.primaryColor ? `${appDetails.primaryColor}08` : '#f9fafb'}"
        >
          {#if appDetails.title}
            <p class="features-intro" in:fly={{ y: 10, duration: 500, delay: 600 }}>
              {appDetails.title} is designed to:
            </p>
          {/if}

          <div class="facts-list">
            {#each appFacts as fact, index}
              <div
                class="fact-item"
                in:fly={{ x: -10, duration: 400, delay: 700 + index * 80 }}
              >
                <div
                  class="fact-dot"
                  style="background-color: {appDetails.primaryColor || '#8b5cf6'}"
                ></div>
                <p class="fact-text">{fact}</p>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- CTA Button -->
      <div class="cta-section" in:fly={{ y: 20, duration: 500, delay: 900 }}>
        <button
          class="cta-button"
          class:disabled={isNavigatingToBuilder}
          disabled={isNavigatingToBuilder}
          on:click={handleNavigateToBuilder}
        >
          <div
            class="button-glow"
            style="background: linear-gradient(to right, {buttonColors.from}, {buttonColors.to})"
          ></div>
          <div
            class="button-content"
            style="background: linear-gradient(to right, {buttonColors.from}, {buttonColors.to})"
          >
            {#if isNavigatingToBuilder}
              <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span>Preparing your workspace...</span>
            {:else if appDetails.title}
              <span>Meet {appDetails.title}</span>
              <span class="arrow">&#8594;</span>
            {:else}
              <span>Enter the Builder</span>
              <span class="arrow">&#8594;</span>
            {/if}
          </div>
        </button>

        <p class="helper-text">You can customize everything in the builder</p>
      </div>
    </div>
  </div>
</div>

<style>
  .success-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    max-width: 36rem;
    margin: 0 auto;
  }

  .success-card-wrapper {
    position: relative;
    max-width: 42rem;
    width: 100%;
  }

  .glow-effect {
    position: absolute;
    inset: -8px;
    border-radius: var(--radius-2xl);
    filter: blur(16px);
    opacity: 0.2;
    animation: gradientPulse 2s ease-in-out infinite;
  }

  @media (min-width: 640px) {
    .glow-effect {
      inset: -16px;
      border-radius: var(--radius-3xl);
      filter: blur(24px);
    }
  }

  .success-card {
    position: relative;
    background: hsl(var(--background) / 0.95);
    backdrop-filter: blur(12px);
    border-radius: var(--radius-2xl);
    padding: var(--space-6);
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    border: 1px solid hsl(var(--border) / 0.5);
  }

  @media (min-width: 640px) {
    .success-card {
      border-radius: var(--radius-3xl);
      padding: var(--space-8);
    }
  }

  .header {
    text-align: center;
    margin-bottom: var(--space-4);
    overflow: visible;
  }

  @media (min-width: 640px) {
    .header {
      margin-bottom: var(--space-6);
    }
  }

  .logo-showcase {
    display: inline-block;
    position: relative;
  }

  .logo-wrapper {
    position: relative;
    margin-bottom: var(--space-4);
  }

  .callout {
    position: absolute;
    left: -90px;
    top: -8px;
    display: flex;
    align-items: center;
    z-index: 50;
    transform: rotate(-8deg);
  }

  @media (min-width: 640px) {
    .callout {
      left: -136px;
      top: -12px;
    }
  }

  .callout-bubble {
    background: rgb(17 24 39);
    color: white;
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 9999px;
    white-space: nowrap;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  }

  @media (min-width: 640px) {
    .callout-bubble {
      font-size: var(--text-xs);
      padding: 6px 12px;
    }
  }

  .callout-arrow {
    position: absolute;
    right: -48px;
    top: 50%;
    width: 50px;
    height: 30px;
    transform: translateY(-50%) rotate(10deg);
  }

  @media (min-width: 640px) {
    .callout-arrow {
      right: -64px;
      width: 70px;
      height: 35px;
    }
  }

  .logo-container {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-xl);
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
    overflow: hidden;
  }

  @media (min-width: 640px) {
    .logo-container {
      width: 80px;
      height: 80px;
      border-radius: var(--radius-2xl);
    }
  }

  .logo-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .success-title {
    font-size: var(--text-2xl);
    font-family: var(--font-serif);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2);
  }

  @media (min-width: 640px) {
    .success-title {
      font-size: var(--text-3xl);
    }
  }

  @media (min-width: 768px) {
    .success-title {
      font-size: var(--text-4xl);
    }
  }

  .time-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    padding: 6px 12px;
    border-radius: 9999px;
    font-size: var(--text-sm);
  }

  .check-icon {
    color: #22c55e;
  }

  .features-section {
    margin-bottom: var(--space-6);
  }

  @media (min-width: 640px) {
    .features-section {
      margin-bottom: var(--space-8);
    }
  }

  .features-card {
    border-radius: var(--radius-xl);
    padding: var(--space-4);
  }

  @media (min-width: 640px) {
    .features-card {
      border-radius: var(--radius-2xl);
      padding: var(--space-6);
    }
  }

  .features-intro {
    text-align: left;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-base);
    font-weight: 500;
    margin: 0 0 var(--space-3);
  }

  @media (min-width: 640px) {
    .features-intro {
      font-size: var(--text-lg);
      margin-bottom: var(--space-4);
    }
  }

  .facts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .fact-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  @media (min-width: 640px) {
    .fact-item {
      align-items: center;
    }
  }

  .fact-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 6px;
  }

  @media (min-width: 640px) {
    .fact-dot {
      margin-top: 0;
    }
  }

  .fact-text {
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    margin: 0;
  }

  @media (min-width: 640px) {
    .fact-text {
      font-size: var(--text-lg);
    }
  }

  .cta-section {
    text-align: center;
  }

  .cta-button {
    position: relative;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }

  .cta-button.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cta-button:not(.disabled):hover .button-content {
    transform: scale(1.02);
  }

  .cta-button:not(.disabled):hover .button-glow {
    opacity: 1;
  }

  .button-glow {
    position: absolute;
    inset: -2px;
    border-radius: var(--radius-xl);
    filter: blur(4px);
    opacity: 0.75;
    transition: opacity 0.2s ease;
  }

  .button-content {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 12px 16px;
    border-radius: var(--radius-xl);
    color: white;
    font-weight: 600;
    font-size: var(--text-base);
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    transition: transform 0.2s ease;
  }

  @media (min-width: 640px) {
    .button-content {
      padding: 14px 24px;
      font-size: var(--text-lg);
    }
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

  .arrow {
    display: inline-block;
    animation: bounce 1.5s infinite;
  }

  .helper-text {
    text-align: center;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin-top: var(--space-2);
  }

  @media (min-width: 640px) {
    .helper-text {
      font-size: var(--text-sm);
      margin-top: var(--space-3);
    }
  }

  @keyframes gradientPulse {
    0%, 100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.3;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(5px);
    }
  }
</style>
