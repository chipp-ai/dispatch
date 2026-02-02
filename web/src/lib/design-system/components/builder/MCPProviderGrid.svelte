<script lang="ts">
  import BuilderCard from "./BuilderCard.svelte";
  import ProActionModal from "./ProActionModal.svelte";
  import { KNOWN_MCP_PROVIDERS, AGGREGATOR_ONLY_PROVIDERS } from "$lib/mcp/mcpProviders";

  export let applicationId: string | null = null;

  let modalOpen = false;

  const providerCount = KNOWN_MCP_PROVIDERS.length + AGGREGATOR_ONLY_PROVIDERS.length;
</script>

<BuilderCard title="Tools" rightIcon="dropdown" defaultOpen={true}>
  <div class="content">
    <div class="empty-state">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="4" r="1.5" />
        <circle cx="4" cy="12" r="1.5" />
        <circle cx="20" cy="12" r="1.5" />
        <circle cx="12" cy="20" r="1.5" />
        <path d="M12 9V5.5" opacity="0.6" />
        <path d="M12 18.5V15" opacity="0.6" />
        <path d="M9 12H5.5" opacity="0.6" />
        <path d="M18.5 12H15" opacity="0.6" />
      </svg>
      <h4>MCP Integrations</h4>
      <p>Connect your AI to {providerCount}+ enterprise services via MCP</p>
      <button type="button" class="browse-btn" on:click={() => (modalOpen = true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        Browse Integrations
      </button>
    </div>
  </div>
</BuilderCard>

<ProActionModal bind:open={modalOpen} {applicationId} />

<style>
  .content {
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-6);
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state h4 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .browse-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .browse-btn:hover {
    background: var(--color-primary);
    color: white;
  }
</style>
