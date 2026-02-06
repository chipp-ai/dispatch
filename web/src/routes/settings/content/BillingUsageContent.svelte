<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Skeleton } from "$lib/design-system";
  import { Download, TrendingUp, Zap, Hash } from "lucide-svelte";

  type Dimension = "model" | "app" | "agentType";
  type Preset = "7d" | "30d" | "90d";

  interface UsageRow {
    dimension: string;
    dimensionId?: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalRequests: number;
    estimatedCostCents: number;
  }

  interface UsageData {
    data: UsageRow[];
    totals: {
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      totalRequests: number;
      estimatedCostCents: number;
    };
    periodStart: string;
    periodEnd: string;
  }

  let isLoading = true;
  let error: string | null = null;
  let usageData: UsageData | null = null;

  let selectedDimension: Dimension = "model";
  let selectedPreset: Preset = "30d";
  let customStartDate = "";
  let customEndDate = "";

  // Sort state
  let sortColumn: keyof UsageRow = "totalTokens";
  let sortDirection: "asc" | "desc" = "desc";

  function getDateRange(preset: Preset): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    start.setDate(start.getDate() - days);
    return { start, end };
  }

  async function fetchUsageData() {
    isLoading = true;
    error = null;

    try {
      let startDate: string;
      let endDate: string;

      if (customStartDate && customEndDate) {
        startDate = new Date(customStartDate).toISOString();
        endDate = new Date(customEndDate).toISOString();
      } else {
        const range = getDateRange(selectedPreset);
        startDate = range.start.toISOString();
        endDate = range.end.toISOString();
      }

      const params = new URLSearchParams({
        startDate,
        endDate,
        groupBy: selectedDimension,
      });

      const res = await fetch(`/api/billing/usage-analytics?${params}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to load usage data");
      const json = await res.json();
      usageData = json.data;
    } catch (e: any) {
      error = e.message || "Failed to load usage data";
    } finally {
      isLoading = false;
    }
  }

  function selectPreset(preset: Preset) {
    selectedPreset = preset;
    customStartDate = "";
    customEndDate = "";
    fetchUsageData();
  }

  function selectDimension(dim: Dimension) {
    selectedDimension = dim;
    fetchUsageData();
  }

  function sortBy(column: keyof UsageRow) {
    if (sortColumn === column) {
      sortDirection = sortDirection === "desc" ? "asc" : "desc";
    } else {
      sortColumn = column;
      sortDirection = "desc";
    }
  }

  $: sortedData = usageData?.data
    ? [...usageData.data].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "desc" ? bVal - aVal : aVal - bVal;
        }
        const aStr = String(aVal || "");
        const bStr = String(bVal || "");
        return sortDirection === "desc"
          ? bStr.localeCompare(aStr)
          : aStr.localeCompare(bStr);
      })
    : [];

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function exportCSV() {
    if (!sortedData.length) return;

    const headers = [
      getDimensionLabel(),
      "Total Tokens",
      "Input Tokens",
      "Output Tokens",
      "Requests",
      "Est. Credits",
    ];

    const rows = sortedData.map((row) => [
      row.dimension,
      row.totalTokens,
      row.inputTokens,
      row.outputTokens,
      row.totalRequests,
      formatCents(row.estimatedCostCents),
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${selectedDimension}-${selectedPreset}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getDimensionLabel(): string {
    switch (selectedDimension) {
      case "model": return "Model";
      case "app": return "Application";
      case "agentType": return "Source";
      default: return "Dimension";
    }
  }

  // Calculate bar widths for visual representation
  function getBarWidth(value: number, max: number): number {
    if (max === 0) return 0;
    return Math.max(2, (value / max) * 100);
  }

  const presetOptions: { value: Preset; label: string }[] = [
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
    { value: "90d", label: "90 Days" },
  ];

  const dimensionOptions: { value: Dimension; label: string }[] = [
    { value: "model", label: "Model" },
    { value: "app", label: "Application" },
    { value: "agentType", label: "Source" },
  ];

  $: maxTokens = sortedData.reduce((max, row) => Math.max(max, row.totalTokens), 0);

  onMount(() => {
    fetchUsageData();
  });
</script>

<div class="usage-page">
  <!-- Date Range Selector -->
  <div class="controls">
    <div class="presets">
      {#each presetOptions as item}
        <button
          class="preset-btn"
          class:active={selectedPreset === item.value && !customStartDate}
          on:click={() => selectPreset(item.value)}
        >
          {item.label}
        </button>
      {/each}
      <div class="custom-dates">
        <input
          type="date"
          bind:value={customStartDate}
          on:change={() => { if (customStartDate && customEndDate) fetchUsageData(); }}
          class="date-input"
        />
        <span class="date-sep">to</span>
        <input
          type="date"
          bind:value={customEndDate}
          on:change={() => { if (customStartDate && customEndDate) fetchUsageData(); }}
          class="date-input"
        />
      </div>
    </div>

    <div class="actions">
      <Button variant="outline" size="sm" on:click={exportCSV} disabled={!sortedData.length}>
        <Download size={14} />
        Export CSV
      </Button>
    </div>
  </div>

  <!-- Dimension Tabs -->
  <div class="dimension-tabs">
    {#each dimensionOptions as item}
      <button
        class="tab"
        class:active={selectedDimension === item.value}
        on:click={() => selectDimension(item.value)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  {#if isLoading}
    <div class="summary-cards">
      {#each [1, 2, 3] as _}
        <Card>
          <div class="summary-card">
            <Skeleton class="skel-label" />
            <Skeleton class="skel-value" />
          </div>
        </Card>
      {/each}
    </div>
    <Card>
      <div class="table-skeleton">
        {#each [1, 2, 3, 4, 5] as _}
          <Skeleton class="skel-row" />
        {/each}
      </div>
    </Card>
  {:else if error}
    <Card>
      <div class="error-state">
        <p>{error}</p>
        <Button variant="outline" size="sm" on:click={fetchUsageData}>Retry</Button>
      </div>
    </Card>
  {:else if usageData}
    <!-- Summary Cards -->
    <div class="summary-cards">
      <Card>
        <div class="summary-card">
          <div class="summary-icon tokens">
            <Zap size={16} />
          </div>
          <div class="summary-label">Total Tokens</div>
          <div class="summary-value">{formatTokens(usageData.totals.totalTokens)}</div>
        </div>
      </Card>
      <Card>
        <div class="summary-card">
          <div class="summary-icon credits">
            <TrendingUp size={16} />
          </div>
          <div class="summary-label">Est. Credits</div>
          <div class="summary-value">{formatCents(usageData.totals.estimatedCostCents)}</div>
        </div>
      </Card>
      <Card>
        <div class="summary-card">
          <div class="summary-icon requests">
            <Hash size={16} />
          </div>
          <div class="summary-label">Requests</div>
          <div class="summary-value">{usageData.totals.totalRequests.toLocaleString()}</div>
        </div>
      </Card>
    </div>

    <!-- Usage Table -->
    {#if sortedData.length === 0}
      <Card>
        <div class="empty-state">
          <TrendingUp size={32} />
          <p>No usage data for this period</p>
        </div>
      </Card>
    {:else}
      <Card>
        <div class="table-container">
          <table class="usage-table">
            <thead>
              <tr>
                <th class="col-name" on:click={() => sortBy("dimension")}>
                  {getDimensionLabel()}
                  {#if sortColumn === "dimension"}{sortDirection === "desc" ? " ↓" : " ↑"}{/if}
                </th>
                <th class="col-bar">Usage</th>
                <th class="col-num" on:click={() => sortBy("totalTokens")}>
                  Tokens
                  {#if sortColumn === "totalTokens"}{sortDirection === "desc" ? " ↓" : " ↑"}{/if}
                </th>
                <th class="col-num" on:click={() => sortBy("inputTokens")}>
                  Input
                  {#if sortColumn === "inputTokens"}{sortDirection === "desc" ? " ↓" : " ↑"}{/if}
                </th>
                <th class="col-num" on:click={() => sortBy("outputTokens")}>
                  Output
                  {#if sortColumn === "outputTokens"}{sortDirection === "desc" ? " ↓" : " ↑"}{/if}
                </th>
                <th class="col-num" on:click={() => sortBy("estimatedCostCents")}>
                  Est. Credits
                  {#if sortColumn === "estimatedCostCents"}{sortDirection === "desc" ? " ↓" : " ↑"}{/if}
                </th>
                <th class="col-num" on:click={() => sortBy("totalRequests")}>
                  Requests
                  {#if sortColumn === "totalRequests"}{sortDirection === "desc" ? " ↓" : " ↑"}{/if}
                </th>
              </tr>
            </thead>
            <tbody>
              {#each sortedData as row}
                <tr>
                  <td class="col-name">{row.dimension}</td>
                  <td class="col-bar">
                    <div class="bar-container">
                      <div class="bar" style="width: {getBarWidth(row.totalTokens, maxTokens)}%"></div>
                    </div>
                  </td>
                  <td class="col-num">{formatTokens(row.totalTokens)}</td>
                  <td class="col-num muted">{formatTokens(row.inputTokens)}</td>
                  <td class="col-num muted">{formatTokens(row.outputTokens)}</td>
                  <td class="col-num">{formatCents(row.estimatedCostCents)}</td>
                  <td class="col-num muted">{row.totalRequests.toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    {/if}
  {/if}
</div>

<style>
  .usage-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Controls */
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .presets {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .preset-btn {
    padding: var(--space-1-5) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
  }

  .preset-btn.active {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
  }

  .custom-dates {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-left: var(--space-2);
  }

  .date-input {
    padding: var(--space-1) var(--space-2);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-xs);
  }

  .date-sep {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  /* Dimension Tabs */
  .dimension-tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: 0;
  }

  .tab {
    padding: var(--space-2) var(--space-4);
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 0.2s;
  }

  .tab:hover {
    color: hsl(var(--foreground));
  }

  .tab.active {
    color: hsl(var(--foreground));
    border-bottom-color: hsl(var(--primary));
  }

  /* Summary Cards */
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }

  .summary-card {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .summary-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .summary-icon.tokens {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .summary-icon.credits {
    background: hsl(142 71% 45% / 0.1);
    color: hsl(142 71% 45%);
  }

  .summary-icon.requests {
    background: hsl(38 92% 50% / 0.1);
    color: hsl(38 92% 50%);
  }

  .summary-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  /* Table */
  .table-container {
    overflow-x: auto;
  }

  .usage-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .usage-table th {
    text-align: left;
    padding: var(--space-3) var(--space-4);
    font-weight: var(--font-medium);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid hsl(var(--border));
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }

  .usage-table th:hover {
    color: hsl(var(--foreground));
  }

  .usage-table td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }

  .usage-table tbody tr:hover {
    background: hsl(var(--muted) / 0.3);
  }

  .col-name {
    min-width: 150px;
    font-weight: var(--font-medium);
  }

  .col-num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .col-num.muted {
    color: hsl(var(--muted-foreground));
  }

  .col-bar {
    width: 120px;
    min-width: 80px;
  }

  .bar-container {
    height: 8px;
    background: hsl(var(--muted) / 0.3);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: hsl(var(--primary));
    border-radius: 4px;
    transition: width 0.3s ease;
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

  .empty-state {
    padding: var(--space-12);
    text-align: center;
    color: hsl(var(--muted-foreground));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  .table-skeleton {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  :global(.skel-label) {
    height: 16px;
    width: 80px;
  }

  :global(.skel-value) {
    height: 28px;
    width: 100px;
  }

  :global(.skel-row) {
    height: 40px;
    width: 100%;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .summary-cards {
      grid-template-columns: 1fr;
    }

    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .presets {
      flex-wrap: wrap;
    }

    .custom-dates {
      margin-left: 0;
      margin-top: var(--space-2);
    }

    .col-bar {
      display: none;
    }
  }
</style>
