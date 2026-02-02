<script lang="ts">
  export let activeTab: "chatbot" | "widget" = "chatbot";
  export let onTabChange: (tab: "chatbot" | "widget") => void = () => {};

  function selectTab(tab: "chatbot" | "widget") {
    activeTab = tab;
    onTabChange(tab);
  }
</script>

<div class="tab-container">
  <div class="tab-list">
    <button
      class="tab"
      class:active={activeTab === "chatbot"}
      on:click={() => selectTab("chatbot")}
    >
      Chatbot
    </button>
    <button
      class="tab"
      class:active={activeTab === "widget"}
      on:click={() => selectTab("widget")}
    >
      Widget
    </button>
  </div>
</div>

<style>
  .tab-container {
    display: flex;
    justify-content: center;
    padding-top: var(--space-1);
  }

  .tab-list {
    display: flex;
    gap: var(--space-1);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-1);
  }

  .tab {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.2s ease;
  }

  .tab:hover:not(.active) {
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
</style>
