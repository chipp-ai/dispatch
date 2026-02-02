<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { Button, Input, Avatar } from "$lib/design-system";
  import { user } from "../../stores/auth";
  import { Camera } from "lucide-svelte";

  const dispatch = createEventDispatcher<{ next: void }>();

  let name = "";
  let isLoading = false;
  let error = "";
  let pictureUrl = "";

  onMount(() => {
    // Initialize with current user data
    if ($user) {
      name = $user.name || "";
      pictureUrl = $user.picture || "";
    }
  });

  async function handleSubmit() {
    if (!name.trim()) {
      error = "Please enter your name";
      return;
    }

    isLoading = true;
    error = "";

    try {
      const res = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), picture: pictureUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }

      // Update local user store
      user.update((u) => (u ? { ...u, name: name.trim(), picture: pictureUrl } : u));

      // Navigate to next step
      dispatch("next");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save profile";
    } finally {
      isLoading = false;
    }
  }

  function handleSkip() {
    dispatch("next");
  }
</script>

<h1>Welcome to Chipp</h1>
<p class="subtitle">Let's set up your profile</p>

<form on:submit|preventDefault={handleSubmit}>
  <div class="avatar-section">
    <div class="avatar-wrapper">
      <Avatar src={pictureUrl} name={name} size="xl" />
      <button type="button" class="avatar-upload-btn" aria-label="Upload photo">
        <Camera size={16} />
      </button>
    </div>
  </div>

  <div class="form-group">
    <Input
      id="name"
      label="Your name"
      placeholder="Enter your name"
      bind:value={name}
      error={error}
      required
    />
  </div>

  <div class="actions">
    <Button variant="ghost" on:click={handleSkip} disabled={isLoading}>
      Skip for now
    </Button>
    <Button type="submit" loading={isLoading}>
      Continue
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

  .avatar-section {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-6);
  }

  .avatar-wrapper {
    position: relative;
  }

  .avatar-upload-btn {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--brand-color);
    color: var(--brand-color-foreground);
    border: 2px solid hsl(var(--background));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;
  }

  .avatar-upload-btn:hover {
    transform: scale(1.1);
  }

  .form-group {
    margin-bottom: var(--space-6);
    text-align: left;
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
