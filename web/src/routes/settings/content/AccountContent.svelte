<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { user } from "../../../stores/auth";

  // Form state
  let name = "";
  let pictureUrl = "";
  let isSaving = false;
  let fileInput: HTMLInputElement;
  let selectedFileName = "No file chosen";

  onMount(() => {
    // Initialize form with current user data
    if ($user) {
      name = $user.name || "";
      pictureUrl = $user.picture || "";
    }
  });

  // Track if form has changes
  $: hasChanges = name !== ($user?.name || "") || pictureUrl !== ($user?.picture || "");

  // Generate avatar color from email
  $: userEmail = $user?.email || "";
  $: hash = Array.from(userEmail).reduce(
    (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc),
    0
  );
  $: avatarColor = `#${((hash & 0x00ffffff) | 0x1000000).toString(16).substring(1)}`;
  $: initial = (userEmail ? userEmail[0] : "?").toUpperCase();

  // Determine if text should be light or dark based on background
  function shouldUseLightText(hexColor: string): boolean {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

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
      captureException(e, { tags: { feature: "settings-account" }, extra: { action: "handleSubmit" } });
      toasts.error("Error", "Failed to update profile");
    } finally {
      isSaving = false;
    }
  }

  function handleChooseFile() {
    fileInput?.click();
  }

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    selectedFileName = file.name;

    // Upload to server
    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/upload/image?subfolder=avatars", {
        method: "POST",
        body,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const result = await response.json();
      pictureUrl = result.url;
      toasts.success("Success", "Image uploaded successfully");
    } catch (e) {
      captureException(e, { tags: { feature: "settings-account" }, extra: { action: "handleFileChange" } });
      toasts.error("Error", "Failed to upload image");
      selectedFileName = "No file chosen";
    }
  }
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Account</h1>
  <p class="page-subtitle">Manage how teammates see you on Chipp.</p>
</div>

<!-- Account form -->
<Card padding="lg" class="account-card">
  <div class="form-content">
    <!-- Profile Picture field -->
    <div class="form-field">
      <label class="field-label">Profile Picture</label>
      <button
        type="button"
        class="avatar-button"
        on:click={handleChooseFile}
      >
        {#if pictureUrl}
          <img src={pictureUrl} alt="Profile" class="avatar-image" />
        {:else}
          <div
            class="avatar-placeholder"
            style="background-color: {avatarColor}; color: {shouldUseLightText(avatarColor) ? 'white' : 'black'};"
          >
            {initial}
          </div>
        {/if}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        class="hidden-input"
        on:change={handleFileChange}
      />
      <button type="button" class="file-picker-button" on:click={handleChooseFile}>
        <span class="choose-file-btn">Choose File</span>
        <span class="file-name">{selectedFileName}</span>
      </button>
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
    </div>

    <!-- Save button -->
    <div class="form-actions">
      <Button
        variant="default"
        disabled={!hasChanges || isSaving}
        on:click={handleSubmit}
      >
        {isSaving ? "Saving..." : "Save Account Details"}
      </Button>
    </div>
  </div>
</Card>

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
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

  .avatar-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid hsl(var(--border));
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    background: hsl(var(--background));
    transition: filter 0.3s;
  }

  .avatar-button:hover {
    filter: brightness(0.9);
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
    font-size: var(--text-base);
    font-weight: var(--font-medium);
  }

  .hidden-input {
    display: none;
  }

  .file-picker-button {
    display: flex;
    align-items: center;
    width: 100%;
    height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid hsl(var(--input));
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition: colors 0.2s;
  }

  .file-picker-button:hover {
    background: hsl(var(--accent));
  }

  .choose-file-btn {
    padding: 0 var(--space-3);
    margin-right: var(--space-3);
    border-radius: var(--radius-md);
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--input));
    cursor: pointer;
    font-size: var(--text-sm);
  }

  .choose-file-btn:hover {
    background: hsl(var(--muted));
  }

  .file-name {
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    height: 2.25rem; /* 36px - matches chipp-admin h-9 */
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--input));
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .field-input:hover {
    border-color: hsl(var(--foreground) / 0.3);
  }

  .field-input:focus {
    outline: none;
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 1px hsl(var(--ring));
  }

  .field-input.disabled {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: not-allowed;
    opacity: 1;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-4);
  }
</style>
