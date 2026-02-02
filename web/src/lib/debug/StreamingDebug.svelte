<script lang="ts">
  /**
   * StreamingDebug
   *
   * Debug component to visualize what's happening with streaming content.
   * Shows raw content, parsed blocks, and animation state transitions.
   *
   * Usage: Place next to StreamingMarkdown to compare:
   * <StreamingMarkdown {content} {streaming} />
   * <StreamingDebug {content} {streaming} />
   */
  export let content: string = "";
  export let streaming: boolean = false;

  // Track content changes over time
  let contentHistory: { timestamp: number; length: number; streaming: boolean; lastChars: string }[] = [];
  let prevContent = "";
  let prevStreaming = streaming;

  // Analyze content for debugging
  $: if (content !== prevContent || streaming !== prevStreaming) {
    const now = Date.now();
    const lastChars = content.slice(-50).replace(/\n/g, "\\n").replace(/\r/g, "\\r");

    contentHistory = [
      ...contentHistory.slice(-20), // Keep last 20 entries
      {
        timestamp: now,
        length: content.length,
        streaming,
        lastChars,
      },
    ];

    // Detect streaming end transition
    if (prevStreaming && !streaming) {
      console.log("[StreamingDebug] Streaming ended!");
      console.log("[StreamingDebug] Final content length:", content.length);
      console.log("[StreamingDebug] Final content (escaped newlines):");
      console.log(content.replace(/\n/g, "\\n").replace(/\r/g, "\\r"));
    }

    prevContent = content;
    prevStreaming = streaming;
  }

  // Count newlines
  $: newlineCount = (content.match(/\n/g) || []).length;
  $: carriageReturnCount = (content.match(/\r/g) || []).length;

  // Count paragraph breaks (double newlines)
  $: paragraphBreaks = (content.match(/\n\n/g) || []).length;

  // Check for soft breaks (two spaces before newline)
  $: softBreaks = (content.match(/  \n/g) || []).length;

  // Check for markdown line break syntax
  $: markdownLineBreaks = (content.match(/<br\s*\/?>/gi) || []).length;

  // Show/hide debug panel
  let isExpanded = false;
</script>

<div class="streaming-debug" class:expanded={isExpanded}>
  <button class="debug-toggle" on:click={() => (isExpanded = !isExpanded)}>
    {isExpanded ? "▼" : "▶"} Debug ({streaming ? "streaming" : "idle"})
  </button>

  {#if isExpanded}
    <div class="debug-content">
      <div class="debug-section">
        <h4>Content Stats</h4>
        <ul>
          <li>Length: {content.length} chars</li>
          <li>Newlines (\n): {newlineCount}</li>
          <li>Carriage returns (\r): {carriageReturnCount}</li>
          <li>Paragraph breaks (\n\n): {paragraphBreaks}</li>
          <li>Soft breaks (2 spaces + \n): {softBreaks}</li>
          <li>HTML &lt;br&gt;: {markdownLineBreaks}</li>
        </ul>
      </div>

      <div class="debug-section">
        <h4>Raw Content (first 500 chars)</h4>
        <pre class="raw-content">{content.slice(0, 500).replace(/\n/g, "⏎\n").replace(/\r/g, "←")}</pre>
      </div>

      <div class="debug-section">
        <h4>Content History (last 10)</h4>
        <div class="history-list">
          {#each contentHistory.slice(-10) as entry, i}
            <div class="history-entry" class:streaming={entry.streaming}>
              <span class="time">{new Date(entry.timestamp).toISOString().slice(11, 23)}</span>
              <span class="length">{entry.length}</span>
              <span class="status">{entry.streaming ? "🟢" : "⚪"}</span>
              <span class="chars">...{entry.lastChars}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .streaming-debug {
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.9);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    border-radius: 8px;
    z-index: 10000;
    max-width: 400px;
    max-height: 80vh;
    overflow: hidden;
  }

  .streaming-debug.expanded {
    overflow-y: auto;
  }

  .debug-toggle {
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #0f0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
  }

  .debug-toggle:hover {
    background: rgba(0, 255, 0, 0.1);
  }

  .debug-content {
    padding: 0 12px 12px;
  }

  .debug-section {
    margin-bottom: 12px;
  }

  .debug-section h4 {
    margin: 0 0 4px 0;
    color: #ff0;
    font-size: 11px;
  }

  .debug-section ul {
    margin: 0;
    padding-left: 16px;
  }

  .debug-section li {
    margin: 2px 0;
  }

  .raw-content {
    background: rgba(0, 0, 0, 0.5);
    padding: 8px;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 150px;
    overflow-y: auto;
    margin: 0;
  }

  .history-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .history-entry {
    display: flex;
    gap: 8px;
    padding: 2px 4px;
    border-bottom: 1px solid rgba(0, 255, 0, 0.2);
  }

  .history-entry.streaming {
    background: rgba(0, 255, 0, 0.1);
  }

  .history-entry .time {
    color: #888;
  }

  .history-entry .length {
    color: #0ff;
    min-width: 50px;
  }

  .history-entry .chars {
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
</style>
