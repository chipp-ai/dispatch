<script lang="ts">
  /**
   * EnhancedTable
   *
   * Interactive table with:
   * - Column sorting (click header to toggle asc/desc)
   * - Per-column filtering (popover with search)
   * - Cell click to copy
   * - Copy entire table as TSV
   * - Download as CSV
   */
  import { createEventDispatcher } from "svelte";

  export let headers: string[] = [];
  export let rows: string[][] = [];
  export let forceDarkMode: boolean = false;

  const dispatch = createEventDispatcher<{
    copy: { content: string };
  }>();

  // State
  type SortDirection = "asc" | "desc" | null;
  let sortColumn: number | null = null;
  let sortDirection: SortDirection = null;
  let filters: Record<number, string> = {};
  let copiedCell: string | null = null;
  let filterOpenColumn: number | null = null;

  // Computed: sorted and filtered rows
  $: sortedAndFilteredRows = (() => {
    let result = [...rows];

    // Apply filters
    Object.entries(filters).forEach(([colIndex, filterValue]) => {
      if (filterValue) {
        result = result.filter((row) =>
          row[parseInt(colIndex)]
            ?.toLowerCase()
            .includes(filterValue.toLowerCase())
        );
      }
    });

    // Apply sorting
    if (sortColumn !== null && sortDirection) {
      result.sort((a, b) => {
        const aVal = a[sortColumn!] || "";
        const bVal = b[sortColumn!] || "";
        const comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  })();

  $: activeFilterCount = Object.keys(filters).filter((k) => filters[parseInt(k)]).length;

  function handleSort(columnIndex: number) {
    if (sortColumn === columnIndex) {
      if (sortDirection === "asc") {
        sortDirection = "desc";
      } else if (sortDirection === "desc") {
        sortDirection = null;
        sortColumn = null;
      }
    } else {
      sortColumn = columnIndex;
      sortDirection = "asc";
    }
  }

  async function handleCopyCell(content: string, cellId: string) {
    try {
      await navigator.clipboard.writeText(content);
      copiedCell = cellId;
      dispatch("copy", { content });
      setTimeout(() => (copiedCell = null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  async function handleCopyTable() {
    try {
      const headerRow = headers.join("\t");
      const dataRows = sortedAndFilteredRows.map((row) => row.join("\t")).join("\n");
      const tsvContent = `${headerRow}\n${dataRows}`;
      await navigator.clipboard.writeText(tsvContent);
      dispatch("copy", { content: tsvContent });
    } catch (err) {
      console.error("Failed to copy table:", err);
    }
  }

  function handleDownloadCSV() {
    try {
      const csvContent = [
        headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
        ...sortedAndFilteredRows.map((row) =>
          row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", "table_data.csv");
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download CSV:", err);
    }
  }

  function clearAllFilters() {
    filters = {};
  }

  function toggleFilter(columnIndex: number) {
    if (filterOpenColumn === columnIndex) {
      filterOpenColumn = null;
    } else {
      filterOpenColumn = columnIndex;
    }
  }

  function clearColumnFilter(columnIndex: number) {
    const newFilters = { ...filters };
    delete newFilters[columnIndex];
    filters = newFilters;
  }

  function handleFilterInput(columnIndex: number, value: string) {
    filters = { ...filters, [columnIndex]: value };
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".filter-popover") && !target.closest(".filter-trigger")) {
      filterOpenColumn = null;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="enhanced-table" class:dark={forceDarkMode}>
  {#if headers.length === 0 || rows.length === 0}
    <div class="empty-state">No data available</div>
  {:else}
    <!-- Table -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            {#each headers as header, index}
              <th>
                <div class="header-content">
                  <span class="header-text">{header}</span>
                  <div class="header-actions">
                    <!-- Sort button -->
                    <button
                      class="action-btn sort-btn"
                      on:click={() => handleSort(index)}
                      title="Sort by {header}"
                    >
                      {#if sortColumn !== index}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M7 15l5 5 5-5" />
                          <path d="M7 9l5-5 5 5" />
                        </svg>
                      {:else if sortDirection === "asc"}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                      {:else}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      {/if}
                    </button>

                    <!-- Filter button -->
                    <div class="filter-wrapper">
                      <button
                        class="action-btn filter-trigger"
                        class:active={filters[index]}
                        on:click|stopPropagation={() => toggleFilter(index)}
                        title="Filter {header}"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                      </button>

                      {#if filterOpenColumn === index}
                        <div class="filter-popover" on:click|stopPropagation>
                          <div class="filter-header">Filter by {header}</div>
                          <div class="filter-input-row">
                            <input
                              type="text"
                              placeholder="Search..."
                              value={filters[index] || ""}
                              on:input={(e) => handleFilterInput(index, e.currentTarget.value)}
                              class="filter-input"
                            />
                            {#if filters[index]}
                              <button
                                class="clear-filter-btn"
                                on:click={() => clearColumnFilter(index)}
                              >
                                Clear
                              </button>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sortedAndFilteredRows as row, rowIndex}
            <tr>
              {#each row as cell, cellIndex}
                {@const cellId = `${rowIndex}-${cellIndex}`}
                {@const isCopied = copiedCell === cellId}
                <td
                  on:click={() => handleCopyCell(cell, cellId)}
                  title="Click to copy"
                >
                  <span class="cell-text">{cell}</span>
                  <span class="copy-indicator" class:visible={isCopied}>
                    {#if isCopied}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    {/if}
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Table controls -->
    <div class="table-controls">
      <div class="controls-left">
        <span class="row-count">
          {sortedAndFilteredRows.length} of {rows.length} rows
          {#if activeFilterCount > 0}(filtered){/if}
        </span>
        {#if activeFilterCount > 0}
          <button class="clear-all-btn" on:click={clearAllFilters}>
            Clear filters
          </button>
        {/if}
      </div>

      <div class="controls-right">
        <button class="control-btn" on:click={handleCopyTable} title="Copy table">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          <span>Copy table</span>
        </button>

        <button class="control-btn" on:click={handleDownloadCSV} title="Download CSV">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>CSV</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .enhanced-table {
    width: 100%;
  }

  .empty-state {
    padding: var(--space-8);
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .table-container {
    overflow-x: auto;
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
  }

  .dark .table-container {
    border-color: #4b5563;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: hsl(var(--muted) / 0.5);
  }

  .dark thead {
    background: #1f2937;
  }

  th {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    white-space: nowrap;
    border-right: 1px solid hsl(var(--border));
  }

  th:last-child {
    border-right: none;
  }

  .dark th {
    border-color: #4b5563;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .header-text {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--foreground));
  }

  .dark .header-text {
    color: #e5e7eb;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    opacity: 0.5;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    opacity: 1;
    background: hsl(var(--muted));
  }

  .action-btn svg {
    width: 12px;
    height: 12px;
  }

  .action-btn.active {
    opacity: 1;
    background: hsl(217 91% 60% / 0.1);
    color: hsl(217 91% 60%);
  }

  .dark .action-btn.active {
    background: hsl(217 91% 60% / 0.2);
  }

  .filter-wrapper {
    position: relative;
  }

  .filter-popover {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 50;
    width: 280px;
    margin-top: var(--space-1);
    padding: var(--space-3);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }

  .dark .filter-popover {
    background: #1f2937;
    border-color: #4b5563;
  }

  .filter-header {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-2);
    color: hsl(var(--foreground));
  }

  .filter-input-row {
    display: flex;
    gap: var(--space-2);
  }

  .filter-input {
    flex: 1;
    padding: var(--space-2);
    font-size: var(--text-sm);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    color: hsl(var(--foreground));
  }

  .filter-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }

  .dark .filter-input {
    background: #111827;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  .clear-filter-btn {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-filter-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  tbody tr {
    border-top: 1px solid hsl(var(--border));
    transition: background 0.15s ease;
  }

  tbody tr:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .dark tbody tr {
    border-color: #4b5563;
  }

  .dark tbody tr:hover {
    background: #1f2937;
  }

  td {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    white-space: nowrap;
    border-right: 1px solid hsl(var(--border));
    cursor: pointer;
    position: relative;
  }

  td:last-child {
    border-right: none;
  }

  .dark td {
    color: #e5e7eb;
    border-color: #374151;
  }

  .cell-text {
    display: block;
    padding-right: var(--space-6);
  }

  .copy-indicator {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    transition: opacity 0.15s ease;
    color: hsl(var(--muted-foreground));
  }

  .copy-indicator.visible {
    opacity: 1;
    color: hsl(142 76% 36%);
  }

  tr:hover .copy-indicator {
    opacity: 1;
  }

  .copy-indicator svg {
    width: 14px;
    height: 14px;
  }

  .table-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-3);
    padding: 0 var(--space-1);
  }

  .controls-left,
  .controls-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .row-count {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .clear-all-btn {
    font-size: var(--text-xs);
    padding: var(--space-1) var(--space-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-all-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .control-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .control-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .control-btn svg {
    width: 12px;
    height: 12px;
  }
</style>
