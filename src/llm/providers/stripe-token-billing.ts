/**
 * Stripe Token Billing Provider
 *
 * Routes LLM requests through Stripe's Token Billing proxy (https://llm.stripe.com)
 * for automatic usage-based billing attribution.
 *
 * Key features:
 * - Passes X-Stripe-Customer-ID header for billing attribution
 * - Supports all models available via Stripe Token Billing
 * - Handles parameter transformation for different model capabilities
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
  BillingContext,
} from "../types.ts";
import {
  MODEL_TO_STRIPE,
  transformModelParameters,
  stripeModelRequiresResponsesApi,
  getProviderFromModel,
  BYOK_SUPPORTED_PROVIDERS,
  type ByokProviderName,
} from "./stripe-model-mapping.ts";
import * as Sentry from "@sentry/deno";
import { GoogleProvider } from "./google.ts";

// Stripe Token Billing configuration
const STRIPE_LLM_BASE_URL = "https://llm.stripe.com";

/**
 * Get the appropriate Stripe API key based on sandbox mode
 */
function getStripeApiKey(useSandbox: boolean): string | null {
  if (useSandbox) {
    return Deno.env.get("STRIPE_SANDBOX_KEY") || null;
  }
  return Deno.env.get("STRIPE_CHIPP_KEY") || null;
}

export class StripeTokenBillingProvider implements LLMProvider {
  readonly name = "stripe-token-billing";
  private billingContext: BillingContext;

  constructor(billingContext: BillingContext) {
    this.billingContext = billingContext;
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

  /**
   * Check if any message contains video content parts
   */
  private hasVideoContent(messages: Message[]): boolean {
    return messages.some(
      (m) =>
        Array.isArray(m.content) &&
        m.content.some((p) => p.type === "input_video")
    );
  }

  /**
   * Check if any message contains audio content parts
   */
  private hasAudioContent(messages: Message[]): boolean {
    return messages.some(
      (m) =>
        Array.isArray(m.content) &&
        m.content.some((p) => p.type === "input_audio")
    );
  }

  /**
   * Map model name to Stripe Token Billing format
   */
  private mapModelName(model: string): string {
    // Check mapping table
    if (MODEL_TO_STRIPE[model]) {
      return MODEL_TO_STRIPE[model];
    }

    // Check lowercase version
    const lowerModel = model.toLowerCase().replace(/_/g, "-");
    if (MODEL_TO_STRIPE[lowerModel]) {
      return MODEL_TO_STRIPE[lowerModel];
    }

    // Assume it's already in provider/model format
    return model;
  }

  /**
   * Get the customer ID for billing attribution.
   * Every organization must have a Stripe customer ID.
   */
  private getCustomerId(): string | null {
    return this.billingContext.stripeCustomerId || null;
  }

  /**
   * Get Chipp's API key for a given provider from environment variables.
   * Used for BYOK (Bring Your Own Key) with Stripe Token Billing.
   *
   * Note: Only OpenAI supports BYOK. Anthropic and Google requests are routed
   * through Stripe's proxy directly without BYOK credential support.
   */
  private getChippApiKey(provider: ByokProviderName): string | null {
    switch (provider) {
      case "openai":
        return Deno.env.get("OPENAI_API_KEY") || null;
      default:
        return null;
    }
  }

  /**
   * Build the stripe.provider block for BYOK requests.
   * Uses Chipp's API keys from environment variables.
   * Returns null if:
   * - The provider is not supported for BYOK (only OpenAI currently)
   * - The provider's API key is not configured
   */
  private buildByokProviderBlock(
    stripeModelId: string
  ): { name: string; credential: { api_key: string } } | null {
    const provider = getProviderFromModel(stripeModelId);
    if (!provider) return null;

    // Only enable BYOK for providers that Stripe actually supports
    if (!BYOK_SUPPORTED_PROVIDERS.has(provider)) {
      return null;
    }

    const apiKey = this.getChippApiKey(provider);
    if (!apiKey) return null;

    return {
      name: provider,
      credential: {
        api_key: apiKey,
      },
    };
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

    const mappedModel = this.mapModelName(model);
    const useSandbox = this.billingContext.useSandboxForUsageBilling ?? false;

    // Get API key
    const apiKey = getStripeApiKey(useSandbox);
    if (!apiKey) {
      throw new Error(
        `Stripe Token Billing: ${useSandbox ? "STRIPE_SANDBOX_KEY" : "STRIPE_CHIPP_KEY"} not configured`
      );
    }

    // Get customer ID for billing attribution
    const customerId = this.getCustomerId();

    // Validate billing setup - every organization must have a Stripe customer ID
    if (!customerId) {
      throw new Error(
        "Stripe Token Billing: No Stripe customer ID available. " +
          "Every organization must have a Stripe customer ID for billing attribution."
      );
    }

    // TEMPORARY: Bypass Stripe proxy for Gemini + video/audio content.
    // Stripe's proxy has a ~1MB payload limit that prevents sending video as base64,
    // and doesn't support Gemini's file_data content type for URL-based video.
    // For audio, the OpenAI-compatible API only accepts wav/mp3 in input_audio.format,
    // but Gemini's native API accepts audio/webm via inlineData. Bypass for both.
    if (
      (this.hasVideoContent(messages) || this.hasAudioContent(messages)) &&
      model.startsWith("gemini")
    ) {
      console.log(
        "[stripe-token-billing] Bypassing Stripe proxy for Gemini media request (direct Google API)"
      );
      const googleProvider = new GoogleProvider();
      yield* googleProvider.stream(messages, tools, options);
      return;
    }

    // Check if model requires Responses API (o1-pro, o3-pro, gpt-5)
    if (stripeModelRequiresResponsesApi(mappedModel)) {
      // Use Responses API for these models
      yield* this.streamResponsesApi(
        messages,
        tools,
        mappedModel,
        apiKey,
        customerId,
        options
      );
      return;
    }

    // Create OpenAI client with Stripe proxy
    const client = new OpenAI({
      baseURL: STRIPE_LLM_BASE_URL,
      apiKey,
      timeout: 60000,
      maxRetries: 0, // Stripe handles retries
      defaultHeaders: {
        "X-Stripe-Customer-ID": customerId,
      },
    });

    // Prepend system prompt if provided
    const allMessages = systemPrompt
      ? [
          { role: "system" as const, content: systemPrompt },
          ...this.formatMessages(messages),
        ]
      : this.formatMessages(messages);

    // Build request payload for streaming
    // Note: Stripe requires stream_options.include_usage = true for billing attribution
    const requestPayload: Record<string, unknown> = {
      model: mappedModel,
      messages: allMessages,
      tools: tools.length > 0 ? this.formatTools(tools) : undefined,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    // Transform parameters based on model capabilities (modifies in place)
    transformModelParameters(mappedModel, requestPayload, false);

    // Add BYOK credentials if available
    const byokProvider = this.buildByokProviderBlock(mappedModel);
    if (byokProvider) {
      requestPayload.stripe = { provider: byokProvider };
    }

    console.log("[stripe-token-billing] Request", {
      model: mappedModel,
      originalModel: model,
      customerId,
      messageCount: allMessages.length,
      byokEnabled: !!byokProvider,
      byokProvider: byokProvider?.name,
    });

    // Cast through unknown since we're adding Stripe-specific extension properties
    // that aren't in the OpenAI SDK types
    const response = await client.chat.completions.create(
      requestPayload as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming
    );

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
        console.log("[stripe-token-billing] Tool call chunk", {
          tcId: tc.id,
          tcIndex: tc.index,
          tcFunction: tc.function,
        });

        // Check if this is a new tool call (has ID or name for the first time)
        const isNewToolCall = tc.id || (tc.function?.name && !currentToolCall);

        // Capture previous name before any state changes (explicit type to avoid inference loop)
        const previousToolCallName: string | undefined = currentToolCall
          ? currentToolCall.name
          : undefined;

        if (isNewToolCall) {
          // Complete previous tool call if exists
          if (currentToolCall?.id) {
            try {
              const rawArgs = currentToolCall.rawArguments?.trim() || "{}";
              const parsedArgs = JSON.parse(rawArgs);
              yield {
                type: "tool_call",
                call: {
                  id: currentToolCall.id,
                  name: currentToolCall.name!,
                  arguments: parsedArgs,
                },
              };
            } catch (parseError) {
              console.error(
                "[stripe-token-billing] Failed to parse tool call arguments"
              );
              Sentry.captureException(parseError instanceof Error ? parseError : new Error(String(parseError)), {
                tags: { source: "llm", feature: "token-billing", operation: "tool-call-parse" },
                extra: { model: mappedModel, customerId },
              });
              // Still emit the tool call with empty args
              yield {
                type: "tool_call",
                call: {
                  id: currentToolCall.id,
                  name: currentToolCall.name!,
                  arguments: {},
                },
              };
            }
          }

          // Start new tool call - use ID if available, otherwise generate one
          const toolCallId = tc.id || `call_${Date.now()}_${tc.index ?? 0}`;
          currentToolCall = {
            id: toolCallId,
            name: tc.function?.name ?? previousToolCallName ?? "",
            rawArguments: "",
          };
        }

        // Update name if provided (some APIs send name in separate chunk)
        if (tc.function?.name && currentToolCall) {
          currentToolCall.name = tc.function.name;
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
          console.log("[stripe-token-billing] Final tool call", {
            id: currentToolCall.id,
            name: currentToolCall.name,
            rawArguments: currentToolCall.rawArguments,
          });
          try {
            // Handle empty arguments (tools with no params)
            const rawArgs = currentToolCall.rawArguments?.trim() || "{}";
            const parsedArgs = JSON.parse(rawArgs);
            yield {
              type: "tool_call",
              call: {
                id: currentToolCall.id,
                name: currentToolCall.name!,
                arguments: parsedArgs,
              },
            };
          } catch (parseError) {
            console.error(
              "[stripe-token-billing] Failed to parse final tool call arguments",
              {
                rawArguments: currentToolCall.rawArguments,
                error: parseError,
              }
            );
            Sentry.captureException(parseError instanceof Error ? parseError : new Error(String(parseError)), {
              tags: { source: "llm", feature: "token-billing", operation: "final-tool-call-parse" },
              extra: { model: mappedModel, customerId, rawArguments: currentToolCall.rawArguments },
            });
            // Still emit the tool call with empty args rather than failing
            yield {
              type: "tool_call",
              call: {
                id: currentToolCall.id,
                name: currentToolCall.name!,
                arguments: {},
              },
            };
          }
        }

        // Extract usage from response if available
        const usage = (chunk as any).usage;

        yield {
          type: "done",
          finishReason,
          hasToolCalls: finishReason === "tool_calls",
          usage: usage
            ? {
                inputTokens: usage.prompt_tokens ?? 0,
                outputTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
                model: mappedModel,
              }
            : undefined,
        };
      }
    }
  }

  /**
   * Stream from Responses API for models that require it (o1-pro, o3-pro, gpt-5)
   */
  private async *streamResponsesApi(
    messages: Message[],
    tools: Tool[],
    model: string,
    apiKey: string,
    customerId: string,
    options: StreamOptions
  ): AsyncGenerator<StreamChunk> {
    const { maxTokens = 4096, systemPrompt } = options;

    // Check if this is a follow-up after tool calls (messages contain tool results)
    const hasToolResults = messages.some((m) => m.role === "tool");

    // Count function calls for logging (used to determine if this is a follow-up turn)
    let functionCallCount = 0;
    for (const msg of messages) {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        functionCallCount += msg.content.filter(
          (p) => p.type === "tool_use"
        ).length;
      }
    }

    const isFollowUp = hasToolResults && functionCallCount > 0;

    // Build input based on whether this is a follow-up or initial request
    let input: unknown[];

    if (isFollowUp) {
      // For follow-up requests with ZDR (Zero Data Retention), we need to include
      // the full conversation history since the model doesn't remember anything.
      // IMPORTANT: Maintain chronological message order for the model to understand context.
      input = [];

      for (const msg of messages) {
        if (msg.role === "user") {
          // User messages
          if (typeof msg.content === "string") {
            input.push({ role: "user", content: msg.content });
          } else {
            const content = msg.content.map((p) => {
              if (p.type === "text") {
                return { type: "input_text", text: p.text };
              }
              if (p.type === "image_url") {
                return { type: "input_image", image_url: p.image_url.url };
              }
              if (p.type === "input_audio") {
                return {
                  type: "input_audio",
                  input_audio: (
                    p as {
                      type: "input_audio";
                      input_audio: { data: string; format: string };
                    }
                  ).input_audio,
                };
              }
              if (p.type === "input_video") {
                return {
                  type: "input_video",
                  video_url: (
                    p as {
                      type: "input_video";
                      input_video: { url: string; mimeType: string };
                    }
                  ).input_video.url,
                };
              }
              return { type: "input_text", text: "" };
            });
            input.push({ role: "user", content });
          }
        } else if (msg.role === "assistant") {
          // Assistant messages - handle both text-only and messages with tool_use
          if (Array.isArray(msg.content)) {
            const textParts = msg.content
              .filter((p) => p.type === "text")
              .map((p) => (p as { type: "text"; text: string }).text)
              .join("");
            const toolUseParts = msg.content.filter(
              (p) => p.type === "tool_use"
            );

            // Add text content first (the assistant's explanation)
            if (textParts) {
              input.push({ role: "assistant", content: textParts });
            }

            // Add function_call items for tool_use
            for (const part of toolUseParts) {
              const tu = part as {
                type: "tool_use";
                id?: string;
                name?: string;
                input?: Record<string, unknown>;
              };
              if (tu.name) {
                const callId = tu.id || `call_${crypto.randomUUID()}`;
                input.push({
                  type: "function_call",
                  call_id: callId,
                  name: tu.name,
                  arguments: JSON.stringify(tu.input || {}),
                });
              }
            }
          } else if (typeof msg.content === "string" && msg.content) {
            // Simple string content
            input.push({ role: "assistant", content: msg.content });
          }
        } else if (msg.role === "tool") {
          // Tool results become function_call_output items
          if (msg.toolCallId) {
            input.push({
              type: "function_call_output",
              call_id: msg.toolCallId,
              output:
                typeof msg.content === "string"
                  ? msg.content
                  : JSON.stringify(msg.content),
            });
          }
        } else if (msg.role === "system") {
          // System messages
          const content =
            typeof msg.content === "string"
              ? msg.content
              : msg.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("");
          if (content) {
            input.push({ role: "system", content });
          }
        }
      }
    } else {
      // For initial requests, format all messages
      input = this.formatMessagesForResponsesApi(messages);
    }

    // Build request payload with streaming enabled
    const requestPayload: Record<string, unknown> = {
      model,
      input,
      max_output_tokens: maxTokens,
      store: false, // ZDR prevents storing, use false to avoid errors
      stream: true, // Enable streaming for incremental responses
    };

    // Add system instructions if provided
    if (systemPrompt) {
      requestPayload.instructions = systemPrompt;
    }

    // Add tools if provided (must be sent on every turn)
    if (tools.length > 0) {
      requestPayload.tools = tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters) as Record<string, unknown>,
      }));
    }

    // Add BYOK credentials if available
    const byokProvider = this.buildByokProviderBlock(model);
    if (byokProvider) {
      requestPayload.stripe = { provider: byokProvider };
    }

    // Debug: log what we're actually sending
    console.log("[stripe-token-billing] Responses API Request", {
      model,
      customerId,
      inputCount: Array.isArray(input) ? input.length : 0,
      toolCount: tools.length,
      isFollowUp,
      functionCallCount,
      byokEnabled: !!byokProvider,
      byokProvider: byokProvider?.name,
      // Debug: show structure of input messages
      inputStructure: Array.isArray(input)
        ? input.map((item: any) => ({
            type: item.type || item.role,
            hasContent: !!item.content,
            contentLength:
              typeof item.content === "string"
                ? item.content.length
                : Array.isArray(item.content)
                  ? item.content.length
                  : 0,
          }))
        : "not-array",
    });

    const response = await fetch(`${STRIPE_LLM_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Stripe-Customer-ID": customerId,
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Stripe Token Billing Responses API error: ${response.status} - ${errorBody}`
      );
    }

    // Handle streaming SSE response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body available for streaming");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCalls: ToolCall[] = [];
    let usage: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    } | null = null;

    // Track tool call deltas for accumulation
    const toolCallDeltas: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (separated by double newlines)
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const eventText of events) {
          if (!eventText.trim()) continue;

          // Parse SSE event
          const lines = eventText.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventData = line.slice(5).trim();
            }
          }

          if (!eventData || eventData === "[DONE]") continue;

          try {
            const data = JSON.parse(eventData);

            // Handle different event types from Responses API streaming
            switch (eventType) {
              case "response.output_text.delta":
                // Text delta - yield immediately for streaming
                if (data.delta) {
                  yield { type: "text", delta: data.delta };
                }
                break;

              case "response.content_part.delta":
                // Content part delta (alternative text format)
                if (data.delta?.text) {
                  yield { type: "text", delta: data.delta.text };
                }
                break;

              case "response.function_call_arguments.delta":
                // Tool call arguments streaming
                if (data.item_id !== undefined && data.delta) {
                  const existing = toolCallDeltas.get(data.output_index ?? 0);
                  if (existing) {
                    existing.arguments += data.delta;
                    yield {
                      type: "tool_call_delta",
                      id: existing.id,
                      delta: data.delta,
                    };
                  }
                }
                break;

              case "response.output_item.added":
                // New output item (could be function_call)
                if (data.item?.type === "function_call") {
                  const callId =
                    data.item.call_id || data.item.id || crypto.randomUUID();
                  console.log(
                    `[stripe-token-billing] output_item.added: call_id=${data.item.call_id}, id=${data.item.id}, name=${data.item.name}, output_index=${data.output_index}`
                  );
                  toolCallDeltas.set(data.output_index ?? 0, {
                    id: callId,
                    name: data.item.name || "",
                    arguments: "",
                  });
                }
                break;

              case "response.function_call_arguments.done":
                // Tool call complete
                if (data.output_index !== undefined) {
                  const tc = toolCallDeltas.get(data.output_index);
                  console.log(
                    `[stripe-token-billing] function_call_arguments.done: output_index=${data.output_index}, tc=${JSON.stringify(tc)}`
                  );
                  if (tc && tc.name) {
                    const toolCall: ToolCall = {
                      id: tc.id,
                      name: tc.name,
                      arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
                    };
                    toolCalls.push(toolCall);
                    console.log(
                      `[stripe-token-billing] Yielding tool_call: id=${toolCall.id}, name=${toolCall.name}`
                    );
                    yield { type: "tool_call", call: toolCall };
                  } else {
                    console.warn(
                      `[stripe-token-billing] Skipping tool_call - tc=${!!tc}, name=${tc?.name}`
                    );
                  }
                }
                break;

              case "response.completed":
                // Final response with usage
                if (data.response?.usage) {
                  usage = data.response.usage;
                }
                break;

              case "response.done":
                // Alternative completion event
                if (data.usage) {
                  usage = data.usage;
                }
                break;

              default:
                // Handle generic data events that may contain text
                if (data.type === "output_text" && data.text) {
                  yield {
                    type: "text",
                    delta:
                      typeof data.text === "string"
                        ? data.text
                        : JSON.stringify(data.text),
                  };
                } else if (data.delta) {
                  // Generic delta
                  yield {
                    type: "text",
                    delta:
                      typeof data.delta === "string"
                        ? data.delta
                        : data.delta.text || "",
                  };
                }
                break;
            }
          } catch (parseError) {
            // Skip malformed JSON events
            console.warn(
              "[stripe-token-billing] Failed to parse SSE event:",
              eventData.slice(0, 100)
            );
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Yield done event
    const hasToolCalls = toolCalls.length > 0;
    const finishReason = hasToolCalls ? "tool_calls" : "stop";

    yield {
      type: "done",
      finishReason,
      hasToolCalls,
      usage: usage
        ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            model,
          }
        : undefined,
    };
  }

  /**
   * Format messages for Responses API format
   *
   * Responses API uses a flat input array where:
   * - User messages: { role: "user", content: "text" } or with array content
   * - Assistant messages: { role: "assistant", content: "text" } (WITHOUT tool calls)
   * - Tool results: TOP-LEVEL items { type: "function_call_output", call_id, output }
   *
   * The model maintains its own state for function calls, so we don't include
   * assistant messages that contain tool_use - only the function_call_output.
   */
  private formatMessagesForResponsesApi(
    messages: Message[]
  ): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      // Tool result messages become top-level function_call_output items
      if (msg.role === "tool") {
        // Skip tool results without a call_id
        if (!msg.toolCallId) {
          console.warn(
            "[stripe-token-billing] formatMessagesForResponsesApi: Skipping tool result without toolCallId"
          );
          continue;
        }
        result.push({
          type: "function_call_output",
          call_id: msg.toolCallId,
          output:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        });
        continue;
      }

      // Handle assistant messages with tool_use - must include function_call items
      // for Responses API compatibility (especially when switching models)
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const toolUseParts = msg.content.filter((p) => p.type === "tool_use");
        const textParts = msg.content
          .filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("");

        if (toolUseParts.length > 0) {
          // Include any text content first
          if (textParts) {
            result.push({ role: "assistant", content: textParts });
          }

          // Add function_call items for each tool_use
          for (const part of toolUseParts) {
            const tu = part as {
              type: "tool_use";
              id?: string;
              name?: string;
              input?: Record<string, unknown>;
            };
            // Skip if no name (invalid tool_use)
            if (!tu.name) {
              console.warn(
                "[stripe-token-billing] formatMessages: Skipping tool_use without name"
              );
              continue;
            }
            // Responses API requires call_id - generate one if missing
            const callId = tu.id || `call_${crypto.randomUUID()}`;
            result.push({
              type: "function_call",
              call_id: callId,
              name: tu.name,
              arguments: JSON.stringify(tu.input || {}),
            });
          }
          continue;
        }

        // No tool calls - convert text content
        if (textParts) {
          result.push({ role: "assistant", content: textParts });
        }
        continue;
      }

      // User messages
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          result.push({ role: "user", content: msg.content });
        } else {
          // Array content - convert to input_text/input_image/input_audio/input_video format
          const content = msg.content.map((p) => {
            if (p.type === "text") {
              return { type: "input_text", text: p.text };
            }
            if (p.type === "image_url") {
              return { type: "input_image", image_url: p.image_url.url };
            }
            if (p.type === "input_audio") {
              return {
                type: "input_audio",
                input_audio: (
                  p as {
                    type: "input_audio";
                    input_audio: { data: string; format: string };
                  }
                ).input_audio,
              };
            }
            if (p.type === "input_video") {
              return {
                type: "input_video",
                video_url: (
                  p as {
                    type: "input_video";
                    input_video: { url: string; mimeType: string };
                  }
                ).input_video.url,
              };
            }
            return { type: "input_text", text: "" };
          });
          result.push({ role: "user", content });
        }
        continue;
      }

      // Assistant messages (simple string content)
      if (msg.role === "assistant") {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : msg.content
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
        if (content) {
          result.push({ role: "assistant", content });
        }
        continue;
      }

      // System messages - not typically included in Responses API input
      // but include if present for completeness
      if (msg.role === "system") {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : msg.content
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
        result.push({ role: "system", content });
      }
    }

    return result;
  }

  private formatMessages(
    messages: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    console.log(
      `[stripe-token-billing] formatMessages: Input ${messages.length} messages`
    );
    const toolMsgs = messages.filter((m) => m.role === "tool");
    console.log(
      `[stripe-token-billing] formatMessages: ${toolMsgs.length} tool messages total`
    );
    return messages
      .filter((m) => {
        // Skip tool messages without toolCallId - they can't be matched to tool calls
        if (m.role === "tool" && !m.toolCallId) {
          console.warn(
            "[stripe-token-billing] formatMessages: Skipping tool message without toolCallId"
          );
          return false;
        }
        return true;
      })
      .map((m) => {
        if (m.role === "tool") {
          const content =
            typeof m.content === "string"
              ? m.content
              : Array.isArray(m.content)
                ? m.content
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join("")
                : "";
          return {
            role: "tool" as const,
            content,
            tool_call_id: m.toolCallId!,
          };
        }

        if (m.role === "assistant") {
          if (typeof m.content === "string") {
            return {
              role: "assistant" as const,
              content: m.content,
            };
          }
          // Handle null/undefined content (edge case from model switching)
          // Return null to be filtered out later
          if (!m.content || !Array.isArray(m.content)) {
            return null;
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
          const content =
            typeof m.content === "string"
              ? m.content
              : m.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("");
          return {
            role: "system" as const,
            content,
          };
        }

        // User messages can have multimodal content
        if (Array.isArray(m.content)) {
          return {
            role: "user" as const,
            content: m.content
              .filter(
                (part) =>
                  part.type === "text" ||
                  part.type === "image_url" ||
                  part.type === "input_audio"
              )
              .map((part) => {
                if (part.type === "text") {
                  return { type: "text" as const, text: part.text };
                }
                if (part.type === "image_url") {
                  return {
                    type: "image_url" as const,
                    image_url: { url: part.image_url.url },
                  };
                }
                if (part.type === "input_audio") {
                  const audioPart = part as {
                    type: "input_audio";
                    input_audio: { data: string; format: string };
                  };
                  return {
                    type: "input_audio" as const,
                    input_audio: {
                      data: audioPart.input_audio.data,
                      format: audioPart.input_audio.format as "wav" | "mp3",
                    },
                  };
                }
                return { type: "text" as const, text: "" };
              })
              .filter(
                (p) => p.type !== "text" || ("text" in p && p.text !== "")
              ),
          };
        }

        return {
          role: "user" as const,
          content: m.content,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null) as unknown as OpenAI.Chat.ChatCompletionMessageParam[];
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
