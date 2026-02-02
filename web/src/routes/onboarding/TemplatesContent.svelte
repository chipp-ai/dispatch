<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Button, Textarea } from "$lib/design-system";
  import { Sparkles, ArrowRight } from "lucide-svelte";

  let prompt = "";
  let isLoading = false;
  let error = "";

  async function handleSubmit() {
    if (!prompt.trim()) {
      error = "Please describe what you want to build";
      return;
    }

    isLoading = true;
    error = "";

    try {
      // Mark onboarding as complete
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      // Navigate to app builder with the prompt
      const encodedPrompt = encodeURIComponent(prompt.trim());
      push(`/builder?prompt=${encodedPrompt}`);
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong";
      isLoading = false;
    }
  }

  function handleSkip() {
    // Mark onboarding as complete and go to dashboard
    fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }).finally(() => {
      push("/dashboard");
    });
  }

  const examplePrompts = [
    "A customer support agent for my e-commerce store",
    "A research assistant that can analyze PDFs",
    "A coding tutor that helps learn Python",
    "A writing assistant for blog posts",
  ];

  function useExample(example: string) {
    prompt = example;
    error = "";
  }
</script>

<div class="icon-header">
  <div class="sparkle-icon">
    <Sparkles size={24} />
  </div>
</div>

<h1>What do you want to build?</h1>
<p class="subtitle">Describe your AI agent and we'll create it for you</p>

<form on:submit|preventDefault={handleSubmit}>
  <div class="prompt-section">
    <Textarea
      id="prompt"
      placeholder="I want to build an AI agent that..."
      bind:value={prompt}
      rows={4}
      class="prompt-textarea"
    />
  </div>

  <div class="examples">
    <p class="examples-label">Try an example:</p>
    <div class="example-chips">
      {#each examplePrompts as example}
        <button
          type="button"
          class="example-chip"
          on:click={() => useExample(example)}
        >
          {example}
        </button>
      {/each}
    </div>
  </div>

  {#if error}
    <p class="error-text">{error}</p>
  {/if}

  <div class="actions">
    <Button variant="ghost" on:click={handleSkip} disabled={isLoading}>
      Skip to dashboard
    </Button>
    <Button type="submit" loading={isLoading} disabled={!prompt.trim()}>
      <span>Create my agent</span>
      <ArrowRight size={16} />
    </Button>
  </div>
</form>

<style>
  .icon-header {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-4);
  }

  .sparkle-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--brand-color), hsl(var(--brand-color) / 0.7));
    border-radius: var(--radius-lg);
    color: var(--brand-color-foreground);
  }

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

  .prompt-section {
    margin-bottom: var(--space-4);
    text-align: left;
  }

  .prompt-section :global(.prompt-textarea) {
    width: 100%;
    min-height: 100px;
    resize: vertical;
  }

  .examples {
    margin-bottom: var(--space-6);
    text-align: left;
  }

  .examples-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-2);
  }

  .example-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .example-chip {
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .example-chip:hover {
    background: hsl(var(--muted) / 0.5);
    border-color: var(--brand-color);
  }

  .error-text {
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
    text-align: left;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .actions :global(button) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  @media (max-width: 640px) {
    .actions {
      flex-direction: column-reverse;
    }

    .actions :global(button) {
      width: 100%;
      justify-content: center;
    }
  }
</style>
