// PWA initialization script - captures beforeinstallprompt early
(function () {
  console.log("[PWA Init] Script loaded");

  // Store the event globally
  window.deferredInstallPrompt = null;

  // Flag to track if event was fired
  window.pwaPromptFired = false;

  window.addEventListener("beforeinstallprompt", function (e) {
    console.log("[PWA Init] beforeinstallprompt event captured!", e);
    e.preventDefault();
    window.deferredInstallPrompt = e;
    window.pwaPromptFired = true;

    // Dispatch a custom event that Svelte components can listen for
    window.dispatchEvent(new CustomEvent("pwainstallready", { detail: e }));
  });

  // Also listen for app installed
  window.addEventListener("appinstalled", function () {
    console.log("[PWA Init] App was installed");
    window.deferredInstallPrompt = null;
  });
})();
