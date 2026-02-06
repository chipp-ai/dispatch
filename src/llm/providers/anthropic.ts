/**
 * Anthropic Provider
 *
 * Streaming chat completions with tool support.
 * Uses the native Anthropic SDK which works with Deno.
 */

import Anthropic from "@anthropic-ai/sdk";
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

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? Deno.env.get("ANTHROPIC_API_KEY"),
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
      model = "claude-sonnet-4-20250514",
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt,
    } = options;

    // formatMessages is now async to handle image URL fetching
    const formattedMessages = await this.formatMessages(messages);
    const formattedTools =
      tools.length > 0 ? this.formatTools(tools) : undefined;

    // Validate temperature - ensure it's a valid number between 0 and 1
    const validTemperature =
      typeof temperature === "number" && !isNaN(temperature)
        ? Math.max(0, Math.min(1, temperature))
        : 0.7;

    const stream = await this.client.messages.create({
      model,
      messages: formattedMessages,
      tools: formattedTools,
      system: systemPrompt,
      max_tokens: maxTokens,
      temperature: validTemperature,
      stream: true,
    });

    // Track current tool use block
    const toolCalls = new Map<
      number,
      Partial<ToolCall> & { rawInput?: string }
    >();
    let currentToolIndex = -1;

    for await (const event of stream) {
      // Handle different event types
      switch (event.type) {
        case "content_block_start": {
          if (event.content_block.type === "tool_use") {
            currentToolIndex = event.index;
            toolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              rawInput: "",
            });
          }
          break;
        }

        case "content_block_delta": {
          if (event.delta.type === "text_delta") {
            yield { type: "text", delta: event.delta.text };
          }

          if (event.delta.type === "input_json_delta") {
            const toolCall = toolCalls.get(event.index);
            if (toolCall) {
              toolCall.rawInput =
                (toolCall.rawInput ?? "") + event.delta.partial_json;
              yield {
                type: "tool_call_delta",
                id: toolCall.id!,
                delta: event.delta.partial_json,
              };
            }
          }
          break;
        }

        case "content_block_stop": {
          const toolCall = toolCalls.get(event.index);
          if (toolCall?.id) {
            try {
              const parsedArgs = JSON.parse(toolCall.rawInput ?? "{}");
              yield {
                type: "tool_call",
                call: {
                  id: toolCall.id,
                  name: toolCall.name!,
                  arguments: parsedArgs,
                },
              };
            } catch (parseError) {
              console.error("Failed to parse Anthropic tool call arguments");
              Sentry.captureException(parseError, {
                tags: {
                  source: "anthropic-provider",
                  feature: "tool-call-parse",
                },
                extra: { model },
              });
            }
          }
          break;
        }

        case "message_stop": {
          // Get stop reason from the accumulated message
          const hasToolCalls = toolCalls.size > 0;
          yield {
            type: "done",
            finishReason: hasToolCalls ? "tool_use" : "end_turn",
            hasToolCalls,
          };
          break;
        }
      }
    }
  }

  private async formatMessages(
    messages: Message[]
  ): Promise<Anthropic.MessageParam[]> {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Skip system messages - handled via system param
        continue;
      }

      if (msg.role === "tool") {
        // Tool results go into a user message with tool_result block
        const content =
          typeof msg.content === "string"
            ? msg.content
            : msg.content
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId!,
              content,
            },
          ],
        });
        continue;
      }

      if (msg.role === "assistant") {
        // Assistant messages can have string or array content (with tool_use blocks)
        if (typeof msg.content === "string") {
          result.push({
            role: "assistant",
            content: msg.content,
          });
        } else {
          // Array content - convert to Anthropic format
          const contentBlocks: Array<
            Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam
          > = [];
          for (const part of msg.content) {
            if (part.type === "text" && part.text) {
              contentBlocks.push({ type: "text", text: part.text });
            } else if (part.type === "tool_use") {
              contentBlocks.push({
                type: "tool_use",
                id: part.id,
                name: part.name,
                input: part.input,
              });
            }
          }
          if (contentBlocks.length > 0) {
            result.push({
              role: "assistant",
              content: contentBlocks,
            });
          }
        }
        continue;
      }

      // User message - can have multimodal content
      if (Array.isArray(msg.content)) {
        // Convert to Anthropic's multimodal format
        const contentBlocks: Array<
          Anthropic.TextBlockParam | Anthropic.ImageBlockParam
        > = [];
        for (const part of msg.content) {
          if (part.type === "text" && part.text) {
            contentBlocks.push({ type: "text", text: part.text });
          } else if (part.type === "image_url") {
            // Anthropic requires base64 encoded images
            const imageData = await this.fetchImageAsBase64(part.image_url.url);
            if (imageData) {
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageData.mediaType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/gif"
                    | "image/webp",
                  data: imageData.base64,
                },
              });
            }
          }
        }
        if (contentBlocks.length > 0) {
          result.push({
            role: "user",
            content: contentBlocks,
          });
        }
        continue;
      }

      result.push({
        role: "user",
        content: msg.content,
      });
    }

    return result;
  }

  /**
   * Fetch an image from URL and convert to base64
   */
  private async fetchImageAsBase64(
    url: string
  ): Promise<{ base64: string; mediaType: string } | null> {
    try {
      console.log(`[anthropic] Fetching image for base64 conversion: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[anthropic] Failed to fetch image: ${response.status}`);
        Sentry.captureMessage(`[anthropic] Failed to fetch image: ${response.status}`, {
          level: "error",
          tags: { source: "llm", provider: "anthropic", feature: "fetch-image" },
          extra: { imageUrl: url, statusCode: response.status },
        });
        return null;
      }

      const contentType =
        response.headers.get("content-type") || this.getMimeTypeFromUrl(url);
      const arrayBuffer = await response.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      console.log(
        `[anthropic] Image converted: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB, type: ${contentType}`
      );
      return { base64, mediaType: contentType };
    } catch (error) {
      console.error(`[anthropic] Error fetching image:`, error);
      Sentry.captureException(error, {
        tags: { source: "anthropic-provider", feature: "fetch-image" },
        extra: { imageUrl: url },
      });
      return null;
    }
  }

  /**
   * Infer MIME type from URL
   */
  private getMimeTypeFromUrl(url: string): string {
    const lowercaseUrl = url.toLowerCase();
    if (lowercaseUrl.includes(".png")) return "image/png";
    if (lowercaseUrl.includes(".jpg") || lowercaseUrl.includes(".jpeg"))
      return "image/jpeg";
    if (lowercaseUrl.includes(".gif")) return "image/gif";
    if (lowercaseUrl.includes(".webp")) return "image/webp";
    return "image/jpeg"; // default
  }

  private formatTools(tools: Tool[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.parameters) as Anthropic.Tool.InputSchema,
    }));
  }
}
