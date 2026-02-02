<script lang="ts">
  /**
   * VideoUploader
   *
   * Video file picker for chat attachment menu.
   * Handles video selection and upload to server.
   */
  import { createEventDispatcher } from "svelte";

  export let disabled: boolean = false;
  export let appNameId: string = "";

  const accept = "video/mp4,video/webm,video/quicktime";
  const maxSize = 20 * 1024 * 1024; // 20MB

  let fileInput: HTMLInputElement;

  const dispatch = createEventDispatcher<{
    uploadStart: void;
    uploaded: { url: string; mimeType: string };
    error: { message: string };
  }>();

  function handleClick(): void {
    if (!disabled) {
      fileInput?.click();
    }
  }

  async function handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!file.type.startsWith("video/")) {
      dispatch("error", {
        message: `${file.name} is not a valid video file.`,
      });
      input.value = "";
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      dispatch("error", {
        message: `${file.name} is too large. Maximum size is 20MB.`,
      });
      input.value = "";
      return;
    }

    dispatch("uploadStart");

    try {
      const formData = new FormData();
      formData.append("file", file);

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

      dispatch("uploaded", { url: data.url, mimeType: file.type });
    } catch (e) {
      dispatch("error", {
        message: e instanceof Error ? e.message : "Upload failed",
      });
    }

    // Reset input
    input.value = "";
  }
</script>

<button
  class="video-upload-btn"
  on:click={handleClick}
  {disabled}
  type="button"
  aria-label="Upload video"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
  <span>Upload Video</span>
</button>

<input
  bind:this={fileInput}
  type="file"
  {accept}
  on:change={handleFileSelect}
  class="hidden-input"
/>

<style>
  .video-upload-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: background-color 0.2s;
    text-align: left;
  }

  .video-upload-btn:hover:not(:disabled) {
    background-color: hsl(var(--muted));
  }

  .video-upload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .video-upload-btn svg {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
  }

  .hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
