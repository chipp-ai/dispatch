<script lang="ts">
  import { onMount } from "svelte";

  export let showShimmer: boolean = true;

  let isMobile = false;
  let isDarkMode = false;

  onMount(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };

    const checkDarkMode = () => {
      isDarkMode = document.documentElement.classList.contains("dark");
    };

    checkMobile();
    checkDarkMode();

    window.addEventListener("resize", checkMobile);

    // Watch for dark mode changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          checkDarkMode();
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });

    return () => {
      window.removeEventListener("resize", checkMobile);
      observer.disconnect();
    };
  });
</script>

<div class="gradient-effects" class:dark-mode={isDarkMode}>
  {#if isDarkMode}
    <!-- Dark mode: subtle constellation-style radial gradients -->
    <div class="dark-gradient left-glow"></div>
    <div class="dark-gradient right-glow"></div>
  {:else}
  <!-- Light mode: bright yellow/orange sun gradients -->
  <div class="gradient-wrapper">
    <!-- Left Gradient -->
    <div class="gradient-container left">
      <!-- Shimmer overlay - desktop only -->
      {#if showShimmer && !isMobile}
        <div class="shimmer-overlay"></div>
      {/if}

      <div class="gradient-inner">
        <!-- Wide Ellipse (orange) -->
        <div class="wide-ellipse">
          <svg viewBox="0 0 302 69" preserveAspectRatio="none">
            <g style="mix-blend-mode: plus-lighter" opacity="0.31">
              <path
                d="M299.317 36.6555C298.283 54.1482 191.71 66.8453 142.704 66.1576C93.6978 65.47 1.78551 49.9879 2.8194 32.4952C3.85328 15.0024 97.4418 2.12321 146.448 2.81084C195.454 3.49846 300.351 19.1628 299.317 36.6555Z"
                fill="#FF6F30"
              />
            </g>
          </svg>
        </div>

        <!-- Ellipse 1 (yellow, large) -->
        <div class="ellipse-1">
          <svg viewBox="0 0 303 205">
            <path
              d="M 302.247 102.971 C 302.247 46.638 234.759 0.971 151.509 0.971 C 68.259 0.971 0.771 46.638 0.771 102.971 C 0.771 159.304 68.259 204.971 151.509 204.971 C 234.759 204.971 302.247 159.304 302.247 102.971 Z"
              fill="#F9D200"
            />
          </svg>
        </div>

        <!-- Ellipse 2 (yellow, rotated) -->
        <div class="ellipse-2">
          <svg viewBox="0 0 288 282">
            <path
              d="M 67.298 -8.305 C 13.754 9.199 -8.682 87.536 17.187 166.666 C 43.055 245.795 107.432 295.752 160.976 278.247 C 214.521 260.743 236.957 182.406 211.088 103.276 C 185.22 24.147 120.843 -25.81 67.298 -8.305 Z"
              fill="#F9D200"
              opacity="0.7"
            />
          </svg>
        </div>

        <!-- Light Ellipse -->
        <div class="light-ellipse">
          <div class="light-ellipse-inner"></div>
        </div>

        <!-- Light Beams -->
        <div class="light-rectangle rect-1">
          <div class="light-rect-inner"></div>
        </div>
        <div class="light-rectangle rect-2">
          <div class="light-rect-inner"></div>
        </div>
        <div class="light-rectangle rect-3">
          <div class="light-rect-inner"></div>
        </div>
        <div class="light-beam beam-1">
          <svg viewBox="0 0 90 310">
            <defs>
              <linearGradient id="leftBeam1" x1="0.336" x2="0.664" y1="0" y2="1">
                <stop offset="0" stop-color="#F9D200" stop-opacity="1" />
                <stop offset="1" stop-color="rgb(255, 255, 255)" stop-opacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 0.077 11.566 L 0 0 L 53 300.131 L 34.547 301 Z"
              transform="translate(5.433 -1.53) rotate(-3 26.5 150.5)"
              fill="url(#leftBeam1)"
            />
          </svg>
        </div>
        <div class="light-beam beam-2">
          <svg viewBox="0 0 90 310">
            <defs>
              <linearGradient id="leftBeam2" x1="0.336" x2="0.664" y1="0" y2="1">
                <stop offset="0" stop-color="#F9D200" stop-opacity="1" />
                <stop offset="1" stop-color="rgb(255, 255, 255)" stop-opacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 0.077 11.566 L 0 0 L 53 300.131 L 34.547 301 Z"
              transform="translate(5.433 -1.53) rotate(-3 26.5 150.5)"
              fill="url(#leftBeam2)"
            />
          </svg>
        </div>
      </div>
    </div>

    <!-- Right Gradient -->
    <div class="gradient-container right">
      <!-- Shimmer overlay - desktop only -->
      {#if showShimmer && !isMobile}
        <div class="shimmer-overlay right-shimmer"></div>
      {/if}

      <div class="gradient-inner">
        <!-- Wide Ellipse (orange) -->
        <div class="wide-ellipse">
          <svg viewBox="0 0 302 69" preserveAspectRatio="none">
            <g style="mix-blend-mode: plus-lighter" opacity="0.31">
              <path
                d="M299.317 36.6555C298.283 54.1482 191.71 66.8453 142.704 66.1576C93.6978 65.47 1.78551 49.9879 2.8194 32.4952C3.85328 15.0024 97.4418 2.12321 146.448 2.81084C195.454 3.49846 300.351 19.1628 299.317 36.6555Z"
                fill="#FF6F30"
              />
            </g>
          </svg>
        </div>

        <!-- Ellipse 1 (yellow, large) -->
        <div class="ellipse-1">
          <svg viewBox="0 0 303 205">
            <path
              d="M 302.247 102.971 C 302.247 46.638 234.759 0.971 151.509 0.971 C 68.259 0.971 0.771 46.638 0.771 102.971 C 0.771 159.304 68.259 204.971 151.509 204.971 C 234.759 204.971 302.247 159.304 302.247 102.971 Z"
              fill="#F9D200"
            />
          </svg>
        </div>

        <!-- Ellipse 2 (yellow, rotated) -->
        <div class="ellipse-2">
          <svg viewBox="0 0 288 282">
            <path
              d="M 67.298 -8.305 C 13.754 9.199 -8.682 87.536 17.187 166.666 C 43.055 245.795 107.432 295.752 160.976 278.247 C 214.521 260.743 236.957 182.406 211.088 103.276 C 185.22 24.147 120.843 -25.81 67.298 -8.305 Z"
              fill="#F9D200"
              opacity="0.7"
            />
          </svg>
        </div>

        <!-- Light Ellipse -->
        <div class="light-ellipse">
          <div class="light-ellipse-inner"></div>
        </div>

        <!-- Light Beams -->
        <div class="light-rectangle rect-1">
          <div class="light-rect-inner"></div>
        </div>
        <div class="light-rectangle rect-2">
          <div class="light-rect-inner"></div>
        </div>
        <div class="light-rectangle rect-3">
          <div class="light-rect-inner"></div>
        </div>
        <div class="light-beam beam-1">
          <svg viewBox="0 0 90 310">
            <defs>
              <linearGradient id="rightBeam1" x1="0.336" x2="0.664" y1="0" y2="1">
                <stop offset="0" stop-color="#F9D200" stop-opacity="1" />
                <stop offset="1" stop-color="rgb(255, 255, 255)" stop-opacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 0.077 11.566 L 0 0 L 53 300.131 L 34.547 301 Z"
              transform="translate(5.433 -1.53) rotate(-3 26.5 150.5)"
              fill="url(#rightBeam1)"
            />
          </svg>
        </div>
        <div class="light-beam beam-2">
          <svg viewBox="0 0 90 310">
            <defs>
              <linearGradient id="rightBeam2" x1="0.336" x2="0.664" y1="0" y2="1">
                <stop offset="0" stop-color="#F9D200" stop-opacity="1" />
                <stop offset="1" stop-color="rgb(255, 255, 255)" stop-opacity="1" />
              </linearGradient>
            </defs>
            <path
              d="M 0.077 11.566 L 0 0 L 53 300.131 L 34.547 301 Z"
              transform="translate(5.433 -1.53) rotate(-3 26.5 150.5)"
              fill="url(#rightBeam2)"
            />
          </svg>
        </div>
      </div>
    </div>
  </div>
  {/if}
</div>

<style>
  .gradient-effects {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
    top: -120px;
    min-height: calc(100% + 200px);
  }

  .gradient-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    min-height: 600px;
    z-index: 1;
    overflow: hidden;
    display: none;
    align-items: center;
    justify-content: space-between;
    flex-direction: row;
    gap: 10px;
    padding: 0;
  }

  @media (min-width: 768px) {
    .gradient-wrapper {
      display: flex;
    }
  }

  .gradient-container {
    position: relative;
    overflow: hidden;
    width: 434px;
    height: 500px;
  }

  .gradient-container.left {
    transform: rotate(-15deg) rotateY(180deg);
  }

  .gradient-container.right {
    transform: rotate(15deg);
  }

  .gradient-inner {
    width: 100%;
    height: 500px;
    position: relative;
    overflow: hidden;
  }

  /* Wide Ellipse - orange */
  .wide-ellipse {
    position: absolute;
    right: 31px;
    top: -48px;
    width: 280px;
    height: 124px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: blur(35px);
  }

  .wide-ellipse svg {
    width: 302px;
    height: 69px;
  }

  /* Ellipse 1 - main yellow */
  .ellipse-1 {
    position: absolute;
    right: -151px;
    top: -86px;
    width: 298px;
    height: 257px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: blur(50px);
  }

  .ellipse-1 svg {
    width: 303px;
    height: 205px;
  }

  /* Ellipse 2 - secondary yellow */
  .ellipse-2 {
    position: absolute;
    right: 50px;
    top: -100px;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: blur(50px);
  }

  .ellipse-2 svg {
    width: 288px;
    height: 282px;
  }

  /* Light ellipse */
  .light-ellipse {
    position: absolute;
    right: -6px;
    top: -32px;
    width: 87px;
    height: 199px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
  }

  .light-ellipse-inner {
    width: 18px;
    height: 221px;
    background: linear-gradient(180deg, rgb(254, 236, 173) -18%, rgba(255, 154, 58, 0) 80%);
    filter: blur(3.5px);
    border-radius: 100%;
    box-shadow: rgba(0, 0, 0, 0.25) 0px 1px 2px 0px;
    transform: rotate(-20deg);
  }

  /* Light rectangles */
  .light-rectangle {
    position: absolute;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .light-rectangle.rect-1 {
    left: calc(48.5% - 62px);
    top: -100px;
    width: 124px;
    height: 450px;
    filter: blur(8px);
  }

  .light-rectangle.rect-2 {
    left: 90px;
    top: -90px;
    width: 125px;
    height: 440px;
    filter: blur(6px);
    transform: rotate(7deg);
  }

  .light-rectangle.rect-3 {
    right: 61px;
    top: -100px;
    width: 125px;
    height: 440px;
    filter: blur(10px);
    opacity: 0.6;
  }

  .light-rect-inner {
    width: 134px;
    height: 400px;
    background-size: 100% 100%;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 134 337'%3E%3Cg transform='translate(-5.348 3.814)'%3E%3Cdefs%3E%3ClinearGradient id='g1' x1='0.426' x2='0.574' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='rgb(255, 229, 138)'/%3E%3Cstop offset='1' stop-color='rgb(255, 255, 254)'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M 0 1.686 L 57.542 0 L 138.779 325.564 L 56 322.686 Z' fill='url(%23g1)'/%3E%3C/g%3E%3C/svg%3E");
  }

  /* Light beams */
  .light-beam {
    position: absolute;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: blur(8px);
    opacity: 0.6;
    width: 72px;
    height: 250px;
  }

  .light-beam.beam-1 {
    right: 123px;
    top: 100px;
  }

  .light-beam.beam-2 {
    right: 27px;
    top: 60px;
    transform: rotate(-5deg);
  }

  .light-beam svg {
    width: 90px;
    height: 310px;
  }

  /* Shimmer overlay */
  .shimmer-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      transparent 40%,
      rgba(255, 255, 255, 0.5) 50%,
      transparent 60%
    );
    background-size: 200% 100%;
    animation: shimmer 8s linear infinite;
    transform: rotate(-12deg) scale(1.2);
    transform-origin: center center;
  }

  .shimmer-overlay.right-shimmer {
    transform: rotate(12deg) scale(1.2);
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  /* Dark mode styles */
  .gradient-effects.dark-mode {
    overflow: visible;
  }

  .dark-gradient {
    position: absolute;
    top: 0;
    width: 500px;
    height: 400px;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(60px);
  }

  /* Left corner radial - warm orange glow */
  .dark-gradient.left-glow {
    left: -100px;
    background: radial-gradient(
      ellipse at center,
      rgba(249, 115, 22, 0.15) 0%,
      rgba(249, 115, 22, 0.08) 30%,
      rgba(249, 115, 22, 0.03) 50%,
      transparent 70%
    );
  }

  /* Right corner radial - purple/blue glow */
  .dark-gradient.right-glow {
    right: -100px;
    background: radial-gradient(
      ellipse at center,
      rgba(167, 139, 250, 0.12) 0%,
      rgba(139, 92, 246, 0.06) 30%,
      rgba(139, 92, 246, 0.02) 50%,
      transparent 70%
    );
  }
</style>
