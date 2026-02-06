<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Switch, Spinner } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { Bell, Info } from "lucide-svelte";

  interface NotificationPref {
    type: string;
    label: string;
    description: string;
    category: string;
    categoryLabel: string;
    enabled: boolean;
  }

  let preferences: NotificationPref[] = [];
  let isLoading = true;
  let isSaving = false;
  let saveSuccess = false;
  let saveError: string | null = null;
  let hasChanges = false;
  let originalState: Record<string, boolean> = {};

  // Group preferences by category
  $: grouped = preferences.reduce<Record<string, { label: string; items: NotificationPref[] }>>((acc, pref) => {
    if (!acc[pref.category]) {
      acc[pref.category] = { label: pref.categoryLabel, items: [] };
    }
    acc[pref.category].items.push(pref);
    return acc;
  }, {});

  $: categoryKeys = Object.keys(grouped);

  onMount(async () => {
    await loadPreferences();
  });

  async function loadPreferences() {
    isLoading = true;
    try {
      const res = await fetch("/api/organization/notification-preferences", {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        preferences = json.data;
        originalState = Object.fromEntries(preferences.map((p) => [p.type, p.enabled]));
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-notifications" },
        extra: { action: "loadPreferences" },
      });
    } finally {
      isLoading = false;
    }
  }

  function handleToggle(type: string, enabled: boolean) {
    preferences = preferences.map((p) => (p.type === type ? { ...p, enabled } : p));
    checkChanges();
  }

  function checkChanges() {
    hasChanges = preferences.some((p) => p.enabled !== originalState[p.type]);
  }

  async function handleSave() {
    if (!hasChanges || isSaving) return;
    isSaving = true;
    saveError = null;
    saveSuccess = false;

    try {
      const body: Record<string, boolean> = {};
      for (const pref of preferences) {
        if (pref.enabled !== originalState[pref.type]) {
          body[pref.type] = pref.enabled;
        }
      }

      const res = await fetch("/api/organization/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save preferences");

      originalState = Object.fromEntries(preferences.map((p) => [p.type, p.enabled]));
      hasChanges = false;
      saveSuccess = true;
      setTimeout(() => { saveSuccess = false; }, 3000);
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Failed to save";
    } finally {
      isSaving = false;
    }
  }

  function handleDiscard() {
    preferences = preferences.map((p) => ({ ...p, enabled: originalState[p.type] }));
    hasChanges = false;
  }
</script>

<div class="page-header">
  <h1>Notification Preferences</h1>
  <p class="page-subtitle">Choose which email notifications you'd like to receive.</p>
</div>

{#if isLoading}
  <div class="loading-container">
    <Spinner size="lg" />
    <p>Loading preferences...</p>
  </div>
{:else}
  <div class="info-banner">
    <Info size={16} />
    <span>Notifications are sent to your email address. All notifications are enabled by default.</span>
  </div>

  {#each categoryKeys as category}
    <section class="settings-section">
      <h2>{grouped[category].label}</h2>
      <Card>
        <div class="toggle-group">
          {#each grouped[category].items as pref}
            <div class="toggle-item">
              <div class="toggle-info">
                <Bell size={18} />
                <div>
                  <h4>{pref.label}</h4>
                  <p>{pref.description}</p>
                </div>
              </div>
              <Switch
                checked={pref.enabled}
                on:change={(e) => handleToggle(pref.type, e.detail)}
              />
            </div>
          {/each}
        </div>
      </Card>
    </section>
  {/each}

  {#if hasChanges || saveError || saveSuccess}
    <div class="save-actions visible">
      <div class="save-status">
        {#if saveError}
          <span class="error-message">{saveError}</span>
        {:else if saveSuccess}
          <span class="success-message">Preferences saved</span>
        {:else if hasChanges}
          <span class="unsaved-message">You have unsaved changes</span>
        {/if}
      </div>
      <div class="save-buttons">
        <Button variant="ghost" on:click={handleDiscard} disabled={!hasChanges || isSaving}>
          Discard
        </Button>
        <Button on:click={handleSave} disabled={!hasChanges || isSaving}>
          {#if isSaving}
            <Spinner size="sm" />
            Saving...
          {:else}
            Save
          {/if}
        </Button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .info-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-6);
  }

  .settings-section {
    margin-bottom: var(--space-8);
  }

  .settings-section h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-lg);
  }

  .toggle-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .toggle-info div h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .toggle-info div p {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .save-actions {
    position: sticky;
    bottom: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    margin-bottom: var(--space-8);
  }

  .save-status {
    font-size: var(--text-sm);
  }

  .error-message {
    color: hsl(var(--destructive));
  }

  .success-message {
    color: hsl(142 76% 36%);
  }

  .unsaved-message {
    color: hsl(var(--muted-foreground));
  }

  .save-buttons {
    display: flex;
    gap: var(--space-2);
  }

  @media (max-width: 768px) {
    .save-actions {
      flex-direction: column;
      gap: var(--space-3);
      align-items: stretch;
    }

    .save-buttons {
      justify-content: flex-end;
    }
  }
</style>
