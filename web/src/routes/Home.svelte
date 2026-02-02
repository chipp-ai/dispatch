<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";

  onMount(async () => {
    // Get routing decision for the current user
    // - "dashboard" - user has apps (returning user)
    // - "import" - user has legacy data in chipp-admin
    // - "onboarding-v2" - completely new user
    try {
      const res = await fetch("/api/import/routing", {
        credentials: "include",
      });

      if (res.ok) {
        const { data } = await res.json();
        push(`/${data.route}`);
        return;
      }
    } catch (err) {
      console.error("[home] Error getting routing decision:", err);
    }

    // Default: go to onboarding-v2 for new users
    push("/onboarding-v2");
  });
</script>

<div class="loading">
  <div class="spinner"></div>
</div>

<style>
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background));
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid hsl(var(--muted));
    border-top-color: hsl(var(--accent));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
