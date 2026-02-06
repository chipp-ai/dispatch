<script lang="ts">
  /**
   * TypingIndicatorBar
   *
   * Shows "X is typing..." or "X and Y are typing..." with colored dots.
   * Auto-clears after 3s (handled by the multiplayerChat store).
   */
  export let typingNames: string[] = [];
  export let forceDarkMode: boolean = false;

  $: typingText = formatTypingText(typingNames);

  function formatTypingText(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
    return `${names[0]} and ${names.length - 1} others are typing`;
  }
</script>

{#if typingNames.length > 0}
  <div class="typing-bar" class:dark={forceDarkMode}>
    <div class="typing-dots">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <span class="typing-text">{typingText}</span>
  </div>
{/if}

<style>
  .typing-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    animation: fade-in 0.2s ease;
  }

  .typing-bar.dark {
    color: rgba(255, 255, 255, 0.5);
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .typing-dots {
    display: flex;
    gap: 3px;
    align-items: center;
  }

  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: hsl(var(--muted-foreground));
    animation: dot-bounce 1.2s ease-in-out infinite;
  }

  .dark .dot {
    background-color: rgba(255, 255, 255, 0.5);
  }

  .dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes dot-bounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-3px);
      opacity: 1;
    }
  }

  .typing-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
