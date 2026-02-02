<script lang="ts">
  import { companyLogoUrl } from "../../../stores/whitelabel";
</script>

{#if $companyLogoUrl}
  <div class="small-logo-container">
    <img src={$companyLogoUrl} alt="Company Logo" class="custom-logo" />
  </div>
{:else}
  <img src="/assets/chippylogo.svg" alt="Chipp" width="40" height="40" class="small-chipp-logo" />
{/if}

<style>
  .small-logo-container {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: var(--radius-md);
    position: relative;
    left: -8px;
  }

  .custom-logo {
    width: 50px;
    height: 50px;
    object-fit: contain;
    border-radius: var(--radius-md);
  }

  .small-chipp-logo {
    flex-shrink: 0;
    border-radius: var(--radius-lg);
  }
</style>

