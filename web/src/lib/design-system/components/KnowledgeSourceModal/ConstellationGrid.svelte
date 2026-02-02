<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    selectSource: 'website' | 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'podcasts' | 'documents' | 'audio' | 'notion' | 'google-drive' | 'sharepoint-onedrive' | 'api';
    close: void;
  }>();

  type SourceCategory = 'docs' | 'cloud' | 'social' | 'media' | 'api';

  interface SourceItem {
    id: string;
    name: string;
    icon: string;
    category: SourceCategory;
    screen: string;
  }

  const essentialSources: SourceItem[] = [
    {
      id: 'url',
      name: 'Website URL',
      icon: 'link',
      category: 'docs',
      screen: 'website',
    },
    {
      id: 'documents',
      name: 'Documents',
      icon: 'file-text',
      category: 'docs',
      screen: 'documents',
    },
    {
      id: 'audio',
      name: 'Audio',
      icon: 'mic',
      category: 'docs',
      screen: 'audio',
    },
  ];

  const cloudSources: SourceItem[] = [
    {
      id: 'google-drive',
      name: 'Google Drive',
      icon: 'google-drive',
      category: 'cloud',
      screen: 'google-drive',
    },
    {
      id: 'notion',
      name: 'Notion',
      icon: 'notion',
      category: 'cloud',
      screen: 'notion',
    },
    {
      id: 'sharepoint',
      name: 'SharePoint',
      icon: 'sharepoint',
      category: 'cloud',
      screen: 'sharepoint-onedrive',
    },
  ];

  const socialSources: SourceItem[] = [
    {
      id: 'youtube',
      name: 'YouTube',
      icon: 'youtube',
      category: 'social',
      screen: 'youtube',
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'instagram',
      category: 'social',
      screen: 'instagram',
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: 'tiktok',
      category: 'social',
      screen: 'tiktok',
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'facebook',
      category: 'social',
      screen: 'facebook',
    },
  ];

  const mediaSources: SourceItem[] = [
    {
      id: 'podcasts',
      name: 'Podcasts',
      icon: 'headphones',
      category: 'media',
      screen: 'podcasts',
    },
  ];

  const apiSources: SourceItem[] = [
    {
      id: 'api',
      name: 'API Route',
      icon: 'route',
      category: 'api',
      screen: 'api',
    },
  ];

  function handleSourceClick(screen: string) {
    dispatch('selectSource', screen as any);
  }

  function getIcon(iconName: string): string {
    const icons: Record<string, string> = {
      link: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      'file-text': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
      mic: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
      youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
      instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
      tiktok: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`,
      facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
      headphones: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
      route: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`,
      'google-drive': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l3.43 5.97L11.16 9.5 7.71 3.5zM22.85 15L16.29 3.5H9.14l6.57 11.5H22.85zM8.57 21.03h13.71l-3.43-5.97H5.14l3.43 5.97z"/></svg>`,
      notion: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.72c-.466.046-.56.28-.374.466l1.823 1.022zm.793 3.358v13.916c0 .746.373 1.026 1.212.98l14.57-.84c.84-.046.933-.56.933-1.166V6.732c0-.606-.233-.933-.746-.886l-15.17.886c-.56.047-.8.327-.8.84zm14.336.513c.093.42 0 .84-.42.886l-.7.14v10.264c-.608.327-1.166.514-1.632.514-.746 0-.932-.234-1.492-.934l-4.571-7.181v6.954l1.446.327s0 .84-1.166.84l-3.218.187c-.093-.187 0-.653.327-.746l.84-.234V9.632L7.27 9.46c-.093-.42.14-1.026.793-1.073l3.451-.233 4.758 7.275V9.046l-1.166-.14c-.093-.514.28-.886.746-.933l3.218-.186z"/></svg>`,
      sharepoint: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.5 17.25h-9v-1.5h9v1.5zm0-3h-9v-1.5h9v1.5zm0-3h-9v-1.5h9v1.5zm0-3h-9V6.75h9v1.5z"/></svg>`,
    };
    return icons[iconName] || '';
  }
</script>

<div class="ks-constellation">
  <!-- Header -->
  <div class="ks-header">
    <div class="ks-header-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="5" r="1.5" stroke-width="1.5"/>
        <circle cx="5" cy="12" r="1.5" stroke-width="1.5"/>
        <circle cx="19" cy="12" r="1.5" stroke-width="1.5"/>
        <circle cx="12" cy="19" r="1.5" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="2" stroke-width="1.5"/>
        <path d="M12 7v3M12 14v3M9 12H7M17 12h-3" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
      </svg>
    </div>
    <h2 class="ks-title">Add Knowledge Sources</h2>
    <p class="ks-description">Connect your data to build intelligent, context-aware responses</p>
  </div>

  <!-- Grid Container -->
  <div class="ks-grid-container">
    <!-- Essential Sources -->
    <div class="ks-category">
      <div class="ks-category-header">
        <span class="ks-category-label">Essentials</span>
        <div class="ks-category-line"></div>
      </div>
      <div class="ks-source-grid">
        {#each essentialSources as source, i}
          <button
            class="ks-source-card"
            data-category={source.category}
            style="animation-delay: {0.05 + i * 0.05}s"
            on:click={() => handleSourceClick(source.screen)}
          >
            <div class="ks-card-icon">
              {@html getIcon(source.icon)}
            </div>
            <span class="ks-card-label">{source.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Cloud Storage -->
    <div class="ks-category">
      <div class="ks-category-header">
        <span class="ks-category-label">Cloud Storage</span>
        <div class="ks-category-line"></div>
      </div>
      <div class="ks-source-grid">
        {#each cloudSources as source, i}
          <button
            class="ks-source-card"
            data-category={source.category}
            style="animation-delay: {0.05 + i * 0.05}s"
            on:click={() => handleSourceClick(source.screen)}
          >
            <div class="ks-card-icon">
              {@html getIcon(source.icon)}
            </div>
            <span class="ks-card-label">{source.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Social Media -->
    <div class="ks-category">
      <div class="ks-category-header">
        <span class="ks-category-label">Social Media</span>
        <div class="ks-category-line"></div>
      </div>
      <div class="ks-source-grid">
        {#each socialSources as source, i}
          <button
            class="ks-source-card"
            data-category={source.category}
            style="animation-delay: {0.05 + i * 0.05}s"
            on:click={() => handleSourceClick(source.screen)}
          >
            <div class="ks-card-icon">
              {@html getIcon(source.icon)}
            </div>
            <span class="ks-card-label">{source.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Media -->
    <div class="ks-category">
      <div class="ks-category-header">
        <span class="ks-category-label">Media</span>
        <div class="ks-category-line"></div>
      </div>
      <div class="ks-source-grid">
        {#each mediaSources as source, i}
          <button
            class="ks-source-card"
            data-category={source.category}
            style="animation-delay: {0.05 + i * 0.05}s"
            on:click={() => handleSourceClick(source.screen)}
          >
            <div class="ks-card-icon">
              {@html getIcon(source.icon)}
            </div>
            <span class="ks-card-label">{source.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Developer -->
    <div class="ks-category">
      <div class="ks-category-header">
        <span class="ks-category-label">Developer</span>
        <div class="ks-category-line"></div>
      </div>
      <div class="ks-source-grid">
        {#each apiSources as source, i}
          <button
            class="ks-source-card"
            data-category={source.category}
            style="animation-delay: {0.05 + i * 0.05}s"
            on:click={() => handleSourceClick(source.screen)}
          >
            <div class="ks-card-icon">
              {@html getIcon(source.icon)}
            </div>
            <span class="ks-card-label">{source.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .ks-constellation {
    height: 100%;
    overflow-y: auto;
  }

  /* Header */
  .ks-header {
    position: relative;
    z-index: 1;
    padding: 2rem 2rem 1rem;
    text-align: center;
  }

  .ks-header-icon {
    width: 56px;
    height: 56px;
    margin: 0 auto 1rem;
    background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(96, 165, 250, 0.2));
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-primary);
  }

  .ks-header-icon svg {
    stroke: var(--text-primary);
  }

  .ks-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.5rem;
    letter-spacing: -0.02em;
  }

  .ks-description {
    font-size: 0.9rem;
    color: var(--text-secondary);
    max-width: 380px;
    margin: 0 auto;
    line-height: 1.5;
  }

  /* Grid Container */
  .ks-grid-container {
    position: relative;
    z-index: 1;
    padding: 1rem 1.5rem 3rem;
  }

  /* Category */
  .ks-category {
    margin-bottom: 1.5rem;
  }

  .ks-category:last-child {
    margin-bottom: 0;
  }

  .ks-category-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    padding: 0 0.25rem;
  }

  .ks-category-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  .ks-category-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--border-primary) 0%, transparent 100%);
  }

  /* Source Grid */
  .ks-source-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  @media (max-width: 640px) {
    .ks-source-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Source Card */
  .ks-source-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;
    animation: ks-slide-up 0.4s ease-out forwards;
    opacity: 0;
  }

  .ks-source-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 0%, var(--card-glow, transparent) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .ks-source-card:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-secondary);
    transform: translateY(-2px);
  }

  .ks-source-card:hover::before {
    opacity: 1;
  }

  .ks-source-card:active {
    transform: translateY(0);
  }

  /* Card glow colors by category */
  .ks-source-card[data-category="cloud"] {
    --card-glow: rgba(96, 165, 250, 0.15);
  }
  .ks-source-card[data-category="social"] {
    --card-glow: rgba(251, 146, 60, 0.15);
  }
  .ks-source-card[data-category="docs"] {
    --card-glow: rgba(167, 139, 250, 0.15);
  }
  .ks-source-card[data-category="media"] {
    --card-glow: rgba(52, 211, 153, 0.15);
  }
  .ks-source-card[data-category="api"] {
    --card-glow: rgba(244, 114, 182, 0.15);
  }

  /* Card Icon */
  .ks-card-icon {
    position: relative;
    z-index: 1;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-primary);
    color: var(--text-primary);
  }

  .ks-source-card[data-category="cloud"]:hover .ks-card-icon {
    background: rgba(96, 165, 250, 0.15);
    border-color: rgba(96, 165, 250, 0.3);
  }
  .ks-source-card[data-category="social"]:hover .ks-card-icon {
    background: rgba(251, 146, 60, 0.15);
    border-color: rgba(251, 146, 60, 0.3);
  }
  .ks-source-card[data-category="docs"]:hover .ks-card-icon {
    background: rgba(167, 139, 250, 0.15);
    border-color: rgba(167, 139, 250, 0.3);
  }
  .ks-source-card[data-category="media"]:hover .ks-card-icon {
    background: rgba(52, 211, 153, 0.15);
    border-color: rgba(52, 211, 153, 0.3);
  }
  .ks-source-card[data-category="api"]:hover .ks-card-icon {
    background: rgba(244, 114, 182, 0.15);
    border-color: rgba(244, 114, 182, 0.3);
  }

  /* Card Label */
  .ks-card-label {
    position: relative;
    z-index: 1;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-primary);
    text-align: center;
    line-height: 1.2;
  }

  /* Animation */
  @keyframes ks-slide-up {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Scrollbar */
  .ks-constellation::-webkit-scrollbar {
    width: 6px;
  }

  .ks-constellation::-webkit-scrollbar-track {
    background: transparent;
  }

  .ks-constellation::-webkit-scrollbar-thumb {
    background: var(--border-primary);
    border-radius: 3px;
  }

  .ks-constellation::-webkit-scrollbar-thumb:hover {
    background: var(--border-secondary);
  }
</style>
