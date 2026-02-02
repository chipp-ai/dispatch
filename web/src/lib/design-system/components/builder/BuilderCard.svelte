<script lang="ts">
  import { slide } from "svelte/transition";

  export let title: string = "";
  export let rightIcon: "dropdown" | "toggle" | "none" = "dropdown";
  export let defaultOpen: boolean = true;

  let isOpen = defaultOpen;

  function toggle() {
    if (rightIcon === "dropdown") {
      isOpen = !isOpen;
    }
  }
</script>

<div class="card">
  <button class="card-header" on:click={toggle} class:clickable={rightIcon === "dropdown"}>
    <h3 class="title">{title}</h3>
    {#if rightIcon === "dropdown"}
      <span class="chevron" class:open={isOpen}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    {/if}
  </button>

  {#if isOpen}
    <div class="card-content" transition:slide={{ duration: 200 }}>
      <slot />
    </div>
  {/if}
</div>

<style>
  .card {
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    cursor: default;
  }

  .card-header.clickable {
    cursor: pointer;
  }

  .card-header.clickable:hover {
    background: var(--bg-secondary);
  }

  .title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .card-content {
    padding: var(--space-4);
    padding-top: var(--space-2);
  }
</style>
