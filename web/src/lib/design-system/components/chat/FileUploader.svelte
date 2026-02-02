<script lang="ts">
  /**
   * FileUploader
   *
   * File upload component for chat input.
   * Handles file selection and upload to server.
   */
  import { createEventDispatcher } from "svelte";
  import type { StagedFile } from "./types";

  export let disabled: boolean = false;
  export let accept: string = ".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.md,.json";
  export let maxSize: number = 10 * 1024 * 1024; // 10MB
  export let appNameId: string = "";

  let fileInput: HTMLInputElement;

  const dispatch = createEventDispatcher<{
    uploadStart: { file: File };
    uploaded: { file: StagedFile };
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

      // Validate file size
      if (file.size > maxSize) {
        dispatch("error", {
          message: `${file.name} is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`,
        });
        continue;
      }

      // Create staged file entry
      const stagedFile: StagedFile = {
        id: crypto.randomUUID(),
        rawFileDetails: file,
        isUploading: true,
        hasError: false,
      };

      dispatch("uploadStart", { file });

      try {
        // Upload file
        const formData = new FormData();
        formData.append("file", file);

        const uploadUrl = appNameId
          ? `/consumer/${appNameId}/upload/file`
          : "/api/upload/file";

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

        // Update staged file with upload result
        stagedFile.isUploading = false;
        stagedFile.uploadedFileDetails = {
          url: data.url,
          name: file.name,
          type: file.type,
        };

        dispatch("uploaded", { file: stagedFile });
      } catch (e) {
        stagedFile.isUploading = false;
        stagedFile.hasError = true;

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
  class="file-upload-btn"
  on:click={handleClick}
  {disabled}
  type="button"
  aria-label="Upload file"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
  <span>Upload File</span>
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
  .file-upload-btn {
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

  .file-upload-btn:hover:not(:disabled) {
    background-color: hsl(var(--muted));
  }

  .file-upload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .file-upload-btn svg {
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
