<script lang="ts">
  /**
   * CustomInstructionsSheet
   *
   * Sheet for managing consumer custom instructions.
   * Allows users to set personalized preferences for how the AI responds.
   */
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import Button from '../Button.svelte';
  import Textarea from '../Textarea.svelte';
  import Spinner from '../Spinner.svelte';

  export let open: boolean = false;
  export let appNameId: string;

  const MAX_LENGTH = 1000;

  let customInstructions = '';
  let originalInstructions = '';
  let loading = false;
  let saving = false;
  let enabled = true;
  let error: string | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    saved: void;
  }>();

  function close() {
    open = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  async function loadInstructions() {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/custom-instructions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load custom instructions');
      }

      const data = await response.json();
      customInstructions = data.customInstructions || '';
      originalInstructions = customInstructions;
      enabled = data.enabled;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load';
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    saving = true;
    error = null;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/custom-instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customInstructions: customInstructions.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      originalInstructions = customInstructions;
      dispatch('saved');
      close();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      saving = false;
    }
  }

  async function handleClear() {
    if (!confirm('Clear your custom instructions?')) return;

    saving = true;
    error = null;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/custom-instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customInstructions: null }),
      });

      if (response.ok) {
        customInstructions = '';
        originalInstructions = '';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to clear';
    } finally {
      saving = false;
    }
  }

  $: hasChanges = customInstructions !== originalInstructions;
  $: charCount = customInstructions.length;

  // Load instructions when sheet opens
  $: if (open) {
    loadInstructions();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="sheet-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
    <div
      class="sheet-content"
      role="dialog"
      aria-modal="true"
      aria-label="Custom Instructions"
      transition:fly={{ x: 300, duration: 200 }}
    >
      <div class="sheet-header">
        <div class="header-content">
          <div class="header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <div class="header-text">
            <h2>Custom Instructions</h2>
            <p>Tell the AI how you'd like it to respond</p>
          </div>
        </div>
        <button class="sheet-close" on:click={close} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="sheet-body">
        {#if loading}
          <div class="loading-state">
            <Spinner size="md" />
            <p>Loading...</p>
          </div>
        {:else if !enabled}
          <div class="disabled-state">
            <div class="disabled-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <p>Custom instructions are not available for this app</p>
          </div>
        {:else}
          <div class="instructions-form">
            <Textarea
              bind:value={customInstructions}
              placeholder="Example: I prefer concise responses. Please use simple language and avoid technical jargon unless I ask for it."
              rows={8}
              maxlength={MAX_LENGTH}
            />
            <div class="char-count">
              {charCount}/{MAX_LENGTH}
            </div>

            {#if error}
              <div class="error-message">
                {error}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      {#if enabled && !loading}
        <div class="sheet-footer">
          <Button
            variant="secondary"
            size="sm"
            on:click={handleClear}
            disabled={saving || !originalInstructions}
          >
            Clear
          </Button>
          <div class="footer-actions">
            <Button variant="secondary" size="sm" on:click={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              on:click={handleSave}
              disabled={saving || !hasChanges}
            >
              {#if saving}
                <Spinner size="sm" />
              {:else}
                Save
              {/if}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background-color: rgba(0, 0, 0, 0.5);
  }

  .sheet-content {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 400px;
    background-color: hsl(var(--background));
    border-left: 1px solid hsl(var(--border));
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sheet-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .header-content {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background-color: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .header-icon svg {
    width: 20px;
    height: 20px;
  }

  .header-text {
    flex: 1;
  }

  .header-text h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .header-text p {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0;
  }

  .sheet-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s;
  }

  .sheet-close:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .sheet-close svg {
    width: 18px;
    height: 18px;
  }

  .sheet-body {
    flex: 1;
    padding: var(--space-4);
    overflow-y: auto;
  }

  .loading-state,
  .disabled-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .disabled-icon {
    width: 48px;
    height: 48px;
    opacity: 0.3;
  }

  .disabled-icon svg {
    width: 100%;
    height: 100%;
  }

  .instructions-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .char-count {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-align: right;
  }

  .error-message {
    font-size: var(--text-sm);
    color: hsl(var(--destructive));
    padding: var(--space-2);
    background-color: hsl(var(--destructive) / 0.1);
    border-radius: var(--radius-sm);
  }

  .sheet-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    gap: var(--space-2);
  }

  .footer-actions {
    display: flex;
    gap: var(--space-2);
  }

  @media (max-width: 640px) {
    .sheet-content {
      max-width: 100%;
    }
  }
</style>
