<script lang="ts">
  /**
   * Streaming Test Page
   *
   * Debug page to test streaming markdown behavior with controlled content.
   * Tests the newline collapse issue by simulating streaming and then stopping.
   */
  import { StreamingMarkdown } from "$lib/design-system";
  import { onMount } from "svelte";

  // Test patterns with different newline scenarios
  const testPatterns = {
    singleNewlines: `Line 1
Line 2
Line 3`,
    doubleNewlines: `Paragraph 1

Paragraph 2

Paragraph 3`,
    softBreaks: `Line with soft break
Next line
Another line`,
    poem: `Roses are red,
Violets are blue,
Single newlines test,
Are they working for you?`,
    mixed: `# Test Document

First paragraph with some text.

List:
- Item 1
- Item 2
- Item 3

Another paragraph with
a single newline inside it.

Final paragraph.`,
  };

  let selectedPattern = "poem";
  let content = "";
  let streaming = false;
  let streamIndex = 0;
  let streamInterval: ReturnType<typeof setInterval> | null = null;
  let streamDelay = 20; // ms per character

  $: fullContent = testPatterns[selectedPattern as keyof typeof testPatterns] || "";

  function startStreaming() {
    content = "";
    streamIndex = 0;
    streaming = true;

    streamInterval = setInterval(() => {
      if (streamIndex < fullContent.length) {
        content = fullContent.slice(0, streamIndex + 1);
        streamIndex++;
      } else {
        stopStreaming();
      }
    }, streamDelay);
  }

  function stopStreaming() {
    streaming = false;
    if (streamInterval) {
      clearInterval(streamInterval);
      streamInterval = null;
    }
    // Ensure full content is shown
    content = fullContent;
  }

  function reset() {
    stopStreaming();
    content = "";
    streamIndex = 0;
  }

  function showInstant() {
    stopStreaming();
    content = fullContent;
    streaming = false;
  }

  onMount(() => {
    return () => {
      if (streamInterval) clearInterval(streamInterval);
    };
  });
</script>

<div class="streaming-test-page">
  <h1>Streaming Markdown Test</h1>

  <div class="controls">
    <div class="control-row">
      <label>
        Pattern:
        <select bind:value={selectedPattern} on:change={reset}>
          {#each Object.keys(testPatterns) as pattern}
            <option value={pattern}>{pattern}</option>
          {/each}
        </select>
      </label>

      <label>
        Delay (ms):
        <input type="number" bind:value={streamDelay} min="1" max="200" />
      </label>
    </div>

    <div class="button-row">
      <button on:click={startStreaming} disabled={streaming}>
        Start Streaming
      </button>
      <button on:click={stopStreaming} disabled={!streaming}>
        Stop Streaming
      </button>
      <button on:click={showInstant}>
        Show Instant (No Streaming)
      </button>
      <button on:click={reset}>
        Reset
      </button>
    </div>

    <div class="status">
      Status: <span class:streaming>{streaming ? "STREAMING" : "IDLE"}</span>
      | Characters: {content.length}/{fullContent.length}
    </div>
  </div>

  <div class="content-panels">
    <div class="panel">
      <h3>Raw Content (escaped newlines)</h3>
      <pre class="raw-content">{fullContent.replace(/\n/g, "\\n\n")}</pre>
    </div>

    <div class="panel">
      <h3>StreamingMarkdown Output</h3>
      <div class="markdown-output" class:streaming>
        {#if content}
          <StreamingMarkdown {content} {streaming} />
        {:else}
          <em class="placeholder">Click "Start Streaming" or "Show Instant" to see content</em>
        {/if}
      </div>
    </div>
  </div>

  <div class="debug-info">
    <h3>Debug Info</h3>
    <p>Check browser console for <code>[StreamingMarkdown]</code> logs when streaming ends.</p>
    <p>
      <strong>Expected behavior:</strong> Content should look the same during and after streaming.
    </p>
    <p>
      <strong>Bug symptom:</strong> Newlines collapse when streaming ends.
    </p>
  </div>
</div>

<style>
  .streaming-test-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin-bottom: 20px;
  }

  .controls {
    background: #f5f5f5;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .control-row {
    display: flex;
    gap: 20px;
    margin-bottom: 12px;
  }

  .control-row label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-row select,
  .control-row input {
    padding: 6px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .button-row {
    display: flex;
    gap: 10px;
    margin-bottom: 12px;
  }

  button {
    padding: 8px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #0056b3;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status {
    font-size: 14px;
    color: #666;
  }

  .status span.streaming {
    color: #28a745;
    font-weight: bold;
  }

  .content-panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }

  .panel {
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }

  .panel h3 {
    margin: 0;
    padding: 12px 16px;
    background: #f0f0f0;
    border-bottom: 1px solid #ddd;
    font-size: 14px;
    color: #333;
  }

  .raw-content {
    margin: 0;
    padding: 16px;
    background: #1e1e1e;
    color: #d4d4d4;
    font-size: 13px;
    line-height: 1.5;
    overflow-x: auto;
    min-height: 200px;
  }

  .markdown-output {
    padding: 16px;
    min-height: 200px;
    background: white;
    color: #1a1a1a;
    /* Override CSS variables for light background */
    --foreground: 0 0% 10%;
    --muted-foreground: 0 0% 40%;
  }

  .markdown-output.streaming {
    border-left: 3px solid #28a745;
  }

  .placeholder {
    color: #999;
  }

  .debug-info {
    background: #fff3cd;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #ffc107;
  }

  .debug-info h3 {
    margin-top: 0;
    color: #856404;
  }

  .debug-info code {
    background: rgba(0, 0, 0, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
  }

  @media (max-width: 768px) {
    .content-panels {
      grid-template-columns: 1fr;
    }
  }
</style>
