<script lang="ts">
  import { onMount } from "svelte";
  import { companyLogoUrl, companyColor } from "../../../stores/whitelabel";
  import { consumerApp } from "../../../stores/consumerAuth";

  export let onComplete: () => void = () => {};
  
  // Optional props to override with app-specific branding
  export let appLogoUrl: string | null = null;
  export let appPrimaryColor: string | null = null;

  // Check for server-injected brand config first (for instant consumer chat loading)
  // This is set by the Cloudflare Worker for vanity subdomain routes
  const injectedBrand = typeof window !== "undefined"
    ? (window as unknown as { __APP_BRAND__?: { slug: string; name: string; color: string; bg?: string; logo: string } }).__APP_BRAND__
    : undefined;

  // Animation states - start with logo-bw since HTML already shows B&W logo
  let phase: "logo-bw" | "logo-color" | "pulse" | "fadeout" | "complete" =
    "logo-bw";

  // Get app logo from consumerApp store (for when app data loads)
  $: appBrandStyles = ($consumerApp?.brandStyles as Record<string, string>) || {};
  $: consumerAppLogo = appBrandStyles.logoUrl || null;
  $: consumerAppColor = appBrandStyles.primaryColor || null;

  // Priority: 
  // 1. Props (explicit override)
  // 2. Injected brand (server/Cloudflare Worker)
  // 3. Consumer app store (after API fetch)
  // 4. Whitelabel store (platform branding)
  // 5. Chipp defaults
  $: logo = appLogoUrl || injectedBrand?.logo || consumerAppLogo || $companyLogoUrl || "/assets/chippylogo.svg";
  $: brandColor = appPrimaryColor || injectedBrand?.color || consumerAppColor || $companyColor || "#F9DB00"; // Chipp yellow as default

  // Small delay for GPU layer prep after Svelte takes over
  const TAKEOVER_DELAY = 100;

  onMount(() => {
    // Crossfade: fade out HTML splash while Svelte splash fades in
    const initialSplash = document.getElementById("initial-splash");
    if (initialSplash) {
      initialSplash.style.transition = "opacity 200ms ease-out";
      initialSplash.style.opacity = "0";
      setTimeout(() => {
        initialSplash.style.display = "none";
      }, 200);
    }

    // Phase 1: B&W logo already visible (from HTML, now from Svelte)
    // Phase 2: Color + pulse start together (no delay between them)
    setTimeout(() => {
      phase = "pulse"; // Skip logo-color, go straight to pulse which includes color
    }, TAKEOVER_DELAY + 300);

    // Phase 3: Fade out (extended time for slower beam animation)
    setTimeout(() => {
      phase = "fadeout";
    }, TAKEOVER_DELAY + 2200);

    // Phase 4: Complete and call callback
    setTimeout(() => {
      phase = "complete";
      // Re-enable scrolling now that splash is done
      document.documentElement.classList.remove("splash-active");
      onComplete();
    }, TAKEOVER_DELAY + 2600);
  });
</script>

{#if phase !== "complete"}
  <div
    class="splash-screen"
    class:fadeout={phase === "fadeout"}
    style="--brand-color: {brandColor}"
  >
    <!-- Stacked ripple rings for radio wave effect -->
    <div class="ripple-container" class:active={phase === "pulse"}>
      <div class="ripple ripple-1"></div>
      <div class="ripple ripple-2"></div>
      <div class="ripple ripple-3"></div>
    </div>

    <!-- Light beams that radiate outward -->
    <div class="beams-container" class:active={phase === "pulse"}>
      {#each Array(8) as _, i}
        <div
          class="beam"
          style="--beam-angle: {i * 45}deg; --beam-delay: {i * 40}ms"
        ></div>
      {/each}
    </div>

    <!-- Logo container with persistent subtle spring -->
    <div class="logo-container" class:breathing={phase === "pulse"}>
      <img
        src={logo}
        alt="Loading"
        class="logo"
        class:grayscale={phase === "logo-bw"}
        class:color={phase !== "logo-bw"}
      />
    </div>
  </div>
{/if}

<style>
  .splash-screen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary, #0a0a0a);
    transition: opacity 400ms ease-out;
    overflow: hidden;
    /* Performance: isolate compositing layer */
    contain: layout style;
  }

  .splash-screen.fadeout {
    opacity: 0;
    pointer-events: none;
  }

  /* Ripple container for radio wave effect */
  .ripple-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0;
    height: 0;
    pointer-events: none;
    /* Performance: prep GPU layer */
    will-change: transform;
  }

  .ripple {
    position: absolute;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--brand-color) 15%, transparent);
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--brand-color) 4%, transparent) 0%,
      transparent 70%
    );
    opacity: 0;
    /* Center each ripple on the origin point */
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.3);
    /* Performance: GPU compositing */
    will-change: transform, opacity;
    backface-visibility: hidden;
  }

  .ripple-1 {
    width: 200px;
    height: 200px;
  }

  .ripple-2 {
    width: 320px;
    height: 320px;
  }

  .ripple-3 {
    width: 480px;
    height: 480px;
  }

  .ripple-container.active .ripple {
    animation: rippleWave 3.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
  }

  .ripple-container.active .ripple-1 {
    animation-delay: 0ms;
  }

  .ripple-container.active .ripple-2 {
    animation-delay: 300ms;
  }

  .ripple-container.active .ripple-3 {
    animation-delay: 600ms;
  }

  @keyframes rippleWave {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.4);
    }
    15% {
      opacity: 0.12;
    }
    50% {
      opacity: 0.06;
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.8);
    }
  }

  /* Light beams radiating from center */
  .beams-container {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    transform-origin: center center;
    /* Performance: prep GPU layer for rotation */
    will-change: transform;
  }

  .beams-container.active {
    animation: beamsRotate 12s linear infinite;
  }

  @keyframes beamsRotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .beam {
    position: absolute;
    /* Fixed size - we'll animate with scaleX/scaleY for GPU performance */
    width: 80px;
    height: 160px;
    /* Soft radial gradient that fades on all edges */
    background: radial-gradient(
      ellipse 50% 100% at 50% 100%,
      color-mix(in srgb, var(--brand-color) 35%, transparent) 0%,
      color-mix(in srgb, var(--brand-color) 18%, transparent) 25%,
      color-mix(in srgb, var(--brand-color) 6%, transparent) 55%,
      transparent 85%
    );
    /* Transform origin at center-bottom so rotation pivots from center of screen */
    transform-origin: center bottom;
    /* Center the beam horizontally */
    left: -40px;
    bottom: 0;
    /* Initial state: scaled to 0 */
    transform: rotate(var(--beam-angle)) scaleX(0.6) scaleY(0);
    opacity: 0;
    /* Soft fade mask for edges */
    -webkit-mask-image:
      linear-gradient(to top, black 0%, black 20%, transparent 100%),
      linear-gradient(
        to right,
        transparent 0%,
        black 30%,
        black 70%,
        transparent 100%
      );
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(to top, black 0%, black 20%, transparent 100%),
      linear-gradient(
        to right,
        transparent 0%,
        black 30%,
        black 70%,
        transparent 100%
      );
    mask-composite: intersect;
    /* Performance: GPU compositing for transform/opacity only */
    will-change: transform, opacity;
    backface-visibility: hidden;
  }

  .beams-container.active .beam {
    animation:
      beamShoot 1400ms cubic-bezier(0.34, 1.3, 0.64, 1) forwards,
      beamShimmer 2.5s ease-in-out 1400ms infinite;
    animation-delay: var(--beam-delay), calc(var(--beam-delay) + 1400ms);
  }

  /* GPU-friendly animation using only transform and opacity */
  @keyframes beamShoot {
    0% {
      transform: rotate(var(--beam-angle)) scaleX(0.6) scaleY(0);
      opacity: 0;
    }
    30% {
      transform: rotate(var(--beam-angle)) scaleX(1.25) scaleY(1.4);
      opacity: 0.45;
    }
    60% {
      transform: rotate(var(--beam-angle)) scaleX(1.1) scaleY(1.1);
      opacity: 0.12;
    }
    100% {
      transform: rotate(var(--beam-angle)) scaleX(1) scaleY(1);
      opacity: 0.06;
    }
  }

  @keyframes beamShimmer {
    0%,
    100% {
      transform: rotate(var(--beam-angle)) scaleX(1) scaleY(1);
      opacity: 0.06;
    }
    50% {
      transform: rotate(var(--beam-angle)) scaleX(1.05) scaleY(1.02);
      opacity: 0.1;
    }
  }

  /* Logo container with subtle breathing spring */
  .logo-container {
    position: relative;
    z-index: 1;
    /* Performance: prep GPU layer */
    will-change: transform;
    backface-visibility: hidden;
  }

  .logo-container.breathing {
    animation: subtleSpring 3s cubic-bezier(0.34, 1.2, 0.64, 1) infinite;
  }

  @keyframes subtleSpring {
    0%,
    100% {
      transform: scale(1);
    }
    25% {
      transform: scale(1.012);
    }
    50% {
      transform: scale(0.995);
    }
    75% {
      transform: scale(1.008);
    }
  }

  .logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    transition:
      filter 400ms ease-out,
      transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 400ms ease-out;
    /* Performance: GPU compositing */
    will-change: transform, opacity, filter;
    backface-visibility: hidden;
  }

  .logo.grayscale {
    filter: grayscale(100%) brightness(0.8);
    transform: scale(0.95);
    opacity: 0.6;
  }

  .logo.color {
    filter: grayscale(0%) brightness(1);
    opacity: 0.75;
    /* Spring pop effect - overshoots gently then settles */
    animation: springPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes springPop {
    0% {
      transform: scale(0.95);
      opacity: 0.5;
    }
    40% {
      transform: scale(1.06);
      opacity: 0.78;
    }
    70% {
      transform: scale(0.99);
      opacity: 0.74;
    }
    85% {
      transform: scale(1.02);
      opacity: 0.76;
    }
    100% {
      transform: scale(1);
      opacity: 0.75;
    }
  }
</style>
