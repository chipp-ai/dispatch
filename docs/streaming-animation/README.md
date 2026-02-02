# Streaming Animation Architecture: Deep Dive Analysis

> **Status**: Research Complete | **Date**: January 2026
> **Problem**: CSS animations fail during streaming due to complete DOM replacement
> **Recommendation**: Adopt `svelte-streamdown` or `streaming-markdown` for append-only DOM updates

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Root Cause: DOM Replacement](#root-cause-dom-replacement)
4. [Industry Research](#industry-research)
5. [Performance Analysis](#performance-analysis)
6. [Recommended Solutions](#recommended-solutions)
7. [Implementation Guide](#implementation-guide)
8. [Quick Wins](#quick-wins)
9. [Sources & References](#sources--references)

---

## Executive Summary

Our current streaming animation architecture has a **fundamental architectural flaw**: `Markdown.svelte` uses `{@html htmlContent}` which performs **complete DOM replacement** on every content update. This destroys all animation state and makes smooth animations impossible.

### The Core Problem

```
Token arrives → Buffer (50ms) → Store update → Svelte reactivity
→ Markdown.svelte → marked.parse(fullContent) → {@html}
→ COMPLETE DOM REPLACEMENT → All animation state lost
```

### The Industry Solution

Major chat applications (ChatGPT, Claude.ai, Vercel AI SDK) solve this with three architectural changes:

1. **Decouple network arrival from UI rendering** (buffer → animate at controlled pace)
2. **Use incremental/streaming markdown parsers** (append-only DOM operations)
3. **Character-by-character animation** (requestAnimationFrame at 60fps)

### Recommended Path Forward

| Priority | Solution                           | Effort | Impact  |
| -------- | ---------------------------------- | ------ | ------- |
| **1**    | Adopt `svelte-streamdown`          | Low    | High    |
| **2**    | Integrate `streaming-markdown`     | Medium | High    |
| **3**    | Implement buffered animation layer | Medium | Medium  |
| **4**    | Custom keyed block renderer        | High   | Highest |

---

## Current Architecture Analysis

### Component Hierarchy

```
Consumer Chat:
ConsumerChat.svelte
  └── ChatMessage.svelte
        └── AnimatedMarkdown.svelte
              └── Markdown.svelte
                    └── {@html htmlContent}  ← PROBLEM

Builder Preview:
ChatPreview.svelte
  └── AnimatedMarkdown.svelte
        └── Markdown.svelte
              └── {@html htmlContent}  ← SAME PROBLEM
```

### Current Data Flow

1. **Token Arrival**: SSE stream delivers text deltas
2. **Buffering**: `textBuffer` accumulates tokens for 50ms (`TEXT_BATCH_INTERVAL_MS`)
3. **Store Update**: `flushTextBuffer()` triggers Svelte reactivity
4. **Markdown Parsing**: `marked.parse(fullContent)` re-parses **entire document**
5. **DOM Replacement**: `{@html htmlContent}` replaces **all** DOM children
6. **Animation Loss**: Any CSS classes, attributes, or animation state is destroyed

### Why Current Approaches Failed

#### Attempt 1: CSS Class Tracking

```javascript
// Add class to mark animated blocks
block.classList.add("block-entered");
// FAILURE: Class is destroyed on next DOM replacement
```

#### Attempt 2: Block Count Tracking

```javascript
let animatedBlockCount = 0;
// Count blocks and animate new ones
// FAILURE: DOM elements are completely different objects after re-render
```

#### Attempt 3: Skip Last Block During Streaming

```javascript
const animateUpTo = streaming ? blocks.length - 1 : blocks.length;
// FAILURE: `streaming` prop doesn't sync with actual content state
```

### Key Files Involved

| File                      | Role                     | Problem                             |
| ------------------------- | ------------------------ | ----------------------------------- |
| `consumerChat.ts`         | Store with 50ms batching | Updates too frequently              |
| `ChatMessage.svelte`      | Renders message parts    | Re-renders on every update          |
| `AnimatedMarkdown.svelte` | Animation wrapper        | Can't track DOM across replacements |
| `Markdown.svelte`         | Uses `{@html}`           | Complete DOM replacement            |

---

## Root Cause: DOM Replacement

### The `{@html}` Problem

When Svelte encounters `{@html htmlContent}`, it:

1. Removes all existing child nodes from the container
2. Parses the HTML string
3. Creates entirely new DOM elements
4. Inserts the new elements

This is **not** a Svelte bug—it's the intended behavior. The `{@html}` directive has no way to diff or patch existing content.

### Why This Breaks Animations

```javascript
// Frame 1: DOM has <p id="1">Hello</p>
animateBlock(paragraph); // Works!
paragraph.classList.add("animated");

// Frame 2: Content updates to "Hello world"
// Markdown re-parses entire content
// {@html} replaces entire innerHTML
// DOM now has <p id="NEW">Hello world</p>
// Original <p id="1"> is GONE, along with .animated class
```

### Browser Performance Impact

From Chrome's documentation:

> "Setting `textContent` on a node removes all of the node's children and replaces them with a single text node...When you do this frequently (as is the case with streamed responses), the browser needs to do a lot of removal and replacement work, which can add up."

---

## Industry Research

### ChatGPT/OpenAI Architecture

According to [Akash Kumar's analysis](https://akashbuilds.com/blog/chatgpt-stream-text-react), ChatGPT uses a **two-stage decoupled architecture**:

**Stage 1: Buffer Without Re-renders**

```javascript
// Tokens accumulate in a ref (no re-render!)
const bufferRef = useRef([]);

function onNewToken(token) {
  bufferRef.current.push(token);
}
```

**Stage 2: Controlled Batch Updates**

```javascript
useEffect(() => {
  const interval = setInterval(() => {
    if (bufferRef.current.length > 0) {
      setMessages((prev) => [...prev, ...bufferRef.current]);
      bufferRef.current = [];
    }
  }, 50); // Only 20 updates per second

  return () => clearInterval(interval);
}, []);
```

**Key Insight**: React only re-renders ~20 times per second instead of on every token.

### Upstash Smooth Streaming Pattern

From [Upstash's implementation](https://upstash.com/blog/smooth-streaming):

**Dual-State Buffering**

- `parts` state: Raw chunks as they arrive from server
- `stream` state: Currently visible text (animated character by character)

**Animation Loop**

```javascript
const typewriterSpeed = 5; // ms per character (~200 chars/sec)

const animate = (time) => {
  if (streamIndexRef.current < fullText.length) {
    if (time - lastTimeRef.current > typewriterSpeed) {
      streamIndexRef.current++;
      setStream(fullText.slice(0, streamIndexRef.current));
      lastTimeRef.current = time;
    }
    frame.current = requestAnimationFrame(animate);
  }
};
```

**Key Insight**: Characters are revealed at a **consistent pace** (5ms each) regardless of network arrival timing.

### Vercel AI SDK Architecture

From [Vercel's AI SDK documentation](https://vercel.com/blog/ai-sdk-5):

- **UIMessage vs ModelMessage**: Separate types for UI state vs LLM communication
- **SSE-based Streaming**: Server-Sent Events for stable real-time responses
- **Decoupled State Management**: Hook state can integrate with external stores
- **StreamingText Component**: Contains typing effect separately from data streaming

```javascript
// The streaming still occurs through the Vercel AI SDK
// The <StreamingText /> component only determines how the stream appears
```

### Chrome's Best Practices

From [Chrome DevRel documentation](https://developer.chrome.com/docs/ai/render-llm-responses):

**DOM Manipulation Recommendations**:

- ❌ Avoid: `textContent +=` and `innerText +=` (constant removal/replacement)
- ❌ Avoid: `innerHTML` with accumulated chunks (re-parse everything)
- ✅ Use: `append()` or `insertAdjacentText('beforeend', chunk)`
- ✅ Use: Streaming markdown parsers that append-only

**Security Note**: Always sanitize accumulated chunks with DOMPurify before rendering.

---

## Performance Analysis

### Quadratic Complexity Problem

From [Incremark analysis](https://dev.to/kingshuaishuai/eliminate-redundant-markdown-parsing-typically-2-10x-faster-ai-streaming-4k94):

Traditional parsers re-parse the **entire document** on every update, creating O(n²) complexity:

| Document Size | Traditional Parsing      | Incremental Parsing | Reduction |
| ------------- | ------------------------ | ------------------- | --------- |
| 1KB           | 1,010,000 chars parsed   | 20,000 chars        | 98%       |
| 5KB           | 25,050,000 chars parsed  | 100,000 chars       | 99.6%     |
| 20KB          | 400,200,000 chars parsed | 400,000 chars       | 99.9%     |

**Real-world improvement**: 2-10x typical, up to 46x for longer documents.

### Current Implementation Cost

With our 50ms batch interval and a 10KB response:

- ~200 batches during streaming
- Each batch: `marked.parse()` on growing content
- Total characters parsed: ~100 million (quadratic)

### Memory and GC Pressure

Each DOM replacement:

1. Creates new element objects
2. Destroys old element objects
3. Triggers garbage collection
4. Invalidates browser layout cache

---

## Recommended Solutions

### Solution 1: svelte-streamdown (Recommended)

**Effort**: Low | **Impact**: High | **Risk**: Low

[svelte-streamdown](https://github.com/beynar/svelte-streamdown) is a Svelte port of Vercel's Streamdown, featured in [Svelte's October 2025 blog](https://svelte.dev/blog/whats-new-in-svelte-october-2025).

**Features**:

- Handles incomplete/unterminated markdown gracefully
- Progressive rendering (perfect for streaming)
- Built-in smooth animations for tokens and blocks
- Svelte 5 compatible
- Character-level or word-level tokenization

**Usage**:

```svelte
<script>
  import { Streamdown } from 'svelte-streamdown';
  export let content: string;
  export let streaming: boolean = false;
</script>

<Streamdown
  {content}
  tokenize="word"
  animation={{ duration: 150, easing: 'ease-out' }}
/>
```

**Migration Path**:

1. Install: `npm install svelte-streamdown`
2. Replace `Markdown.svelte` imports with `Streamdown`
3. Remove `AnimatedMarkdown.svelte` wrapper (no longer needed)
4. Configure animation options as desired

### Solution 2: streaming-markdown

**Effort**: Medium | **Impact**: High | **Risk**: Low

[streaming-markdown](https://github.com/thetarnav/streaming-markdown) is a 3KB library that only appends DOM nodes.

**Key Principle**: "The parser is only adding new elements to the DOM, not modifying the existing ones."

**Architecture**:

```javascript
import * as smd from "streaming-markdown";

// Initialize once per message
const element = document.getElementById("markdown");
const renderer = smd.default_renderer(element);
const parser = smd.parser(renderer);

// On each NEW chunk (not accumulated content):
smd.parser_write(parser, newChunk);

// When streaming ends:
smd.parser_end(parser);
```

**Features**:

- 40+ markdown features (headers, tables, code, LaTeX, etc.)
- Preserves user text selection during streaming
- Handles partial/incomplete markdown
- Optimistic rendering (styles immediately on opening syntax)

**Migration Path**:

1. Install: `npm install streaming-markdown`
2. Create new `StreamingMarkdown.svelte` component
3. Track parser instance per message
4. Pass only new chunks, not accumulated content

### Solution 3: Buffered Animation Layer

**Effort**: Medium | **Impact**: Medium | **Risk**: Medium

Decouple content arrival from visual rendering:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Markdown from './Markdown.svelte';

  export let content: string;
  export let streaming: boolean = false;

  let visibleContent = '';
  let animationFrame: number;
  let lastCharIndex = 0;

  // Tuning parameters
  const CHARS_PER_FRAME = 3; // ~180 chars/sec at 60fps
  const MIN_CHARS_PER_UPDATE = 10; // Batch small updates

  // Buffer holds full content, visibleContent is what we show
  $: if (content.length > lastCharIndex && !animationFrame) {
    startAnimation();
  }

  function startAnimation() {
    function animate() {
      const targetIndex = Math.min(
        lastCharIndex + CHARS_PER_FRAME,
        content.length
      );

      // Only update if meaningful change
      if (targetIndex - lastCharIndex >= MIN_CHARS_PER_UPDATE ||
          targetIndex === content.length) {
        lastCharIndex = targetIndex;
        visibleContent = content.slice(0, lastCharIndex);
      }

      if (lastCharIndex < content.length) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        animationFrame = 0;
      }
    }

    animationFrame = requestAnimationFrame(animate);
  }

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });
</script>

<Markdown content={visibleContent} {streaming} />
```

**Trade-off**: Still does full DOM replacement, but at a controlled, predictable rate (~60 updates/second max instead of network-driven).

### Solution 4: Custom Keyed Block Renderer

**Effort**: High | **Impact**: Highest | **Risk**: High

Replace `{@html}` with Svelte's keyed each blocks:

```svelte
<script lang="ts">
  import { marked } from 'marked';

  export let content: string;

  interface ParsedBlock {
    id: string;
    type: 'paragraph' | 'heading' | 'code' | 'list' | 'blockquote';
    content: string;
    isNew: boolean;
  }

  let blocks: ParsedBlock[] = [];
  let seenIds = new Set<string>();

  $: {
    const tokens = marked.lexer(content);
    blocks = tokens.map((token, i) => {
      const id = generateStableId(token, i);
      const isNew = !seenIds.has(id);
      seenIds.add(id);
      return { id, type: token.type, content: token.raw, isNew };
    });
  }
</script>

{#each blocks as block (block.id)}
  <MarkdownBlock {block} animate={block.isNew} />
{/each}
```

**Requires**:

1. Parse markdown to AST (tokens), not HTML
2. Assign stable IDs to blocks based on content hash
3. Implement `MarkdownBlock` component for each type
4. Handle all markdown features (code highlighting, tables, etc.)

---

## Implementation Guide

### Phase 1: Adopt svelte-streamdown (Week 1)

1. **Install dependency**:

   ```bash
   npm install svelte-streamdown
   ```

2. **Create adapter component**:

   ```svelte
   <!-- StreamingMarkdownAdapter.svelte -->
   <script lang="ts">
     import { Streamdown } from 'svelte-streamdown';
     import type { FileDownloadInfo } from '../utils/fileUtils';

     export let content: string = '';
     export let streaming: boolean = false;

     // Map our props to Streamdown's API
     $: tokenize = streaming ? 'word' : 'none';
   </script>

   <div class="markdown-wrapper">
     <Streamdown
       {content}
       {tokenize}
       animation={streaming ? { duration: 150 } : null}
     />
   </div>
   ```

3. **Update imports** in `ChatMessage.svelte` and `ChatPreview.svelte`

4. **Remove AnimatedMarkdown.svelte** (no longer needed)

5. **Test thoroughly** with various markdown content types

### Phase 2: Optimize Store Updates (Week 2)

1. **Increase batch interval** from 50ms to 100ms:

   ```typescript
   const TEXT_BATCH_INTERVAL_MS = 100; // Was 50
   ```

2. **Add content-length threshold**:

   ```typescript
   // Only flush if meaningful content accumulated
   if (textBuffer.length > 20) {
     flushTextBuffer(assistantId);
   }
   ```

3. **Fix streaming state race condition**:
   ```typescript
   finally {
     // Flush BEFORE setting isStreaming to false
     this.flushTextBuffer(assistantId);
     update((s) => ({
       ...s,
       isStreaming: false,
       responseGenerating: false,
     }));
   }
   ```

### Phase 3: Performance Monitoring (Week 3)

1. **Add performance markers**:

   ```javascript
   performance.mark("markdown-parse-start");
   const html = marked.parse(content);
   performance.mark("markdown-parse-end");
   performance.measure(
     "markdown-parse",
     "markdown-parse-start",
     "markdown-parse-end"
   );
   ```

2. **Monitor DOM replacement frequency** using DevTools Paint Flashing

3. **Track animation frame drops** for smoothness metrics

---

## Quick Wins

These can be implemented immediately with minimal risk:

### 1. Increase Batch Interval

```typescript
// consumerChat.ts
const TEXT_BATCH_INTERVAL_MS = 100; // Was 50
```

**Impact**: 50% fewer DOM replacements

### 2. Add CSS Containment

```css
/* Markdown.svelte */
.markdown-content {
  contain: layout style;
  will-change: contents;
}

.markdown-content.streaming {
  contain: layout style paint;
}
```

**Impact**: Browser can optimize rendering

### 3. Disable Animations During Streaming

```svelte
<!-- AnimatedMarkdown.svelte -->
<script>
  // Don't animate during streaming - show instantly
  // Only animate the final state when streaming ends
  $: shouldAnimate = !streaming;
</script>
```

**Impact**: Removes janky mid-stream animations

### 4. Virtualize Long Conversations

For chats with many messages, only render visible ones:

```bash
npm install svelte-virtual-scroll-list
```

**Impact**: Constant memory/CPU regardless of conversation length

---

## Sources & References

### Primary Research

1. **[Upstash: Smooth Text Streaming in AI SDK v5](https://upstash.com/blog/smooth-streaming)**
   Comprehensive guide on decoupling network from UI with dual-state buffering and requestAnimationFrame animation.

2. **[Chrome DevRel: Best practices to render streamed LLM responses](https://developer.chrome.com/docs/ai/render-llm-responses)**
   Official browser vendor recommendations for DOM manipulation, security, and performance.

3. **[Why React Apps Lag With Streaming Text (ChatGPT Analysis)](https://akashbuilds.com/blog/chatgpt-stream-text-react)**
   Reverse-engineering of ChatGPT's two-stage buffering architecture.

4. **[Eliminate Redundant Markdown Parsing](https://dev.to/kingshuaishuai/eliminate-redundant-markdown-parsing-typically-2-10x-faster-ai-streaming-4k94)**
   Analysis of O(n²) complexity in traditional parsers with Incremark solution.

### Libraries & Tools

5. **[svelte-streamdown](https://github.com/beynar/svelte-streamdown)**
   Svelte port of Vercel's Streamdown. Featured in Svelte's October 2025 blog.

6. **[streaming-markdown](https://github.com/thetarnav/streaming-markdown)**
   3KB append-only markdown parser. Preserves text selection during streaming.

7. **[FlowToken](https://github.com/Ephibbs/flowtoken)**
   React library for animating streaming LLM output with 13+ animation options.

8. **[@humanspeak/svelte-markdown](https://www.npmjs.com/package/@humanspeak/svelte-markdown)**
   Svelte markdown renderer with intelligent token caching (50-200x faster re-renders).

### Platform Documentation

9. **[Vercel AI SDK 5](https://vercel.com/blog/ai-sdk-5)**
   UIMessage vs ModelMessage architecture, SSE streaming, decoupled state management.

10. **[Vercel AI SDK 6](https://vercel.com/blog/ai-sdk-6)**
    Latest patterns for composable agents and streaming.

11. **[AI SDK UI: Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)**
    Text content streaming with start/delta/end patterns.

### Community Discussions

12. **[OpenAI Forum: Animating LLM streaming text](https://community.openai.com/t/animating-llm-streaming-text/878081)**
    Community solutions and approaches.

13. **[GSAP Forum: Animating text while streaming in React](https://gsap.com/community/forums/topic/44242-animating-text-while-streaming-in-in-react/)**
    Animation library-specific approaches.

---

## Appendix: Animation Timing Reference

| Speed     | Characters/Second | Use Case                     |
| --------- | ----------------- | ---------------------------- |
| 5ms/char  | 200               | Very readable, feels natural |
| 10ms/char | 100               | Deliberate, dramatic effect  |
| 2ms/char  | 500               | Fast but still perceptible   |
| 0ms/char  | Instant           | No animation (fallback)      |

**Recommended**: 5ms per character (200 chars/second) balances readability with responsiveness.

---

## Additional Documentation

- **[svelte-streamdown Deep Dive](./svelte-streamdown-deep-dive.md)** - Comprehensive analysis of the library internals, animation system, and known issues
- **[Troubleshooting Guide](./troubleshooting.md)** - Quick fixes for common issues with StreamingMarkdown
- **[Debugging Session 2026-01-25](./debugging-session-2026-01-25.md)** - Detailed walkthrough of investigating the newline collapse issue, including architecture discoveries and debugging tools created

---

## Implementation Status & Learnings

### Current State (January 2026)

We implemented `StreamingMarkdown.svelte` using svelte-streamdown as the primary solution. Key findings from implementation:

#### What Works

- **Incremental DOM updates**: Content is parsed into blocks that are keyed, so existing DOM is preserved
- **Incomplete markdown handling**: `parseIncompleteMarkdown()` gracefully handles mid-stream syntax
- **Basic fade animation**: Opacity transitions work when `display: inline` is forced

#### What Causes Issues

1. **`display: inline-block` on animated spans**

   - Root cause of all layout shift issues
   - Whitespace renders differently than normal inline text
   - Line breaks and spacing change when streaming completes

2. **Word-level tokenization** (`tokenize: "word"`)

   - Splits on `/(\s+)/` regex, keeping delimiters
   - Whitespace-as-tokens causes spacing artifacts

3. **Character-level tokenization** (`tokenize: "char"`)
   - Same inline-block problem applies
   - Every character gets its own span, more DOM overhead

#### Current Workaround

CSS override to force inline display:

```css
.streaming-markdown-wrapper :global(span[style*="inline-block"]) {
  display: inline !important;
}
```

This preserves opacity animation while preventing layout shift. Trade-off: `slideUp`/`slideDown` animations won't work properly since they rely on `transform` which needs block-level context.

#### Recommendation

For production use, consider one of these approaches:

1. **Animation only on complete** - Disable animation during streaming, enable fade on final render
2. **Block-level animation only** - Animate paragraphs/headers as whole units, not individual words
3. **CSS-only animation** - Use our own CSS transitions on the wrapper, not svelte-streamdown's animation
4. **No animation** - Accept the benefit of incremental DOM updates without text animation

---

## Known Issue: Newline Collapse on Streaming End

### Symptom

Content with newlines displays correctly during streaming but collapses onto single lines when streaming ends.

Example:

```
During streaming:
  Line 1
  Line 2
  Line 3

After streaming ends:
  Line 1 Line 2 Line 3
```

### Root Cause Analysis

This is caused by the interaction between CSS `white-space` properties and markdown's newline handling:

1. **During streaming**: Each character/word is wrapped in `<span style="white-space: pre-wrap; display: inline-block;">`. The `pre-wrap` preserves newline characters visually.

2. **After streaming**: Standard markdown rendering takes over. In markdown, single newlines within a paragraph are collapsed to spaces. Only these create actual line breaks:

   - Two consecutive newlines (paragraph break)
   - Two trailing spaces before newline (soft break `<br>`)
   - Explicit `<br>` tags

3. **The mismatch**: AI models often output content with single newlines expecting visual line breaks, which works during streaming (due to CSS) but fails after.

### Debugging Tools

1. **Console logging** - `StreamingMarkdown.svelte` logs detailed state transitions:

   ```
   [StreamingMarkdown] streaming: true → false
   [StreamingMarkdown] === STREAMING ENDED ===
   [StreamingMarkdown] Final content length: 1234
   [StreamingMarkdown] Newline count: 5
   [StreamingMarkdown] Double-newline count: 1
   ```

2. **DOM inspection** - The component logs DOM structure after streaming:

   ```
   [StreamingMarkdown] DOM Structure: {
     spanCount: 0,
     hasInlineBlockSpans: 0,
     sampleTextNodes: [...]
   }
   ```

3. **Test endpoint** - `/api/dev/streaming-test?pattern=poem` to test specific content patterns:
   - `newlines`: Single newlines (should collapse)
   - `paragraphs`: Double newlines (proper paragraph breaks)
   - `softbreaks`: Two spaces + newline (markdown soft breaks)
   - `mixed`: Combination of all patterns
   - `poem`: Multi-line content with single newlines

### Current Workaround

Added `white-space: pre-wrap` to paragraphs in `StreamingMarkdown.svelte`:

```css
.streaming-markdown-wrapper :global(p) {
  white-space: pre-wrap;
}
```

**Trade-offs**:

- ✅ Preserves newlines as users expect
- ⚠️ Deviates from standard markdown rendering
- ⚠️ May affect spacing in some edge cases

### Proper Fix Options

1. **Post-process AI output**: Convert single newlines to markdown soft breaks (`  \n`) before displaying

2. **Use `<br>` tags**: Configure AI prompts to use explicit `<br>` for line breaks

3. **Accept markdown behavior**: Educate users that single newlines = spaces in markdown

4. **CSS-only (current)**: Force `white-space: pre-wrap` on paragraphs

### Files Modified for Debugging

- `web/src/lib/design-system/components/StreamingMarkdown.svelte` - Console logging and CSS fix
- `web/src/lib/debug/StreamingDebug.svelte` - Visual debug panel
- `src/api/routes/dev/streaming-test.ts` - Test endpoint

---

## Revision History

| Date       | Author | Changes                                                       |
| ---------- | ------ | ------------------------------------------------------------- |
| 2026-01-25 | Claude | Initial research and analysis                                 |
| 2026-01-25 | Claude | Added svelte-streamdown deep dive and implementation findings |
| 2026-01-25 | Claude | Added newline collapse investigation and debugging tools      |
