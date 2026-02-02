<script lang="ts">
  type InputType = "text" | "email" | "password" | "number" | "search" | "url";

  export let type: InputType = "text";
  export let value: string = "";
  export let placeholder: string = "";
  export let label: string = "";
  export let error: string = "";
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let id: string = "";
</script>

<div class="input-wrapper" class:has-error={error}>
  {#if label}
    <label for={id} class="label">
      {label}
      {#if required}
        <span class="required">*</span>
      {/if}
    </label>
  {/if}

  <input
    {id}
    {type}
    {placeholder}
    {disabled}
    {required}
    bind:value
    class="input"
    on:input
    on:focus
    on:blur
    on:keydown
    {...$$restProps}
  />

  {#if error}
    <span class="error-text">{error}</span>
  {/if}
</div>

<style>
  .input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
  }

  .required {
    color: var(--color-error);
    margin-left: var(--space-1);
  }

  .input {
    width: 100%;
    height: 2.25rem; /* 36px - matches chipp-admin h-9 */
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    background: transparent;
    border: 1px solid hsl(var(--input));
    border-radius: var(--radius-md);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .input:hover {
    border-color: hsl(var(--foreground) / 0.3);
  }

  .input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 1px hsl(var(--ring));
  }

  .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: hsl(var(--muted));
  }

  .has-error .input {
    border-color: var(--color-error);
  }

  .has-error .input:focus {
    box-shadow: 0 0 0 3px var(--color-error-light);
  }

  .error-text {
    font-size: var(--text-sm);
    color: var(--color-error);
  }
</style>
