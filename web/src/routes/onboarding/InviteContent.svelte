<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Button } from "$lib/design-system";
  import { Mail, Plus, X } from "lucide-svelte";

  const dispatch = createEventDispatcher<{ next: void }>();

  let invites = ["", "", ""];
  let isLoading = false;
  let error = "";

  async function handleSubmit() {
    isLoading = true;
    error = "";

    try {
      const validEmails = invites.filter((email) => email.trim() && email.includes("@"));

      const res = await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emails: validEmails }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send invites");
      }

      dispatch("next");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to send invites";
    } finally {
      isLoading = false;
    }
  }

  function handleSkip() {
    dispatch("next");
  }

  function addInvite() {
    invites = [...invites, ""];
  }

  function removeInvite(index: number) {
    invites = invites.filter((_, i) => i !== index);
  }

  function updateInvite(index: number, value: string) {
    invites = invites.map((invite, i) => (i === index ? value : invite));
    error = "";
  }

  $: hasValidEmails = invites.some((email) => email.trim() && email.includes("@"));
</script>

<h1>Invite your team</h1>
<p class="subtitle">Chipp unlocks more superpowers with more people</p>

<form on:submit|preventDefault={handleSubmit}>
  <div class="invite-fields">
    {#each invites as invite, index}
      <div class="invite-row">
        <div class="input-wrapper">
          <Mail size={16} class="input-icon" />
          <input
            type="email"
            placeholder="name@email.com"
            value={invite}
            on:input={(e) => updateInvite(index, e.currentTarget.value)}
            class="invite-input"
          />
        </div>
        {#if invites.length > 1}
          <button
            type="button"
            class="remove-btn"
            on:click={() => removeInvite(index)}
            aria-label="Remove invite"
          >
            <X size={16} />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <button type="button" class="add-invite-btn" on:click={addInvite}>
    <Plus size={16} />
    <span>Add another invite</span>
  </button>

  {#if error}
    <p class="error-text">{error}</p>
  {/if}

  <div class="actions">
    <Button variant="ghost" on:click={handleSkip} disabled={isLoading}>
      Skip for now
    </Button>
    <Button type="submit" loading={isLoading} disabled={!hasValidEmails && isLoading}>
      {hasValidEmails ? "Send invites" : "Continue"}
    </Button>
  </div>
</form>

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

  .invite-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .invite-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .input-wrapper {
    flex: 1;
    position: relative;
  }

  .input-wrapper :global(.input-icon) {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }

  .invite-input {
    width: 100%;
    padding: var(--space-3) var(--space-3) var(--space-3) 40px;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-base);
    transition: border-color 0.2s;
  }

  .invite-input:focus {
    outline: none;
    border-color: var(--brand-color);
  }

  .invite-input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .remove-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--muted));
    border: none;
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .remove-btn:hover {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .add-invite-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    background: transparent;
    border: 2px dashed hsl(var(--border));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: var(--space-6);
  }

  .add-invite-btn:hover {
    border-color: var(--brand-color);
    color: var(--brand-color);
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
