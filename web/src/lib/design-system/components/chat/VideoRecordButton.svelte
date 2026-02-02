<script lang="ts">
  /**
   * VideoRecordButton
   *
   * Camera recording button for chat input.
   * Click to start recording from camera, click again to stop.
   * Uploads recorded video to GCS and dispatches the URL.
   * Self-hides if browser doesn't support getUserMedia with video or MediaRecorder.
   *
   * Dispatches: videoRecorded { videoUrl, mimeType, durationMs }
   */
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  export let disabled: boolean = false;
  export let primaryColor: string = "#4499ff";
  export let appNameId: string = "";

  type RecordingState = "idle" | "recording" | "uploading";

  let state: RecordingState = "idle";
  let supported = false;
  let permissionError = false;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startTime = 0;
  let durationMs = 0;
  let durationDisplay = "0:00";
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let stream: MediaStream | null = null;
  let videoPreviewEl: HTMLVideoElement;
  let showPreview = false;
  let useFrontCamera = true;

  const MAX_DURATION_MS = 60_000;
  const MIN_DURATION_MS = 1_000;

  const dispatch = createEventDispatcher<{
    videoRecorded: { videoUrl: string; mimeType: string; durationMs: number };
  }>();

  function getPreferredVideoMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
      "video/mp4",
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
      getPreferredVideoMimeType() !== "";
  });

  onDestroy(() => {
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
    showPreview = false;
  }

  function updateDuration() {
    durationMs = Date.now() - startTime;
    const seconds = Math.floor(durationMs / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    durationDisplay = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    permissionError = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useFrontCamera ? "user" : "environment" },
        audio: true,
      });
    } catch (err) {
      console.error("[VideoRecordButton] Camera permission denied:", err);
      permissionError = true;
      return;
    }

    // Show live preview
    showPreview = true;
    // Wait a tick for the video element to mount
    await new Promise((r) => setTimeout(r, 0));
    if (videoPreviewEl && stream) {
      videoPreviewEl.srcObject = stream;
    }

    const mimeType = getPreferredVideoMimeType();
    chunks = [];
    startTime = Date.now();
    state = "recording";

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1_000_000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const finalDuration = Date.now() - startTime;

      // Stop camera
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      showPreview = false;

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

      state = "uploading";

      const blob = new Blob(chunks, { type: mimeType });
      chunks = [];

      // Upload to GCS
      try {
        const formData = new FormData();
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        formData.append("file", blob, `video.${ext}`);

        const uploadUrl = appNameId
          ? `/consumer/${appNameId}/upload/video?subfolder=chat-videos`
          : `/api/upload/video?subfolder=chat-videos`;

        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }

        const data = await response.json();

        dispatch("videoRecorded", {
          videoUrl: data.url,
          mimeType: mimeType.split(";")[0],
          durationMs: finalDuration,
        });
      } catch (err) {
        console.error("[VideoRecordButton] Upload failed:", err);
      }

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

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function handleClick() {
    if (disabled) return;
    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  }

  function flipCamera() {
    useFrontCamera = !useFrontCamera;
    // Restart recording with new camera
    if (state === "recording") {
      // Stop current recording tracks but keep recorder
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: useFrontCamera ? "user" : "environment" },
          audio: true,
        })
        .then((newStream) => {
          stream = newStream;
          if (videoPreviewEl) {
            videoPreviewEl.srcObject = newStream;
          }
          // Replace tracks in the media recorder
          if (mediaRecorder && mediaRecorder.state === "recording") {
            // Can't replace tracks in MediaRecorder, so just update preview
            // The recorder will keep using the old stream's last frame
            // This is a limitation - full restart would lose recording data
          }
        })
        .catch((err) => {
          console.error("[VideoRecordButton] Camera flip failed:", err);
        });
    }
  }
</script>

{#if supported}
  <div class="video-record-wrapper">
    {#if showPreview}
      <div class="video-preview-container">
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
          bind:this={videoPreviewEl}
          class="video-preview"
          autoplay
          playsinline
          muted
        ></video>
        <div class="preview-overlay">
          <div class="rec-indicator">
            <span class="rec-dot"></span>
            <span class="rec-duration">{durationDisplay}</span>
          </div>
          <button
            class="flip-btn"
            on:click|stopPropagation={flipCamera}
            aria-label="Flip camera"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
              <polyline points="16 3 19 6 16 9" />
              <polyline points="8 21 5 18 8 15" />
            </svg>
          </button>
        </div>
        <button
          class="stop-recording-btn"
          on:click|stopPropagation={stopRecording}
          aria-label="Stop recording"
          style="--primary-color: {primaryColor}"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>
    {/if}

    <button
      class="video-record-btn"
      class:recording={state === "recording"}
      class:uploading={state === "uploading"}
      on:click={handleClick}
      {disabled}
      aria-label={state === "recording"
        ? "Stop recording"
        : state === "uploading"
          ? "Uploading video..."
          : "Record video"}
      style="--primary-color: {primaryColor}"
    >
      {#if state === "recording"}
        <span class="rec-dot"></span>
        <span class="rec-duration">{durationDisplay}</span>
      {:else if state === "uploading"}
        <div class="upload-spinner"></div>
      {:else}
        <!-- Video camera icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      {/if}
    </button>

    {#if permissionError}
      <div class="permission-error">
        Camera access denied
      </div>
    {/if}
  </div>
{/if}

<style>
  .video-record-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .video-record-btn {
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

  .video-record-btn:hover:not(:disabled):not(.recording):not(.uploading) {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .video-record-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .video-record-btn svg {
    width: 20px;
    height: 20px;
  }

  /* Recording state */
  .video-record-btn.recording {
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
    flex-shrink: 0;
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

  /* Upload state */
  .upload-spinner {
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

  /* Camera preview */
  .video-preview-container {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    width: 320px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    background: black;
    z-index: 50;
  }

  .video-preview {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
    transform: scaleX(-1); /* Mirror front camera */
  }

  .preview-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .rec-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.5);
    padding: 4px 10px;
    border-radius: 20px;
    color: white;
    font-size: 13px;
    font-weight: 500;
  }

  .rec-indicator .rec-dot {
    background: #ff4444;
  }

  .flip-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .flip-btn:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .flip-btn svg {
    width: 16px;
    height: 16px;
  }

  .stop-recording-btn {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 2px solid white;
    border-radius: 50%;
    background: rgba(255, 68, 68, 0.8);
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .stop-recording-btn:hover {
    background: rgba(255, 68, 68, 1);
  }

  .stop-recording-btn svg {
    width: 18px;
    height: 18px;
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

  @media (max-width: 640px) {
    .video-preview-container {
      width: 260px;
    }
  }
</style>
