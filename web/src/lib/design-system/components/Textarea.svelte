<script lang="ts">
  export let value: string = "";
  export let placeholder: string = "";
  export let disabled: boolean = false;
  export let rows: number = 3;
</script>

<textarea
  bind:value
  {placeholder}
  {disabled}
  {rows}
  class="textarea"
  on:input
  on:change
  on:focus
  on:blur
  {...$$restProps}
/>

<style>
  .textarea {
    display: block;
    width: 100%;
    min-height: 80px;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-family: inherit;
    line-height: 1.5;
    color: var(--text-primary);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    resize: vertical;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .textarea::placeholder {
    color: var(--text-muted);
  }

  .textarea:hover:not(:disabled) {
    border-color: var(--border-secondary);
  }

  .textarea:focus {
    outline: none;
    border-color: var(--brand-color-ui);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-color-ui) 10%, transparent);
  }

  .textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--bg-secondary);
  }
</style>
