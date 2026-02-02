<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { toasts, Button, Badge, Skeleton } from "$lib/design-system";
  import { Phone, Play, Pause, Download, FileText, ChevronDown, ChevronUp } from "lucide-svelte";

  export let appId: string;
  export let app: { id: string; name: string };

  // Types
  interface CallRecord {
    id: string;
    applicationId: string;
    phoneNumberId: string | null;
    twilioCallSid: string;
    twilioAccountSid: string | null;
    fromNumber: string;
    toNumber: string;
    direction: "inbound" | "outbound-api" | "outbound-dial";
    status: string;
    durationSeconds: number | null;
    openaiCallId: string | null;
    startedAt: string;
    endedAt: string | null;
    recordingUrl: string | null;
    transcriptionText: string | null;
    metadata: unknown | null;
    createdAt: string;
    updatedAt: string;
  }

  // State
  let calls: CallRecord[] = [];
  let isLoading = true;
  let downloadingCallId: string | null = null;
  let playingCallId: string | null = null;
  let loadingAudioCallId: string | null = null;
  let expandedTranscripts: Set<string> = new Set();

  // Audio refs
  let audioElement: HTMLAudioElement | null = null;
  let audioUrl: string | null = null;

  onMount(async () => {
    await loadCalls();
  });

  onDestroy(() => {
    // Cleanup audio on component destroy
    if (audioElement) {
      audioElement.pause();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  });

  async function loadCalls() {
    if (!appId) return;

    try {
      isLoading = true;
      const response = await fetch(`/api/applications/${appId}/calls`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load calls");
      }

      const data = await response.json();
      calls = data.data || [];
    } catch (error) {
      console.error("Error loading calls:", error);
      toasts.error("Failed to load call history");
    } finally {
      isLoading = false;
    }
  }

  async function handlePlayPause(callId: string) {
    // If this recording is already playing, pause it
    if (playingCallId === callId && audioElement) {
      audioElement.pause();
      playingCallId = null;
      return;
    }

    // Stop any currently playing audio
    if (audioElement) {
      audioElement.pause();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    }

    loadingAudioCallId = callId;

    try {
      const response = await fetch(
        `/api/applications/${appId}/calls/${callId}/recording`,
        { credentials: "include" }
      );

      if (!response.ok) {
        const error = await response.json();
        toasts.error(error.error || "Failed to load recording");
        return;
      }

      // Get the blob from response
      const blob = await response.blob();
      audioUrl = URL.createObjectURL(blob);

      // Create audio element
      const audio = new Audio(audioUrl);
      audioElement = audio;

      // Set up event listeners
      audio.onended = () => {
        playingCallId = null;
      };

      audio.onerror = () => {
        toasts.error("Failed to play recording");
        playingCallId = null;
        loadingAudioCallId = null;
      };

      audio.onloadeddata = () => {
        loadingAudioCallId = null;
        playingCallId = callId;
      };

      // Start playing
      await audio.play();
    } catch (error) {
      console.error("Error playing recording:", error);
      toasts.error("Failed to play recording");
      loadingAudioCallId = null;
    }
  }

  async function handleDownload(callId: string) {
    downloadingCallId = callId;
    try {
      const response = await fetch(
        `/api/applications/${appId}/calls/${callId}/recording`,
        { credentials: "include" }
      );

      if (!response.ok) {
        const error = await response.json();
        toasts.error(error.error || "Failed to download recording");
        return;
      }

      // Get the blob from response
      const blob = await response.blob();

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "recording.mp3";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toasts.success("Recording downloaded");
    } catch (error) {
      console.error("Error downloading recording:", error);
      toasts.error("Failed to download recording");
    } finally {
      downloadingCallId = null;
    }
  }

  function toggleTranscript(callId: string) {
    if (expandedTranscripts.has(callId)) {
      expandedTranscripts.delete(callId);
    } else {
      expandedTranscripts.add(callId);
    }
    expandedTranscripts = expandedTranscripts; // Trigger reactivity
  }

  function formatDuration(seconds: number | null): string {
    if (seconds === null || seconds === undefined) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  function getDirectionBadge(direction: string): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
    switch (direction) {
      case "inbound":
        return { text: "Inbound", variant: "default" };
      case "outbound-api":
        return { text: "API", variant: "secondary" };
      case "outbound-dial":
        return { text: "Dial", variant: "outline" };
      default:
        return { text: direction, variant: "outline" };
    }
  }

  function getStatusBadge(status: string): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
    switch (status) {
      case "completed":
        return { text: "Completed", variant: "default" };
      case "in-progress":
        return { text: "In Progress", variant: "secondary" };
      case "failed":
        return { text: "Failed", variant: "destructive" };
      case "initiated":
        return { text: "Initiated", variant: "outline" };
      default:
        return { text: status, variant: "outline" };
    }
  }
</script>

<div class="calls-container">
  {#if isLoading}
    <!-- Loading skeleton -->
    <div class="loading-state">
      {#each Array(5) as _, i}
        <Skeleton class="call-skeleton" />
      {/each}
    </div>
  {:else if calls.length === 0}
    <!-- Empty state -->
    <div class="empty-state">
      <Phone size={48} class="empty-icon" />
      <h3 class="empty-title">No calls yet</h3>
      <p class="empty-description">
        Incoming and outgoing calls will appear here once users start interacting with your voice agent.
      </p>
    </div>
  {:else}
    <!-- Calls table -->
    <div class="calls-header">
      <h2 class="calls-title">Call History</h2>
      <span class="calls-count">{calls.length} calls</span>
    </div>

    <div class="table-wrapper">
      <table class="calls-table">
        <thead>
          <tr>
            <th>Direction</th>
            <th>From</th>
            <th>To</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each calls as call (call.id)}
            {@const badge = getDirectionBadge(call.direction)}
            {@const statusBadge = getStatusBadge(call.status)}
            <tr>
              <td>
                <Badge variant={badge.variant}>{badge.text}</Badge>
              </td>
              <td class="phone-number">{call.fromNumber}</td>
              <td class="phone-number">{call.toNumber}</td>
              <td>
                <Badge variant={statusBadge.variant}>{statusBadge.text}</Badge>
              </td>
              <td>{formatDuration(call.durationSeconds)}</td>
              <td class="date-cell">{formatDate(call.startedAt)}</td>
              <td class="actions-cell">
                <div class="actions">
                  <!-- Play/Pause button -->
                  <Button
                    variant="outline"
                    size="sm"
                    on:click={() => handlePlayPause(call.id)}
                    disabled={loadingAudioCallId === call.id}
                  >
                    {#if loadingAudioCallId === call.id}
                      Loading...
                    {:else if playingCallId === call.id}
                      <Pause size={14} />
                      <span>Pause</span>
                    {:else}
                      <Play size={14} />
                      <span>Play</span>
                    {/if}
                  </Button>

                  <!-- Download button -->
                  <Button
                    variant="outline"
                    size="sm"
                    on:click={() => handleDownload(call.id)}
                    disabled={downloadingCallId === call.id}
                  >
                    {#if downloadingCallId === call.id}
                      <Download size={14} class="spin" />
                    {:else}
                      <Download size={14} />
                    {/if}
                  </Button>

                  <!-- Transcript button -->
                  {#if call.transcriptionText}
                    <Button
                      variant="outline"
                      size="sm"
                      on:click={() => toggleTranscript(call.id)}
                    >
                      {#if expandedTranscripts.has(call.id)}
                        <ChevronUp size={14} />
                      {:else}
                        <FileText size={14} />
                      {/if}
                    </Button>
                  {/if}
                </div>
              </td>
            </tr>
            <!-- Transcript row -->
            {#if call.transcriptionText && expandedTranscripts.has(call.id)}
              <tr class="transcript-row">
                <td colspan="7">
                  <div class="transcript-content">
                    <div class="transcript-header">
                      <h4>Transcript</h4>
                      {#if call.durationSeconds}
                        <span class="transcript-duration">
                          Duration: {formatDuration(call.durationSeconds)}
                        </span>
                      {/if}
                    </div>
                    <div class="transcript-text">
                      {call.transcriptionText}
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .calls-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .loading-state {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  :global(.call-skeleton) {
    height: 64px;
    border-radius: var(--radius-lg);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
  }

  :global(.empty-icon) {
    color: hsl(var(--muted-foreground));
    opacity: 0.5;
  }

  .empty-title {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    text-align: center;
    max-width: 400px;
    margin: 0;
  }

  .calls-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid hsl(var(--border));
  }

  .calls-title {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .calls-count {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .table-wrapper {
    flex: 1;
    overflow: auto;
  }

  .calls-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .calls-table thead {
    position: sticky;
    top: 0;
    background: hsl(var(--muted));
    z-index: 1;
  }

  .calls-table th {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .calls-table td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
    vertical-align: middle;
  }

  .calls-table tbody tr:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .phone-number {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .date-cell {
    white-space: nowrap;
  }

  .actions-cell {
    width: 1%;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .actions :global(button) {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .transcript-row td {
    padding: 0;
    background: hsl(var(--muted) / 0.5);
  }

  .transcript-content {
    padding: var(--space-4) var(--space-6);
  }

  .transcript-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .transcript-header h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .transcript-duration {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .transcript-text {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    white-space: pre-wrap;
    background: hsl(var(--background));
    padding: var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid hsl(var(--border));
    line-height: 1.6;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .calls-table th:nth-child(3),
    .calls-table td:nth-child(3) {
      display: none;
    }

    .calls-table th:nth-child(5),
    .calls-table td:nth-child(5) {
      display: none;
    }

    .actions :global(button span) {
      display: none;
    }
  }
</style>
