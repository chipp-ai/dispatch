# LLM Format Normalization Report

## Executive Summary

This report analyzes how the Vercel AI SDK normalizes different LLM API formats across providers (OpenAI, Anthropic, Google/Gemini). The goal is to understand what a minimal normalization utility would need to handle for:

1. Storing chat history in a database with a unified schema
2. Allowing users to swap models mid-conversation
3. Creating a reusable, provider-agnostic interface

---

## Table of Contents

1. [Provider Format Comparison](#1-provider-format-comparison)
2. [Key Differences by Category](#2-key-differences-by-category)
3. [Tool Call Format Differences](#3-tool-call-format-differences)
4. [Unified Schema Design](#4-unified-schema-design)
5. [Minimal Normalization Utility Design](#5-minimal-normalization-utility-design)
6. [Database Schema Recommendations](#6-database-schema-recommendations)
7. [Implementation Checklist](#7-implementation-checklist)

---

## 1. Provider Format Comparison

### 1.1 Message Structure Overview

| Aspect              | OpenAI                                 | Anthropic                                 | Google/Gemini                                    |
| ------------------- | -------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| **System Messages** | In messages array with role `'system'` | Separate top-level `system` field (array) | Separate `systemInstruction` field               |
| **User Role**       | `'user'`                               | `'user'`                                  | `'user'`                                         |
| **Assistant Role**  | `'assistant'`                          | `'assistant'`                             | `'model'`                                        |
| **Tool Results**    | Separate message with role `'tool'`    | Content block inside user message         | Part inside user message with `functionResponse` |
| **Content Format**  | String or array of parts               | Always array of content blocks            | Always array of parts                            |

### 1.2 Native API Request Formats

**OpenAI:**

```typescript
{
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi!", tool_calls: [...] },
    { role: "tool", tool_call_id: "call_123", content: "result" }
  ],
  tools: [{ type: "function", function: { name, description, parameters } }],
  tool_choice: "auto" | "none" | "required" | { type: "function", function: { name } }
}
```

**Anthropic:**

```typescript
{
  model: "claude-3-opus",
  system: [{ type: "text", text: "You are helpful", cache_control?: {...} }],
  messages: [
    { role: "user", content: [{ type: "text", text: "Hello" }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Hi!" },
        { type: "tool_use", id: "toolu_123", name: "search", input: {...} }
      ]
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_123", content: "result" }
      ]
    }
  ],
  tools: [{ name, description, input_schema }]
}
```

**Google/Gemini:**

```typescript
{
  model: "gemini-pro",
  systemInstruction: { parts: [{ text: "You are helpful" }] },
  contents: [
    { role: "user", parts: [{ text: "Hello" }] },
    {
      role: "model",
      parts: [
        { text: "Hi!" },
        { functionCall: { name: "search", args: {...} } }
      ]
    },
    {
      role: "user",
      parts: [
        { functionResponse: { name: "search", response: { name: "search", content: "result" } } }
      ]
    }
  ],
  tools: [{ functionDeclarations: [{ name, description, parameters }] }],
  toolConfig: { functionCallingConfig: { mode: "AUTO" | "NONE" | "ANY" } }
}
```

---

## 2. Key Differences by Category

### 2.1 System Messages

| Provider      | Location                     | Format                                            | Constraints                                                |
| ------------- | ---------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| **OpenAI**    | In `messages[]`              | `{ role: "system", content: string }`             | Can be interspersed                                        |
| **Anthropic** | Separate `system` field      | Array of `{ type: "text", text, cache_control? }` | Must be first, merged                                      |
| **Google**    | Separate `systemInstruction` | `{ parts: [{ text }] }`                           | Must be first; Gemma models: prepend to first user message |

**Normalization Required:**

- Extract system messages from/to different locations
- Handle Anthropic's cache_control metadata
- Handle Google's Gemma model special case

### 2.2 Content Parts/Blocks

**Text Content:**
| Provider | Format |
|----------|--------|
| OpenAI | `{ type: "text", text: string }` or plain `string` |
| Anthropic | `{ type: "text", text: string, cache_control? }` |
| Google | `{ text: string, thought?: boolean }` |

**Image Content:**
| Provider | Format |
|----------|--------|
| OpenAI | `{ type: "image_url", image_url: { url: "data:..." \| "https://...", detail? } }` |
| Anthropic | `{ type: "image", source: { type: "base64", media_type, data } }` |
| Google | `{ inlineData: { mimeType, data } }` or `{ fileData: { mimeType, fileUri } }` |

**Reasoning/Thinking:**
| Provider | Format |
|----------|--------|
| OpenAI | Provider metadata / extended thinking response |
| Anthropic | `{ type: "thinking", thinking: string, signature: string }` |
| Google | `{ text: string, thought: true, thoughtSignature? }` |

### 2.3 Assistant Role Name

| Provider  | Role Name     |
| --------- | ------------- |
| OpenAI    | `"assistant"` |
| Anthropic | `"assistant"` |
| Google    | `"model"`     |

---

## 3. Tool Call Format Differences

### 3.1 Tool Definition Schema

| Provider      | Schema Format          | Tool Structure                                                      |
| ------------- | ---------------------- | ------------------------------------------------------------------- |
| **OpenAI**    | JSON Schema 7          | `{ type: "function", function: { name, description, parameters } }` |
| **Anthropic** | JSON Schema 7          | `{ name, description, input_schema }`                               |
| **Google**    | **OpenAPI Schema 3.0** | `{ functionDeclarations: [{ name, description, parameters }] }`     |

**Critical:** Google requires converting JSON Schema to OpenAPI Schema format.

### 3.2 Tool Call Representation

**OpenAI:**

```typescript
// In assistant message
{
  role: "assistant",
  content: "Let me search...",
  tool_calls: [
    {
      id: "call_abc123",
      type: "function",
      function: {
        name: "search",
        arguments: "{\"query\": \"weather\"}"  // STRINGIFIED JSON
      }
    }
  ]
}
```

**Anthropic:**

```typescript
// In assistant message content array
{
  role: "assistant",
  content: [
    { type: "text", text: "Let me search..." },
    {
      type: "tool_use",
      id: "toolu_abc123",
      name: "search",
      input: { query: "weather" }  // PARSED OBJECT
    }
  ]
}
```

**Google:**

```typescript
// In model message parts array
{
  role: "model",
  parts: [
    { text: "Let me search..." },
    {
      functionCall: {
        name: "search",
        args: { query: "weather" }  // PARSED OBJECT
      }
    }
  ]
}
```

### 3.3 Tool Call ID Comparison

| Provider  | ID Field | ID in Request              | ID in Response           |
| --------- | -------- | -------------------------- | ------------------------ |
| OpenAI    | `id`     | Required                   | Generated by API         |
| Anthropic | `id`     | Optional (can be provided) | Generated by API         |
| Google    | **None** | N/A                        | N/A (uses function name) |

**Critical:** Google doesn't use tool call IDs. Correlation is by function name only.

### 3.4 Tool Results

**OpenAI:**

```typescript
{
  role: "tool",
  tool_call_id: "call_abc123",
  content: "The weather is sunny"  // STRING only
}
```

**Anthropic:**

```typescript
// Inside a USER message
{
  role: "user",
  content: [
    {
      type: "tool_result",
      tool_use_id: "toolu_abc123",
      content: "The weather is sunny",  // Can be string OR array of content blocks
      is_error: false
    }
  ]
}
```

**Google:**

```typescript
// Inside a USER message
{
  role: "user",
  parts: [
    {
      functionResponse: {
        name: "search",
        response: {
          name: "search",
          content: "The weather is sunny"
        }
      }
    }
  ]
}
```

### 3.5 Tool Choice/Mode

| Unified Value | OpenAI                                     | Anthropic                | Google                                          |
| ------------- | ------------------------------------------ | ------------------------ | ----------------------------------------------- |
| `"auto"`      | `"auto"`                                   | `{ type: "auto" }`       | `{ mode: "AUTO" }`                              |
| `"none"`      | `"none"`                                   | `{ type: "none" }`       | `{ mode: "NONE" }`                              |
| `"required"`  | `"required"`                               | `{ type: "any" }`        | `{ mode: "ANY" }`                               |
| Specific tool | `{ type: "function", function: { name } }` | `{ type: "tool", name }` | `{ mode: "ANY", allowedFunctionNames: [name] }` |

---

## 4. Unified Schema Design

Based on the AI SDK's approach, here's a minimal unified format:

### 4.1 Message Types

```typescript
type UnifiedMessage =
  | UnifiedSystemMessage
  | UnifiedUserMessage
  | UnifiedAssistantMessage
  | UnifiedToolMessage;

interface UnifiedSystemMessage {
  role: "system";
  content: string;
  metadata?: {
    cacheControl?: { type: "ephemeral"; ttl?: "5m" | "1h" };
  };
}

interface UnifiedUserMessage {
  role: "user";
  content: UnifiedContentPart[];
}

interface UnifiedAssistantMessage {
  role: "assistant";
  content: UnifiedContentPart[];
}

interface UnifiedToolMessage {
  role: "tool";
  content: UnifiedToolResultPart[];
}
```

### 4.2 Content Parts

```typescript
type UnifiedContentPart =
  | UnifiedTextPart
  | UnifiedImagePart
  | UnifiedFilePart
  | UnifiedToolCallPart
  | UnifiedReasoningPart;

interface UnifiedTextPart {
  type: "text";
  text: string;
}

interface UnifiedImagePart {
  type: "image";
  data: string; // base64 data
  mediaType: string; // e.g., 'image/png'
  url?: string; // optional URL if available
}

interface UnifiedFilePart {
  type: "file";
  data: string;
  mediaType: string;
  filename?: string;
}

interface UnifiedToolCallPart {
  type: "tool-call";
  toolCallId: string; // Generate if provider doesn't provide
  toolName: string;
  input: unknown; // Always store as parsed object
}

interface UnifiedReasoningPart {
  type: "reasoning";
  text: string;
  signature?: string; // For providers that use signatures (Anthropic, Google)
}
```

### 4.3 Tool Result Parts

```typescript
interface UnifiedToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: UnifiedToolOutput;
}

type UnifiedToolOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown }
  | { type: "error"; value: string }
  | { type: "content"; value: UnifiedContentPart[] };
```

### 4.4 Tool Definition

```typescript
interface UnifiedToolDefinition {
  name: string;
  description?: string;
  inputSchema: JSONSchema7; // Store as JSON Schema 7 (most flexible)
  strict?: boolean; // For OpenAI structured outputs
}
```

### 4.5 Finish Reason

```typescript
type UnifiedFinishReason =
  | "stop" // Normal completion
  | "length" // Max tokens reached
  | "tool-calls" // Model wants to call tools
  | "content-filter" // Content was filtered
  | "error" // An error occurred
  | "other"; // Unknown/other reason
```

---

## 5. Minimal Normalization Utility Design

### 5.1 Core Conversion Functions

```typescript
// Main interface
interface LLMNormalizer {
  // Convert unified format to provider-specific format
  toProvider(messages: UnifiedMessage[], provider: Provider): ProviderRequest;

  // Convert provider response to unified format
  fromProvider(response: ProviderResponse, provider: Provider): UnifiedResponse;

  // Convert tool definitions
  toProviderTools(
    tools: UnifiedToolDefinition[],
    provider: Provider
  ): ProviderTools;
}

type Provider = "openai" | "anthropic" | "google";
```

### 5.2 Key Transformations Needed

**To OpenAI:**

```typescript
function toOpenAI(messages: UnifiedMessage[]): OpenAIMessage[] {
  return messages.flatMap((msg) => {
    switch (msg.role) {
      case "system":
        return { role: "system", content: msg.content };

      case "user":
        return {
          role: "user",
          content:
            msg.content.length === 1 && msg.content[0].type === "text"
              ? msg.content[0].text // Single text → string
              : convertContentParts(msg.content),
        };

      case "assistant":
        const text = extractText(msg.content);
        const toolCalls = extractToolCalls(msg.content);
        return {
          role: "assistant",
          content: text || undefined,
          tool_calls:
            toolCalls.length > 0
              ? toolCalls.map((tc) => ({
                  id: tc.toolCallId,
                  type: "function",
                  function: {
                    name: tc.toolName,
                    arguments: JSON.stringify(tc.input), // STRINGIFY
                  },
                }))
              : undefined,
        };

      case "tool":
        return msg.content.map((tr) => ({
          role: "tool",
          tool_call_id: tr.toolCallId,
          content: stringifyToolOutput(tr.output),
        }));
    }
  });
}
```

**To Anthropic:**

```typescript
function toAnthropic(messages: UnifiedMessage[]): AnthropicRequest {
  const systemMessages: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg.content);
    } else if (msg.role === "tool") {
      // Tool results go INTO the previous or next user message
      // This requires block grouping logic
      mergeToolResultsIntoUserMessage(anthropicMessages, msg);
    } else {
      anthropicMessages.push(convertMessage(msg));
    }
  }

  return {
    system:
      systemMessages.length > 0
        ? systemMessages.map((text) => ({ type: "text", text }))
        : undefined,
    messages: anthropicMessages,
  };
}

// Critical: Tool results must be in USER messages
function mergeToolResultsIntoUserMessage(
  messages: AnthropicMessage[],
  toolMsg: UnifiedToolMessage
) {
  const lastMsg = messages[messages.length - 1];

  if (lastMsg?.role === "user") {
    // Add to existing user message
    lastMsg.content.push(
      ...toolMsg.content.map((tr) => ({
        type: "tool_result",
        tool_use_id: tr.toolCallId,
        content: stringifyToolOutput(tr.output),
      }))
    );
  } else {
    // Create new user message with tool results
    messages.push({
      role: "user",
      content: toolMsg.content.map((tr) => ({
        type: "tool_result",
        tool_use_id: tr.toolCallId,
        content: stringifyToolOutput(tr.output),
      })),
    });
  }
}
```

**To Google:**

```typescript
function toGoogle(messages: UnifiedMessage[]): GoogleRequest {
  let systemInstruction: { parts: { text: string }[] } | undefined;
  const contents: GoogleContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (!systemInstruction) {
        systemInstruction = { parts: [] };
      }
      systemInstruction.parts.push({ text: msg.content });
    } else if (msg.role === "tool") {
      // Tool results go into USER message as functionResponse
      contents.push({
        role: "user",
        parts: msg.content.map((tr) => ({
          functionResponse: {
            name: tr.toolName,
            response: {
              name: tr.toolName,
              content: stringifyToolOutput(tr.output),
            },
          },
        })),
      });
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user", // Map 'assistant' → 'model'
        parts: convertParts(msg.content),
      });
    }
  }

  return { systemInstruction, contents };
}
```

### 5.3 Response Parsing

**From OpenAI:**

```typescript
function fromOpenAI(response: OpenAIResponse): UnifiedResponse {
  const choice = response.choices[0];
  const content: UnifiedContentPart[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  for (const tc of choice.message.tool_calls ?? []) {
    content.push({
      type: "tool-call",
      toolCallId: tc.id,
      toolName: tc.function.name,
      input: JSON.parse(tc.function.arguments), // PARSE
    });
  }

  return {
    message: { role: "assistant", content },
    finishReason: mapFinishReason(choice.finish_reason),
    usage: mapUsage(response.usage),
  };
}
```

**From Anthropic:**

```typescript
function fromAnthropic(response: AnthropicResponse): UnifiedResponse {
  const content: UnifiedContentPart[] = [];

  for (const block of response.content) {
    switch (block.type) {
      case "text":
        content.push({ type: "text", text: block.text });
        break;
      case "tool_use":
        content.push({
          type: "tool-call",
          toolCallId: block.id,
          toolName: block.name,
          input: block.input, // Already an object
        });
        break;
      case "thinking":
        content.push({
          type: "reasoning",
          text: block.thinking,
          signature: block.signature,
        });
        break;
    }
  }

  return {
    message: { role: "assistant", content },
    finishReason: mapFinishReason(response.stop_reason),
    usage: mapUsage(response.usage),
  };
}
```

**From Google:**

```typescript
function fromGoogle(response: GoogleResponse): UnifiedResponse {
  const candidate = response.candidates[0];
  const content: UnifiedContentPart[] = [];

  for (const part of candidate.content.parts) {
    if ("text" in part) {
      if (part.thought) {
        content.push({
          type: "reasoning",
          text: part.text,
          signature: part.thoughtSignature,
        });
      } else {
        content.push({ type: "text", text: part.text });
      }
    } else if ("functionCall" in part) {
      content.push({
        type: "tool-call",
        toolCallId: generateId(), // Google doesn't provide IDs
        toolName: part.functionCall.name,
        input: part.functionCall.args,
      });
    }
  }

  return {
    message: { role: "assistant", content },
    finishReason: mapFinishReason(candidate.finishReason),
    usage: mapUsage(response.usageMetadata),
  };
}
```

### 5.4 Tool Definition Conversion

```typescript
function convertTools(tools: UnifiedToolDefinition[], provider: Provider) {
  switch (provider) {
    case "openai":
      return tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
          strict: t.strict,
        },
      }));

    case "anthropic":
      return tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));

    case "google":
      return {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: jsonSchemaToOpenAPI(t.inputSchema), // CRITICAL CONVERSION
        })),
      };
  }
}

// JSON Schema 7 → OpenAPI Schema conversion
function jsonSchemaToOpenAPI(schema: JSONSchema7): OpenAPISchema {
  // Key differences:
  // - OpenAPI uses 'nullable' instead of type: [..., 'null']
  // - OpenAPI uses 'example' instead of 'examples'
  // - Some keywords differ slightly
  return transformSchema(schema);
}
```

---

## 6. Database Schema Recommendations

### 6.1 Conversation Table

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);
```

### 6.2 Messages Table

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  role VARCHAR(20) NOT NULL,  -- 'system', 'user', 'assistant', 'tool'
  content JSONB NOT NULL,      -- Array of content parts
  created_at TIMESTAMP DEFAULT NOW(),

  -- For ordering
  sequence_number INTEGER NOT NULL,

  -- Optional: track which model generated this
  model_id VARCHAR(100),
  provider VARCHAR(50),

  -- Optional: store raw provider response
  raw_response JSONB
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sequence_number);
```

### 6.3 Content Part Schema (JSONB)

```json
{
  "type": "text" | "image" | "file" | "tool-call" | "tool-result" | "reasoning",

  // For text
  "text": "string",

  // For images/files
  "data": "base64...",
  "mediaType": "image/png",
  "filename": "optional",
  "url": "optional",

  // For tool-call
  "toolCallId": "uuid",
  "toolName": "string",
  "input": { ... },

  // For tool-result
  "toolCallId": "uuid",
  "toolName": "string",
  "output": {
    "type": "text" | "json" | "error",
    "value": ...
  },

  // For reasoning
  "signature": "optional"
}
```

### 6.4 Tool Definitions Table (Optional)

```sql
CREATE TABLE tool_definitions (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,  -- JSON Schema 7
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. Implementation Checklist

### 7.1 Core Requirements

- [ ] **Message Role Mapping**

  - [ ] Map `assistant` ↔ `model` for Google
  - [ ] Handle system message placement (top-level vs in array)

- [ ] **Content Part Conversion**

  - [ ] Text parts (trivial)
  - [ ] Image parts (base64 vs URL vs inline data)
  - [ ] Tool call parts (see below)
  - [ ] Reasoning/thinking parts

- [ ] **Tool Call Handling**

  - [ ] Generate tool call IDs for Google (doesn't provide them)
  - [ ] Stringify/parse tool inputs (OpenAI uses strings, others use objects)
  - [ ] Handle tool results placement (separate message vs content block)

- [ ] **Tool Definition Conversion**

  - [ ] JSON Schema 7 → OpenAPI Schema for Google
  - [ ] Tool choice/mode mapping

- [ ] **Response Parsing**
  - [ ] Finish reason mapping
  - [ ] Usage/token counting normalization
  - [ ] Extract tool calls from different locations

### 7.2 Edge Cases to Handle

- [ ] **Anthropic's block grouping**: Tool results must be in user messages
- [ ] **Google's Gemma models**: System instructions prepended to first user message
- [ ] **OpenAI's reasoning models**: Different parameter support (no temperature, etc.)
- [ ] **Empty content**: Some providers don't allow empty messages
- [ ] **Consecutive same-role messages**: May need merging for some providers

### 7.3 Optional Advanced Features

- [ ] **Streaming support**: Different streaming formats per provider
- [ ] **Provider-specific metadata**: Cache control (Anthropic), thought signatures, etc.
- [ ] **Provider-executed tools**: Code execution, web search (provider-specific)
- [ ] **Multimodal content**: Audio, video, documents (PDF, etc.)

---

## Appendix A: Finish Reason Mapping Table

| OpenAI           | Anthropic    | Google                    | Unified          |
| ---------------- | ------------ | ------------------------- | ---------------- |
| `stop`           | `end_turn`   | `STOP`                    | `stop`           |
| `length`         | `max_tokens` | `MAX_TOKENS`              | `length`         |
| `content_filter` | N/A          | `SAFETY`                  | `content-filter` |
| `tool_calls`     | `tool_use`   | `STOP` (with tool calls)  | `tool-calls`     |
| `function_call`  | N/A          | N/A                       | `tool-calls`     |
| N/A              | N/A          | `MALFORMED_FUNCTION_CALL` | `error`          |

---

## Appendix B: Quick Reference - Provider Quirks

### OpenAI

- Tool call arguments are **stringified JSON**
- Tool results are **separate messages** with role `"tool"`
- System messages can be interspersed (but usually first)
- Supports `developer` role for newer models

### Anthropic

- Tool call inputs are **parsed objects**
- Tool results must be **inside user messages** as content blocks
- System messages are **separate top-level field**
- Supports **prompt caching** with TTL per block
- Uses `tool_use_id` (not `tool_call_id`)

### Google/Gemini

- Uses `"model"` instead of `"assistant"` for role
- **No tool call IDs** - correlation by function name only
- Tool results use nested `response.name` and `response.content`
- Requires **OpenAPI Schema** (not JSON Schema 7) for tool definitions
- System instruction is **separate field** (except Gemma: prepend to first user)
- Uses `parts` instead of `content` for message content

---

## Appendix C: Minimal Type Definitions

```typescript
// ============= UNIFIED TYPES =============

export type UnifiedRole = "system" | "user" | "assistant" | "tool";

export interface UnifiedMessage {
  role: UnifiedRole;
  content: string | UnifiedContentPart[];
}

export type UnifiedContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mediaType: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: unknown;
    }
  | { type: "reasoning"; text: string; signature?: string };

export interface UnifiedToolDef {
  name: string;
  description?: string;
  inputSchema: object; // JSON Schema 7
}

export type UnifiedFinishReason =
  | "stop"
  | "length"
  | "tool-calls"
  | "content-filter"
  | "error"
  | "other";

export interface UnifiedResponse {
  content: UnifiedContentPart[];
  finishReason: UnifiedFinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============= NORMALIZER INTERFACE =============

export interface LLMNormalizer<TRequest, TResponse> {
  encodeMessages(messages: UnifiedMessage[]): TRequest;
  encodeTools(tools: UnifiedToolDef[]): unknown;
  decodeResponse(response: TResponse): UnifiedResponse;
}

// Create normalizers for each provider
export const openaiNormalizer: LLMNormalizer<OpenAIRequest, OpenAIResponse>;
export const anthropicNormalizer: LLMNormalizer<
  AnthropicRequest,
  AnthropicResponse
>;
export const googleNormalizer: LLMNormalizer<GoogleRequest, GoogleResponse>;
```

---

## Summary

To build a minimal LLM format normalization utility:

1. **Define a unified message format** that can represent all providers
2. **Handle the 3 critical differences**:
   - System message placement (array vs top-level)
   - Tool call ID generation (Google doesn't provide them)
   - Tool result placement (separate message vs content block)
3. **Convert tool definitions** - especially JSON Schema → OpenAPI for Google
4. **Parse responses** uniformly, mapping finish reasons and extracting content
5. **Store in a provider-agnostic database schema** using JSONB for flexible content

The AI SDK accomplishes this through a `LanguageModelV3` interface that all providers implement, with bidirectional conversion functions in each provider package. A minimal utility can follow the same pattern but skip streaming, middleware, and provider-specific features if not needed.
