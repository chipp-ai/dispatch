<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Skeleton } from "$lib/design-system";
  import { Bell, Info, Plus, X } from "lucide-svelte";
  import { toasts } from "$lib/design-system";

  interface NotificationSettings {
    enabled: boolean;
    defaultPercentage: number;
    thresholds: number[];
    tierAllowanceCents: number;
    subscriptionTier: string;
  }

  let settings: NotificationSettings | null = null;
  let isLoading = true;
  let isSaving = false;
  let error: string | null = null;

  // Form state
  let enabled = true;
  let defaultPercentage = 50;
  let customThresholds: number[] = [];
  let newThresholdInput = "";

  async function fetchSettings() {
    isLoading = true;
    error = null;
    try {
      const res = await fetch("/api/organization/notification-settings", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load notification settings");
      const json = await res.json();
      settings = json.data;

      // Initialize form state
      enabled = settings!.enabled;
      defaultPercentage = settings!.defaultPercentage;
      customThresholds = [...settings!.thresholds];
    } catch (e: any) {
      error = e.message || "Failed to load settings";
    } finally {
      isLoading = false;
    }
  }

  async function saveSettings() {
    isSaving = true;
    try {
      const res = await fetch("/api/organization/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled,
          defaultPercentage,
          thresholds: customThresholds,
        }),
      });

      if (!res.ok) throw new Error("Failed to save settings");
      const json = await res.json();
      settings = json.data;
      toasts.success("Notification settings saved");
    } catch (e: any) {
      toasts.error(e.message || "Failed to save settings");
    } finally {
      isSaving = false;
    }
  }

  function addThreshold() {
    const amount = parseFloat(newThresholdInput);
    if (isNaN(amount) || amount <= 0) return;

    const cents = Math.round(amount * 100);
    if (!customThresholds.includes(cents)) {
      customThresholds = [...customThresholds, cents].sort((a, b) => b - a);
    }
    newThresholdInput = "";
  }

  function removeThreshold(cents: number) {
    customThresholds = customThresholds.filter((t) => t !== cents);
  }

  function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatTierName(tier: string): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  }

  // Calculate effective thresholds for preview
  $: percentageThreshold = settings
    ? Math.round((settings.tierAllowanceCents * defaultPercentage) / 100)
    : 0;

  $: effectiveThresholds = (() => {
    const all = new Set([percentageThreshold, ...customThresholds]);
    all.delete(0);
    return [...all].filter((v) => v > 0).sort((a, b) => b - a);
  })();

  $: hasChanges = settings && (
    enabled !== settings.enabled ||
    defaultPercentage !== settings.defaultPercentage ||
    JSON.stringify(customThresholds) !== JSON.stringify(settings.thresholds)
  );

  onMount(fetchSettings);
</script>

<div class="notifications-page">
  {#if isLoading}
    <Card>
      <div class="card-body">
        <Skeleton class="skel-title" />
        <Skeleton class="skel-desc" />
        <Skeleton class="skel-field" />
        <Skeleton class="skel-field" />
      </div>
    </Card>
  {:else if error}
    <Card>
      <div class="error-state">
        <p>{error}</p>
        <Button variant="outline" size="sm" on:click={fetchSettings}>Retry</Button>
      </div>
    </Card>
  {:else if settings}
    <!-- Enable/Disable Toggle -->
    <Card>
      <div class="card-body">
        <div class="toggle-row">
          <div class="toggle-info">
            <h3 class="card-title">Credit Notifications</h3>
            <p class="card-description">
              Receive email alerts when your credit balance drops below configured thresholds.
            </p>
          </div>
          <label class="toggle">
            <input type="checkbox" bind:checked={enabled} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </Card>

    {#if enabled}
      <!-- Default Percentage -->
      <Card>
        <div class="card-body">
          <h3 class="card-title">Default Alert Threshold</h3>
          <p class="card-description">
            Alert when credits drop below this percentage of your {formatTierName(settings.subscriptionTier)} plan allowance ({formatCents(settings.tierAllowanceCents)}).
          </p>

          <div class="slider-row">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              bind:value={defaultPercentage}
              class="range-slider"
            />
            <span class="slider-value">{defaultPercentage}%</span>
          </div>

          <p class="threshold-preview">
            Alert at {formatCents(percentageThreshold)} remaining
          </p>
        </div>
      </Card>

      <!-- Custom Thresholds -->
      <Card>
        <div class="card-body">
          <h3 class="card-title">Custom Dollar Thresholds</h3>
          <p class="card-description">
            Add specific dollar amounts to trigger notifications.
          </p>

          <div class="threshold-input-row">
            <span class="dollar-sign">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              bind:value={newThresholdInput}
              placeholder="e.g. 5.00"
              class="threshold-input"
              on:keydown={(e) => e.key === "Enter" && addThreshold()}
            />
            <Button variant="outline" size="sm" on:click={addThreshold}>
              <Plus size={14} />
              Add
            </Button>
          </div>

          {#if customThresholds.length > 0}
            <div class="threshold-chips">
              {#each customThresholds as threshold}
                <span class="chip">
                  {formatCents(threshold)}
                  <button class="chip-remove" on:click={() => removeThreshold(threshold)}>
                    <X size={12} />
                  </button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      </Card>

      <!-- Alert Preview -->
      <Card>
        <div class="card-body">
          <h3 class="card-title">Active Alert Thresholds</h3>
          <p class="card-description">
            You will be notified when your balance drops below these amounts:
          </p>

          {#if effectiveThresholds.length > 0}
            <div class="threshold-list">
              {#each effectiveThresholds as threshold, i}
                <div class="threshold-item">
                  <Bell size={14} />
                  <span>{formatCents(threshold)}</span>
                  {#if threshold === percentageThreshold}
                    <span class="threshold-badge">Default ({defaultPercentage}%)</span>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="no-thresholds">No thresholds configured.</p>
          {/if}
        </div>
      </Card>

      <!-- Info Box -->
      <div class="info-box">
        <Info size={16} />
        <div>
          <p>Notifications are sent to all organization owners and editors.</p>
          <p>Maximum one notification email per 24 hours per threshold.</p>
        </div>
      </div>
    {/if}

    <!-- Save Button -->
    {#if hasChanges}
      <div class="save-bar">
        <Button
          variant="default"
          on:click={saveSettings}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .notifications-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .card-body {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card-title {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .card-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  /* Toggle */
  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .toggle-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
    cursor: pointer;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: hsl(var(--muted));
    border-radius: 12px;
    transition: background 0.2s;
  }

  .toggle-slider::before {
    content: "";
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .toggle input:checked + .toggle-slider {
    background: hsl(var(--primary));
  }

  .toggle input:checked + .toggle-slider::before {
    transform: translateX(20px);
  }

  /* Slider */
  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .range-slider {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: hsl(var(--muted));
    border-radius: 3px;
    outline: none;
  }

  .range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: hsl(var(--primary));
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .slider-value {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    min-width: 40px;
    text-align: right;
  }

  .threshold-preview {
    font-size: var(--text-sm);
    color: hsl(var(--primary));
    font-weight: var(--font-medium);
    margin: 0;
  }

  /* Threshold Input */
  .threshold-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dollar-sign {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
  }

  .threshold-input {
    flex: 1;
    max-width: 120px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
  }

  .threshold-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
  }

  /* Chips */
  .threshold-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .chip-remove {
    display: flex;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: hsl(var(--muted-foreground));
    transition: color 0.2s;
  }

  .chip-remove:hover {
    color: hsl(var(--destructive));
  }

  /* Threshold List */
  .threshold-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .threshold-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
  }

  .threshold-item :global(svg) {
    color: hsl(var(--primary));
  }

  .threshold-badge {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.5);
    padding: 1px 6px;
    border-radius: var(--radius-full);
  }

  .no-thresholds {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    font-style: italic;
    margin: 0;
  }

  /* Info Box */
  .info-box {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    background: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
  }

  .info-box :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .info-box p {
    margin: 0;
  }

  .info-box p + p {
    margin-top: var(--space-1);
  }

  /* Save Bar */
  .save-bar {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
  }

  /* States */
  .error-state {
    padding: var(--space-8);
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .error-state p {
    margin-bottom: var(--space-4);
  }

  :global(.skel-title) {
    height: 24px;
    width: 200px;
  }

  :global(.skel-desc) {
    height: 16px;
    width: 300px;
  }

  :global(.skel-field) {
    height: 40px;
    width: 100%;
  }
</style>
