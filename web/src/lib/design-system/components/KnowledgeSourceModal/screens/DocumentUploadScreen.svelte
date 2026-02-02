<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ArrowLeft, FileText, Upload, X, Loader2, File as FileIcon } from 'lucide-svelte';

  export let applicationId: string;

  const dispatch = createEventDispatcher<{
    back: void;
    close: void;
    sourceAdded: { id: string; type: string; name: string; url?: string };
  }>();

  // Supported file types
  const SUPPORTED_FILE_TYPES = [
    '.pdf', '.doc', '.docx', '.txt', '.md',
    '.csv', '.xlsx', '.xls', '.json', '.xml'
  ];
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

  let selectedFiles: File[] = [];
  let isDragging = false;
  let isUploading = false;
  let uploadProgress = 0;
  let error: string | null = null;
  let uploadedCount = 0;
  let fileInputRef: HTMLInputElement;

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File "${file.name}" is too large. Maximum size is 20MB.` };
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_FILE_TYPES.includes(extension)) {
      return { valid: false, error: `File type "${extension}" is not supported.` };
    }

    return { valid: true };
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;

    addFiles(Array.from(files));
    // Reset input
    if (fileInputRef) {
      fileInputRef.value = '';
    }
  }

  function handleDropzoneClick() {
    fileInputRef?.click();
  }

  function addFiles(files: File[]) {
    error = null;
    const validFiles: File[] = [];

    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        error = validation.error || 'Invalid file';
        continue;
      }
      // Check for duplicates
      if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      selectedFiles = [...selectedFiles, ...validFiles];
    }
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    const files = event.dataTransfer?.files;
    if (files) {
      addFiles(Array.from(files));
    }
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) {
      error = 'Please select at least one file';
      return;
    }

    isUploading = true;
    error = null;
    uploadProgress = 0;
    uploadedCount = 0;

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append('file', file);
      }

      const response = await fetch(`/api/upload/documents?applicationId=${applicationId}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      const uploadedSources = result.data || [];
      uploadProgress = 100;
      uploadedCount = uploadedSources.filter((s: { status?: string }) => s.status !== 'failed').length;

      // Notify parent of all uploaded files with real IDs from API
      for (const source of uploadedSources) {
        if (source.status !== 'failed') {
          dispatch('sourceAdded', {
            id: source.knowledgeSourceId,
            type: 'document',
            name: source.fileName,
          });
        }
      }

      // Show message briefly then close
      // Note: Processing happens async - TrainCard will show toast when complete/failed
      setTimeout(() => {
        dispatch('close');
      }, 1500);

    } catch (e) {
      console.error('Error uploading documents:', e);
      error = e instanceof Error ? e.message : 'Upload failed';
      isUploading = false;
    }
  }

  function handleBack() {
    dispatch('back');
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<div class="ks-upload-screen">
  <div class="ks-upload-content">
    <!-- Header with back button -->
    <div class="ks-upload-header">
      <button class="ks-back-btn" on:click={handleBack}>
        <ArrowLeft size={20} />
        Back
      </button>
      <h2 class="ks-upload-title">Upload Documents</h2>
      <p class="ks-upload-description">
        Upload PDF, Word, Excel, CSV, or text files to add to your assistant's knowledge base
      </p>
    </div>

    {#if !isUploading}
      <!-- Dropzone -->
      <div
        class="ks-dropzone"
        class:ks-dropzone-active={isDragging}
        class:ks-dropzone-compact={selectedFiles.length > 0}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
        role="button"
        tabindex="0"
        on:click={handleDropzoneClick}
        on:keydown={(e) => e.key === 'Enter' && handleDropzoneClick()}
      >
        <input
          bind:this={fileInputRef}
          type="file"
          multiple
          accept={SUPPORTED_FILE_TYPES.join(',')}
          on:change={handleFileSelect}
          class="ks-file-input"
        />

        <FileText
          size={selectedFiles.length > 0 ? 32 : 48}
          class="ks-dropzone-icon"
        />

        <button
          class="ks-select-btn"
          on:click|stopPropagation={handleDropzoneClick}
        >
          <Upload size={16} />
          Select Files
        </button>

        <p class="ks-dropzone-text">
          {isDragging ? 'Drop files here...' : 'or drag and drop files here'}
        </p>
        <p class="ks-dropzone-hint">
          Max 20MB per file
        </p>
      </div>

      <!-- Selected Files -->
      {#if selectedFiles.length > 0}
        <div class="ks-selected-files">
          <label class="ks-label">
            Selected {selectedFiles.length === 1 ? 'File' : 'Files'} ({selectedFiles.length})
          </label>
          <div class="ks-file-list">
            {#each selectedFiles as file, index}
              <div class="ks-file-item">
                <div class="ks-file-info">
                  <FileIcon size={16} class="ks-file-icon" />
                  <span class="ks-file-name">{file.name}</span>
                  <span class="ks-file-size">({formatFileSize(file.size)})</span>
                </div>
                <button
                  class="ks-file-remove"
                  on:click={() => removeFile(index)}
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if error}
        <div class="ks-error-message">
          {error}
        </div>
      {/if}
    {:else}
      <!-- Upload Progress -->
      <div class="ks-upload-progress">
        <div class="ks-progress-icon">
          <FileText size={48} class="ks-icon-primary" />
          {#if uploadProgress < 100}
            <div class="ks-progress-spinner">
              <Loader2 size={64} class="ks-spinner" />
            </div>
          {/if}
        </div>

        <h3 class="ks-progress-title">
          {#if uploadProgress < 100}
            Uploading Documents...
          {:else}
            Documents Uploaded!
          {/if}
        </h3>

        <p class="ks-progress-info">
          {#if uploadProgress < 100}
            Uploading {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'}...
          {:else}
            {uploadedCount} {uploadedCount === 1 ? 'document is' : 'documents are'} now being processed
          {/if}
        </p>

        {#if uploadProgress < 100}
          <div class="ks-progress-bar-container">
            <div class="ks-progress-bar">
              <div class="ks-progress-fill ks-progress-indeterminate"></div>
            </div>
          </div>
        {:else}
          <div class="ks-success-check">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="ks-upload-footer">
    {#if !isUploading}
      <button
        class="ks-btn ks-btn-primary"
        on:click={handleUpload}
        disabled={selectedFiles.length === 0}
      >
        {selectedFiles.length > 0
          ? `Upload Documents (${selectedFiles.length})`
          : 'Upload Documents'}
      </button>
    {:else if uploadProgress >= 100}
      <button class="ks-btn ks-btn-primary" on:click={handleClose}>
        Done
      </button>
    {/if}
  </div>
</div>

<style>
  .ks-upload-screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
  }

  .ks-upload-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ks-upload-header {
    margin-bottom: var(--space-2);
  }

  .ks-back-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: var(--space-4);
  }

  .ks-back-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-secondary);
  }

  .ks-upload-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  .ks-upload-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* Dropzone */
  .ks-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8);
    min-height: 250px;
    border: 2px dashed var(--border-primary);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ks-dropzone-compact {
    min-height: 150px;
    padding: var(--space-6);
  }

  .ks-dropzone:hover,
  .ks-dropzone-active {
    border-color: var(--brand-blue);
    background: rgba(96, 165, 250, 0.05);
  }

  .ks-dropzone-active :global(.ks-dropzone-icon) {
    transform: scale(1.1);
  }

  :global(.ks-dropzone-icon) {
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
  }

  .ks-file-input {
    display: none;
  }

  .ks-select-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-secondary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ks-select-btn:hover {
    background: var(--bg-primary);
    border-color: var(--border-primary);
  }

  .ks-dropzone-text {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    margin: 0;
  }

  .ks-dropzone-hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    margin: 0;
  }

  /* Selected Files */
  .ks-selected-files {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ks-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .ks-file-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
  }

  .ks-file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    background: rgba(255, 255, 255, 0.02);
    border-radius: var(--radius-md);
  }

  .ks-file-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  :global(.ks-file-icon) {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .ks-file-name {
    font-size: var(--text-sm);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ks-file-size {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .ks-file-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ks-file-remove:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* Error Message */
  .ks-error-message {
    padding: var(--space-3) var(--space-4);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-lg);
    color: #f87171;
    font-size: var(--text-sm);
  }

  /* Upload Progress */
  .ks-upload-progress {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
  }

  .ks-progress-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.ks-icon-primary) {
    color: var(--brand-blue);
  }

  .ks-progress-spinner {
    position: absolute;
    inset: -8px;
  }

  :global(.ks-spinner) {
    color: var(--brand-blue);
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .ks-progress-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    text-align: center;
  }

  .ks-progress-info {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
    text-align: center;
  }

  .ks-progress-bar-container {
    width: 100%;
    max-width: 300px;
  }

  .ks-progress-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .ks-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--brand-blue), var(--brand-purple));
    border-radius: 4px;
  }

  .ks-progress-indeterminate {
    width: 30%;
    animation: indeterminate 1.5s infinite ease-in-out;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }

  .ks-success-check {
    color: #22c55e;
    animation: checkPop 0.3s ease;
  }

  @keyframes checkPop {
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  /* Footer */
  .ks-upload-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-primary);
    margin-top: var(--space-4);
  }

  .ks-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .ks-btn-primary {
    background: linear-gradient(135deg, var(--brand-blue), var(--brand-purple));
    color: white;
  }

  .ks-btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .ks-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
