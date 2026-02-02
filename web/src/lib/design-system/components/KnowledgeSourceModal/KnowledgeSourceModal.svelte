<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Dialog } from '$lib/design-system';
  import ConstellationGrid from './ConstellationGrid.svelte';
  import WebsiteUploadScreen from './screens/WebsiteUploadScreen.svelte';
  import YouTubeUploadScreen from './screens/YouTubeUploadScreen.svelte';
  import DocumentUploadScreen from './screens/DocumentUploadScreen.svelte';
  import AudioUploadScreen from './screens/AudioUploadScreen.svelte';

  export let open = false;
  export let applicationId: string;

  const dispatch = createEventDispatcher<{
    close: void;
    sourceAdded: { id: string; type: string; name: string; url?: string };
  }>();

  // Screen states
  type ScreenState =
    | 'selection'
    | 'website'
    | 'youtube'
    | 'instagram'
    | 'tiktok'
    | 'facebook'
    | 'podcasts'
    | 'documents'
    | 'audio'
    | 'notion'
    | 'google-drive'
    | 'sharepoint-onedrive'
    | 'api';

  let currentScreen: ScreenState = 'selection';
  let isUploading = false;

  function handleClose() {
    open = false;
    // Reset screen after animation
    setTimeout(() => {
      currentScreen = 'selection';
    }, 300);
    dispatch('close');
  }

  function handleSourceSelect(screen: ScreenState) {
    currentScreen = screen;
  }

  function handleBack() {
    currentScreen = 'selection';
  }

  function handleSourceAdded(event: CustomEvent<{ id: string; type: string; name: string; url?: string }>) {
    dispatch('sourceAdded', event.detail);
    handleClose();
  }

  // Reset screen when modal closes
  $: if (!open) {
    setTimeout(() => {
      currentScreen = 'selection';
    }, 300);
  }
</script>

<Dialog bind:open onClose={handleClose}>
  <div class="ks-modal-container">
    {#if currentScreen === 'selection'}
      <ConstellationGrid
        on:selectSource={(e) => handleSourceSelect(e.detail)}
        on:close={handleClose}
      />
    {:else if currentScreen === 'website'}
      <WebsiteUploadScreen
        {applicationId}
        on:back={handleBack}
        on:close={handleClose}
        on:sourceAdded={handleSourceAdded}
      />
    {:else if currentScreen === 'youtube'}
      <YouTubeUploadScreen
        {applicationId}
        on:back={handleBack}
        on:close={handleClose}
        on:sourceAdded={handleSourceAdded}
      />
    {:else if currentScreen === 'documents'}
      <DocumentUploadScreen
        {applicationId}
        on:back={handleBack}
        on:close={handleClose}
        on:sourceAdded={handleSourceAdded}
      />
    {:else if currentScreen === 'audio'}
      <AudioUploadScreen
        {applicationId}
        on:back={handleBack}
        on:close={handleClose}
        on:sourceAdded={handleSourceAdded}
      />
    {:else if currentScreen === 'instagram'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>Instagram Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'tiktok'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>TikTok Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'facebook'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>Facebook Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'podcasts'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>Podcasts Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'notion'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>Notion Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'google-drive'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>Google Drive Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'sharepoint-onedrive'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>SharePoint/OneDrive Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {:else if currentScreen === 'api'}
      <div class="ks-coming-soon">
        <button class="ks-back-btn" on:click={handleBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div class="ks-coming-soon-content">
          <h3>API Route Integration</h3>
          <p>Coming soon! This feature is being ported from the main app.</p>
        </div>
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .ks-modal-container {
    width: 100%;
    max-width: 800px;
    height: 600px;
    background: radial-gradient(
        ellipse 120% 80% at 20% 0%,
        rgba(96, 165, 250, 0.08) 0%,
        transparent 40%
      ),
      radial-gradient(
        ellipse 100% 60% at 80% 100%,
        rgba(167, 139, 250, 0.08) 0%,
        transparent 40%
      ),
      var(--bg-primary);
    border-radius: var(--radius-xl);
    overflow: hidden;
    position: relative;
  }

  .ks-coming-soon {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
  }

  .ks-back-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    width: fit-content;
  }

  .ks-back-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-secondary);
  }

  .ks-coming-soon-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: var(--space-4);
  }

  .ks-coming-soon-content h3 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .ks-coming-soon-content p {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
    max-width: 300px;
  }
</style>
