import { WebClient } from "@slack/web-api";
import { db } from "../db";
import { getWatchingCustomers, type WatchingCustomer } from "./watcherService";
import {
  getUsersForNotification,
  type CustomerUser,
} from "./customerUserService";
import { getCustomerById } from "./customerService";

// ---------------------------------------------------------------------------
// Notification Control
// ---------------------------------------------------------------------------

/**
 * Check if notifications are enabled.
 * Set NOTIFICATIONS_ENABLED=false to disable all Slack/email notifications during testing.
 */
function areNotificationsEnabled(): boolean {
  const enabled = process.env.NOTIFICATIONS_ENABLED;
  // Default to true if not set, only disable if explicitly set to 'false'
  return enabled?.toLowerCase() !== "false";
}

// ---------------------------------------------------------------------------
// Slack Client Setup
// ---------------------------------------------------------------------------

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Cache WebClient instances by token to avoid recreating them each request
const webClientCache = new Map<string, WebClient>();

function getSlackClient(token?: string): WebClient | null {
  const botToken = token || SLACK_BOT_TOKEN;
  if (!botToken) {
    console.warn(
      "[Slack] No bot token configured. Set SLACK_BOT_TOKEN env var."
    );
    return null;
  }

  let client = webClientCache.get(botToken);
  if (!client) {
    client = new WebClient(botToken);
    webClientCache.set(botToken, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Exported Notification Types
// ---------------------------------------------------------------------------

export interface IssueStatusChange {
  issueId: string;
  identifier: string;
  title: string;
  previousStatus: string;
  newStatus: string;
  slackThreadTs: string | null;
}

export interface IssueCreated {
  issueId: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  reporterName: string | null;
  slackChannelId: string | null;
  slackThreadTs: string | null;
  customerId: string | null;
}

export interface CommentAdded {
  issueId: string;
  identifier: string;
  issueTitle: string;
  commentBody: string;
  authorName: string;
  slackThreadTs: string | null;
}

// ---------------------------------------------------------------------------
// Issue Slack Info Helper
// ---------------------------------------------------------------------------

interface IssueSlackInfo {
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
  slack_message_ts: string | null;
  customer_id: string | null;
}

async function getIssueSlackInfo(
  issueId: string
): Promise<IssueSlackInfo | null> {
  return db.queryOne<IssueSlackInfo>(
    `SELECT slack_channel_id, slack_thread_ts, slack_message_ts, customer_id
     FROM chipp_issue WHERE id = $1`,
    [issueId]
  );
}

// ---------------------------------------------------------------------------
// Status Change Notifications
// ---------------------------------------------------------------------------

/**
 * Notify all watchers when an issue's status changes.
 * Sends Slack notifications to customer channels and emails to opted-in users.
 */
export async function notifyStatusChange(
  change: IssueStatusChange
): Promise<void> {
  if (!areNotificationsEnabled()) {
    console.log(
      `[Notification] Notifications disabled, skipping status change for ${change.identifier}`
    );
    return;
  }

  const watchingCustomers = await getWatchingCustomers(change.issueId);

  if (watchingCustomers.length === 0) {
    console.log(
      `[Notification] No watchers for issue ${change.identifier}, skipping notifications`
    );
    return;
  }

  console.log(
    `[Notification] Notifying ${watchingCustomers.length} customers of status change for ${change.identifier}: ${change.previousStatus} -> ${change.newStatus}`
  );

  // Send notifications in parallel
  await Promise.all([
    sendSlackStatusChangeNotifications(change, watchingCustomers),
    sendEmailNotifications(change, watchingCustomers),
  ]);
}

/**
 * Send Slack notifications to all watching customer channels.
 * Posts to the original thread if available, otherwise posts a new message.
 */
async function sendSlackStatusChangeNotifications(
  change: IssueStatusChange,
  customers: WatchingCustomer[]
): Promise<void> {
  const client = getSlackClient();
  if (!client) {
    console.log(
      "[Notification] Slack client not available, skipping Slack notifications"
    );
    return;
  }

  // Get issue's Slack info for thread reply
  const issueInfo = await getIssueSlackInfo(change.issueId);

  for (const customer of customers) {
    if (!customer.slackChannelId) {
      console.log(
        `[Notification] Customer ${customer.name} has no Slack channel, skipping`
      );
      continue;
    }

    try {
      // Get customer's portal token for building the link
      const customerData = await getCustomerById(customer.id);
      const portalUrl = customerData
        ? buildPortalUrl(
            customerData.slug,
            customerData.portalToken,
            change.identifier
          )
        : null;

      const message = formatSlackStatusChangeMessage({
        identifier: change.identifier,
        title: change.title,
        previousStatus: change.previousStatus,
        newStatus: change.newStatus,
        portalUrl,
      });

      await client.chat.postMessage({
        channel: customer.slackChannelId,
        text: message,
        thread_ts: issueInfo?.slack_thread_ts || undefined,
        unfurl_links: false,
        unfurl_media: false,
      });

      console.log(
        `[Notification] Sent Slack status change to ${customer.name} (${customer.slackChannelId})`
      );
    } catch (error) {
      console.error(
        `[Notification] Failed to send Slack notification to ${customer.name}:`,
        error
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Issue Creation Notifications
// ---------------------------------------------------------------------------

/**
 * Notify when an issue is created.
 * Posts to the associated Slack channel if available.
 */
export async function notifyIssueCreated(issue: IssueCreated): Promise<void> {
  if (!areNotificationsEnabled()) {
    console.log(
      `[Notification] Notifications disabled, skipping issue creation for ${issue.identifier}`
    );
    return;
  }

  const client = getSlackClient();
  if (!client) {
    console.log(
      "[Notification] Slack client not available, skipping issue creation notification"
    );
    return;
  }

  // If issue has a direct Slack channel, post there
  if (issue.slackChannelId) {
    try {
      const customer = issue.customerId
        ? await getCustomerById(issue.customerId)
        : null;
      const portalUrl = customer
        ? buildPortalUrl(customer.slug, customer.portalToken, issue.identifier)
        : null;

      const message = formatSlackIssueCreatedMessage({
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        status: issue.status,
        reporterName: issue.reporterName,
        portalUrl,
      });

      const result = await client.chat.postMessage({
        channel: issue.slackChannelId,
        text: message,
        thread_ts: issue.slackThreadTs || undefined,
        unfurl_links: false,
        unfurl_media: false,
      });

      console.log(
        `[Notification] Sent issue creation to Slack channel ${issue.slackChannelId}`
      );

      // If this was a new message (not a thread reply), store the message_ts for future thread replies
      if (result.ts && !issue.slackThreadTs) {
        await db.query(
          `UPDATE chipp_issue SET slack_message_ts = $1 WHERE id = $2`,
          [result.ts, issue.issueId]
        );
        console.log(
          `[Notification] Stored Slack message_ts ${result.ts} for issue ${issue.identifier}`
        );
      }
    } catch (error) {
      console.error(
        `[Notification] Failed to send issue creation to Slack:`,
        error
      );
    }
  }

  // Also notify watching customers if any
  if (issue.customerId) {
    const customer = await getCustomerById(issue.customerId);
    if (
      customer?.slackChannelId &&
      customer.slackChannelId !== issue.slackChannelId
    ) {
      try {
        const portalUrl = buildPortalUrl(
          customer.slug,
          customer.portalToken,
          issue.identifier
        );

        const message = formatSlackIssueCreatedMessage({
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          status: issue.status,
          reporterName: issue.reporterName,
          portalUrl,
        });

        await client.chat.postMessage({
          channel: customer.slackChannelId,
          text: message,
          unfurl_links: false,
          unfurl_media: false,
        });

        console.log(
          `[Notification] Sent issue creation to customer ${customer.name} channel`
        );
      } catch (error) {
        console.error(
          `[Notification] Failed to notify customer of issue creation:`,
          error
        );
      }
    }
  }
}

interface IssueCreatedMessageParams {
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  reporterName: string | null;
  portalUrl: string | null;
}

function formatSlackIssueCreatedMessage(
  params: IssueCreatedMessageParams
): string {
  const priorityEmoji = getPriorityEmoji(params.priority);
  let message = `:ticket: *New Issue Created*\n`;
  message += `${priorityEmoji} *${params.identifier}*: ${params.title}\n`;
  message += `Status: _${params.status}_`;

  if (params.reporterName) {
    message += ` | Reported by: ${params.reporterName}`;
  }

  if (params.description) {
    // Truncate long descriptions
    const truncatedDesc =
      params.description.length > 200
        ? params.description.substring(0, 200) + "..."
        : params.description;
    message += `\n>${truncatedDesc.replace(/\n/g, "\n>")}`;
  }

  if (params.portalUrl) {
    message += `\n<${params.portalUrl}|View in Portal>`;
  }

  return message;
}

// ---------------------------------------------------------------------------
// Comment Notifications
// ---------------------------------------------------------------------------

/**
 * Notify when a comment is added to an issue.
 * Posts to the issue's Slack thread if available.
 */
export async function notifyCommentAdded(comment: CommentAdded): Promise<void> {
  if (!areNotificationsEnabled()) {
    console.log(
      `[Notification] Notifications disabled, skipping comment for ${comment.identifier}`
    );
    return;
  }

  const client = getSlackClient();
  if (!client) {
    console.log(
      "[Notification] Slack client not available, skipping comment notification"
    );
    return;
  }

  // Get issue's Slack info
  const issueInfo = await getIssueSlackInfo(comment.issueId);
  if (!issueInfo?.slack_channel_id) {
    console.log(
      `[Notification] Issue ${comment.identifier} has no Slack channel, skipping comment notification`
    );
    return;
  }

  // Prefer posting to thread, fallback to channel
  const threadTs = issueInfo.slack_thread_ts || issueInfo.slack_message_ts;

  try {
    const message = formatSlackCommentMessage({
      identifier: comment.identifier,
      issueTitle: comment.issueTitle,
      commentBody: comment.commentBody,
      authorName: comment.authorName,
    });

    await client.chat.postMessage({
      channel: issueInfo.slack_channel_id,
      text: message,
      thread_ts: threadTs || undefined,
      unfurl_links: false,
      unfurl_media: false,
    });

    console.log(
      `[Notification] Sent comment notification to ${issueInfo.slack_channel_id}`
    );
  } catch (error) {
    console.error(`[Notification] Failed to send comment notification:`, error);
  }
}

interface CommentMessageParams {
  identifier: string;
  issueTitle: string;
  commentBody: string;
  authorName: string;
}

function formatSlackCommentMessage(params: CommentMessageParams): string {
  // Truncate long comments
  const truncatedBody =
    params.commentBody.length > 500
      ? params.commentBody.substring(0, 500) + "..."
      : params.commentBody;

  return `:speech_balloon: *${params.authorName}* commented on *${params.identifier}*\n>${truncatedBody.replace(/\n/g, "\n>")}`;
}

// ---------------------------------------------------------------------------
// Email Notifications (Status Change)
// ---------------------------------------------------------------------------

/**
 * Send email notifications to all opted-in users in watching customers.
 */
async function sendEmailNotifications(
  change: IssueStatusChange,
  customers: WatchingCustomer[]
): Promise<void> {
  // Gather all users with email notifications enabled across all watching customers
  const allUsersPromises = customers.map((c) => getUsersForNotification(c.id));
  const allUsersArrays = await Promise.all(allUsersPromises);
  const allUsers = allUsersArrays.flat();

  if (allUsers.length === 0) {
    console.log(
      `[Notification] No users with email notifications enabled for ${change.identifier}`
    );
    return;
  }

  // Deduplicate users by email (in case same user is in multiple customers)
  const uniqueEmails = new Set<string>();
  const uniqueUsers: CustomerUser[] = [];
  for (const user of allUsers) {
    if (user.email && !uniqueEmails.has(user.email)) {
      uniqueEmails.add(user.email);
      uniqueUsers.push(user);
    }
  }

  console.log(
    `[Notification] Would send email to ${uniqueUsers.length} users for ${change.identifier} (email sending not yet implemented)`
  );

  // TODO: Implement actual email sending when needed
  // for (const user of uniqueUsers) {
  //   try {
  //     await sendEmailNotification({
  //       toEmail: user.email!,
  //       toName: user.slackDisplayName,
  //       issueIdentifier: change.identifier,
  //       issueTitle: change.title,
  //       previousStatus: change.previousStatus,
  //       newStatus: change.newStatus,
  //       customerId: user.customerId,
  //     });
  //   } catch (error) {
  //     console.error(`[Notification] Failed to send email to ${user.email}:`, error);
  //   }
  // }
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

interface StatusChangeMessageParams {
  identifier: string;
  title: string;
  previousStatus: string;
  newStatus: string;
  portalUrl: string | null;
}

function formatSlackStatusChangeMessage(
  params: StatusChangeMessageParams
): string {
  const statusEmoji = getStatusEmoji(params.newStatus);
  let message = `${statusEmoji} *${params.identifier}* moved from _${params.previousStatus}_ to *${params.newStatus}*\n>${params.title}`;

  if (params.portalUrl) {
    message += `\n<${params.portalUrl}|View in Portal>`;
  }

  return message;
}

function getStatusEmoji(status: string): string {
  const statusLower = status.toLowerCase();
  if (
    statusLower.includes("done") ||
    statusLower.includes("complete") ||
    statusLower.includes("deploy")
  )
    return ":white_check_mark:";
  if (
    statusLower.includes("progress") ||
    statusLower.includes("implement") ||
    statusLower.includes("working")
  )
    return ":hammer_and_wrench:";
  if (statusLower.includes("review")) return ":eyes:";
  if (statusLower.includes("cancel")) return ":x:";
  if (statusLower.includes("block")) return ":octagonal_sign:";
  if (statusLower.includes("triage") || statusLower.includes("backlog"))
    return ":inbox_tray:";
  if (statusLower.includes("test")) return ":test_tube:";
  return ":arrow_right:";
}

function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case "P1":
      return ":rotating_light:";
    case "P2":
      return ":warning:";
    case "P3":
      return ":large_blue_circle:";
    case "P4":
      return ":white_circle:";
    default:
      return ":grey_question:";
  }
}

// ---------------------------------------------------------------------------
// URL Helpers
// ---------------------------------------------------------------------------

/**
 * Build a portal URL for a customer to view an issue.
 */
function buildPortalUrl(
  customerSlug: string,
  portalToken: string,
  issueIdentifier: string
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://issues.chipp.ai";
  return `${baseUrl}/portal/${customerSlug}/issue/${issueIdentifier}?token=${portalToken}`;
}
