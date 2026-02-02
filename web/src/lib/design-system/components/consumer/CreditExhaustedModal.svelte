<script lang="ts">
  /**
   * CreditExhaustedModal
   *
   * Modal shown when a consumer tries to use an app whose creator has exhausted
   * their credits. Styled to match chipp-admin's consumer variant exactly.
   *
   * Features:
   * - Branded with app's primary color
   * - Animated entrance with staggered delays
   * - Empathetic messaging for end users
   * - Reassurance about conversation history
   */
  import { createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';

  export let open: boolean = false;
  export let appName: string = 'App';
  export let primaryColor: string = '#4499ff';
  export let logoUrl: string | null = null;
  export let forceDarkMode: boolean = false;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  // Animation state for staggered entrance
  let isVisible = false;

  // Detect dark mode from system or forced prop
  let isDarkMode = false;
  $: {
    if (typeof window !== 'undefined') {
      isDarkMode = forceDarkMode ||
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  }

  // Color utility functions (matching chipp-admin exactly)
  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  function lightenColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount));
    const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount));
    const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function darkenColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.round(rgb.r * (1 - amount));
    const g = Math.round(rgb.g * (1 - amount));
    const b = Math.round(rgb.b * (1 - amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Brand color calculations - different for light vs dark mode
  $: brandColor = primaryColor || '#4499ff';

  // Light mode colors (tints toward white)
  $: brandColorLight = lightenColor(brandColor, 0.9);
  $: brandColorMedium = lightenColor(brandColor, 0.7);
  $: brandColorDark = darkenColor(brandColor, 0.2);

  // Dark mode colors (shades toward dark, with brand accent)
  $: brandColorDarkBg = darkenColor(brandColor, 0.85); // Very dark version of brand
  $: brandColorDarkBgMedium = darkenColor(brandColor, 0.75);
  $: brandColorDarkAccent = lightenColor(brandColor, 0.3); // Brighter accent for dark mode

  // Computed colors based on mode
  $: modalBg = isDarkMode ? brandColorDarkBg : brandColorLight;
  $: headerBg = isDarkMode
    ? `linear-gradient(180deg, ${brandColorDarkBg} 0%, ${brandColorDarkBgMedium} 100%)`
    : `linear-gradient(180deg, ${brandColorLight} 0%, ${lightenColor(brandColor, 0.95)} 100%)`;
  $: bodyBg = isDarkMode
    ? `linear-gradient(180deg, ${brandColorDarkBgMedium} 0%, ${brandColorDarkBg} 100%)`
    : `linear-gradient(180deg, ${lightenColor(brandColor, 0.95)} 0%, ${brandColorLight} 100%)`;
  $: cardBg = isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.8)';
  $: cardBorder = isDarkMode ? `${brandColor}30` : `${brandColor}20`;
  $: iconBg = isDarkMode ? `${brandColor}25` : `${brandColor}15`;
  $: textColor = isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'hsl(var(--foreground))';
  $: textMuted = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'hsl(var(--muted-foreground))';
  $: buttonGradient = isDarkMode
    ? `linear-gradient(135deg, ${brandColor} 0%, ${brandColorDarkAccent} 100%)`
    : `linear-gradient(135deg, ${brandColorDark} 0%, ${brandColor} 100%)`;

  // Trigger entrance animation when opened
  $: if (open) {
    // Small delay before starting entrance animations
    setTimeout(() => {
      isVisible = true;
    }, 100);
  } else {
    isVisible = false;
  }

  function close() {
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="modal-overlay"
    transition:fade={{ duration: 150 }}
    on:click={handleOverlayClick}
  >
    <div
      class="modal-content"
      class:dark-mode={isDarkMode}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-exhausted-title"
      style="background: {modalBg};"
    >
      <!-- Header with branded gradient -->
      <div
        class="modal-header"
        style="background: {headerBg};"
      >
        <!-- Decorative gradient orbs -->
        <div class="gradient-orbs">
          <div
            class="orb orb-top-right"
            style="background: radial-gradient(circle, {brandColor}30 0%, transparent 70%);"
          />
          <div
            class="orb orb-bottom-left"
            style="background: radial-gradient(circle, {brandColor}20 0%, transparent 70%);"
          />
        </div>

        <!-- App logo or fallback icon -->
        <div class="logo-container" class:visible={isVisible}>
          <div class="logo-glow" style="background: {brandColor}25;" />
          {#if logoUrl}
            <div
              class="logo-wrapper"
              style="
                background: {isDarkMode ? 'rgba(255,255,255,0.95)' : 'white'};
                box-shadow: 0 8px 32px {brandColor}20, inset 0 1px 0 rgba(255,255,255,0.8);
              "
            >
              <img src={logoUrl} alt={appName} class="logo-image" />
            </div>
          {:else}
            <div
              class="icon-fallback"
              style="
                background: linear-gradient(135deg, {brandColorMedium} 0%, {brandColor} 100%);
                box-shadow: 0 8px 32px {brandColor}30, inset 0 1px 0 rgba(255,255,255,0.3);
              "
            >
              <!-- AlertCircle icon -->
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="alert-icon"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          {/if}
        </div>

        <!-- Title -->
        <h2
          id="credit-exhausted-title"
          class="modal-title"
          class:visible={isVisible}
          style="color: {textColor};"
        >
          This app is temporarily unavailable
        </h2>

        <!-- Subtitle -->
        <p class="modal-subtitle" class:visible={isVisible} style="color: {textMuted};">
          The creator of this app has reached their usage quota.
          <br />
          Please check back soon or contact them directly.
        </p>
      </div>

      <!-- Content section -->
      <div
        class="modal-body"
        style="background: {bodyBg};"
      >
        <!-- Reassurance card -->
        <div
          class="reassurance-card"
          class:visible={isVisible}
          style="background: {cardBg}; border-color: {cardBorder};"
        >
          <div class="reassurance-icon" style="background: {iconBg};">
            <!-- AlertCircle icon (smaller) -->
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="reassurance-svg"
              style="color: {isDarkMode ? brandColorDarkAccent : brandColorDark};"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p class="reassurance-text" style="color: {textColor};">
            This is a temporary interruption. Your conversation history is safe
            and will be available once service resumes.
          </p>
        </div>

        <!-- Dismiss button -->
        <button
          class="dismiss-button"
          class:visible={isVisible}
          style="
            background: {buttonGradient};
            box-shadow: 0 4px 14px {brandColor}30;
          "
          on:click={close}
        >
          <span class="button-text">I understand</span>
          <div class="button-shine" />
        </button>

        <!-- Footer text -->
        <p class="footer-text" class:visible={isVisible} style="color: {textMuted};">
          We apologize for any inconvenience
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 440px;
    padding: 0;
    border: 0;
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  /* Header section */
  .modal-header {
    position: relative;
    overflow: hidden;
    padding: 40px 32px 32px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Decorative gradient orbs */
  .gradient-orbs {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    opacity: 0.4;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
  }

  .orb-top-right {
    top: -80px;
    right: -80px;
    width: 192px;
    height: 192px;
  }

  .orb-bottom-left {
    bottom: -64px;
    left: -64px;
    width: 160px;
    height: 160px;
  }

  /* Logo container */
  .logo-container {
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: 24px;
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 700ms ease-out, transform 700ms ease-out;
  }

  .logo-container.visible {
    opacity: 1;
    transform: scale(1);
  }

  .logo-glow {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    filter: blur(20px);
    transform: scale(2);
  }

  .logo-wrapper {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo-image {
    max-width: 80%;
    max-height: 80%;
    object-fit: contain;
  }

  .icon-fallback {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .alert-icon {
    width: 40px;
    height: 40px;
    color: white;
  }

  /* Title */
  .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    text-align: center;
    letter-spacing: -0.01em;
    line-height: 1.4;
    margin: 0;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 500ms ease-out 100ms, transform 500ms ease-out 100ms;
  }

  .modal-title.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Subtitle */
  .modal-subtitle {
    font-size: 0.875rem;
    text-align: center;
    padding-top: 12px;
    line-height: 1.6;
    margin: 0;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 500ms ease-out 150ms, transform 500ms ease-out 150ms;
  }

  .modal-subtitle.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Body section */
  .modal-body {
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Reassurance card */
  .reassurance-card {
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(4px);
    border: 1px solid;
    border-radius: 16px;
    padding: 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 700ms ease-out 200ms, transform 700ms ease-out 200ms;
  }

  .reassurance-card.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .reassurance-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .reassurance-svg {
    width: 16px;
    height: 16px;
  }

  .reassurance-text {
    font-size: 0.875rem;
    line-height: 1.6;
    margin: 0;
  }

  /* Dismiss button */
  .dismiss-button {
    position: relative;
    width: 100%;
    height: 44px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    overflow: hidden;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 700ms ease-out 300ms, transform 700ms ease-out 300ms;
  }

  .dismiss-button.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .button-text {
    position: relative;
    z-index: 1;
    font-size: 1rem;
    font-weight: 500;
    color: white;
  }

  .button-shine {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.15) 50%,
      transparent 100%
    );
    transition: opacity 300ms;
  }

  .dismiss-button:hover .button-shine {
    opacity: 1;
  }

  /* Footer text */
  .footer-text {
    font-size: 0.75rem;
    text-align: center;
    line-height: 1.5;
    padding-top: 4px;
    margin: 0;
    opacity: 0;
    transition: opacity 700ms ease-out 400ms;
  }

  .footer-text.visible {
    opacity: 1;
  }

  /* Mobile adjustments */
  @media (max-width: 480px) {
    .modal-content {
      max-width: 100%;
      margin: 0 16px;
    }

    .modal-header {
      padding: 32px 24px 24px 24px;
    }

    .modal-body {
      padding: 20px 24px;
    }
  }
</style>
