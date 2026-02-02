/**
 * Slack Chat Service
 *
 * Handles Slack message events and connects them to the AI chat system.
 * Manages thread context, user info caching, and response posting.
 */

import { db } from "../db/client.ts";
import { slackService, type SlackInstallation } from "./slack.service.ts";
import { chatService } from "./chat.service.ts";
import { decrypt } from "./crypto.service.ts";

// Agent framework imports
import { DEFAULT_MODEL_ID } from "../config/models.ts";
import { createAdapterWithBilling } from "../llm/index.ts";
import {
  createRegistry,
  agentLoop,
  registerCoreTools,
  registerRAGTools,
} from "../agent/index.ts";
import { registerWebTools } from "../agent/tools/web.ts";
import { registerCustomTools } from "../agent/tools/custom.ts";
import { customActionService } from "./custom-action.service.ts";
import { ExecutionContext } from "./tool-execution.service.ts";
import { hasKnowledgeSources } from "./rag.service.ts";
import type { Message } from "../llm/types.ts";

// ========================================
// Types
// ========================================

interface SlackEvent {
  type: string;
  subtype?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

export interface HandleSlackMessageParams {
  installation: SlackInstallation;
  event: SlackEvent;
  teamId: string;
  slackAppId: string;
  isAppMention: boolean;
  isDirectMessage: boolean;
  isThreadFollowup: boolean;
}

// ========================================
// Markdown Conversion
// ========================================

/**
 * Convert markdown to Slack mrkdwn format
 * - Bold: **text** -> *text*
 * - Links: [text](url) -> <url|text>
 * - Code blocks: ```lang\ncode``` -> ```code```
 */
function convertMarkdownToSlackMrkdwn(text: string): string {
  // Convert bold: **text** -> *text*
  let result = text.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // Convert links: [text](url) -> <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Convert headers: # Header -> *Header*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Keep code blocks but remove language identifier
  result = result.replace(/```\w*\n?/g, "```");

  return result;
}

/**
 * Extract message text from Slack event, removing @mention
 */
function extractMessageText(text: string | undefined): string {
  if (!text) return "";

  // Remove @mentions (format: <@U12345678>)
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

// ========================================
// Main Handler
// ========================================

/**
 * Handle incoming Slack message and generate AI response
 */
export async function handleSlackMessage(
  params: HandleSlackMessageParams
): Promise<void> {
  const {
    installation,
    event,
    teamId,
    slackAppId,
    isAppMention,
    isDirectMessage,
    isThreadFollowup,
  } = params;

  console.log("[SlackChat] Processing message", {
    user: event.user,
    channel: event.channel,
    isAppMention,
    isDirectMessage,
    isThreadFollowup,
  });

  // Get bot token
  let botToken: string;
  try {
    botToken = await decrypt(installation.botToken);
  } catch {
    botToken = installation.botToken;
  }

  // Join channel if not a DM (to ensure we receive future events)
  if (event.channel && event.channel_type !== "im") {
    await slackService.joinChannel(botToken, event.channel).catch((err) => {
      console.log("[SlackChat] Failed to join channel", err);
    });
  }

  // Add thinking reaction
  if (event.channel && event.ts) {
    await slackService
      .addReaction(botToken, event.channel, event.ts, "thinking_face")
      .catch(() => {});
  }

  // Determine thread timestamp (use existing thread or create new)
  const threadTs = event.thread_ts || event.ts;

  // Get chat mapping to find the application
  const mappings = await slackService.getChatMappingsForInstallation(
    installation.id
  );

  if (mappings.length === 0) {
    console.log("[SlackChat] No chat mapping found for installation");
    return;
  }

  // Use the first mapping (typically one app per installation)
  const mapping = mappings[0];
  const applicationId = mapping.applicationId;

  console.log("[SlackChat] Found application", { applicationId });

  // Get or create thread context
  let threadContext = threadTs
    ? await slackService.getThreadContext(threadTs)
    : null;

  if (!threadContext && threadTs) {
    threadContext = await slackService.saveThreadContext({
      threadTs,
      channelId: event.channel ?? null,
      workspaceTeamId: teamId,
      slackAppId,
      chatName: mapping.chatName,
    });
  }

  // Get or create chat session using externalId
  const externalId = `slack:${teamId}:${event.channel}:${threadTs}`;
  let session = await chatService.getSessionByExternalId(
    applicationId,
    externalId
  );

  if (!session) {
    session = await chatService.createSession({
      applicationId,
      source: "SLACK",
      title: `Slack: ${event.channel}`,
    });

    // Update with externalId
    await db
      .updateTable("chat.sessions")
      .set({ externalId })
      .where("id", "=", session.id)
      .execute();

    session.externalId = externalId;
  }

  // Get Slack user info
  const slackUser = event.user
    ? await slackService.getOrFetchSlackUser(event.user, teamId, botToken)
    : null;

  // Extract message text
  const userMessage = extractMessageText(event.text);

  if (!userMessage) {
    console.log("[SlackChat] Empty message after processing");
    return;
  }

  console.log("[SlackChat] Processing user message", {
    sessionId: session.id,
    userMessage: userMessage.substring(0, 100),
  });

  try {
    // Get app config and context
    const appConfig = await chatService.getAppConfig(applicationId);
    const hasKnowledge = await hasKnowledgeSources(applicationId);
    const history = await chatService.getSessionMessages(session.id);

    // Save user message
    await chatService.addMessage(session.id, "user", userMessage);

    // Build system prompt
    let systemPrompt = appConfig.systemPrompt || "";

    if (hasKnowledge) {
      systemPrompt +=
        "\n\nYou have access to a knowledge base through the searchKnowledge tool. " +
        "When the user asks questions that might be answered by uploaded documents or files, " +
        "use searchKnowledge to find relevant information before answering.";
    }

    // Add Slack-specific context
    if (slackUser) {
      systemPrompt += `\n\nYou are chatting with ${slackUser.realName || slackUser.displayName || "a user"} on Slack.`;
    }

    // Add current time
    const now = new Date();
    systemPrompt += `\n\nCurrent date and time: ${now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })}`;

    // Build messages from history
    const messages: Message[] = [];
    for (const msg of history) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        messages.push({ role: "assistant", content: msg.content });
      }
    }

    // Add current message
    messages.push({ role: "user", content: userMessage });

    // Get billing context
    const billingContext = await chatService.getBillingContext(
      appConfig.organizationId
    );

    // Create LLM adapter with billing
    const modelId = appConfig.model || DEFAULT_MODEL_ID;
    const adapter = await createAdapterWithBilling(modelId, {
      organizationId: billingContext.organizationId,
      applicationId,
      sessionId: session.id,
      subscriptionTier: billingContext.subscriptionTier,
      usageBasedBillingEnabled: billingContext.usageBasedBillingEnabled,
    });

    // Create tool registry
    const registry = createRegistry();

    // Register tools
    registerCoreTools(registry);

    if (hasKnowledge) {
      registerRAGTools(registry, applicationId);
    }

    // Register custom actions
    const customActions = await customActionService.list(applicationId);
    if (customActions.length > 0) {
      const execContext: ExecutionContext = {
        applicationId,
        sessionId: session.id,
        consumerId: session.consumerId,
      };
      registerCustomTools(registry, customActions, execContext);
    }

    // Register web tools
    registerWebTools(registry);

    // Run agent loop
    console.log("[SlackChat] Running agent loop");
    const response = await agentLoop({
      adapter,
      registry,
      systemPrompt,
      messages,
      maxIterations: 10,
    });

    // Extract text response
    const responseText =
      typeof response.content === "string"
        ? response.content
        : response.content
            .filter(
              (part): part is { type: "text"; text: string } =>
                part.type === "text"
            )
            .map((part) => part.text)
            .join("\n");

    console.log("[SlackChat] Got response", {
      length: responseText.length,
    });

    // Save assistant message
    await chatService.addMessage(session.id, "assistant", responseText);

    // Convert markdown to Slack format and post response
    const slackMessage = convertMarkdownToSlackMrkdwn(responseText);

    if (event.channel) {
      await slackService.postMessage(
        botToken,
        event.channel,
        slackMessage,
        threadTs
      );
    }
  } catch (error) {
    console.error("[SlackChat] Error generating response", error);

    // Post error message
    if (event.channel) {
      await slackService.postMessage(
        botToken,
        event.channel,
        "Sorry, I encountered an error processing your message. Please try again.",
        threadTs
      );
    }
  }
}
