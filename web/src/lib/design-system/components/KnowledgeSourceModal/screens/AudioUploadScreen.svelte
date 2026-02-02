<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ArrowLeft, Mic, Upload, Loader2 } from 'lucide-svelte';

  export let applicationId: string;

  const dispatch = createEventDispatcher<{
    back: void;
    close: void;
    sourceAdded: { id: string; type: string; name: string; url?: string };
  }>();

  // Supported audio file types
  const SUPPORTED_AUDIO_TYPES = ['mp3', 'wav', 'mp4', 'm4a', 'webm', 'ogg', 'flac'];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  let selectedFile: File | null = null;
  let isProcessing = false;
  let processingStage: 'idle' | 'uploading' | 'transcribing' | 'complete' = 'idle';
  let error: string | null = null;
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
      return { valid: false, error: `File is too large. Maximum size is 100MB.` };
    }

    // Check file extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_AUDIO_TYPES.includes(extension)) {
      return { valid: false, error: `File type is not supported. Supported types: ${SUPPORTED_AUDIO_TYPES.join(', ')}` };
    }

    return { valid: true };
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      error = validation.error || 'Invalid file';
      return;
    }

    error = null;
    selectedFile = file;

    // Reset input
    if (fileInputRef) {
      fileInputRef.value = '';
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      error = 'Please select an audio file';
      return;
    }

    isProcessing = true;
    error = null;
    processingStage = 'uploading';

    try {
      // For now, show a coming soon message since chipp-deno
      // may not have the full audio transcription workflow yet
      processingStage = 'transcribing';

      await new Promise(resolve => setTimeout(resolve, 1500));

      error = 'Audio transcription is being ported from the main app. Please use the main app for now.';
      processingStage = 'idle';
      isProcessing = false;

    } catch (e) {
      console.error('Error uploading audio:', e);
      error = e instanceof Error ? e.message : 'Upload failed';
      processingStage = 'idle';
      isProcessing = false;
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
      <h2 class="ks-upload-title">Upload Audio File</h2>
      <p class="ks-upload-description">
        We'll transcribe your audio file and use it as a knowledge source
      </p>
    </div>

    {#if !isProcessing}
      <div class="ks-audio-upload-content">
        <!-- Upload Dropzone -->
        <div
          class="ks-audio-dropzone"
          role="button"
          tabindex="0"
          on:click={() => fileInputRef?.click()}
          on:keydown={(e) => e.key === 'Enter' && fileInputRef?.click()}
        >
          <input
            bind:this={fileInputRef}
            type="file"
            accept={SUPPORTED_AUDIO_TYPES.map(type => `.${type}`).join(',')}
            on:change={handleFileSelect}
            class="ks-file-input"
          />

          <div class="ks-mic-icon-container">
            <Mic size={24} class="ks-mic-icon" />
          </div>

          <div class="ks-dropzone-text">
            <p class="ks-dropzone-title">Click to upload audio</p>
            <p class="ks-dropzone-hint">
              {SUPPORTED_AUDIO_TYPES.join(', ')} &bull; Max {MAX_FILE_SIZE / (1024 * 1024)}MB
            </p>
          </div>

          <button
            class="ks-choose-file-btn"
            on:click|stopPropagation={() => fileInputRef?.click()}
          >
            <Upload size={16} />
            Choose File
          </button>
        </div>

        <!-- Selected File Preview -->
        {#if selectedFile}
          <div class="ks-selected-file">
            <Mic size={20} class="ks-file-icon" />
            <div class="ks-file-details">
              <span class="ks-file-name">{selectedFile.name}</span>
              <span class="ks-file-size">{formatFileSize(selectedFile.size)}</span>
            </div>
          </div>
        {/if}

        <!-- Features -->
        <div class="ks-features-box">
          <p class="ks-features-title">What we'll extract:</p>
          <ul class="ks-features-list">
            <li>Full transcription of spoken content</li>
            <li>Speaker identification (when possible)</li>
            <li>Timestamps for easy reference</li>
            <li>Key topics and themes</li>
          </ul>
        </div>

        {#if error}
          <div class="ks-error-message">
            {error}
          </div>
        {/if}
      </div>
    {:else}
      <!-- Processing State -->
      <div class="ks-processing-state">
        <div class="ks-processing-icon">
          <Mic size={48} class="ks-mic-processing" />
          <div class="ks-audio-waves">
            <div class="ks-wave"></div>
            <div class="ks-wave"></div>
            <div class="ks-wave"></div>
            <div class="ks-wave"></div>
            <div class="ks-wave"></div>
          </div>
        </div>

        <h3 class="ks-processing-title">
          {#if processingStage === 'uploading'}
            Uploading audio file...
          {:else if processingStage === 'transcribing'}
            Transcribing audio...
          {:else if processingStage === 'complete'}
            Transcription complete!
          {:else}
            Processing...
          {/if}
        </h3>

        {#if selectedFile}
          <p class="ks-processing-file">{selectedFile.name}</p>
        {/if}

        {#if processingStage !== 'complete'}
          <div class="ks-progress-bar">
            <div class="ks-progress-fill ks-progress-indeterminate"></div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="ks-upload-footer">
    {#if processingStage === 'complete'}
      <button class="ks-btn ks-btn-primary" on:click={handleClose}>
        Done
      </button>
    {:else}
      <button
        class="ks-btn ks-btn-primary"
        on:click={handleUpload}
        disabled={!selectedFile || isProcessing}
      >
        {#if isProcessing}
          <Loader2 size={16} class="ks-btn-spinner" />
          Processing...
        {:else}
          Upload & Transcribe
        {/if}
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
  }

  .ks-upload-header {
    margin-bottom: var(--space-6);
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

  .ks-audio-upload-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 500px;
    margin: 0 auto;
  }

  .ks-file-input {
    display: none;
  }

  /* Audio Dropzone */
  .ks-audio-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-8);
    border: 2px dashed var(--border-secondary);
    border-radius: var(--radius-lg);
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .ks-audio-dropzone:hover {
    border-color: var(--brand-purple);
    background: rgba(167, 139, 250, 0.05);
  }

  .ks-mic-icon-container {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border-radius: 50%;
  }

  :global(.ks-mic-icon) {
    color: var(--brand-purple);
  }

  .ks-dropzone-text {
    text-align: center;
  }

  .ks-dropzone-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    margin: 0;
  }

  .ks-dropzone-hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    margin: var(--space-1) 0 0 0;
  }

  .ks-choose-file-btn {
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

  .ks-choose-file-btn:hover {
    background: var(--bg-primary);
  }

  /* Selected File */
  .ks-selected-file {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
  }

  :global(.ks-file-icon) {
    color: var(--brand-purple);
  }

  .ks-file-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ks-file-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .ks-file-size {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  /* Features Box */
  .ks-features-box {
    padding: var(--space-3) var(--space-4);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
  }

  .ks-features-title {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0 0 var(--space-2) 0;
  }

  .ks-features-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ks-features-list li {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .ks-features-list li::before {
    content: '•';
    margin-right: var(--space-2);
    color: var(--brand-purple);
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

  /* Processing State */
  .ks-processing-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
  }

  .ks-processing-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.ks-mic-processing) {
    color: var(--brand-purple);
  }

  .ks-audio-waves {
    position: absolute;
    bottom: -20px;
    display: flex;
    gap: 4px;
    align-items: flex-end;
    height: 20px;
  }

  .ks-wave {
    width: 4px;
    background: var(--brand-purple);
    border-radius: 2px;
    animation: wave 1s ease-in-out infinite;
  }

  .ks-wave:nth-child(1) { animation-delay: 0s; height: 8px; }
  .ks-wave:nth-child(2) { animation-delay: 0.1s; height: 16px; }
  .ks-wave:nth-child(3) { animation-delay: 0.2s; height: 12px; }
  .ks-wave:nth-child(4) { animation-delay: 0.3s; height: 18px; }
  .ks-wave:nth-child(5) { animation-delay: 0.4s; height: 10px; }

  @keyframes wave {
    0%, 100% { transform: scaleY(0.5); }
    50% { transform: scaleY(1); }
  }

  .ks-processing-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
    margin: var(--space-4) 0 0 0;
  }

  .ks-processing-file {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .ks-progress-bar {
    width: 100%;
    max-width: 250px;
    height: 6px;
    background: var(--bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
    margin-top: var(--space-4);
  }

  .ks-progress-fill {
    height: 100%;
    background: var(--brand-purple);
    border-radius: 3px;
  }

  .ks-progress-indeterminate {
    width: 30%;
    animation: indeterminate 1.5s infinite ease-in-out;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
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
    background: linear-gradient(135deg, var(--brand-purple), #8b5cf6);
    color: white;
  }

  .ks-btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .ks-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.ks-btn-spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
