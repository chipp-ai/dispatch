<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Button } from "$lib/design-system";
  import { DollarSign, Building2, Rocket, Lightbulb, Check } from "lucide-svelte";

  const dispatch = createEventDispatcher<{ next: void }>();

  interface PersonaOption {
    value: string;
    label: string;
    icon: typeof DollarSign;
  }

  const PERSONA_OPTIONS: PersonaOption[] = [
    { value: "sell", label: "I want to sell AI services and products to clients", icon: DollarSign },
    { value: "company", label: "I work within a company building internal AI tools", icon: Building2 },
    { value: "indie", label: "I'm an indie hacker building AI products", icon: Rocket },
    { value: "explore", label: "I'm just exploring AI", icon: Lightbulb },
  ];

  let selectedPersona = "";
  let isLoading = false;
  let error = "";

  async function handleSubmit() {
    if (!selectedPersona) {
      error = "Please select an option";
      return;
    }

    isLoading = true;
    error = "";

    try {
      const res = await fetch("/api/onboarding/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ persona: selectedPersona }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save persona");
      }

      dispatch("next");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save persona";
    } finally {
      isLoading = false;
    }
  }

  function handleSkip() {
    dispatch("next");
  }

  function selectPersona(value: string) {
    selectedPersona = value;
    error = "";
  }
</script>

<h1>What best describes you?</h1>
<p class="subtitle">Help us personalize your experience</p>

<div class="persona-options">
  {#each PERSONA_OPTIONS as option}
    <button
      type="button"
      class="persona-option"
      class:selected={selectedPersona === option.value}
      on:click={() => selectPersona(option.value)}
    >
      <div class="persona-icon">
        <svelte:component this={option.icon} size={24} />
      </div>
      <span class="persona-label">{option.label}</span>
      {#if selectedPersona === option.value}
        <div class="check-icon">
          <Check size={16} />
        </div>
      {/if}
    </button>
  {/each}
</div>

{#if error}
  <p class="error-text">{error}</p>
{/if}

<div class="actions">
  <Button variant="ghost" on:click={handleSkip} disabled={isLoading}>
    Skip for now
  </Button>
  <Button on:click={handleSubmit} loading={isLoading} disabled={!selectedPersona}>
    Continue
  </Button>
</div>

<style>
  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .subtitle {
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6) 0;
  }

  .persona-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .persona-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: hsl(var(--background));
    border: 2px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .persona-option:hover {
    border-color: hsl(var(--border-secondary, var(--border)));
    background: hsl(var(--muted) / 0.3);
  }

  .persona-option.selected {
    border-color: var(--brand-color);
    background: hsl(var(--brand-color) / 0.05);
  }

  .persona-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--muted));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .persona-option.selected .persona-icon {
    background: var(--brand-color);
    color: var(--brand-color-foreground);
  }

  .persona-label {
    flex: 1;
    font-size: var(--text-base);
    color: hsl(var(--foreground));
  }

  .check-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-color);
    color: var(--brand-color-foreground);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
  }

  @media (max-width: 640px) {
    .actions {
      flex-direction: column-reverse;
    }

    .actions :global(button) {
      width: 100%;
    }
  }
</style>
