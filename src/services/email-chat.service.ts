/**
 * Email Chat Service
 *
 * Handles email message events and connects them to the AI chat system.
 * Manages session creation, message handling, and response sending.
 *
 * Follows the pattern of whatsapp-chat.service.ts
 */

import { db } from "../db/client.ts";
import { emailService, type PostmarkInboundEmail } from "./email.service.ts";
import { chatService } from "./chat.service.ts";
import * as Sentry from "@sentry/deno";

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

export interface HandleEmailMessageParams {
  applicationId: string;
  configId: string;
  email: PostmarkInboundEmail;
  correlationId?: string;
}

// ========================================
// Language Map (matches shared-utils/src/i18n)
// ========================================

const LANGUAGE_MAP: Record<string, string> = {
  EN: "English",
  ES: "Spanish",
  PT: "Portuguese",
  FR: "French",
  DE: "German",
  IT: "Italian",
  NL: "Dutch",
  PL: "Polish",
  RU: "Russian",
  JA: "Japanese",
  KO: "Korean",
  ZH: "Chinese",
  AR: "Arabic",
  HI: "Hindi",
  TR: "Turkish",
  VI: "Vietnamese",
  TH: "Thai",
  ID: "Indonesian",
  MS: "Malay",
  FIL: "Filipino",
};

// ========================================
// Text Processing
// ========================================

/**
 * Clean email body by removing quoted reply content
 * Looks for common patterns like "On [date], [name] wrote:" or lines starting with ">"
 */
function cleanEmailBody(text: string): string {
  const lines = text.split("\n");
  const cleanedLines: string[] = [];

  for (const line of lines) {
    // Stop at quoted reply markers
    if (
      /^On .+ wrote:$/i.test(line.trim()) ||
      /^From:/.test(line.trim()) ||
      /^Sent:/.test(line.trim()) ||
      /^-{3,}/.test(line.trim()) ||
      /^_{3,}/.test(line.trim())
    ) {
      break;
    }

    // Skip quoted lines (starting with >)
    if (/^>/.test(line.trim())) {
      continue;
    }

    cleanedLines.push(line);
  }

  return cleanedLines.join("\n").trim();
}

/**
 * Format a response for email (no markdown, plain text)
 * Removes markdown formatting and converts to plain text
 */
function formatForEmail(text: string): string {
  return (
    text
      // Remove bold/italic markers
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // Convert markdown links to plain text
      .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
      // Remove code blocks but keep content
      .replace(/```[\s\S]*?```/g, (match) => {
        return match.replace(/```\w*\n?/g, "").replace(/```/g, "");
      })
      // Remove inline code markers
      .replace(/`(.+?)`/g, "$1")
      // Convert headers to plain text with caps
      .replace(/^#{1,6}\s+(.+)$/gm, (_, content) => content.toUpperCase())
      // Clean up excessive whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// ========================================
// Main Handler
// ========================================

/**
 * Handle incoming email message and generate AI response
 */
export async function handleEmailMessage(
  params: HandleEmailMessageParams
): Promise<void> {
  const { applicationId, configId, email, correlationId } = params;

  console.log("[EmailChat] Processing message", {
    correlationId,
    from: email.FromFull?.Email || email.From,
    subject: email.Subject,
    messageId: email.MessageID,
  });

  try {
    // Get app config
    const appConfig = await chatService.getAppConfig(applicationId);
    const language = appConfig.language || "EN";

    // Get email config
    const emailConfig =
      await emailService.getConfigByApplicationId(applicationId);
    if (!emailConfig) {
      console.error("[EmailChat] Email config not found");
      return;
    }

    // Extract thread information
    const threadInfo = emailService.extractThreadInfo(
      email.Headers,
      email.Subject,
      email.MessageID
    );

    // Find or create thread (and associated chat session)
    const senderEmail = email.FromFull?.Email || email.From;
    const { thread, isNew } = await emailService.findOrCreateThread({
      emailConfigId: configId,
      applicationId,
      threadInfo,
      senderEmail,
    });

    console.log("[EmailChat] Thread resolved", {
      correlationId,
      threadId: thread.threadId,
      chatSessionId: thread.chatSessionId,
      isNewThread: isNew,
    });

    // Clean the email body (remove quoted replies)
    const cleanedBody =
      email.StrippedTextReply || cleanEmailBody(email.TextBody || "");

    if (!cleanedBody.trim()) {
      console.log("[EmailChat] Empty message after cleaning, skipping");
      return;
    }

    // Get previous messages (last 10)
    const history = await chatService.getSessionMessages(
      thread.chatSessionId,
      10
    );
    const hasKnowledge = await hasKnowledgeSources(applicationId);

    // Save user message
    await chatService.addMessage(thread.chatSessionId, "user", cleanedBody);

    // Build system prompt with email-specific formatting rules
    let systemPrompt = appConfig.systemPrompt || "";

    // Add language instruction
    const languageName = LANGUAGE_MAP[language.toUpperCase()] || "English";
    systemPrompt += `\n\nRespond in ${languageName} language.`;

    if (hasKnowledge) {
      systemPrompt +=
        "\n\nYou have access to a knowledge base through the searchKnowledge tool. " +
        "When the user asks questions that might be answered by uploaded documents or files, " +
        "use searchKnowledge to find relevant information before answering.";
    }

    // Add email-specific formatting instructions (matches chipp-admin)
    systemPrompt += `

Format your responses for email compatibility:
- DO NOT use markdown formatting like **bold**, *italic*, [links](url), or # headers
- DO NOT use markdown link syntax [text](url) - write 'text (url)' or just the URL instead
- For emphasis, use UPPERCASE or write 'Important:' before key points
- For links, write the full URL on its own line or in parentheses after descriptive text
- For lists, use simple dashes (-) or numbers (1. 2. 3.) at the start of lines
- Keep formatting simple and readable in plain text email clients
- Line breaks: Use single line breaks between items, double line breaks between sections
- Avoid special characters or formatting that might not render in email
Example: Instead of '**Breaking News**', write 'BREAKING NEWS' or 'Breaking News:'
Example: Instead of '[Read more](https://example.com)', write 'Read more at https://example.com'`;

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

    // Build messages from history (reverse order)
    const messages: Message[] = [];
    const reversedHistory = [...history].reverse();
    for (const msg of reversedHistory) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        messages.push({ role: "assistant", content: msg.content });
      }
    }

    // Add current message
    messages.push({ role: "user", content: cleanedBody });

    // Get billing context
    const billingContext = await chatService.getBillingContext(
      appConfig.organizationId
    );

    // Create LLM adapter with billing
    const modelId = appConfig.model || DEFAULT_MODEL_ID;
    const adapter = await createAdapterWithBilling(modelId, {
      organizationId: billingContext.organizationId,
      applicationId,
      sessionId: thread.chatSessionId,
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
        sessionId: thread.chatSessionId,
        consumerId: undefined,
      };
      registerCustomTools(registry, customActions, execContext);
    }

    // Register web tools
    registerWebTools(registry);

    // Run agent loop
    console.log("[EmailChat] Running agent loop", { correlationId });
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

    console.log("[EmailChat] Got response", {
      correlationId,
      length: responseText.length,
    });

    // Save assistant message
    await chatService.addMessage(
      thread.chatSessionId,
      "assistant",
      responseText
    );

    // Format response for email
    const formattedResponse = formatForEmail(responseText);

    // Get server token
    const serverToken = await emailService.getServerToken(emailConfig);
    if (!serverToken) {
      console.error("[EmailChat] No Postmark server token available");
      return;
    }

    // Build reply subject (add Re: if not already present)
    let replySubject = email.Subject;
    if (!replySubject.toLowerCase().startsWith("re:")) {
      replySubject = `Re: ${replySubject}`;
    }

    // Build references for threading
    const references =
      threadInfo.references.length > 0
        ? [...threadInfo.references, email.MessageID]
        : [email.MessageID];

    // Send reply via Postmark
    const sendResult = await emailService.sendReply({
      to: senderEmail,
      from: emailConfig.fromEmailAddress,
      fromName: emailConfig.fromEmailName,
      replyTo: emailConfig.inboundEmailAddress, // Direct replies to the inbound address
      subject: replySubject,
      textBody: formattedResponse,
      inReplyTo: email.MessageID,
      references,
      serverToken,
      messageStream: "outbound",
    });

    if (sendResult.ErrorCode !== 0) {
      const error = new Error(`Postmark error: ${sendResult.Message}`);
      Sentry.captureException(error, {
        tags: {
          source: "email-chat",
          feature: "send-reply",
        },
        extra: {
          correlationId,
          applicationId,
          errorCode: sendResult.ErrorCode,
          errorMessage: sendResult.Message,
        },
      });
      console.error("[EmailChat] Failed to send reply", {
        correlationId,
        errorCode: sendResult.ErrorCode,
        errorMessage: sendResult.Message,
      });
    } else {
      console.log("[EmailChat] Reply sent successfully", {
        correlationId,
        messageId: sendResult.MessageID,
      });
    }
  } catch (error) {
    console.error("[EmailChat] Error processing email", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });

    Sentry.captureException(error, {
      tags: {
        source: "email-chat",
        feature: "message-processing",
      },
      extra: {
        correlationId,
        applicationId,
        messageId: email.MessageID,
      },
    });

    // Note: Unlike WhatsApp, we don't send error messages back to the user
    // to avoid potential email loops
  }
}
