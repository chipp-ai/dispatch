<script lang="ts">
  /**
   * ImageUploader
   *
   * Image upload component for chat input.
   * Handles image selection and upload to server.
   */
  import { createEventDispatcher } from "svelte";

  export let disabled: boolean = false;
  export let accept: string = "image/jpeg,image/png,image/gif,image/webp";
  export let maxSize: number = 5 * 1024 * 1024; // 5MB
  export let appNameId: string = "";
  export let subfolder: string = "chat-images";

  let fileInput: HTMLInputElement;

  const dispatch = createEventDispatcher<{
    uploadStart: void;
    uploaded: { url: string };
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      if (!file.type.startsWith("image/")) {
        dispatch("error", {
          message: `${file.name} is not a valid image file.`,
        });
        continue;
      }

      // Validate file size
      if (file.size > maxSize) {
        dispatch("error", {
          message: `${file.name} is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`,
        });
        continue;
      }

      dispatch("uploadStart");

      try {
        // Upload image
        const formData = new FormData();
        formData.append("file", file);

        const uploadUrl = appNameId
          ? `/consumer/${appNameId}/upload/image?subfolder=${subfolder}`
          : `/api/upload/image?subfolder=${subfolder}`;

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

        dispatch("uploaded", { url: data.url });
      } catch (e) {
        dispatch("error", {
          message: e instanceof Error ? e.message : "Upload failed",
        });
      }
    }

    // Reset input
    input.value = "";
  }
</script>

<button
  class="image-upload-btn"
  on:click={handleClick}
  {disabled}
  type="button"
  aria-label="Upload image"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
  <span>Upload Image</span>
</button>

<input
  bind:this={fileInput}
  type="file"
  {accept}
  multiple
  on:change={handleFileSelect}
  class="hidden-input"
/>

<style>
  .image-upload-btn {
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

  .image-upload-btn:hover:not(:disabled) {
    background-color: hsl(var(--muted));
  }

  .image-upload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .image-upload-btn svg {
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
