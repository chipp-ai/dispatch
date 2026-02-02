<script lang="ts">
  /**
   * InstallAppButton
   *
   * Shows PWA installation instructions for iOS and Android devices.
   * Only visible on mobile devices (unless debug mode is enabled).
   */
  import { onMount } from 'svelte';
  import Sheet from '../Sheet.svelte';

  export let appName: string = 'App';
  export let appId: string = '';
  export let primaryColor: string = '#4499ff';
  export let variant: 'menu' | 'standalone' = 'menu';

  let isIOS = false;
  let isAndroid = false;
  let isStandalone = false;
  let forceShow = false;
  let open = false;

  // Determine text color based on background
  $: textColor = shouldUseLightText(primaryColor) ? '#FFFFFF' : '#163300';

  function shouldUseLightText(bgColor: string): boolean {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  onMount(() => {
    // Check standalone mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    isStandalone = standalone;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    isIOS =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Detect Android
    isAndroid = /android/.test(userAgent);

    // Check debug mode
    const urlParams = new URLSearchParams(window.location.search);
    forceShow =
      urlParams.get('debug') === 'pwa' ||
      urlParams.get('forceInstallButton') === 'true';
  });

  function handleDontShowAgain() {
    open = false;
    if (appId) {
      localStorage.setItem(
        `install-guide-shown-${appId}`,
        (Date.now() + 30 * 24 * 60 * 60 * 1000).toString()
      );
    }
  }

  // Don't show if not mobile or already installed (unless forced)
  $: shouldShow = forceShow || ((isIOS || isAndroid) && !isStandalone);
</script>

{#if shouldShow}
  {#if variant === 'menu'}
    <button class="menu-item" on:click={() => open = true}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      <div class="menu-item-text">
        <span class="menu-item-title">Install App</span>
        <span class="menu-item-desc">Add to home screen</span>
      </div>
    </button>
  {:else}
    <button class="standalone-button" on:click={() => open = true}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      Install App
    </button>
  {/if}

  <Sheet bind:open side="bottom">
    <div class="sheet-inner-content">
        <div class="handle"></div>

        <h2 class="title">Install {appName}</h2>
        <p class="description">Add this app to your home screen for the best experience</p>

        {#if forceShow && !isIOS && !isAndroid}
          <div class="debug-notice">
            <strong>Debug Mode:</strong> This guide is for iOS and Android devices.
          </div>
        {/if}

        <div class="steps">
          {#if isIOS}
            <div class="step">
              <div class="step-number" style="background-color: {primaryColor}; color: {textColor}">1</div>
              <div class="step-content">
                <p class="step-title">Tap the share button</p>
                <p class="step-desc">
                  Look for the
                  <svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  icon in your browser
                </p>
              </div>
            </div>
            <div class="step">
              <div class="step-number" style="background-color: {primaryColor}; color: {textColor}">2</div>
              <div class="step-content">
                <p class="step-title">Scroll down and tap "Add to Home Screen"</p>
                <p class="step-desc">
                  You'll see a
                  <svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  icon next to it
                </p>
              </div>
            </div>
            <div class="step">
              <div class="step-number" style="background-color: {primaryColor}; color: {textColor}">3</div>
              <div class="step-content">
                <p class="step-title">Tap "Add" to install</p>
                <p class="step-desc">The app will appear on your home screen</p>
              </div>
            </div>
          {:else if isAndroid}
            <div class="step">
              <div class="step-number" style="background-color: {primaryColor}; color: {textColor}">1</div>
              <div class="step-content">
                <p class="step-title">Tap the menu button</p>
                <p class="step-desc">Look for the three dots (⋮) in your browser</p>
              </div>
            </div>
            <div class="step">
              <div class="step-number" style="background-color: {primaryColor}; color: {textColor}">2</div>
              <div class="step-content">
                <p class="step-title">Tap "Install app" or "Add to Home screen"</p>
                <p class="step-desc">The option may vary depending on your browser</p>
              </div>
            </div>
            <div class="step">
              <div class="step-number" style="background-color: {primaryColor}; color: {textColor}">3</div>
              <div class="step-content">
                <p class="step-title">Tap "Install" to confirm</p>
                <p class="step-desc">The app will be added to your home screen</p>
              </div>
            </div>
          {:else}
            <div class="generic-notice">
              Platform-specific installation instructions will appear here on mobile devices.
            </div>
          {/if}
        </div>

        <div class="benefits">
          <p class="benefits-title">Why install?</p>
          <ul>
            <li>Works offline</li>
            <li>Faster loading</li>
            <li>Full-screen experience</li>
            <li>Easy access from home screen</li>
          </ul>
        </div>

        <div class="actions">
          <button
            class="action-primary"
            style="background-color: {primaryColor}; color: {textColor}"
            on:click={() => open = false}
          >
            Got it!
          </button>
          <button class="action-secondary" on:click={handleDontShowAgain}>
            Don't show again
          </button>
        </div>
      </div>
  </Sheet>
{/if}

<style>
  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: hsl(var(--foreground));
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: background-color 0.2s;
  }

  .menu-item:hover {
    background-color: hsl(var(--muted));
  }

  .menu-item svg {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .menu-item-text {
    flex: 1;
    min-width: 0;
  }

  .menu-item-title {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .menu-item-desc {
    display: block;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .standalone-button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .standalone-button:hover {
    background: hsl(var(--muted));
  }

  .standalone-button svg {
    width: 16px;
    height: 16px;
  }

  .sheet-inner-content {
    padding: var(--space-6);
    padding-bottom: var(--space-8);
  }

  .handle {
    width: 48px;
    height: 4px;
    background: hsl(var(--border));
    border-radius: var(--radius-full);
    margin: 0 auto var(--space-4);
  }

  .title {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .description {
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-6);
  }

  .debug-notice {
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    background: hsl(45 93% 94%);
    border: 1px solid hsl(45 90% 80%);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: hsl(45 93% 25%);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .step-number {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: var(--font-semibold);
  }

  .step-content {
    flex: 1;
  }

  .step-title {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-1);
  }

  .step-desc {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .inline-icon {
    display: inline;
    width: 16px;
    height: 16px;
    vertical-align: middle;
  }

  .generic-notice {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: var(--space-8) 0;
  }

  .benefits {
    margin-top: var(--space-6);
    padding: var(--space-4);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-lg);
  }

  .benefits-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .benefits ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .benefits li {
    padding-left: var(--space-4);
    position: relative;
  }

  .benefits li::before {
    content: '•';
    position: absolute;
    left: 0;
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }

  .action-primary {
    flex: 1;
    padding: var(--space-3) var(--space-4);
    border: none;
    border-radius: var(--radius-lg);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .action-primary:hover {
    opacity: 0.9;
  }

  .action-secondary {
    padding: var(--space-3) var(--space-4);
    border: none;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    border-radius: var(--radius-lg);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .action-secondary:hover {
    background: hsl(var(--muted) / 0.8);
  }
</style>
