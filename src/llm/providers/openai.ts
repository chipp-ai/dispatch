/**
 * OpenAI Provider
 *
 * Streaming chat completions with tool support.
 * Uses the native OpenAI SDK which works with Deno.
 */

import OpenAI from "openai";
import { zodToJsonSchema } from "npm:zod-to-json-schema@3.23.5";
import type {
  LLMProvider,
  Message,
  Tool,
  StreamChunk,
  StreamOptions,
  ToolCall,
} from "../types.ts";
import * as Sentry from "@sentry/deno";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? Deno.env.get("OPENAI_API_KEY"),
    });
  }

  /**
   * Convenience method for streaming chat without tools
   */
  chat(
    messages: Message[],
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk> {
    return this.stream(messages, [], options);
  }

  async *stream(
    messages: Message[],
    tools: Tool[],
    options: StreamOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const {
      model = "gpt-4o",
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt,
    } = options;

    // Prepend system prompt if provided
    const allMessages = systemPrompt
      ? [
          { role: "system" as const, content: systemPrompt },
          ...this.formatMessages(messages),
        ]
      : this.formatMessages(messages);

    // GPT-5 and o1/o3 models have different parameter requirements
    const isReasoningModel =
      model.includes("gpt-5") || model.includes("o1-") || model.includes("o3-");

    // Validate temperature - ensure it's a valid number between 0 and 2 (OpenAI allows up to 2)
    const validTemperature =
      typeof temperature === "number" && !isNaN(temperature)
        ? Math.max(0, Math.min(2, temperature))
        : 0.7;

    const response = await this.client.chat.completions.create({
      model,
      messages: allMessages,
      tools: tools.length > 0 ? this.formatTools(tools) : undefined,
      // Reasoning models don't support custom temperature (only default 1)
      ...(isReasoningModel ? {} : { temperature: validTemperature }),
      // Reasoning models use max_completion_tokens instead of max_tokens
      ...(isReasoningModel
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      stream: true,
    });

    let currentToolCall:
      | (Partial<ToolCall> & { rawArguments?: string })
      | null = null;

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      // Text content
      if (delta?.content) {
        yield { type: "text", delta: delta.content };
      }

      // Tool calls
      if (delta?.tool_calls?.[0]) {
        const tc = delta.tool_calls[0];

        if (tc.id) {
          // Complete previous tool call if exists
          if (currentToolCall?.id) {
            try {
              const parsedArgs = JSON.parse(
                currentToolCall.rawArguments ?? "{}"
              );
              yield {
                type: "tool_call",
                call: {
                  id: currentToolCall.id,
                  name: currentToolCall.name!,
                  arguments: parsedArgs,
                },
              };
            } catch (parseError) {
              // Invalid JSON, skip this tool call
              console.error("Failed to parse tool call arguments");
              Sentry.captureException(parseError, {
                tags: { source: "openai-provider", feature: "tool-call-parse" },
                extra: { model },
              });
            }
          }

          // Start new tool call
          currentToolCall = {
            id: tc.id,
            name: tc.function?.name ?? "",
            rawArguments: "",
          };
        }

        // Accumulate arguments
        if (tc.function?.arguments && currentToolCall) {
          currentToolCall.rawArguments += tc.function.arguments;
          yield {
            type: "tool_call_delta",
            id: currentToolCall.id!,
            delta: tc.function.arguments,
          };
        }
      }

      // Stream finished
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        // Complete final tool call if exists
        if (currentToolCall?.id) {
          try {
            const parsedArgs = JSON.parse(currentToolCall.rawArguments ?? "{}");
            yield {
              type: "tool_call",
              call: {
                id: currentToolCall.id,
                name: currentToolCall.name!,
                arguments: parsedArgs,
              },
            };
          } catch (parseError) {
            console.error("Failed to parse final tool call arguments");
            Sentry.captureException(parseError, {
              tags: {
                source: "openai-provider",
                feature: "final-tool-call-parse",
              },
              extra: { model },
            });
          }
        }

        yield {
          type: "done",
          finishReason,
          hasToolCalls: finishReason === "tool_calls",
        };
      }
    }
  }

  private formatMessages(
    messages: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role === "tool") {
        // Tool messages must have string content
        const content =
          typeof m.content === "string"
            ? m.content
            : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
        return {
          role: "tool" as const,
          content,
          tool_call_id: m.toolCallId!,
        };
      }
      if (m.role === "assistant") {
        // Assistant messages can have string or array content (with tool_use blocks)
        if (typeof m.content === "string") {
          return {
            role: "assistant" as const,
            content: m.content,
          };
        }
        // Array content - extract text and tool_calls
        const textParts = m.content
          .filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("");
        const toolUseParts = m.content.filter((p) => p.type === "tool_use");
        if (toolUseParts.length > 0) {
          return {
            role: "assistant" as const,
            content: textParts || null,
            tool_calls: toolUseParts.map((p) => {
              const toolUse = p as {
                type: "tool_use";
                id: string;
                name: string;
                input: Record<string, unknown>;
              };
              return {
                id: toolUse.id,
                type: "function" as const,
                function: {
                  name: toolUse.name,
                  arguments: JSON.stringify(toolUse.input),
                },
              };
            }),
          };
        }
        return {
          role: "assistant" as const,
          content: textParts,
        };
      }
      if (m.role === "system") {
        // System messages must have string content
        const content =
          typeof m.content === "string"
            ? m.content
            : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
        return {
          role: "system" as const,
          content,
        };
      }

      // User messages can have multimodal content
      if (Array.isArray(m.content)) {
        // Convert to OpenAI's multimodal format
        return {
          role: "user" as const,
          content: m.content
            .filter((part) => part.type === "text" || part.type === "image_url")
            .map((part) => {
              if (part.type === "text") {
                return { type: "text" as const, text: part.text };
              }
              // image_url part - we know it's ImageContentPart after the filter above
              if (part.type === "image_url") {
                return {
                  type: "image_url" as const,
                  image_url: { url: part.image_url.url },
                };
              }
              // Fallback (should never reach due to filter)
              return { type: "text" as const, text: "" };
            })
            .filter((p) => p.type !== "text" || p.text !== ""),
        };
      }

      return {
        role: "user" as const,
        content: m.content,
      };
    });
  }

  private formatTools(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters) as Record<string, unknown>,
      },
    }));
  }
}
