<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { captureException } from "$lib/sentry";
  import Button from "../lib/design-system/components/Button.svelte";

  export let params: { appId?: string; collectionId?: string } = {};

  const STATUS_CONFIG: Record<
    string,
    { color: string; bgColor: string; label: string }
  > = {
    PENDING: {
      color: "var(--text-warning)",
      bgColor: "var(--bg-warning)",
      label: "Pending",
    },
    APPROVED: {
      color: "var(--text-success)",
      bgColor: "var(--bg-success)",
      label: "Approved",
    },
    REJECTED: {
      color: "var(--text-error)",
      bgColor: "var(--bg-error)",
      label: "Rejected",
    },
    MERGED: {
      color: "var(--text-info)",
      bgColor: "var(--bg-info)",
      label: "Merged",
    },
  };

  interface Contributor {
    id: string;
    email: string;
    name?: string;
  }

  interface Contribution {
    id: string;
    actionId: string;
    description: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "MERGED";
    contribution: Record<string, unknown>;
    createdAt: string;
    reviewedAt?: string;
    reviewNotes?: string;
    contributor?: Contributor;
    reviewer?: Contributor;
  }

  interface Collection {
    id: string;
    name: string;
    description: string;
  }

  let contributions: Contribution[] = [];
  let collection: Collection | null = null;
  let isLoading = true;
  let error: string | null = null;
  let activeTab: string = "PENDING";
  let selectedContribution: Contribution | null = null;
  let reviewDialogOpen = false;
  let reviewAction: "APPROVED" | "REJECTED" | null = null;
  let reviewNotes = "";
  let isSubmitting = false;

  const tabs = ["PENDING", "MERGED", "APPROVED", "REJECTED", "ALL"];

  onMount(async () => {
    if (!params.appId || !params.collectionId) {
      push("/apps");
      return;
    }
    await Promise.all([loadContributions(), loadCollection()]);
  });

  async function loadCollection() {
    try {
      const response = await fetch(
        `/api/action-collections/${params.collectionId}`,
        { credentials: "include" }
      );
      if (response.ok) {
        const result = await response.json();
        collection = result.data;
      }
    } catch (err) {
      captureException(err, { tags: { page: "collection-contributions", feature: "load-collection" } });
    }
  }

  async function loadContributions() {
    try {
      const response = await fetch(
        `/api/action-collections/${params.collectionId}/contributions`,
        { credentials: "include" }
      );

      if (!response.ok) {
        if (response.status === 401) {
          push("/login");
          return;
        }
        if (response.status === 403) {
          error = "Only collection owner can view contributions";
          return;
        }
        throw new Error("Failed to load contributions");
      }

      const result = await response.json();
      contributions = result.data || [];
    } catch (err) {
      captureException(err, { tags: { page: "collection-contributions", feature: "load-contributions" } });
      error = err instanceof Error ? err.message : "Failed to load contributions";
    } finally {
      isLoading = false;
    }
  }

  async function handleReview() {
    if (!selectedContribution || !reviewAction) return;

    isSubmitting = true;
    try {
      const response = await fetch(
        `/api/action-collections/${params.collectionId}/contributions/${selectedContribution.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: reviewAction,
            reviewNotes: reviewNotes.trim() || undefined,
          }),
        }
      );

      if (response.ok) {
        reviewDialogOpen = false;
        selectedContribution = null;
        reviewAction = null;
        reviewNotes = "";
        await loadContributions();
      } else {
        const errorData = await response.json();
        error = errorData.error || "Failed to review contribution";
      }
    } catch (err) {
      error = "Error reviewing contribution";
    } finally {
      isSubmitting = false;
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function openReviewDialog(
    contribution: Contribution,
    action: "APPROVED" | "REJECTED"
  ) {
    selectedContribution = contribution;
    reviewAction = action;
    reviewDialogOpen = true;
  }

  function closeReviewDialog() {
    reviewDialogOpen = false;
    selectedContribution = null;
    reviewAction = null;
    reviewNotes = "";
  }

  function handleBack() {
    push(`/apps/${params.appId}/build`);
  }

  $: filteredContributions =
    activeTab === "ALL"
      ? contributions
      : contributions.filter((c) => c.status === activeTab);

  $: pendingCount = contributions.filter((c) => c.status === "PENDING").length;
</script>

<svelte:head>
  <title>Contributions - {collection?.name || "Collection"} - Chipp</title>
</svelte:head>

<div class="contributions-page">
  <header class="header">
    <button class="back-button" on:click={handleBack}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to Build
    </button>
    <div class="header-content">
      <div class="header-text">
        <h1>Contribution Reviews</h1>
        {#if collection}
          <p class="subtitle">Review and manage contributions to {collection.name}</p>
        {/if}
      </div>
      <div class="pending-badge">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
        </svg>
        {pendingCount} Pending
      </div>
    </div>
  </header>

  <main class="content">
    {#if isLoading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading contributions...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <p>{error}</p>
        <Button variant="secondary" on:click={handleBack}>Go Back</Button>
      </div>
    {:else}
      <div class="card">
        <div class="card-header">
          <h2>Contributions</h2>
        </div>
        <div class="card-content">
          <div class="tabs">
            {#each tabs as tab}
              <button
                class="tab"
                class:active={activeTab === tab}
                on:click={() => (activeTab = tab)}
              >
                {tab === "ALL" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
                ({tab === "ALL"
                  ? contributions.length
                  : contributions.filter((c) => c.status === tab).length})
              </button>
            {/each}
          </div>

          {#if filteredContributions.length === 0}
            <div class="empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
              </svg>
              <p>No {activeTab.toLowerCase()} contributions</p>
            </div>
          {:else}
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Contributor</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredContributions as contribution}
                    {@const statusConfig = STATUS_CONFIG[contribution.status]}
                    <tr>
                      <td>
                        <div class="description-cell">
                          <span class="description">{contribution.description}</span>
                        </div>
                      </td>
                      <td>
                        <div class="contributor-cell">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>
                            {contribution.contributor?.name ||
                              contribution.contributor?.email ||
                              "Unknown"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          class="status-badge"
                          style="--status-color: {statusConfig.color}; --status-bg: {statusConfig.bgColor}"
                        >
                          {statusConfig.label}
                        </span>
                      </td>
                      <td>
                        <span class="date">{formatDate(contribution.createdAt)}</span>
                      </td>
                      <td>
                        <div class="actions">
                          {#if contribution.status === "PENDING"}
                            <button
                              class="action-btn merge"
                              on:click={() => openReviewDialog(contribution, "APPROVED")}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <circle cx="18" cy="18" r="3" />
                                <circle cx="6" cy="6" r="3" />
                                <path d="M6 21V9a9 9 0 0 0 9 9" />
                              </svg>
                              Merge
                            </button>
                            <button
                              class="action-btn reject"
                              on:click={() => openReviewDialog(contribution, "REJECTED")}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                              Reject
                            </button>
                          {:else if contribution.reviewNotes}
                            <span class="review-notes" title={contribution.reviewNotes}>
                              Has notes
                            </span>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </main>

  {#if reviewDialogOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="dialog-overlay" on:click={closeReviewDialog}>
      <div class="dialog" on:click|stopPropagation>
        <div class="dialog-header">
          <h3>{reviewAction === "APPROVED" ? "Merge" : "Reject"} Contribution</h3>
          <p class="dialog-description">
            {#if reviewAction === "APPROVED"}
              This will merge the changes into the action template.
            {:else}
              This will reject the contribution. You can provide feedback to the contributor.
            {/if}
          </p>
        </div>
        <div class="dialog-content">
          <label for="review-notes">
            Review Notes {reviewAction === "REJECTED" ? "(recommended)" : ""}
          </label>
          <textarea
            id="review-notes"
            bind:value={reviewNotes}
            placeholder={reviewAction === "APPROVED"
              ? "Optional notes about the merge..."
              : "Provide feedback to help the contributor improve..."}
          ></textarea>
        </div>
        <div class="dialog-footer">
          <Button variant="secondary" on:click={closeReviewDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <button
            class="review-btn"
            class:merge={reviewAction === "APPROVED"}
            class:reject={reviewAction === "REJECTED"}
            disabled={isSubmitting}
            on:click={handleReview}
          >
            {#if isSubmitting}
              <div class="spinner-small"></div>
            {:else}
              {reviewAction === "APPROVED" ? "Merge" : "Reject"}
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .contributions-page {
    min-height: 100vh;
    background: var(--bg-primary);
  }

  .header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: 1rem;
  }

  .back-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .header-text h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .pending-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-warning);
    color: var(--text-warning);
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 4rem;
    color: var(--text-secondary);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-primary);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 4rem;
    color: var(--text-error);
  }

  .card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .card-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-primary);
  }

  .card-header h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .card-content {
    padding: 1.5rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-primary);
    padding-bottom: 0.5rem;
  }

  .tab {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-weight: 500;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 4rem;
    color: var(--text-muted);
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
  }

  .table th,
  .table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border-secondary);
  }

  .table th {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    background: var(--bg-tertiary);
  }

  .table td {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .description-cell .description {
    display: block;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contributor-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
  }

  .status-badge {
    display: inline-flex;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 9999px;
    color: var(--status-color);
    background: var(--status-bg);
  }

  .date {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn.merge {
    color: var(--text-success);
    background: transparent;
    border-color: var(--border-primary);
  }

  .action-btn.merge:hover {
    background: var(--bg-success);
  }

  .action-btn.reject {
    color: var(--text-error);
    background: transparent;
    border-color: var(--border-primary);
  }

  .action-btn.reject:hover {
    background: var(--bg-error);
  }

  .review-notes {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Dialog */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 0.75rem;
    width: 100%;
    max-width: 480px;
    margin: 1rem;
  }

  .dialog-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-primary);
  }

  .dialog-header h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem;
  }

  .dialog-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .dialog-content {
    padding: 1.5rem;
  }

  .dialog-content label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .dialog-content textarea {
    width: 100%;
    min-height: 100px;
    padding: 0.75rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 0.5rem;
    resize: vertical;
  }

  .dialog-content textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-primary);
    background: var(--bg-tertiary);
  }

  .review-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    min-width: 80px;
  }

  .review-btn.merge {
    background: var(--color-success);
  }

  .review-btn.merge:hover {
    background: var(--color-success-hover, #059669);
  }

  .review-btn.reject {
    background: var(--color-error);
  }

  .review-btn.reject:hover {
    background: var(--color-error-hover, #dc2626);
  }

  .review-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
