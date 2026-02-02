<script lang="ts">
  /**
   * AudioRecordButton
   *
   * Walkie-talkie style audio recording button.
   * Click to start recording, click again to stop and auto-send.
   * Self-hides if browser doesn't support MediaRecorder/getUserMedia.
   *
   * Dispatches: audioRecorded { audioBlob, durationMs, mimeType }
   */
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  export let disabled: boolean = false;
  export let primaryColor: string = "#4499ff";

  type RecordingState = "idle" | "recording" | "processing";

  export let state: RecordingState = "idle";
  export let supported = false;
  let permissionError = false;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startTime = 0;
  let durationMs = 0;
  let durationDisplay = "0:00";
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let stream: MediaStream | null = null;

  // Touch hold-to-record state
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let isHoldRecording = false;
  let skipNextClick = false;

  const MAX_DURATION_MS = 60_000;
  const MIN_DURATION_MS = 500;

  const dispatch = createEventDispatcher<{
    audioRecorded: { audioBlob: Blob; durationMs: number; mimeType: string };
  }>();

  function getPreferredMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "";
    // Prefer WebM Opus (Chrome, Firefox), fall back to MP4 (Safari)
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "";
  }

  onMount(() => {
    supported =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices !== "undefined" &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined" &&
      getPreferredMimeType() !== "";
  });

  onDestroy(() => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    cleanup();
  });

  function cleanup() {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = null;
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    mediaRecorder = null;
    chunks = [];
  }

  function updateDuration() {
    durationMs = Date.now() - startTime;
    const seconds = Math.floor(durationMs / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    durationDisplay = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  export async function startRecording() {
    permissionError = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("[AudioRecordButton] Mic permission denied:", err);
      permissionError = true;
      return;
    }

    const mimeType = getPreferredMimeType();
    chunks = [];
    startTime = Date.now();
    state = "recording";

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const finalDuration = Date.now() - startTime;

      // Stop mic
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      // Clear timers
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
      if (maxDurationTimer) {
        clearTimeout(maxDurationTimer);
        maxDurationTimer = null;
      }

      // Too short - discard
      if (finalDuration < MIN_DURATION_MS) {
        state = "idle";
        durationDisplay = "0:00";
        chunks = [];
        return;
      }

      state = "processing";

      const blob = new Blob(chunks, { type: mimeType });
      chunks = [];

      dispatch("audioRecorded", {
        audioBlob: blob,
        durationMs: finalDuration,
        mimeType,
      });

      state = "idle";
      durationDisplay = "0:00";
    };

    mediaRecorder.start();

    // Duration counter
    durationInterval = setInterval(updateDuration, 100);

    // Auto-stop at max duration
    maxDurationTimer = setTimeout(() => {
      stopRecording();
    }, MAX_DURATION_MS);
  }

  export function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function handleClick() {
    if (skipNextClick) {
      skipNextClick = false;
      return;
    }
    if (disabled) return;
    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  }

  function handleTouchStart(): void {
    if (disabled || state !== "idle") return;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      isHoldRecording = true;
      startRecording();
    }, 300);
  }

  function handleTouchEnd(event: TouchEvent): void {
    if (holdTimer) {
      // Released before threshold — let click handler do tap-to-toggle
      clearTimeout(holdTimer);
      holdTimer = null;
    } else if (isHoldRecording) {
      // Released after hold recording started — stop and send
      event.preventDefault();
      isHoldRecording = false;
      skipNextClick = true;
      stopRecording();
    }
  }

  function handleTouchCancel(): void {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (isHoldRecording) {
      isHoldRecording = false;
      cleanup();
      state = "idle";
      durationDisplay = "0:00";
    }
  }
</script>

{#if supported}
  <div class="audio-record-wrapper">
    <button
      class="audio-record-btn"
      class:recording={state === "recording"}
      class:processing={state === "processing"}
      class:holding={isHoldRecording}
      on:click={handleClick}
      on:touchstart={handleTouchStart}
      on:touchend={handleTouchEnd}
      on:touchcancel={handleTouchCancel}
      {disabled}
      aria-label={state === "recording" ? "Stop recording" : "Record voice message"}
      style="--primary-color: {primaryColor}"
    >
      {#if state === "recording"}
        <!-- Recording indicator: pulsing red dot -->
        <span class="rec-dot"></span>
        <span class="rec-duration">{durationDisplay}</span>
      {:else if state === "processing"}
        <div class="processing-spinner"></div>
      {:else}
        <!-- Mic icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      {/if}
    </button>

    {#if permissionError}
      <div class="permission-error">
        Mic access denied
      </div>
    {/if}
  </div>
{/if}

<style>
  .audio-record-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .audio-record-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 36px;
    min-width: 36px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .audio-record-btn:hover:not(:disabled):not(.recording) {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .audio-record-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .audio-record-btn svg {
    width: 20px;
    height: 20px;
  }

  /* Hold-to-record scale effect */
  .audio-record-btn.holding {
    transform: scale(1.15);
  }

  /* Recording state */
  .audio-record-btn.recording {
    background: hsl(350 80% 95%);
    color: hsl(350 80% 45%);
    padding: 0 10px;
    border-radius: var(--radius-full);
  }

  .rec-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: hsl(350 80% 45%);
    animation: pulse-dot 1s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .rec-duration {
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  /* Processing state */
  .processing-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid hsl(var(--border));
    border-top-color: var(--primary-color, hsl(var(--primary)));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Permission error */
  .permission-error {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 12px;
    color: hsl(350 80% 45%);
    background: hsl(350 90% 95%);
    padding: 4px 10px;
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    animation: fade-in 0.2s ease;
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
