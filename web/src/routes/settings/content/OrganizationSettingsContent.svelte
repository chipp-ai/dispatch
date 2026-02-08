<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Input, Label, Spinner, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { user } from "../../../stores/auth";
  import {
    organization,
    isOrganizationLoading,
    fetchOrganization,
    updateOrganization,
    organizationMembers,
    fetchOrganizationMembers,
    type Organization,
  } from "../../../stores/organization";
  import { AlertCircle, Upload, CreditCard, Mail, X, Clock, Loader2 } from "lucide-svelte";

  // Form state
  let name = "";
  let pictureUrl = "";
  let isSaving = false;
  let hasChanges = false;
  let fileInput: HTMLInputElement;
  let isUploading = false;
  let previewUrl = "";

  // Payment state
  let paymentStatus: {
    hasDefaultPaymentMethod: boolean;
    customerId: string | null;
    card: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  } | null = null;
  let isLoadingPayment = true;
  let isOpeningPortal = false;
  let paymentError: string | null = null;

  // User role check
  $: canEdit = $user && ["owner", "admin"].includes(getUserRole($user.id));
  $: isViewer = $user && getUserRole($user.id) === "viewer";

  function getUserRole(userId: string): string {
    const member = $organizationMembers.find((m) => m.id === userId);
    return member?.role || "member";
  }

  // Initialize form when organization loads
  $: if ($organization) {
    initForm($organization);
  }

  function initForm(org: Organization) {
    if (!hasChanges) {
      name = "";
      pictureUrl = "";
      previewUrl = org.pictureUrl || "";
    }
  }

  // Track changes
  $: hasChanges = name.trim() !== "" || pictureUrl.trim() !== "";

  onMount(async () => {
    await Promise.all([fetchOrganization(), fetchOrganizationMembers()]);
    await fetchPaymentMethodStatus();
  });

  async function fetchPaymentMethodStatus() {
    isLoadingPayment = true;
    paymentError = null;
    try {
      const res = await fetch("/api/organization/payment-method-status", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load payment method status");
      }
      const data = await res.json();
      paymentStatus = {
        hasDefaultPaymentMethod: data.has_default_payment_method,
        customerId: data.customerId,
        card: data.card,
      };
    } catch (e: any) {
      paymentError = e.message || "Failed to load payment method";
    } finally {
      isLoadingPayment = false;
    }
  }

  async function openBillingPortal() {
    isOpeningPortal = true;
    paymentError = null;
    try {
      const response = await fetch("/api/organization/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const err = await response.json().catch(() => ({}));
        paymentError = err?.portalSetupRequired
          ? "Please configure the Stripe Customer Portal in your sandbox first."
          : err?.details || "Failed to open billing portal";
        isOpeningPortal = false;
      }
    } catch (e: any) {
      paymentError = "Failed to open billing portal";
      isOpeningPortal = false;
    }
  }

  async function handleSave() {
    if (!hasChanges || isSaving) return;

    isSaving = true;

    // Only include non-empty fields in the update
    const updateData: { name?: string; pictureUrl?: string } = {};
    if (name.trim()) updateData.name = name.trim();
    if (pictureUrl.trim()) updateData.pictureUrl = pictureUrl.trim();

    try {
      await updateOrganization(updateData);
      toasts.success("Success", "Organization updated successfully");
      // Reset form
      name = "";
      pictureUrl = "";
      hasChanges = false;
    } catch (error) {
      toasts.error("Error", "Failed to update organization");
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

    isUploading = true;

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/upload/image?subfolder=organizations", {
        method: "POST",
        body,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const result = await response.json();
      pictureUrl = result.url;
      previewUrl = result.url;
      toasts.success("Success", "Image uploaded successfully");
    } catch (e) {
      captureException(e, {
        tags: { feature: "settings-organization" },
        extra: { action: "handleFileChange" },
      });
      toasts.error("Error", "Failed to upload image");
    } finally {
      isUploading = false;
    }
  }

  function getBrandDisplayName(brand: string): string {
    const names: Record<string, string> = {
      visa: "Visa",
      mastercard: "Mastercard",
      amex: "American Express",
      discover: "Discover",
      diners: "Diners Club",
      jcb: "JCB",
      unionpay: "UnionPay",
    };
    return names[brand.toLowerCase()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  }
</script>

<svelte:head>
  <title>Organization Settings - Chipp</title>
</svelte:head>

{#if $isOrganizationLoading && !$organization}
  <div class="loading-container">
    <Spinner size="lg" />
    <p>Loading organization...</p>
  </div>
{:else if !$organization}
  <Card>
    <div class="empty-state">
      <AlertCircle size={48} />
      <h3>No organization found</h3>
      <p>You don't appear to be part of an organization.</p>
    </div>
  </Card>
{:else if !isViewer}
  <!-- Organization Settings Section -->
  <div class="settings-section">
    <div class="section-header">
      <h1>Organization Settings</h1>
      <p class="section-subtitle">Update branding and organization details.</p>
    </div>

    <Card padding="lg">
      <div class="org-form">
        <!-- Logo Section -->
        <div class="logo-section">
          <Label>Organization Logo</Label>
          <button
            type="button"
            class="logo-uploader"
            on:click={handleChooseFile}
            disabled={isUploading}
          >
            {#if isUploading}
              <Spinner size="sm" />
            {:else if previewUrl}
              <img src={previewUrl} alt="Organization logo" class="logo-preview" />
              <div class="logo-overlay">
                <Upload size={20} />
              </div>
            {:else}
              <div class="logo-placeholder">
                <Upload size={24} />
                <span>Upload</span>
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
          <p class="field-hint">Square image recommended</p>
        </div>

        <!-- Name Section -->
        <div class="name-section">
          <div class="form-field">
            <Label for="org-name">Organization Name</Label>
            <Input
              id="org-name"
              placeholder={$organization?.name || "Enter name"}
              bind:value={name}
            />
            <p class="field-hint">This is displayed across your workspaces and to team members.</p>
          </div>

          <div class="form-actions">
            <Button
              variant="default"
              size="sm"
              disabled={!hasChanges || isSaving}
              on:click={handleSave}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  </div>

  <!-- Payment Details Section -->
  <div class="settings-section">
    <div class="section-header">
      <h2>Payment Details</h2>
      <p class="section-subtitle">Payment method on file for this organization</p>
    </div>

    <Card padding="lg">
      {#if isLoadingPayment}
        <div class="payment-loading">
          <div class="card-skeleton" />
          <div class="info-skeleton">
            <div class="line-skeleton" />
            <div class="line-skeleton short" />
          </div>
        </div>
      {:else if paymentStatus?.hasDefaultPaymentMethod && paymentStatus?.card}
        <div class="payment-row">
          <div class="payment-info">
            <div class="card-icon {paymentStatus.card.brand.toLowerCase()}">
              <CreditCard size={20} />
            </div>
            <div class="card-details">
              <div class="card-brand">
                <span class="brand-name">{getBrandDisplayName(paymentStatus.card.brand)}</span>
                <span class="card-last4">**** {paymentStatus.card.last4}</span>
              </div>
              <p class="card-expiry">
                Expires {String(paymentStatus.card.exp_month).padStart(2, "0")}/{String(paymentStatus.card.exp_year).slice(-2)}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            on:click={openBillingPortal}
            disabled={isOpeningPortal}
          >
            {#if isOpeningPortal}
              <Loader2 size={16} class="animate-spin" />
            {:else}
              Update
            {/if}
          </Button>
        </div>
      {:else}
        <div class="payment-row">
          <div class="payment-info">
            <div class="card-icon empty">
              <CreditCard size={20} />
            </div>
            <div class="card-details">
              <p class="no-card-text">No payment method</p>
              <p class="no-card-hint">Add a card to enable billing</p>
            </div>
          </div>
          <Button
            size="sm"
            on:click={openBillingPortal}
            disabled={isOpeningPortal}
          >
            {#if isOpeningPortal}
              <Loader2 size={16} class="animate-spin" />
            {:else}
              Add Card
            {/if}
          </Button>
        </div>
      {/if}

      {#if paymentError}
        <div class="payment-error">
          <p>{paymentError}</p>
        </div>
      {/if}

      <div class="invite-section">
        <Button variant="outline" size="sm" on:click={() => {}}>
          <Mail size={16} />
          Invite to Update Payment
        </Button>
      </div>
    </Card>
  </div>
{/if}

<style>
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .empty-state h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: hsl(var(--foreground));
  }

  .settings-section {
    margin-bottom: var(--space-12);
  }

  .section-header {
    margin-bottom: var(--space-4);
  }

  .section-header h1,
  .section-header h2 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .org-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  @media (min-width: 640px) {
    .org-form {
      flex-direction: row;
    }
  }

  .logo-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .logo-uploader {
    position: relative;
    width: 120px;
    height: 120px;
    border: 2px dashed hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--muted) / 0.5);
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.2s, background 0.2s;
  }

  .logo-uploader:hover {
    border-color: hsl(var(--primary));
    background: hsl(var(--muted));
  }

  .logo-uploader:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .logo-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .logo-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background) / 0.7);
    opacity: 0;
    transition: opacity 0.2s;
    color: hsl(var(--foreground));
  }

  .logo-uploader:hover .logo-overlay {
    opacity: 1;
  }

  .logo-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .hidden-input {
    display: none;
  }

  .field-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .name-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-actions {
    padding-top: var(--space-2);
  }

  /* Payment Details Styles */
  .payment-loading {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .card-skeleton {
    width: 72px;
    height: 48px;
    border-radius: var(--radius-md);
    background: hsl(var(--muted));
    animation: pulse 2s infinite;
  }

  .info-skeleton {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .line-skeleton {
    height: 16px;
    width: 128px;
    border-radius: var(--radius);
    background: hsl(var(--muted));
    animation: pulse 2s infinite;
  }

  .line-skeleton.short {
    width: 96px;
    height: 12px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .payment-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
  }

  .payment-info {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 48px;
    border-radius: var(--radius-md);
    background: hsl(var(--primary));
    color: white;
  }

  .card-icon.visa {
    background: #1A1F71;
  }

  .card-icon.mastercard {
    background: #000;
  }

  .card-icon.amex {
    background: #006FCF;
  }

  .card-icon.empty {
    background: hsl(var(--muted));
    border: 2px dashed hsl(var(--border));
    color: hsl(var(--muted-foreground));
  }

  .card-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .card-brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .brand-name {
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .card-last4 {
    color: hsl(var(--muted-foreground));
  }

  .card-expiry {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .no-card-text {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .no-card-hint {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .payment-error {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--destructive) / 0.3);
    background: hsl(var(--destructive) / 0.1);
  }

  .payment-error p {
    font-size: var(--text-sm);
    color: hsl(var(--destructive));
    margin: 0;
  }

  .invite-section {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
  }

  .invite-section :global(button) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
