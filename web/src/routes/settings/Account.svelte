<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { user } from "../../stores/auth";
  import { ArrowLeft, Camera } from "lucide-svelte";

  // Form state
  let name = "";
  let pictureUrl = "";
  let isSaving = false;
  let fileInput: HTMLInputElement;

  onMount(() => {
    // Initialize form with current user data
    if ($user) {
      name = $user.name || "";
      pictureUrl = $user.picture || "";
    }
  });

  // Track if form has changes
  $: hasChanges = name !== ($user?.name || "") || pictureUrl !== ($user?.picture || "");

  async function handleSubmit() {
    if (!hasChanges) return;

    isSaving = true;
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, pictureUrl }),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      const result = await response.json();

      // Update the user store with new data
      user.update(u => u ? { ...u, name, picture: pictureUrl } : u);

      toasts.success("Success", "Profile updated successfully");
    } catch (e) {
      captureException(e, {
        tags: { feature: "settings-account" },
        extra: { userId: $user?.id, action: "updateProfile" },
      });
      toasts.error("Error", "Failed to update profile");
    } finally {
      isSaving = false;
    }
  }

  function handleAvatarClick() {
    fileInput?.click();
  }

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // For now, just create a preview URL
    // In production, this would upload to a storage service
    const reader = new FileReader();
    reader.onloadend = () => {
      pictureUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
</script>

<svelte:head>
  <title>Account Settings - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <!-- Mobile back button -->
      <a href="#/settings" class="back-link">
        <ArrowLeft size={16} />
        <span>Back to Settings</span>
      </a>

      <!-- Page header -->
      <div class="page-header">
        <h1>Account</h1>
        <p class="page-subtitle">Manage how teammates see you on Chipp.</p>
      </div>

      <!-- Account form -->
      <Card padding="lg" class="account-card">
        <div class="form-content">
          <!-- Avatar section -->
          <div class="avatar-section">
            <button type="button" class="avatar-button" on:click={handleAvatarClick}>
              {#if pictureUrl}
                <img src={pictureUrl} alt="Profile" class="avatar-image" />
              {:else}
                <div class="avatar-placeholder">
                  {($user?.name || "?").charAt(0).toUpperCase()}
                </div>
              {/if}
              <div class="avatar-overlay">
                <Camera size={20} />
              </div>
            </button>
            <input
              bind:this={fileInput}
              type="file"
              accept="image/*"
              class="hidden-input"
              on:change={handleFileChange}
            />
            <p class="avatar-hint">Click to upload a photo</p>
          </div>

          <!-- Name field -->
          <div class="form-field">
            <label for="name" class="field-label">Name</label>
            <input
              id="name"
              type="text"
              class="field-input"
              placeholder={$user?.name || "John Doe"}
              bind:value={name}
            />
          </div>

          <!-- Email field (read-only) -->
          <div class="form-field">
            <label for="email" class="field-label">Email</label>
            <input
              id="email"
              type="email"
              class="field-input disabled"
              value={$user?.email || ""}
              disabled
            />
            <p class="field-hint">Email cannot be changed</p>
          </div>

          <!-- Save button -->
          <div class="form-actions">
            <Button
              variant="default"
              disabled={!hasChanges || isSaving}
              on:click={handleSubmit}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </div>
</div>

<style>
  .settings-layout {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
    padding-top: 64px;
  }

  .settings-main {
    flex: 1;
    overflow-y: auto;
  }

  .settings-content {
    max-width: 600px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  .back-link {
    display: none;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
    transition: color 0.2s;
  }

  .back-link:hover {
    color: hsl(var(--foreground));
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .account-card :global(.card) {
    background: hsl(var(--card));
  }

  .form-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .avatar-button {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: none;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    background: transparent;
  }

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .avatar-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .avatar-button:hover .avatar-overlay {
    opacity: 1;
  }

  .hidden-input {
    display: none;
  }

  .avatar-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .field-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .field-input {
    padding: var(--space-2-5) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .field-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .field-input.disabled {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: not-allowed;
  }

  .field-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
  }

  @media (min-width: 769px) {
    .settings-layout {
      padding-left: 256px;
    }
  }

  @media (max-width: 768px) {
    .back-link {
      display: flex;
    }

    .settings-content {
      padding: var(--space-4);
    }
  }
</style>
