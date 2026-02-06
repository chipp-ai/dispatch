<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, Label, Input, Textarea, Select, SelectItem, Switch, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { currentWorkspace } from "../../stores/workspace";
  import { user } from "../../stores/auth";
  import { ArrowLeft, Globe, Lock, CreditCard, Copy, ExternalLink, Upload, X, Image as ImageIcon } from "lucide-svelte";

  // Access mode enum
  type HQAccessMode = "public" | "public_paid" | "private" | "paid";

  // HQ data state
  let hqData: {
    name: string;
    slug: string;
    description: string;
    videoUrl: string;
    pictureUrl: string;
    bannerUrl: string;
    accessMode: HQAccessMode;
  } | null = null;

  // Form state
  let title = "";
  let slug = "";
  let description = "";
  let videoUrl = "";
  let logoFile: File | null = null;
  let logoPreview = "";
  let bannerFile: File | null = null;
  let bannerPreview = "";
  let accessMode: HQAccessMode = "public";
  let enableDuplication = false;

  // UI state
  let isLoading = true;
  let isSaving = false;
  let videoUrlError = "";
  let logoInput: HTMLInputElement;
  let bannerInput: HTMLInputElement;

  // Access mode info
  const accessModeInfo: Record<HQAccessMode, { label: string; icon: typeof Globe; description: string }> = {
    public: {
      label: "Public",
      icon: Globe,
      description: "Anyone who visits your HQ can use your applications.",
    },
    public_paid: {
      label: "Public Paid",
      icon: Globe,
      description: "Anyone who visits your HQ can use your applications for a fee.",
    },
    private: {
      label: "Private",
      icon: Lock,
      description: "Only users in your workspace can use your applications.",
    },
    paid: {
      label: "Paid",
      icon: CreditCard,
      description: "Users can purchase access to a Viewer seat in your workspace.",
    },
  };

  onMount(async () => {
    await loadHQData();
  });

  async function loadHQData() {
    isLoading = true;
    try {
      const workspaceId = $currentWorkspace?.id;
      if (!workspaceId) {
        throw new Error("No workspace selected");
      }

      const response = await fetch(`/api/workspaces/${workspaceId}/hq`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        hqData = data.hq;
        accessMode = hqData?.accessMode || "public";
        enableDuplication = data.enableDuplication || false;
      }
    } catch (e) {
      captureException(e, {
        tags: { feature: "settings-hq" },
        extra: { workspaceId: $currentWorkspace?.id, action: "loadHQData" },
      });
    } finally {
      isLoading = false;
    }
  }

  function validateVideoUrl(url: string): boolean {
    if (!url.trim()) {
      videoUrlError = "";
      return true;
    }

    const validPatterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /vimeo\.com\//,
      /loom\.com\//,
      /wistia\.com\//,
    ];

    const isValid = validPatterns.some(pattern => pattern.test(url));
    if (!isValid) {
      videoUrlError = "Please use YouTube, Loom, Vimeo, or Wistia.";
      return false;
    }

    videoUrlError = "";
    return true;
  }

  function handleVideoUrlChange(e: Event) {
    const target = e.target as HTMLInputElement;
    videoUrl = target.value;
    validateVideoUrl(videoUrl);
  }

  function handleSlugChange(e: Event) {
    const target = e.target as HTMLInputElement;
    slug = target.value.replace(/\s+/g, "-").toLowerCase();
  }

  function handleLogoClick() {
    logoInput?.click();
  }

  function handleBannerClick() {
    bannerInput?.click();
  }

  function handleLogoChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      logoFile = file;
      const reader = new FileReader();
      reader.onloadend = () => {
        logoPreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  function handleBannerChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      bannerFile = file;
      const reader = new FileReader();
      reader.onloadend = () => {
        bannerPreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  function clearLogo() {
    logoFile = null;
    logoPreview = "";
    if (logoInput) logoInput.value = "";
  }

  function clearBanner() {
    bannerFile = null;
    bannerPreview = "";
    if (bannerInput) bannerInput.value = "";
  }

  async function handleAccessModeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const newMode = target.value as HQAccessMode;

    // Check subscription tier for private/paid modes
    const tier = $currentWorkspace?.subscriptionTier;
    if ((newMode === "private" || newMode === "paid") && tier === "FREE") {
      toasts.error("Upgrade Required", "Please upgrade to use Private or Paid access modes");
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace?.id}/hq/access-mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessMode: newMode }),
      });

      if (response.ok) {
        accessMode = newMode;
        toasts.success("Success", "Access mode updated");
      } else {
        throw new Error("Failed to update access mode");
      }
    } catch (e) {
      toasts.error("Error", "Failed to update access mode");
    }
  }

  async function handleDuplicationToggle() {
    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace?.id}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enableDuplication: !enableDuplication }),
      });

      if (response.ok) {
        enableDuplication = !enableDuplication;
        toasts.success("Success", "Duplication setting updated");
      } else {
        throw new Error("Failed to update setting");
      }
    } catch (e) {
      toasts.error("Error", "Failed to update setting");
    }
  }

  async function handleSubmit() {
    if (!validateVideoUrl(videoUrl)) {
      return;
    }

    isSaving = true;
    try {
      const formData = new FormData();
      if (title.trim()) formData.append("title", title);
      if (slug.trim()) formData.append("slug", slug);
      if (description.trim()) formData.append("description", description);
      if (videoUrl.trim()) formData.append("videoUrl", videoUrl);
      if (logoFile) formData.append("logo", logoFile);
      if (bannerFile) formData.append("banner", bannerFile);

      const response = await fetch(`/api/workspaces/${$currentWorkspace?.id}/hq`, {
        method: "PUT",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to update HQ");
      }

      const result = await response.json();
      hqData = result.hq;

      // Clear form
      title = "";
      slug = "";
      description = "";
      videoUrl = "";
      clearLogo();
      clearBanner();

      toasts.success("Success", "HQ updated successfully");
    } catch (e) {
      captureException(e, {
        tags: { feature: "settings-hq" },
        extra: { workspaceId: $currentWorkspace?.id, action: "updateHQ" },
      });
      toasts.error("Error", "Failed to update HQ");
    } finally {
      isSaving = false;
    }
  }

  function copyInviteLink() {
    const link = `${window.location.origin}/hq/${hqData?.slug || $currentWorkspace?.slug}/invite`;
    navigator.clipboard.writeText(link);
    toasts.success("Copied", "Invite link copied to clipboard");
  }

  $: hasChanges = title.trim() || slug.trim() || description.trim() || videoUrl.trim() || logoFile || bannerFile;
  $: hqSlug = hqData?.slug || $currentWorkspace?.slug;
  $: hqPreviewUrl = `/hq/${hqSlug}`;
  $: currentModeInfo = accessModeInfo[accessMode];
  $: showInviteLink = accessMode === "private" || accessMode === "paid";
</script>

<svelte:head>
  <title>HQ Settings - Chipp</title>
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
        <h1>HQ</h1>
        <p class="page-subtitle">Configure your workspace's public HQ page.</p>
      </div>

      {#if isLoading}
        <Card padding="lg">
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading HQ settings...</p>
          </div>
        </Card>
      {:else}
        <!-- Access Mode Section -->
        <section class="section">
          <div class="section-header">
            <h2>Access</h2>
            <p class="section-subtitle">Configure how people join your HQ</p>
          </div>

          <Card padding="lg">
            <div class="form-field">
              <Label>How do people join your HQ?</Label>
              <select
                class="select-input"
                value={accessMode}
                on:change={handleAccessModeChange}
              >
                {#each Object.entries(accessModeInfo) as [mode, info]}
                  <option value={mode}>
                    {info.label} - {info.description}
                  </option>
                {/each}
              </select>
            </div>

            {#if showInviteLink}
              <div class="invite-link-section">
                <Label>{accessMode === "paid" ? "Purchase Link" : "Invite Link"}</Label>
                <p class="field-hint">
                  {accessMode === "paid"
                    ? "Anyone with this link can purchase access to your HQ"
                    : "Anyone with this link can join your HQ for free"}
                </p>
                <div class="link-row">
                  <input
                    type="text"
                    class="link-input"
                    readonly
                    value={`${hqSlug}/invite`}
                  />
                  <Button variant="outline" on:click={copyInviteLink}>
                    <Copy size={16} />
                    Copy
                  </Button>
                </div>
              </div>
            {/if}
          </Card>
        </section>

        <!-- App Duplication Section -->
        <section class="section">
          <div class="section-header">
            <h2>App Duplication</h2>
            <p class="section-subtitle">Allow visitors to duplicate your apps</p>
          </div>

          <Card padding="lg">
            <div class="toggle-row">
              <div class="toggle-info">
                <span class="toggle-label">Enable App Duplication</span>
                <p class="toggle-description">
                  When enabled, visitors to your HQ can create copies of your applications.
                </p>
              </div>
              <button
                class="toggle-switch"
                class:active={enableDuplication}
                on:click={handleDuplicationToggle}
                role="switch"
                aria-checked={enableDuplication}
              >
                <span class="toggle-thumb"></span>
              </button>
            </div>
          </Card>
        </section>

        <!-- HQ Details Section -->
        <section class="section">
          <div class="section-header">
            <h2>HQ Details</h2>
            <p class="section-subtitle">Customize your HQ page</p>
          </div>

          <Card padding="lg">
            <form on:submit|preventDefault={handleSubmit} class="hq-form">
              <!-- Logo Uploader -->
              <div class="form-field">
                <Label>Logo</Label>
                <div class="image-uploader" class:has-image={logoPreview || hqData?.pictureUrl}>
                  {#if logoPreview || hqData?.pictureUrl}
                    <div class="image-preview">
                      <img src={logoPreview || hqData?.pictureUrl} alt="Logo preview" />
                      {#if logoPreview}
                        <button type="button" class="clear-image" on:click={clearLogo}>
                          <X size={16} />
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <button type="button" class="upload-button" on:click={handleLogoClick}>
                      <ImageIcon size={24} />
                      <span>Upload Logo</span>
                    </button>
                  {/if}
                  <input
                    bind:this={logoInput}
                    type="file"
                    accept="image/*"
                    class="hidden-input"
                    on:change={handleLogoChange}
                  />
                  {#if logoPreview || hqData?.pictureUrl}
                    <Button variant="outline" size="sm" on:click={handleLogoClick}>
                      <Upload size={14} />
                      Change
                    </Button>
                  {/if}
                </div>
              </div>

              <!-- Banner Uploader -->
              <div class="form-field">
                <Label>Banner</Label>
                <div class="banner-uploader" class:has-image={bannerPreview || hqData?.bannerUrl}>
                  {#if bannerPreview || hqData?.bannerUrl}
                    <div class="banner-preview">
                      <img src={bannerPreview || hqData?.bannerUrl} alt="Banner preview" />
                      {#if bannerPreview}
                        <button type="button" class="clear-image" on:click={clearBanner}>
                          <X size={16} />
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <button type="button" class="upload-button banner-upload" on:click={handleBannerClick}>
                      <ImageIcon size={24} />
                      <span>Upload Banner</span>
                    </button>
                  {/if}
                  <input
                    bind:this={bannerInput}
                    type="file"
                    accept="image/*"
                    class="hidden-input"
                    on:change={handleBannerChange}
                  />
                  {#if bannerPreview || hqData?.bannerUrl}
                    <Button variant="outline" size="sm" on:click={handleBannerClick}>
                      <Upload size={14} />
                      Change
                    </Button>
                  {/if}
                </div>
              </div>

              <!-- Title -->
              <div class="form-field">
                <Label for="title">Title</Label>
                <input
                  id="title"
                  type="text"
                  class="field-input"
                  placeholder={hqData?.name || "Enter your HQ title"}
                  bind:value={title}
                  maxlength={20}
                />
              </div>

              <!-- Slug -->
              <div class="form-field">
                <Label for="slug">Slug</Label>
                <input
                  id="slug"
                  type="text"
                  class="field-input"
                  placeholder={hqData?.slug || "enter-your-hq-slug"}
                  value={slug}
                  on:input={handleSlugChange}
                  maxlength={40}
                />
                <p class="field-hint">URL: chipp.ai/hq/{slug || hqData?.slug || $currentWorkspace?.slug}</p>
              </div>

              <!-- Video URL -->
              <div class="form-field">
                <Label for="videoUrl">Video URL</Label>
                <input
                  id="videoUrl"
                  type="text"
                  class="field-input"
                  class:error={videoUrlError}
                  placeholder={hqData?.videoUrl || "https://youtube.com/watch?v=..."}
                  value={videoUrl}
                  on:input={handleVideoUrlChange}
                />
                {#if videoUrlError}
                  <p class="field-error">{videoUrlError}</p>
                {:else}
                  <p class="field-hint">Supports YouTube, Loom, Vimeo, and Wistia</p>
                {/if}
              </div>

              <!-- Description -->
              <div class="form-field">
                <Label for="description">Description</Label>
                <textarea
                  id="description"
                  class="field-textarea"
                  placeholder={hqData?.description || "Describe your HQ..."}
                  bind:value={description}
                  rows={4}
                ></textarea>
              </div>

              <!-- Submit -->
              <div class="form-actions">
                <Button
                  variant="default"
                  disabled={!hasChanges || isSaving}
                  type="submit"
                >
                  {isSaving ? "Saving..." : "Save HQ Details"}
                </Button>
              </div>
            </form>
          </Card>
        </section>

        <!-- Preview Section -->
        <section class="section">
          <div class="section-header">
            <h2>Preview</h2>
            <p class="section-subtitle">Preview and edit your HQ</p>
          </div>

          <a href={hqPreviewUrl} class="preview-link" target="_blank" rel="noopener">
            <div class="preview-container">
              <iframe
                src={hqPreviewUrl}
                title="HQ Preview"
                loading="lazy"
                class="preview-iframe"
              ></iframe>
              <div class="preview-overlay">
                <ExternalLink size={24} />
                <span>Click to preview and edit</span>
              </div>
            </div>
          </a>
        </section>
      {/if}
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
    max-width: 800px;
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

  .section {
    margin-bottom: var(--space-8);
  }

  .section-header {
    margin-bottom: var(--space-4);
  }

  .section-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
    margin-bottom: var(--space-4);
  }

  .select-input {
    width: 100%;
    padding: var(--space-2-5) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .select-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .invite-link-section {
    margin-top: var(--space-6);
    padding-top: var(--space-6);
    border-top: 1px solid hsl(var(--border));
  }

  .field-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .link-row {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .link-input {
    flex: 1;
    padding: var(--space-2-5) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .toggle-info {
    flex: 1;
  }

  .toggle-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .toggle-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  .toggle-switch {
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 9999px;
    background: hsl(var(--muted));
    border: none;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle-switch.active {
    background: hsl(var(--primary));
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s;
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  .hq-form {
    display: flex;
    flex-direction: column;
  }

  .image-uploader {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .image-preview {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid hsl(var(--border));
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .clear-image {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .upload-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 96px;
    height: 96px;
    border: 2px dashed hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
    font-size: var(--text-xs);
  }

  .upload-button:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }

  .banner-uploader {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .banner-preview {
    position: relative;
    width: 100%;
    height: 120px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid hsl(var(--border));
  }

  .banner-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .banner-upload {
    width: 100%;
    height: 120px;
  }

  .hidden-input {
    display: none;
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

  .field-input.error {
    border-color: hsl(var(--destructive));
  }

  .field-error {
    font-size: var(--text-xs);
    color: hsl(var(--destructive));
    margin: 0;
  }

  .field-textarea {
    padding: var(--space-2-5) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    resize: none;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .field-textarea:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-4);
  }

  .preview-link {
    display: block;
    text-decoration: none;
    transition: transform 0.2s;
  }

  .preview-link:hover {
    transform: translateY(-2px);
  }

  .preview-container {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-md);
    border: 1px solid hsl(var(--border));
  }

  .preview-iframe {
    width: 100%;
    height: 400px;
    pointer-events: none;
    user-select: none;
  }

  .preview-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-weight: var(--font-medium);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .preview-link:hover .preview-overlay {
    opacity: 1;
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

    .toggle-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .preview-iframe {
      height: 300px;
    }
  }
</style>
