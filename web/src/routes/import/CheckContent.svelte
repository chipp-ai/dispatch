<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { Spinner } from "$lib/design-system";
  import { user } from "../../stores/auth";

  const dispatch = createEventDispatcher<{
    hasData: { developerId: number };
    noData: void;
    error: { message: string };
  }>();

  let checking = true;
  let error = "";

  onMount(async () => {
    await checkForExistingData();
  });

  async function checkForExistingData() {
    try {
      checking = true;
      error = "";

      const res = await fetch("/api/import/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to check for existing data");
      }

      const { data } = await res.json();

      if (data.hasExistingData && data.developerId) {
        // User has existing data in chipp-admin
        dispatch("hasData", { developerId: data.developerId });
      } else {
        // No existing data, skip to onboarding
        dispatch("noData");
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to check for existing data";
      dispatch("error", { message: error });
    } finally {
      checking = false;
    }
  }
</script>

<div class="check-content">
  {#if checking}
    <div class="loading-state">
      <Spinner size="lg" />
      <h1>Checking for existing data...</h1>
      <p class="subtitle">
        We're checking if you have any existing apps from Chipp that can be imported.
      </p>
    </div>
  {:else if error}
    <div class="error-state">
      <h1>Something went wrong</h1>
      <p class="subtitle">{error}</p>
      <button class="retry-btn" on:click={checkForExistingData}>Try again</button>
    </div>
  {/if}
</div>

<style>
  .check-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
  }

  .loading-state,
  .error-state {
    text-align: center;
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: var(--space-4) 0 var(--space-2) 0;
  }

  .subtitle {
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 320px;
  }

  .error-state {
    color: hsl(var(--destructive));
  }

  .retry-btn {
    margin-top: var(--space-4);
    padding: var(--space-2) var(--space-4);
    background: var(--brand-color);
    color: var(--brand-color-foreground);
    border: none;
    border-radius: var(--radius-md);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .retry-btn:hover {
    opacity: 0.9;
  }
</style>
