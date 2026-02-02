<script lang="ts">
  import { link } from "svelte-spa-router";

  interface Application {
    id: string;
    name: string;
    description?: string;
    picture_url?: string | null;
    developer?: {
      username?: string;
    };
    created_at: string;
    updated_at?: string;
  }

  export let application: Application;
  export let onDuplicate: () => void = () => {};
  export let onDelete: () => void = () => {};

  let showMenu = false;

  const defaultLogo = "/assets/default-app-image.png";

  function toggleMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showMenu = !showMenu;
  }

  function handleDuplicate(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showMenu = false;
    onDuplicate();
  }

  function handleDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showMenu = false;
    onDelete();
  }

  function handleClickOutside() {
    showMenu = false;
  }
</script>

<svelte:window on:click={handleClickOutside} />

<a href="/apps/{application.id}" use:link class="card">
  <div class="card-header">
    <div class="app-logo">
      <img src={application.picture_url || defaultLogo} alt={application.name} />
    </div>
    <button class="menu-button" on:click={toggleMenu} aria-label="App menu">
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
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>

    {#if showMenu}
      <div class="dropdown-menu" on:click|stopPropagation on:keydown|stopPropagation>
        <button class="menu-item" on:click={handleDuplicate}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Duplicate
        </button>
        <button class="menu-item danger" on:click={handleDelete}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete
        </button>
      </div>
    {/if}
  </div>

  <div class="card-body">
    <h3 class="app-name">{application.name}</h3>
    {#if application.description}
      <p class="app-description">{application.description}</p>
    {/if}
  </div>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
    position: relative;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .card-header {
    position: relative;
    padding: var(--space-4);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .app-logo {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg-secondary);
  }

  .app-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .menu-button {
    padding: var(--space-1);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .menu-button:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: var(--space-2);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
    min-width: 140px;
    z-index: 10;
    overflow: hidden;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    font-size: var(--text-sm);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .menu-item:hover {
    background: var(--bg-secondary);
  }

  .menu-item.danger {
    color: var(--color-error);
  }

  .menu-item.danger:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .card-body {
    padding: 0 var(--space-4) var(--space-4);
  }

  .app-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-1) 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
