<script lang="ts">
  /**
   * InstallPrompt
   *
   * Handles the native browser install prompt (beforeinstallprompt event).
   * Shows a custom UI that triggers the browser's native PWA installation.
   * Only works on supported browsers (Chrome, Edge, Samsung Internet, etc.)
   */
  import { onMount, onDestroy } from 'svelte';

  export let appName: string = 'App';
  export let appId: string = '';
  export let logoUrl: string = '';
  export let primaryColor: string = '#4499ff';

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let showInstallPrompt = false;
  let showMinimalButton = false;
  let isInstalled = false;
  let isMobile = false;
  let promptTimeout: ReturnType<typeof setTimeout> | null = null;

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

  function isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const mobileKeywords = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/;

    if (mobileKeywords.test(userAgent)) return true;
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    if (window.innerWidth <= 768) return true;

    return false;
  }

  function handleBeforeInstallPrompt(e: Event) {
    console.log('[InstallPrompt] beforeinstallprompt event fired', e);
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    showMinimalButton = true;

    // Show full prompt after delay
    promptTimeout = setTimeout(() => {
      showInstallPrompt = true;
      showMinimalButton = false;
    }, 3000);
  }

  function handlePWAInstallReady(e: CustomEvent) {
    console.log('[InstallPrompt] pwainstallready event received', e.detail);
    deferredPrompt = e.detail as BeforeInstallPromptEvent;
    showMinimalButton = true;

    promptTimeout = setTimeout(() => {
      showInstallPrompt = true;
      showMinimalButton = false;
    }, 3000);
  }

  function handleAppInstalled() {
    console.log('[InstallPrompt] App was installed');
    isInstalled = true;
    showInstallPrompt = false;
    showMinimalButton = false;
    deferredPrompt = null;
    if (promptTimeout) clearTimeout(promptTimeout);
  }

  async function handleInstallClick() {
    console.log('[InstallPrompt] Install button clicked', { hasDeferredPrompt: !!deferredPrompt });

    if (!deferredPrompt) {
      console.error('[InstallPrompt] No installation prompt available');
      return;
    }

    try {
      showInstallPrompt = false;
      showMinimalButton = false;

      console.log('[InstallPrompt] Calling prompt()...');
      await deferredPrompt.prompt();
      console.log('[InstallPrompt] prompt() called successfully');

      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[InstallPrompt] User response: ${outcome}`);

      if (outcome === 'accepted') {
        console.log('[InstallPrompt] User accepted the install prompt');
      } else {
        console.log('[InstallPrompt] User dismissed the install prompt');
      }
    } catch (error) {
      console.error('[InstallPrompt] Error showing install prompt:', error);
      showInstallPrompt = true;
    } finally {
      deferredPrompt = null;
    }
  }

  function handleDismiss() {
    console.log('[InstallPrompt] User dismissed custom install prompt');
    showInstallPrompt = false;
    showMinimalButton = false;
    deferredPrompt = null;
    if (promptTimeout) clearTimeout(promptTimeout);

    // Remember dismissal for this app
    if (appId) {
      localStorage.setItem(`pwa-install-dismissed-${appId}`, 'true');
    }
  }

  onMount(() => {
    isMobile = isMobileDevice();

    // Don't show on desktop
    if (!isMobile) {
      console.log('[InstallPrompt] Disabled on desktop');
      return;
    }

    // Check for secure context
    if (!window.isSecureContext) {
      console.warn('[InstallPrompt] Requires secure context (HTTPS)');
      return;
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[InstallPrompt] App is already installed');
      isInstalled = true;
      return;
    }

    // Check if dismissed
    const dismissed = localStorage.getItem(`pwa-install-dismissed-${appId}`);
    if (dismissed) {
      console.log('[InstallPrompt] Previously dismissed');
      return;
    }

    // Check if prompt was already captured by pwa-init.js
    if ((window as any).deferredInstallPrompt) {
      console.log('[InstallPrompt] Using globally stored install prompt');
      deferredPrompt = (window as any).deferredInstallPrompt;
      showMinimalButton = true;

      promptTimeout = setTimeout(() => {
        showInstallPrompt = true;
        showMinimalButton = false;
      }, 3000);
    }

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwainstallready', handlePWAInstallReady as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    console.log('[InstallPrompt] Component mounted, listening for events');
  });

  onDestroy(() => {
    if (typeof window === 'undefined') return;

    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('pwainstallready', handlePWAInstallReady as EventListener);
    window.removeEventListener('appinstalled', handleAppInstalled);

    if (promptTimeout) clearTimeout(promptTimeout);
  });

  $: shouldRender = !isInstalled && isMobile && (showMinimalButton || showInstallPrompt) && deferredPrompt;
</script>

{#if shouldRender}
  {#if showMinimalButton && !showInstallPrompt}
    <!-- Minimal floating button -->
    <button
      class="minimal-button"
      style="background-color: {primaryColor}"
      on:click={handleInstallClick}
      title="Install app"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke={textColor} stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
    </button>
  {:else if showInstallPrompt}
    <!-- Full install prompt -->
    <div class="install-prompt">
      <div class="prompt-card">
        <div class="prompt-content">
          {#if logoUrl}
            <img src={logoUrl} alt={appName} class="app-logo" />
          {:else}
            <div class="app-logo-placeholder" style="background-color: {primaryColor}">
              <svg viewBox="0 0 24 24" fill="none" stroke={textColor} stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </div>
          {/if}
          <div class="prompt-text">
            <h3>Install {appName}</h3>
            <p>Install this app on your device for quick access and offline use</p>
            <div class="prompt-actions">
              <button
                class="btn-install"
                style="background-color: {primaryColor}; color: {textColor}"
                on:click={handleInstallClick}
              >
                Install
              </button>
              <button class="btn-dismiss" on:click={handleDismiss}>
                Not now
              </button>
            </div>
          </div>
          <button class="btn-close" on:click={handleDismiss} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .minimal-button {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 9998;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .minimal-button:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .minimal-button svg {
    width: 20px;
    height: 20px;
  }

  .install-prompt {
    position: fixed;
    bottom: 16px;
    left: 16px;
    right: 16px;
    z-index: 9998;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (min-width: 640px) {
    .install-prompt {
      left: auto;
      right: 16px;
      width: 384px;
    }
  }

  .prompt-card {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .prompt-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
  }

  .app-logo {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    object-fit: cover;
    flex-shrink: 0;
  }

  .app-logo-placeholder {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .app-logo-placeholder svg {
    width: 24px;
    height: 24px;
  }

  .prompt-text {
    flex: 1;
    min-width: 0;
  }

  .prompt-text h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
  }

  .prompt-text p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 12px 0;
    line-height: 1.4;
  }

  .prompt-actions {
    display: flex;
    gap: 8px;
  }

  .btn-install {
    padding: 8px 16px;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-install:hover {
    opacity: 0.9;
  }

  .btn-dismiss {
    padding: 8px 16px;
    border: none;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-dismiss:hover {
    background: hsl(var(--muted) / 0.8);
  }

  .btn-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: color 0.2s, background-color 0.2s;
  }

  .btn-close:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--muted));
  }

  .btn-close svg {
    width: 16px;
    height: 16px;
  }
</style>
