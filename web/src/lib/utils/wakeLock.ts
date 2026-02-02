/**
 * Wake Lock Utility
 *
 * Prevents the screen from sleeping while active.
 * Uses the Screen Wake Lock API to keep the display on during voice calls.
 *
 * Usage with Svelte:
 *   import { createWakeLock } from '$lib/utils/wakeLock';
 *
 *   let wakeLock = createWakeLock();
 *
 *   // Enable wake lock
 *   wakeLock.enable();
 *
 *   // Disable wake lock
 *   wakeLock.disable();
 *
 *   // Use reactive statement
 *   $: if (isVoiceMode) wakeLock.enable(); else wakeLock.disable();
 *
 *   // Clean up on component destroy
 *   onDestroy(() => wakeLock.disable());
 */

interface WakeLockController {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  isActive: () => boolean;
}

/**
 * Creates a wake lock controller for managing screen wake lock state.
 * Handles visibility change events to re-acquire the lock when page becomes visible.
 */
export function createWakeLock(): WakeLockController {
  let wakeLockSentinel: WakeLockSentinel | null = null;
  let enabled = false;

  const requestWakeLock = async (): Promise<void> => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      console.log("[WakeLock] Screen Wake Lock API not supported");
      return;
    }

    try {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      console.log("[WakeLock] Screen wake lock acquired");

      wakeLockSentinel.addEventListener("release", () => {
        console.log("[WakeLock] Screen wake lock released");
      });
    } catch (err) {
      // Wake lock request can fail if:
      // - Page is not visible
      // - User denied permission
      // - Low battery mode on some devices
      console.log("[WakeLock] Failed to acquire wake lock:", err);
    }
  };

  const releaseWakeLock = async (): Promise<void> => {
    if (wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      } catch (err) {
        console.log("[WakeLock] Failed to release wake lock:", err);
      }
    }
  };

  const handleVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState === "visible" && enabled) {
      // Re-acquire the wake lock when page becomes visible again
      await requestWakeLock();
    }
  };

  return {
    enable: async (): Promise<void> => {
      if (enabled) return;
      enabled = true;

      // Add visibility change listener
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }

      await requestWakeLock();
    },

    disable: async (): Promise<void> => {
      if (!enabled) return;
      enabled = false;

      // Remove visibility change listener
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      }

      await releaseWakeLock();
    },

    isActive: (): boolean => {
      return wakeLockSentinel !== null;
    },
  };
}
