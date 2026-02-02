# Streaming Response Animation Architecture

This document details all components involved in rendering streaming AI responses in chipp-deno, learnings from debugging animation issues, and potential solutions.

## Table of Contents

1. [Component Overview](#component-overview)
2. [Data Flow](#data-flow)
3. [Key Files](#key-files)
4. [Text Batching System](#text-batching-system)
5. [DOM Recreation Problem](#dom-recreation-problem)
6. [Animation Attempts and Failures](#animation-attempts-and-failures)
7. [Root Cause Analysis](#root-cause-analysis)
8. [Potential Solutions](#potential-solutions)

---

## Component Overview

### Two Separate Chat Systems

There are **TWO independent chat implementations** in chipp-deno:

| System              | Location              | Store             | Use Case                             |
| ------------------- | --------------------- | ----------------- | ------------------------------------ |
| **Consumer Chat**   | `ConsumerChat.svelte` | `consumerChat.ts` | End-user chat at `/#/w/chat/{appId}` |
| **Builder Preview** | `ChatPreview.svelte`  | Internal state    | App builder preview panel            |

**Critical:** These systems have **separate streaming logic**. Fixing one doesn't fix the other.

### Component Hierarchy

```
Consumer Chat:
ConsumerChat.svelte
  └── ChatMessage.svelte
        └── AnimatedMarkdown.svelte
              └── Markdown.svelte
                    └── (renders HTML via marked.js)

Builder Preview:
ChatPreview.svelte (self-contained)
  └── AnimatedMarkdown.svelte (after our changes)
        └── Markdown.svelte
              └── (renders HTML via marked.js)
```

---

## Data Flow

### Consumer Chat Flow

```
1. User sends message
   └── consumerChat.sendMessage(message)

2. Store creates empty assistant message
   └── assistantMsg = { id, role: "assistant", content: "", parts: [] }
   └── messages = [...messages, userMsg, assistantMsg]

3. SSE stream starts
   └── fetch("/consumer/{appId}/chat/stream", { ... })

4. Text deltas arrive
   └── event.type === "text-delta"
   └── textBuffer += delta  (accumulated in buffer)

5. Buffer flushed every 50ms
   └── batchTimeout = setTimeout(flushTextBuffer, 50)
   └── flushTextBuffer() → updateAssistantMessage()
   └── Store updates: message.parts[0] = { type: "text", text: newContent }

6. Svelte reactivity triggers
   └── ChatMessage re-renders with new message.parts
   └── AnimatedMarkdown receives new content prop
   └── Markdown.svelte re-parses and re-renders HTML

7. Stream ends
   └── finally block: isStreaming = false
   └── Final buffer flush happens
```

### Builder Preview Flow

```
1. User sends message
   └── sendMessage(content) (local function)

2. Component creates assistant message
   └── assistantMessage = { id, role: "assistant", content: "", parts: [] }
   └── messages = [...messages, userMsg, assistantMessage]

3. SSE stream starts (same endpoint)

4. Text deltas arrive
   └── appendPendingText(messageId, delta)
   └── pendingTextByMessage.set(id, current + delta)
   └── messages updated: msg.content += delta

5. Stream done/finish event
   └── finalizeMessage(messageId)
   └── Pending text moved to parts array

6. Rendering during streaming:
   └── {#if isLoading && pendingTextByMessage.get(message.id)}
   └──   <AnimatedMarkdown content={pendingText} streaming={true} />
```

**Key difference:** Builder preview uses `pendingTextByMessage` Map for streaming text, separate from the `parts` array.

---

## Key Files

### 1. consumerChat.ts (Store)

**Location:** `web/src/stores/consumerChat.ts`

**Key Variables:**

```typescript
const TEXT_BATCH_INTERVAL_MS = 50; // Buffer flush interval
let textBuffer = ""; // Accumulated text between flushes
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let currentTextContent = ""; // Full text content so far
```

**State Shape:**

```typescript
interface ConsumerChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean; // True during active stream
  responseGenerating: boolean; // True while waiting for response
  // ...
}
```

**Critical Code Path:**

```typescript
// Line 708-724: handleSSEEvent
case "text-delta": {
  textBuffer += delta;
  if (!batchTimeout) {
    batchTimeout = setTimeout(() => {
      this.flushTextBuffer(assistantId);
    }, TEXT_BATCH_INTERVAL_MS);
  }
  break;
}

// Line 666-670: finally block
finally {
  update((s) => ({
    ...s,
    isStreaming: false,        // ← Set BEFORE final flush!
    responseGenerating: false,
  }));
  // ...
}
```

### 2. ChatMessage.svelte

**Location:** `web/src/lib/design-system/components/consumer/ChatMessage.svelte`

**Key Logic:**

```svelte
$: showStreamingCursor = isStreaming && isLast && isAssistant;

<!-- Renders AnimatedMarkdown for assistant messages -->
{#each message.parts || [] as part}
  {#if part.type === "text" && part.text}
    <AnimatedMarkdown content={part.text} streaming={showStreamingCursor} />
  {/if}
{/each}
```

### 3. ChatPreview.svelte

**Location:** `web/src/lib/design-system/components/builder/ChatPreview.svelte`

**Key Differences from Consumer Chat:**

- Self-contained component with internal state
- Uses `pendingTextByMessage` Map for streaming text
- Has TWO render paths:
  1. **During streaming:** Renders from `pendingTextByMessage`
  2. **After streaming:** Renders from `message.parts`

```svelte
<!-- Line 558-574: Rendering logic -->
{#if isLoading && pendingTextByMessage.get(message.id)}
  <AnimatedMarkdown content={pendingTextByMessage.get(message.id) || ""} streaming={true} />
{:else if message.content}
  <AnimatedMarkdown content={message.content} streaming={isLoading} />
{:else if isLoading}
  <!-- Pulse indicator -->
{/if}
```

### 4. AnimatedMarkdown.svelte

**Location:** `web/src/lib/design-system/components/AnimatedMarkdown.svelte`

**Purpose:** Wrapper around Markdown that animates new block elements.

**Current Implementation (after fixes):**

```svelte
// Track by block count, not DOM classes
let animatedBlockCount = 0;

function animateNewBlocks() {
  const blocks = markdownContent.querySelectorAll(BLOCK_SELECTORS);
  const animateUpTo = streaming ? blocks.length - 1 : blocks.length;

  for (let i = animatedBlockCount; i < animateUpTo; i++) {
    animateBlock(blocks[i]);
  }

  animatedBlockCount = Math.max(animatedBlockCount, animateUpTo);
}
```

### 5. Markdown.svelte

**Location:** `web/src/lib/design-system/components/Markdown.svelte`

**Key Behavior:**

- Uses `marked.js` to parse markdown to HTML
- Re-parses on EVERY content change: `$: htmlContent = parseMarkdown(content, katexLoaded)`
- Renders via `{@html htmlContent}` - **complete DOM replacement**
- No incremental updates - the entire `.markdown-content` innerHTML is replaced

---

## Text Batching System

### Why Batching Exists

Without batching, every single token (word/character) would trigger:

1. Store update
2. Svelte reactivity
3. Component re-render
4. Markdown re-parse
5. DOM replacement

With 50ms batching, multiple tokens are grouped into single updates.

### Timing Diagram

```
Time:    0ms    10ms   20ms   30ms   40ms   50ms   60ms   70ms
Tokens:  [A]    [B]    [C]    [D]    [E]    [F]    [G]    [H]
Buffer:  "A"    "AB"   "ABC"  "ABCD" "ABCDE"       "FG"   "FGH"
Flush:                               ↑             ↑
                                   "ABCDE"       "ABCDEFG"
```

### Problem: Race Condition on Stream End

```typescript
// In sendMessage() finally block (line 666):
finally {
  update((s) => ({
    ...s,
    isStreaming: false,  // ← Happens FIRST
    responseGenerating: false,
  }));
  // Final buffer flush happens AFTER isStreaming is false
}
```

By the time the UI receives the final content, `isStreaming` is already `false`.

---

## DOM Recreation Problem

### The Core Issue

When `content` prop changes in Markdown.svelte:

```svelte
$: htmlContent = parseMarkdown(content, katexLoaded);
```

This triggers:

```svelte
<div class="markdown-content">
  {@html htmlContent}   <!-- ENTIRE innerHTML replaced -->
</div>
```

**All DOM elements are destroyed and recreated.** Any classes, attributes, or state attached to those elements is lost.

### Why CSS Classes Don't Work

```javascript
// Attempt: Mark animated blocks with CSS class
el.classList.add("block-entered");

// Next content update:
// - Markdown re-renders
// - Old <p> element with "block-entered" is destroyed
// - New <p> element created (no classes)
// - AnimatedMarkdown sees "new" block, animates it again
```

### Why Block Count Tracking Doesn't Work Either

```javascript
// Attempt: Track by block count
let animatedBlockCount = 3; // Animated 3 blocks

// Content: "Para 1\n\nPara 2\n\nPara 3"  (3 blocks)
// New token adds to Para 3: "Para 3!"
// Markdown re-renders, still 3 <p> elements
// animatedBlockCount === 3, blocks.length === 3
// No new blocks detected ✓

// But wait - what if token creates NEW paragraph?
// Content: "Para 1\n\nPara 2\n\nPara 3\n\n"  (still parsing as 3 blocks)
// Next token: "P"
// Content: "Para 1\n\nPara 2\n\nPara 3\n\nP"  (NOW 4 blocks)
// We'd animate block[3] correctly

// PROBLEM: Markdown may split differently during streaming
// Incomplete markdown can parse differently than complete markdown
```

---

## Animation Attempts and Failures

### Attempt 1: CSS Class Tracking

**Approach:** Add `.block-entered` class to animated blocks.

**Code:**

```javascript
blocks.forEach((block) => {
  if (!block.classList.contains("block-entered")) {
    animateBlock(block);
    block.classList.add("block-entered");
  }
});
```

**Failure:** Classes lost on every re-render because Markdown uses `{@html}`.

### Attempt 2: Block Count Tracking

**Approach:** Track number of animated blocks, only animate new ones.

**Code:**

```javascript
let animatedBlockCount = 0;

function animateNewBlocks() {
  const blocks = markdownContent.querySelectorAll(BLOCK_SELECTORS);
  for (let i = animatedBlockCount; i < blocks.length; i++) {
    animateBlock(blocks[i]);
  }
  animatedBlockCount = blocks.length;
}
```

**Partial Failure:**

- Doesn't handle case where block count stays same but content changes
- During streaming, the LAST block is constantly being updated
- If we skip the last block, we need to animate it when streaming ends
- Timing issues with `streaming` prop vs actual content state

### Attempt 3: Skip Last Block During Streaming

**Approach:** During streaming, don't animate the last block (it's being typed into).

**Code:**

```javascript
const animateUpTo = streaming ? blocks.length - 1 : blocks.length;
```

**Problem:** The `streaming` prop doesn't accurately reflect when content is still changing:

- In ChatPreview, `streaming` is tied to `isLoading` which may not sync with content updates
- The "last block" keeps changing as new paragraphs are added
- First block of a new message never gets animated because it starts as the "last" block

---

## Root Cause Analysis

### The Fundamental Problem

**Markdown.svelte performs complete DOM replacement on every content change.**

This is by design - `marked.js` parses markdown to HTML string, and `{@html}` replaces the entire innerHTML. There's no incremental DOM update.

### Why This Is Hard to Fix

1. **No DOM diffing:** Unlike React/Vue, Svelte's `{@html}` doesn't diff - it replaces.

2. **Streaming creates partial markdown:** During streaming, content is often incomplete markdown:

   - `"Hello, how can I h"` - incomplete paragraph
   - `"Hello, how can I help?\n\n"` - complete paragraph, but trailing newlines
   - `"Hello, how can I help?\n\nI can"` - two paragraphs, second incomplete

3. **Marked.js behavior varies:** How incomplete markdown parses can change:

   - `"Hello"` → `<p>Hello</p>` (1 block)
   - `"Hello\n\n"` → `<p>Hello</p>` (still 1 block, trailing newlines stripped)
   - `"Hello\n\nWorld"` → `<p>Hello</p><p>World</p>` (2 blocks)

4. **Animation timing:** We want to animate when a NEW block appears, not when existing block's content changes.

---

## Potential Solutions

### Solution 1: Content-Based Block Identification

Track blocks by their content hash/prefix rather than position.

```javascript
let seenBlockPrefixes = new Set();

function animateNewBlocks() {
  blocks.forEach((block) => {
    // Use first N characters as identifier
    const prefix = block.textContent?.substring(0, 50) || "";

    if (!seenBlockPrefixes.has(prefix)) {
      seenBlockPrefixes.add(prefix);
      animateBlock(block);
    }
  });
}
```

**Pros:** Survives DOM recreation.
**Cons:** Prefix might match across different blocks; incomplete text might have different prefix than complete text.

### Solution 2: Paragraph-Based Content Tracking

Track completed paragraphs by detecting double-newlines in content.

```javascript
let animatedParagraphCount = 0;

$: paragraphs = content.split(/\n\n+/).filter((p) => p.trim());

$: if (paragraphs.length > animatedParagraphCount) {
  // New paragraph detected
  tick().then(() => {
    // Animate paragraphs from animatedParagraphCount to paragraphs.length - 1
    // (skip last one if streaming - it's still being typed)
  });
  animatedParagraphCount = streaming
    ? paragraphs.length - 1
    : paragraphs.length;
}
```

**Pros:** Works with raw content, not DOM.
**Cons:** Doesn't handle non-paragraph blocks (lists, code, etc.); list items don't have double-newlines.

### Solution 3: Delay Animation Until Streaming Ends

Only animate when streaming is complete.

```javascript
let wasStreaming = false;
let initialBlockCount = 0;

onMount(() => {
  initialBlockCount = getBlockCount();
});

$: if (wasStreaming && !streaming) {
  // Streaming just ended
  tick().then(() => {
    const blocks = getBlocks();
    // Animate all blocks after initialBlockCount
    for (let i = initialBlockCount; i < blocks.length; i++) {
      animateBlock(blocks[i]);
    }
  });
}
wasStreaming = streaming;
```

**Pros:** Simple, reliable.
**Cons:** No animation during streaming - user sees text appear instantly, then animate at end.

### Solution 4: Custom Markdown Renderer with Keyed Blocks

Create a custom renderer that tracks block identity.

```javascript
// Instead of {#html}, render blocks as Svelte components
{#each parsedBlocks as block (block.id)}
  <MarkdownBlock {block} animate={block.isNew} />
{/each}
```

**Pros:** Full control over DOM, proper keying.
**Cons:** Major rewrite of Markdown.svelte; need to handle all markdown features.

### Solution 5: CSS Animation on New Content

Use CSS animations that trigger on element creation, regardless of class.

```css
.markdown-content > p,
.markdown-content > li,
/* etc */ {
  animation: fadeSlideIn 0.3s ease-out;
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Problem:** Every element animates on EVERY re-render, not just new ones.

### Solution 6: Intersection Observer + Animation

Use Intersection Observer to detect when blocks enter viewport, animate once.

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && !entry.target.dataset.animated) {
      entry.target.dataset.animated = "true";
      animateBlock(entry.target);
    }
  });
});
```

**Problem:** `dataset.animated` gets lost on DOM recreation.

### Solution 7: MutationObserver for New Nodes

Watch for new DOM nodes being added.

```javascript
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1 && isBlockElement(node)) {
        animateBlock(node);
      }
    });
  });
});

observer.observe(markdownContent, { childList: true, subtree: true });
```

**Problem:** When `{@html}` replaces content, ALL nodes are "added" - no way to distinguish new from re-created.

---

## Recommended Approach

Given the constraints, the most pragmatic solution is a **hybrid approach**:

### Hybrid Solution: Content-Length Delta Detection

```javascript
let lastContentLength = 0;
let animatedBlockCount = 0;

$: {
  const contentLengthDelta = content.length - lastContentLength;
  lastContentLength = content.length;

  // Only check for new blocks if content grew significantly
  // (small deltas are just tokens being added to existing block)
  if (contentLengthDelta > 20) {
    // Threshold: ~1 sentence
    tick().then(() => {
      const blocks = getBlocks();
      if (blocks.length > animatedBlockCount) {
        // New block appeared
        for (let i = animatedBlockCount; i < blocks.length; i++) {
          animateBlock(blocks[i]);
        }
        animatedBlockCount = blocks.length;
      }
    });
  }
}
```

**Tuning:** The threshold (20 chars) may need adjustment based on typical response patterns.

### Alternative: Accept the Limitation

Another option is to accept that smooth per-block animations during streaming aren't feasible with the current architecture, and instead:

1. Show content instantly during streaming (no animation)
2. Add a subtle "complete" animation when streaming ends
3. Use the pulse indicator as the primary "activity" feedback

This matches how ChatGPT and Claude.ai handle streaming - they don't animate individual blocks during streaming.

---

## Files Changed in This Investigation

| File                      | Changes                                   |
| ------------------------- | ----------------------------------------- |
| `AnimatedMarkdown.svelte` | Rewrote animation logic multiple times    |
| `ChatMessage.svelte`      | Changed to always use AnimatedMarkdown    |
| `ChatPreview.svelte`      | Changed from Markdown to AnimatedMarkdown |

---

## Key Learnings

1. **Svelte `{@html}` does complete DOM replacement** - no incremental updates.

2. **Text batching (50ms) means content updates are chunked**, not per-token.

3. **`isStreaming` state becomes false before final content flush** - timing race condition.

4. **Builder preview and consumer chat are separate systems** with different streaming logic.

5. **CSS classes on DOM elements don't survive re-renders** when using `{@html}`.

6. **Block count tracking is unreliable** because markdown parsing of incomplete content varies.

7. **The `streaming` prop to AnimatedMarkdown doesn't accurately reflect content change state** - it's a hint, not a guarantee.

---

## Next Steps

1. **Decide on UX goal:** Do we need per-block animation during streaming, or is end-of-stream animation acceptable?

2. **If per-block animation is required:** Implement the hybrid content-length delta approach.

3. **If end-of-stream is acceptable:** Simplify AnimatedMarkdown to only animate when `streaming` transitions from true to false.

4. **Consider architectural change:** If this feature is critical, consider rewriting Markdown.svelte to use keyed Svelte components instead of `{@html}`.
