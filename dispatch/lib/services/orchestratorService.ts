/**
 * Orchestrator Service
 *
 * Agent loop that streams Anthropic responses and executes tool calls.
 * Yields SSE events: text_delta, tool_start, tool_result, error, done.
 */

import Anthropic from "@anthropic-ai/sdk";
import { tools, executeTool } from "./orchestratorTools";
import {
  getSession,
  getLatestSession,
  createSession,
  saveMessages,
} from "./orchestratorSessionService";
import { getOrCreateDefaultWorkspace } from "./workspaceService";

const MODEL = process.env.ORCHESTRATOR_MODEL || "claude-sonnet-4-5-20250929";
const MAX_TOKENS = parseInt(process.env.ORCHESTRATOR_MAX_TOKENS || "4096", 10);
const MAX_TOOL_ROUNDS = parseInt(
  process.env.ORCHESTRATOR_MAX_TOOL_ROUNDS || "10",
  10
);

const SYSTEM_PROMPT = `You are the Dispatch orchestrator — a terse, technical terminal assistant for managing an AI-powered issue tracker.

Your personality:
- Terminal native. Short, direct responses. No fluff.
- Use markdown for structure: headers, lists, code blocks, bold.
- When showing issue identifiers, always use the CHIPP-XXX format.
- Think in small, independently-shippable issues. When decomposing features, break them into 3-7 concrete issues.

Your capabilities:
- Search existing issues before creating duplicates.
- Create individual issues or batch-decompose features.
- Spawn autonomous Claude Code agents to investigate or implement issues.
- Check board status, agent activity, and costs.
- Update issue metadata (status, priority, labels).

Rules:
- Always search before creating to avoid duplicates.
- Ask a clarifying question before decomposing a large feature — confirm scope, priority, and approach.
- Before spawning agents, confirm with the user. Never auto-spawn without explicit approval.
- When creating issues, write clear descriptions with acceptance criteria.
- When presenting options, format them as a numbered list so the user can pick by number.
- If something fails, explain what happened and suggest next steps.`;

type MessageParam = Anthropic.MessageParam;

export interface SSEEvent {
  type:
    | "text_delta"
    | "tool_start"
    | "tool_result"
    | "usage"
    | "error"
    | "done"
    | "session_id";
  data: string;
}

/**
 * Run a single user turn through the orchestrator.
 * Yields SSE events as an async generator.
 */
export async function* orchestrate(
  userMessage: string,
  sessionId?: string
): AsyncGenerator<SSEEvent> {
  const client = new Anthropic();
  const workspace = await getOrCreateDefaultWorkspace();

  // Load or create session
  let session = sessionId
    ? await getSession(sessionId)
    : await getLatestSession(workspace.id);

  if (!session) {
    session = await createSession(workspace.id);
  }

  yield { type: "session_id", data: session.id };

  // Append user message
  const messages: MessageParam[] = [
    ...session.messages,
    { role: "user", content: userMessage },
  ];

  let toolRound = 0;

  while (toolRound < MAX_TOOL_ROUNDS) {
    toolRound++;

    // Stream the response, buffering complete content blocks
    let assistantContent: Anthropic.ContentBlock[] = [];
    let stopReason: string | null = null;
    let blockBuffer = ""; // Buffer text within a content block
    let currentBlockType: string | null = null;

    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          blockBuffer = "";
          currentBlockType = event.content_block.type;
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_start",
              data: JSON.stringify({
                id: event.content_block.id,
                name: event.content_block.name,
              }),
            };
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            blockBuffer += event.delta.text;
          }
        } else if (event.type === "content_block_stop") {
          // Flush the buffered text as a single atomic chunk
          if (currentBlockType === "text" && blockBuffer) {
            yield { type: "text_delta", data: blockBuffer };
            blockBuffer = "";
          }
          currentBlockType = null;
        } else if (event.type === "message_stop") {
          const finalMessage = await stream.finalMessage();
          assistantContent = finalMessage.content;
          stopReason = finalMessage.stop_reason;

          // Emit usage metrics for this API call
          const usage = finalMessage.usage;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usageAny = usage as any;
          yield {
            type: "usage",
            data: JSON.stringify({
              input_tokens: usage?.input_tokens ?? 0,
              output_tokens: usage?.output_tokens ?? 0,
              cache_read_input_tokens:
                usageAny?.cache_read_input_tokens ?? 0,
              cache_creation_input_tokens:
                usageAny?.cache_creation_input_tokens ?? 0,
            }),
          };
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      yield { type: "error", data: msg };
      break;
    }

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: assistantContent });

    // If no tool calls, we're done
    if (stopReason !== "tool_use") {
      break;
    }

    // Execute tool calls
    const toolUseBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>
      );

      yield {
        type: "tool_result",
        data: JSON.stringify({
          tool_use_id: toolUse.id,
          name: toolUse.name,
          result,
        }),
      };

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Append tool results and continue the loop
    messages.push({ role: "user", content: toolResults });
  }

  // Save conversation
  await saveMessages(session.id, messages);

  yield { type: "done", data: session.id };
}
