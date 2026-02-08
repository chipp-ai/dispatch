<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Input, Label, Badge, Spinner } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import {
    Globe,
    Plus,
    Trash2,
    ExternalLink,
    RefreshCw,
    Copy,
    Check,
    AlertCircle,
    ShieldCheck,
    Clock,
  } from "lucide-svelte";

  export let tenantId: string | null = null;
  export let canEdit = false;

  interface Domain {
    hostname: string;
    type: string;
    sslStatus: string;
    tenantId: string | null;
    createdAt: string;
  }

  interface DnsRecord {
    type: string;
    name: string;
    value: string;
  }

  let domains: Domain[] = [];
  let isLoading = true;
  let isRegistering = false;
  let isDeleting = false;
  let isRefreshing = false;
  let newHostname = "";
  let registerError: string | null = null;
  let dnsRecords: DnsRecord[] = [];
  let copiedField: string | null = null;

  // Computed state
  $: activeDomain = domains.find((d) => d.type === "dashboard");
  $: domainState = activeDomain
    ? activeDomain.sslStatus === "active"
      ? "active"
      : "pending"
    : dnsRecords.length > 0
      ? "dns-setup"
      : "empty";

  onMount(fetchDomains);

  async function fetchDomains() {
    isLoading = true;
    try {
      const response = await fetch("/api/domains", { credentials: "include" });
      if (response.ok) {
        const { data } = await response.json();
        domains = data.filter((d: Domain) => d.type === "dashboard");
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "custom-domain-section" },
      });
    } finally {
      isLoading = false;
    }
  }

  async function handleRegister() {
    if (!newHostname.trim() || isRegistering) return;
    registerError = null;
    isRegistering = true;

    try {
      const response = await fetch("/api/domains", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: newHostname.trim().toLowerCase(),
          type: "dashboard",
          tenantId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to register domain");
      }

      const { data } = await response.json();
      dnsRecords = data.dnsRecords;

      // Refresh domain list
      await fetchDomains();
      newHostname = "";
    } catch (error) {
      registerError = error instanceof Error ? error.message : "Failed to register domain";
      captureException(error, {
        tags: { feature: "custom-domain-register" },
        extra: { hostname: newHostname },
      });
    } finally {
      isRegistering = false;
    }
  }

  async function handleDelete() {
    if (!activeDomain || isDeleting) return;
    if (!confirm(`Remove ${activeDomain.hostname}? This will revoke the SSL certificate.`)) return;
    isDeleting = true;

    try {
      const response = await fetch(`/api/domains/${activeDomain.hostname}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete domain");
      domains = [];
      dnsRecords = [];
    } catch (error) {
      captureException(error, {
        tags: { feature: "custom-domain-delete" },
        extra: { hostname: activeDomain.hostname },
      });
    } finally {
      isDeleting = false;
    }
  }

  async function handleRefreshStatus() {
    if (!activeDomain || isRefreshing) return;
    isRefreshing = true;

    try {
      const response = await fetch(`/api/domains/${activeDomain.hostname}/status`, {
        credentials: "include",
      });
      if (response.ok) {
        await fetchDomains();
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "custom-domain-status" },
      });
    } finally {
      isRefreshing = false;
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  }
</script>

<section class="settings-section">
  <h2>Custom Domain</h2>
  <Card>
    {#if isLoading}
      <div class="loading-state">
        <Spinner size="sm" />
        <span>Loading domain settings...</span>
      </div>
    {:else if domainState === "empty" && canEdit}
      <!-- Empty state: add domain form -->
      <p class="section-description">
        Connect a custom domain so your team accesses the dashboard at your own URL
        (e.g., dashboard.yourcompany.com).
      </p>
      <div class="domain-form">
        <div class="domain-input-row">
          <Input
            bind:value={newHostname}
            placeholder="dashboard.yourcompany.com"
            disabled={isRegistering}
            on:keydown={(e) => e.key === "Enter" && handleRegister()}
          />
          <Button on:click={handleRegister} disabled={!newHostname.trim() || isRegistering}>
            {#if isRegistering}
              <Spinner size="sm" />
            {:else}
              <Plus size={16} />
            {/if}
            Add Domain
          </Button>
        </div>
        {#if registerError}
          <p class="error-text">
            <AlertCircle size={14} />
            {registerError}
          </p>
        {/if}
      </div>
    {:else if domainState === "dns-setup" || domainState === "pending"}
      <!-- Pending: show DNS records + status -->
      <div class="domain-status-header">
        <div class="domain-name-row">
          <Globe size={20} />
          <span class="domain-hostname">{activeDomain?.hostname}</span>
          <Badge variant="secondary">
            <Clock size={12} />
            Pending SSL
          </Badge>
        </div>
        <div class="domain-actions">
          <Button variant="ghost" size="sm" on:click={handleRefreshStatus} disabled={isRefreshing}>
            <RefreshCw size={14} class={isRefreshing ? "spinning" : ""} />
            Check Status
          </Button>
          {#if canEdit}
            <Button variant="ghost" size="sm" on:click={handleDelete} disabled={isDeleting}>
              <Trash2 size={14} />
            </Button>
          {/if}
        </div>
      </div>

      <div class="dns-instructions">
        <p class="section-description">
          Add these DNS records to your domain provider, then click "Check Status" once configured.
          SSL will be automatically provisioned.
        </p>
        <div class="dns-records">
          {#each dnsRecords.length ? dnsRecords : [{ type: "CNAME", name: activeDomain?.hostname || "", value: "custom.chipp.ai" }] as record, i}
            <div class="dns-record">
              <div class="dns-field">
                <Label>Type</Label>
                <code>{record.type}</code>
              </div>
              <div class="dns-field dns-field-name">
                <Label>Name</Label>
                <div class="copy-field">
                  <code>{record.name}</code>
                  <button
                    class="copy-btn"
                    on:click={() => copyToClipboard(record.name, `name-${i}`)}
                    title="Copy"
                  >
                    {#if copiedField === `name-${i}`}
                      <Check size={12} />
                    {:else}
                      <Copy size={12} />
                    {/if}
                  </button>
                </div>
              </div>
              <div class="dns-field dns-field-value">
                <Label>Value</Label>
                <div class="copy-field">
                  <code>{record.value}</code>
                  <button
                    class="copy-btn"
                    on:click={() => copyToClipboard(record.value, `value-${i}`)}
                    title="Copy"
                  >
                    {#if copiedField === `value-${i}`}
                      <Check size={12} />
                    {:else}
                      <Copy size={12} />
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if domainState === "active"}
      <!-- Active: green badge + link -->
      <div class="domain-status-header">
        <div class="domain-name-row">
          <ShieldCheck size={20} class="text-success" />
          <a
            href="https://{activeDomain?.hostname}"
            target="_blank"
            rel="noopener noreferrer"
            class="domain-hostname domain-link"
          >
            {activeDomain?.hostname}
            <ExternalLink size={14} />
          </a>
          <Badge variant="success">Active</Badge>
        </div>
        <div class="domain-actions">
          {#if canEdit}
            <Button variant="ghost" size="sm" on:click={handleDelete} disabled={isDeleting}>
              <Trash2 size={14} />
              Remove
            </Button>
          {/if}
        </div>
      </div>
      <p class="section-description active-description">
        Your custom domain is active with SSL. Your team can access the dashboard at this URL.
      </p>
    {:else}
      <p class="section-description">
        Custom domain setup is available for enterprise organizations. Contact an admin to configure.
      </p>
    {/if}
  </Card>
</section>

<style>
  .settings-section {
    margin-bottom: var(--space-8);
  }

  .settings-section h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .section-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-4) 0;
    line-height: 1.5;
  }

  .active-description {
    margin-top: var(--space-3);
    margin-bottom: 0;
  }

  .loading-state {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .domain-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .domain-input-row {
    display: flex;
    gap: var(--space-3);
  }

  .domain-input-row :global(input) {
    flex: 1;
  }

  .error-text {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: hsl(var(--destructive));
    margin: 0;
  }

  .domain-status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .domain-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--foreground));
  }

  .domain-hostname {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .domain-link {
    color: hsl(var(--foreground));
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .domain-link:hover {
    text-decoration: underline;
  }

  .domain-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  :global(.text-success) {
    color: hsl(142 76% 36%);
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .dns-instructions {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
  }

  .dns-records {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .dns-record {
    display: grid;
    grid-template-columns: 80px 1fr 1fr;
    gap: var(--space-3);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-lg);
  }

  .dns-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .dns-field code {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: hsl(var(--foreground));
    background: hsl(var(--muted));
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
    word-break: break-all;
  }

  .copy-field {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .copy-field code {
    flex: 1;
  }

  .copy-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    border-radius: var(--radius);
    cursor: pointer;
  }

  .copy-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  @media (max-width: 640px) {
    .dns-record {
      grid-template-columns: 1fr;
    }

    .domain-status-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .domain-input-row {
      flex-direction: column;
    }
  }
</style>
