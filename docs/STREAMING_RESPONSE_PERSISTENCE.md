# Streaming Response Persistence Architecture

This document explains how streaming responses are accumulated and persisted in the chat system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REQUEST FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Client Request                                                             │
│        │                                                                     │
│        ▼                                                                     │
│   POST /:appId/stream                                                        │
│   { message, sessionId?, model?, temperature? }                              │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 1: Load History from Database                                │   │
│   │  ─────────────────────────────────────────────────────────────────  │   │
│   │  history = chatService.getSessionMessages(sessionId)                │   │
│   │  Each message may have:                                             │   │
│   │    - toolCalls: Array<{id, name, input}>                            │   │
│   │    - toolResults: Array<{callId, name, result, success}>            │   │
│   │                                                                     │   │
│   │  Build historyMessages[] from history:                              │   │
│   │    - user messages → { role: "user", content }                      │   │
│   │    - assistant with tools → { role: "assistant", content: [...] }   │   │
│   │    - tool results → { role: "tool", content, toolCallId }           │   │
│   │                                                                     │   │
│   │  ⚠️ SAFEGUARD: Limit toolResults to min(count, toolCalls*2, 100)    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 2: Agent Loop Execution                                      │   │
│   │  ─────────────────────────────────────────────────────────────────  │   │
│   │                                                                     │   │
│   │  agentLoop(messages, registry, adapter)                             │   │
│   │       │                                                             │   │
│   │       │  maxIterations = 10 (hard limit)                            │   │
│   │       │                                                             │   │
│   │       └──► while (iteration < maxIterations)                        │   │
│   │              │                                                      │   │
│   │              ├──► Stream from LLM adapter                           │   │
│   │              │    └──► yield chunk (text, tool_call, done)          │   │
│   │              │                                                      │   │
│   │              ├──► If hasToolCalls:                                  │   │
│   │              │    for each call in pendingToolCalls:                │   │
│   │              │      ├──► Execute tool                               │   │
│   │              │      ├──► yield { type: "tool_result", callId, ... } │   │
│   │              │      │    (ONE yield per tool execution)             │   │
│   │              │      └──► Add to conversationMessages                │   │
│   │              │                                                      │   │
│   │              └──► Continue loop if tools, else break                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 3: Chat Route Accumulation                                   │   │
│   │  ─────────────────────────────────────────────────────────────────  │   │
│   │                                                                     │   │
│   │  // Fresh arrays per request (inside streamSSE callback)            │   │
│   │  const completedToolCalls = []                                      │   │
│   │  const completedToolResults = []                                    │   │
│   │  const pendingToolCalls = new Map()                                 │   │
│   │                                                                     │   │
│   │  for await (const chunk of agentStream):                            │   │
│   │    case "tool_call":                                                │   │
│   │      pendingToolCalls.set(call.id, {...})                           │   │
│   │      completedToolCalls.push({...})                                 │   │
│   │                                                                     │   │
│   │    case "tool_result":                                              │   │
│   │      if (pendingToolCalls.has(callId)):                             │   │
│   │        completedToolResults.push({...})  ← ONE push per result      │   │
│   │        pendingToolCalls.delete(callId)                              │   │
│   │                                                                     │   │
│   │    case "tool_error":                                               │   │
│   │      (same pattern as tool_result)                                  │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 4: Message Persistence                                       │   │
│   │  ─────────────────────────────────────────────────────────────────  │   │
│   │                                                                     │   │
│   │  chatService.addMessage(sessionId, "assistant", content, {          │   │
│   │    model: modelId,                                                  │   │
│   │    toolCalls: completedToolCalls,      // JSON.stringify'd          │   │
│   │    toolResults: completedToolResults,  // JSON.stringify'd          │   │
│   │  })                                                                 │   │
│   │                                                                     │   │
│   │  // INSERT INTO chat.messages (no UPDATE, no merge)                 │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Invariants

### 1. One Yield Per Tool Execution

The agent loop yields exactly ONE `tool_result` per tool execution:

```typescript
// loop.ts:158-162
yield {
  type: "tool_result",
  callId: call.id,
  result: executionResult.result,
};
```

### 2. One Push Per Result (with Guard)

The chat route only pushes to `completedToolResults` if the callId is found AND not yet processed:

```typescript
// index.ts:885-903
case "tool_result": {
  const toolCall = pendingToolCalls.get(chunk.callId);
  if (toolCall) {
    completedToolResults.push({...});
    pendingToolCalls.delete(chunk.callId); // Prevents double-processing
  }
}
```

### 3. Fresh Arrays Per Request

Arrays are initialized inside the `streamSSE` callback, ensuring they're fresh per request:

```typescript
// index.ts:764-774
const completedToolCalls: Array<{...}> = [];
const completedToolResults: Array<{...}> = [];
```

### 4. Maximum Iterations

The agent loop has a hard limit of 10 iterations (configurable via `maxIterations`):

```typescript
// loop.ts:46
const maxIterations = options.maxIterations ?? 10;
```

## Safeguards Against Corrupted Data

### History Loading Safeguard

When loading history with corrupted toolResults, the system now limits results:

```typescript
// index.ts:588-602
const maxToolResults = Math.min(
  toolResults.length,
  toolCalls.length * 2,
  100 // Hard limit
);
if (toolResults.length > maxToolResults) {
  console.warn(
    `[chat] Corrupted data detected: ${toolResults.length} toolResults...`
  );
}
```

### Save Warning

When saving, the system warns if too many results are being persisted:

```typescript
// index.ts:1040
if (completedToolResults.length > 100) {
  console.error(
    `[chat] WARNING: Attempting to save ${completedToolResults.length} tool results...`
  );
}
```

## Theoretical Maximum Tool Results

Given the architecture:

- Max iterations: 10
- Max tools per iteration: ~20 (practical limit due to context window)
- Maximum tool results per message: 10 × 20 = 200

Any value significantly higher (like 37,130) indicates data corruption.

## Known Issue: 37,130 Tool Results (Investigation)

A message was found with 37,130 tool results stored in the database. Based on analysis:

1. **Not from request body** - The schema only accepts `{message, sessionId?, model?, temperature?}`
2. **Not from array concatenation** - No code merges toolResults arrays
3. **Not from message UPDATE** - addMessage is INSERT only
4. **Not from runaway loop** - maxIterations caps at 10

### Possible Causes (Under Investigation)

- Memory corruption during JSON serialization
- Race condition in async generator consumption
- Database driver bug during JSONB serialization
- External system corruption

### Mitigation

The safeguard at history loading prevents corrupted data from crashing requests.

## Files Involved

| File                                        | Purpose                                   |
| ------------------------------------------- | ----------------------------------------- |
| `src/agent/loop.ts`                         | Agent execution loop, yields tool results |
| `src/api/routes/chat/index.ts`              | Accumulates results, persists messages    |
| `src/services/chat.service.ts`              | Database operations (addMessage)          |
| `src/llm/providers/stripe-token-billing.ts` | LLM streaming, yields chunks              |
| `src/api/validators/chat.ts`                | Request validation schemas                |
