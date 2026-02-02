<script lang="ts">
  import { Globe, Code, Phone, Mail, Tag } from "lucide-svelte";

  export let session: {
    id: string;
    title: string | null;
    source: string;
    createdAt: string;
    messages: {
      id: string;
      content: string;
      senderType: string;
      createdAt: string;
    }[];
    user: {
      id: string;
      name: string | null;
      email: string | null;
      identifier: string | null;
    } | null;
    tags?: { id: string; name: string }[];
    slackUser?: {
      realName?: string;
      displayName?: string;
      email?: string;
      avatar?: string;
    };
  };
  export let isSelected = false;
  export let isUnread = false;
  export let searchTerm = "";
  export let onClick: () => void = () => {};

  // Highlight search term in text
  function highlightSearch(text: string): string {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${escapeRegex(searchTerm)})`, "gi");
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Get user display name
  function getUserDisplay(): string {
    const isSlackSession = session.source === "SLACK" || session.slackUser;

    if (isSlackSession && session.slackUser) {
      return (
        session.slackUser.realName ||
        session.slackUser.displayName ||
        session.slackUser.email ||
        "Slack User"
      );
    }

    if (session.source === "WHATSAPP") {
      if (session.user?.identifier) return session.user.identifier;
      // Parse from session ID (legacy format: whatsapp-<phone>-<appId>)
      const parts = session.id.split("-");
      if (parts[0] === "whatsapp" && parts.length >= 3) {
        return parts[1];
      }
      return "WhatsApp User";
    }

    return session.user?.name || session.user?.email || "Anonymous";
  }

  // Get source info
  function getSourceInfo() {
    const sources: Record<string, { label: string; colorClass: string }> = {
      APP: { label: "Web", colorClass: "source-web" },
      API: { label: "API", colorClass: "source-api" },
      WHATSAPP: { label: "WhatsApp", colorClass: "source-whatsapp" },
      SLACK: { label: "Slack", colorClass: "source-slack" },
      EMAIL: { label: "Email", colorClass: "source-email" },
    };
    return sources[session.source] || { label: "Unknown", colorClass: "source-default" };
  }

  // Get last message preview
  function getLastMessage() {
    if (!session.messages || session.messages.length === 0) return null;
    const last = session.messages[session.messages.length - 1];
    const preview = last.content?.substring(0, 100) || "";
    return {
      content: preview + (last.content?.length > 100 ? "..." : ""),
      isBot: last.senderType === "BOT",
    };
  }

  // Format relative time
  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  $: sourceInfo = getSourceInfo();
  $: lastMessage = getLastMessage();
  $: userDisplay = getUserDisplay();
  $: lastMessageTime = session.messages?.length > 0
    ? session.messages[session.messages.length - 1].createdAt
    : session.createdAt;

  // Collect unique tags
  $: uniqueTags = (() => {
    const tagMap = new Map<string, { id: string; name: string }>();
    session.messages?.forEach((msg: any) => {
      msg.tags?.forEach((tag: { id: string; name: string }) => {
        tagMap.set(tag.id, tag);
      });
    });
    return Array.from(tagMap.values());
  })();
</script>

<button
  class="session-card"
  class:selected={isSelected}
  on:click={onClick}
>
  <!-- Top row: Source badge and time -->
  <div class="card-header">
    <span class="source-badge {sourceInfo.colorClass}">
      {#if session.source === "APP"}
        <Globe size={12} />
      {:else if session.source === "API"}
        <Code size={12} />
      {:else if session.source === "WHATSAPP"}
        <Phone size={12} />
      {:else if session.source === "SLACK"}
        <img src="/assets/deploy-icons/slack-logo.png" alt="Slack" class="source-icon" />
      {:else if session.source === "EMAIL"}
        <Mail size={12} />
      {:else}
        <Globe size={12} />
      {/if}
      <span>{sourceInfo.label}</span>
    </span>
    <span class="time">{formatRelativeTime(lastMessageTime)}</span>
  </div>

  <!-- Content section -->
  <div class="card-content">
    {#if session.slackUser?.avatar}
      <img src={session.slackUser.avatar} alt={userDisplay} class="avatar" />
    {/if}

    <div class="content-text">
      <div class="user-name">
        {#if searchTerm}
          {@html highlightSearch(userDisplay)}
        {:else}
          {userDisplay}
        {/if}
      </div>

      {#if lastMessage}
        <p class="last-message">
          <span class="sender-prefix">{lastMessage.isBot ? "Bot: " : "User: "}</span>
          {#if searchTerm}
            {@html highlightSearch(lastMessage.content)}
          {:else}
            {lastMessage.content}
          {/if}
        </p>
      {/if}
    </div>

    <div class="indicators">
      {#if isUnread}
        <div class="unread-dot"></div>
      {/if}

      {#if uniqueTags.length > 0}
        <div class="tags">
          {#each uniqueTags.slice(0, 2) as tag}
            <span class="tag">
              <Tag size={10} />
              <span class="tag-name">{tag.name}</span>
            </span>
          {/each}
          {#if uniqueTags.length > 2}
            <span class="tag-more">+{uniqueTags.length - 2}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</button>

<style>
  .session-card {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: none;
    border-left: 4px solid transparent;
    border-bottom: 1px solid var(--border-primary);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .session-card:hover {
    background: var(--bg-secondary);
  }

  .session-card.selected {
    background: hsl(var(--primary) / 0.1);
    border-left-color: hsl(var(--primary));
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 500;
  }

  .source-icon {
    width: 12px;
    height: 12px;
  }

  .source-web {
    background: hsl(217 91% 60% / 0.1);
    color: hsl(217 91% 50%);
  }

  .source-api {
    background: hsl(142 71% 45% / 0.1);
    color: hsl(142 71% 35%);
  }

  .source-whatsapp {
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 35%);
  }

  .source-slack {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .source-email {
    background: hsl(263 70% 50% / 0.1);
    color: hsl(263 70% 45%);
  }

  .source-default {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .time {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .card-content {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .content-text {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .last-message {
    margin: var(--space-1) 0 0;
    font-size: 12px;
    color: var(--text-tertiary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .sender-prefix {
    font-weight: 500;
    color: var(--text-secondary);
  }

  .indicators {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .unread-dot {
    width: 8px;
    height: 8px;
    background: hsl(142 71% 45%);
    border-radius: 50%;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    max-width: 150px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    background: linear-gradient(135deg, hsl(0 84% 96%), hsl(25 95% 95%));
    border: 1px solid hsl(0 84% 85%);
    border-radius: var(--radius-full);
    font-size: 10px;
    color: hsl(0 72% 45%);
  }

  .tag-name {
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-more {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-full);
    color: var(--text-tertiary);
  }

  :global(.search-highlight) {
    background: hsl(48 96% 70%);
    font-weight: 600;
    padding: 0 2px;
    border-radius: 2px;
  }
</style>
