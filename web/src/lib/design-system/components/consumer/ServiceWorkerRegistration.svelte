<script lang="ts">
  /**
   * ServiceWorkerRegistration
   *
   * Handles service worker registration and update prompts for consumer PWA.
   * Skips registration in development mode.
   */
  import { onMount } from 'svelte';
  import { toasts } from '$lib/design-system';

  export let swPath: string = '/consumer-sw.js';

  let registration: ServiceWorkerRegistration | null = null;
  let updateAvailable = false;
  let newWorker: ServiceWorker | null = null;

  onMount(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Skip in development
    const isDevelopment =
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('ngrok') ||
      window.location.hostname === '127.0.0.1';

    if (isDevelopment) {
      console.log('[SW] Skipping registration in development');
      // Unregister any existing service worker in dev
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          reg.unregister();
          console.log('[SW] Unregistered:', reg.scope);
        });
      });
      return;
    }

    registerServiceWorker();
  });

  async function registerServiceWorker() {
    try {
      registration = await navigator.serviceWorker.register(swPath, {
        scope: '/',
      });

      console.log('[SW] Registered:', registration.scope);

      // Check for updates periodically
      setInterval(() => {
        registration?.update();
      }, 60 * 60 * 1000); // Every hour

      registration.addEventListener('updatefound', () => {
        newWorker = registration?.installing || null;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker?.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New update available
              updateAvailable = true;
              showUpdateToast();
            } else {
              console.log('[SW] First install complete');
            }
          }
        });
      });

      // Reload when controller changes
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (error) {
      console.error('[SW] Registration failed:', error);
    }
  }

  function showUpdateToast() {
    // Show a simple info toast - the update will happen on next page load
    toasts.info('A new version is available', 'Refresh the page to update.', 10000);
    // Automatically trigger update after a short delay if still on page
    setTimeout(() => {
      handleUpdate();
    }, 2000);
  }

  function handleUpdate() {
    if (newWorker) {
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }
</script>

<!-- This component renders nothing - it just handles SW registration -->
