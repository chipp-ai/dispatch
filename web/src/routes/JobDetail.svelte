<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import Button from "../lib/design-system/components/Button.svelte";

  export let params: { appId?: string; workflowId?: string } = {};

  // Job types mapped to display names
  const JOB_TYPE_LABELS: Record<string, string> = {
    FILE_UPLOAD: "File Upload",
    URL_CRAWL: "URL Crawl",
    YOUTUBE_UPLOAD: "YouTube Import",
    TIKTOK_UPLOAD: "TikTok Import",
    INSTAGRAM_UPLOAD: "Instagram Import",
    FACEBOOK_UPLOAD: "Facebook Import",
    NOTION_UPLOAD: "Notion Import",
    GOOGLE_DRIVE_UPLOAD: "Google Drive Import",
    SHAREPOINT_ONEDRIVE_UPLOAD: "SharePoint/OneDrive Import",
    AUDIO_UPLOAD: "Audio Upload",
    PODCAST_UPLOAD: "Podcast Import",
    API_UPLOAD: "API Upload",
    CHAT_BATCH: "Chat Batch",
    VIDEO_GENERATION: "Video Generation",
  };

  // Status colors and icons
  const STATUS_CONFIG: Record<
    string,
    { color: string; bgColor: string; icon: string }
  > = {
    PENDING: {
      color: "var(--text-warning)",
      bgColor: "var(--bg-warning)",
      icon: "clock",
    },
    ACTIVE: {
      color: "var(--text-info)",
      bgColor: "var(--bg-info)",
      icon: "loader",
    },
    COMPLETE: {
      color: "var(--text-success)",
      bgColor: "var(--bg-success)",
      icon: "check",
    },
    ERROR: {
      color: "var(--text-error)",
      bgColor: "var(--bg-error)",
      icon: "x",
    },
    CANCELLED: {
      color: "var(--text-muted)",
      bgColor: "var(--bg-tertiary)",
      icon: "slash",
    },
  };

  interface JobData {
    id: number;
    applicationId: string;
    workflowId: string;
    jobType: string;
    status: string;
    displayName: string | null;
    metadata: Record<string, unknown> | null;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }

  let job: JobData | null = null;
  let isLoading = true;
  let error: string | null = null;
  let pollInterval: number | null = null;

  onMount(async () => {
    if (!params.appId || !params.workflowId) {
      push("/apps");
      return;
    }
    await loadJob();

    // Poll for updates if job is active
    if (job && (job.status === "PENDING" || job.status === "ACTIVE")) {
      pollInterval = setInterval(loadJob, 3000) as unknown as number;
    }
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  async function loadJob() {
    try {
      const response = await fetch(`/api/jobs/${params.workflowId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          push("/login");
          return;
        }
        if (response.status === 404) {
          error = "Job not found";
          return;
        }
        throw new Error("Failed to load job");
      }

      const data = await response.json();
      job = data.data;

      // Stop polling if job completed
      if (job && job.status !== "PENDING" && job.status !== "ACTIVE") {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    } catch (err) {
      console.error("Error loading job:", err);
      error = err instanceof Error ? err.message : "Failed to load job";
    } finally {
      isLoading = false;
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function getDuration(start: string, end: string | null): string {
    if (!end) return "In progress...";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    const remainingSecs = diffSecs % 60;
    if (diffMins < 60) return `${diffMins}m ${remainingSecs}s`;

    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    return `${diffHours}h ${remainingMins}m`;
  }

  function handleBack() {
    push(`/apps/${params.appId}/build`);
  }

  $: statusConfig = job ? STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING : null;
  $: jobTypeLabel = job ? JOB_TYPE_LABELS[job.jobType] || job.jobType : "";
</script>

<svelte:head>
  <title>Job Details - Chipp</title>
</svelte:head>

<div class="job-detail">
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
      Back to App
    </button>
    <h1>Job Details</h1>
  </header>

  <main class="content">
    {#if isLoading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading job details...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <p>{error}</p>
        <Button variant="secondary" on:click={handleBack}>Go Back</Button>
      </div>
    {:else if job}
      <div class="job-card">
        <div class="job-header">
          <div class="job-title">
            <h2>{job.displayName || jobTypeLabel}</h2>
            <span class="job-type">{jobTypeLabel}</span>
          </div>
          {#if statusConfig}
            <div
              class="status-badge"
              style="--status-color: {statusConfig.color}; --status-bg: {statusConfig.bgColor}"
            >
              {#if job.status === "ACTIVE"}
                <span class="spinner-small"></span>
              {/if}
              {job.status}
            </div>
          {/if}
        </div>

        {#if job.status === "ACTIVE"}
          <div class="progress-bar">
            <div class="progress-bar-inner"></div>
          </div>
        {/if}

        <div class="job-details">
          <div class="detail-row">
            <span class="detail-label">Workflow ID</span>
            <span class="detail-value mono">{job.workflowId}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Started</span>
            <span class="detail-value">{formatDate(job.startedAt)}</span>
          </div>

          {#if job.completedAt}
            <div class="detail-row">
              <span class="detail-label">Completed</span>
              <span class="detail-value">{formatDate(job.completedAt)}</span>
            </div>
          {/if}

          <div class="detail-row">
            <span class="detail-label">Duration</span>
            <span class="detail-value"
              >{getDuration(job.startedAt, job.completedAt)}</span
            >
          </div>

          {#if job.errorMessage}
            <div class="error-section">
              <span class="detail-label">Error</span>
              <pre class="error-message">{job.errorMessage}</pre>
            </div>
          {/if}

          {#if job.metadata && Object.keys(job.metadata).length > 0}
            <div class="metadata-section">
              <span class="detail-label">Metadata</span>
              <pre class="metadata-content">{JSON.stringify(
                  job.metadata,
                  null,
                  2
                )}</pre>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .job-detail {
    min-height: 100vh;
    background: var(--bg-primary);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
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
  }

  .back-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .header h1 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .content {
    max-width: 800px;
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
    width: 12px;
    height: 12px;
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

  .job-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-primary);
  }

  .job-title h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.25rem;
  }

  .job-type {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    color: var(--status-color);
    background: var(--status-bg);
    border-radius: 9999px;
  }

  .progress-bar {
    height: 4px;
    background: var(--bg-tertiary);
    overflow: hidden;
  }

  .progress-bar-inner {
    height: 100%;
    width: 30%;
    background: var(--text-info);
    animation: progress 2s ease-in-out infinite;
  }

  @keyframes progress {
    0% {
      width: 0%;
      margin-left: 0;
    }
    50% {
      width: 40%;
    }
    100% {
      width: 0%;
      margin-left: 100%;
    }
  }

  .job-details {
    padding: 1.5rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border-secondary);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .detail-value {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .detail-value.mono {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .error-section,
  .metadata-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-primary);
  }

  .error-message {
    margin-top: 0.5rem;
    padding: 1rem;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-error);
    background: var(--bg-error);
    border-radius: 0.5rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .metadata-content {
    margin-top: 0.5rem;
    padding: 1rem;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border-radius: 0.5rem;
    overflow-x: auto;
    white-space: pre-wrap;
  }
</style>
