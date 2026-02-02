/**
 * Chat Theme Configuration System
 *
 * Composable theme system for chat interfaces. Each theme is a configuration
 * object that controls visual properties. Users can create custom themes by
 * mixing and matching properties or defining entirely new configurations.
 *
 * Usage:
 *   import { chatThemes, getChatTheme } from './chatThemes';
 *   const theme = getChatTheme('modern');
 *   // Or create a custom theme:
 *   const customTheme = { ...chatThemes.modern, showUserAvatar: true };
 */

export interface ChatThemeConfig {
  // === Avatar Settings ===
  /** Show avatar for user messages */
  showUserAvatar: boolean;
  /** Show avatar for assistant messages */
  showAssistantAvatar: boolean;
  /** Avatar size in pixels */
  avatarSize: number;
  /** Avatar border radius (e.g., '50%' for circle, '8px' for rounded square) */
  avatarBorderRadius: string;
  /** Show border around avatars */
  avatarBorder: boolean;
  /** Vertical offset for avatar alignment with text (in pixels) */
  avatarMarginTop: number;

  // === Message Layout ===
  /** Alignment for user messages */
  userMessageAlignment: "left" | "right";
  /** Alignment for assistant messages */
  assistantMessageAlignment: "left" | "right";
  /** Maximum width of message bubbles (CSS value) */
  maxWidth: string;
  /** Gap between avatar and message bubble (in pixels) */
  messageGap: number;

  // === Bubble Styling ===
  /** Bubble style type */
  bubbleStyle: "none" | "solid" | "gradient";
  /** Show bubble tail (iMessage-style pointer) */
  showBubbleTail: boolean;
  /** Border radius for message bubbles (in pixels) */
  bubbleBorderRadius: number;
  /** Flatten corner on speech direction side (in pixels, 0 to disable) */
  flattenedCornerRadius: number;
  /** Bubble padding (CSS shorthand) */
  bubblePadding: string;

  // === Colors (can use CSS variables) ===
  /** User bubble background (CSS value or variable) */
  userBubbleBackground: string;
  /** User bubble text color */
  userBubbleColor: string;
  /** Assistant bubble background */
  assistantBubbleBackground: string;
  /** Assistant bubble text color */
  assistantBubbleColor: string;

  // === Dark Mode Overrides ===
  /** Assistant bubble background in dark mode */
  darkAssistantBubbleBackground: string;
  /** Assistant bubble text color in dark mode */
  darkAssistantBubbleColor: string;

  // === Streaming Indicator ===
  /** Type of streaming indicator */
  streamingIndicator: "cursor" | "dots" | "none";
}

/**
 * Built-in theme presets
 */
export const chatThemes: Record<string, ChatThemeConfig> = {
  /**
   * Default Theme
   * Clean, minimal interface. No avatars, no assistant bubble background,
   * pill-shaped user bubbles, full-width assistant text. Identical to "modern".
   */
  default: {
    // Avatars - none shown
    showUserAvatar: false,
    showAssistantAvatar: false,
    avatarSize: 32,
    avatarBorderRadius: "50%",
    avatarBorder: false,
    avatarMarginTop: 0,

    // Layout
    userMessageAlignment: "right",
    assistantMessageAlignment: "left",
    maxWidth: "768px",
    messageGap: 8,

    // Bubbles - user gets pill bubble, assistant is transparent
    bubbleStyle: "solid",
    showBubbleTail: false,
    bubbleBorderRadius: 22,
    flattenedCornerRadius: 0,
    bubblePadding: "10px 18px",

    // Colors
    userBubbleBackground: "var(--primary-color, hsl(var(--primary)))",
    userBubbleColor: "white",
    assistantBubbleBackground: "transparent",
    assistantBubbleColor: "hsl(var(--foreground))",

    // Dark mode
    darkAssistantBubbleBackground: "transparent",
    darkAssistantBubbleColor: "#e5e5ea",

    // Streaming
    streamingIndicator: "cursor",
  },

  /**
   * iMessage Theme
   * Classic iOS-style bubbles with tails, no avatars
   */
  imessage: {
    // Avatars
    showUserAvatar: false,
    showAssistantAvatar: false,
    avatarSize: 28,
    avatarBorderRadius: "50%",
    avatarBorder: false,
    avatarMarginTop: 2,

    // Layout
    userMessageAlignment: "right",
    assistantMessageAlignment: "left",
    maxWidth: "75%",
    messageGap: 8,

    // Bubbles
    bubbleStyle: "solid",
    showBubbleTail: true,
    bubbleBorderRadius: 18,
    flattenedCornerRadius: 0,
    bubblePadding: "12px 16px",

    // Colors
    userBubbleBackground: "var(--primary-color, hsl(var(--primary)))",
    userBubbleColor: "white",
    assistantBubbleBackground: "hsl(var(--muted))",
    assistantBubbleColor: "hsl(var(--foreground))",

    // Dark mode
    darkAssistantBubbleBackground: "#2a2a2a",
    darkAssistantBubbleColor: "#f0f0f0",

    // Streaming
    streamingIndicator: "dots",
  },

  /**
   * Classic Chipp Theme
   * Plain text style like ChatGPT, both avatars visible, all left-aligned
   */
  "classic-chipp": {
    // Avatars
    showUserAvatar: true,
    showAssistantAvatar: true,
    avatarSize: 28,
    avatarBorderRadius: "50%",
    avatarBorder: true,
    avatarMarginTop: 10,

    // Layout
    userMessageAlignment: "left",
    assistantMessageAlignment: "left",
    maxWidth: "768px",
    messageGap: 8,

    // Bubbles
    bubbleStyle: "none",
    showBubbleTail: false,
    bubbleBorderRadius: 0,
    flattenedCornerRadius: 0,
    bubblePadding: "8px 0",

    // Colors
    userBubbleBackground: "transparent",
    userBubbleColor: "hsl(var(--foreground))",
    assistantBubbleBackground: "transparent",
    assistantBubbleColor: "hsl(var(--foreground))",

    // Dark mode
    darkAssistantBubbleBackground: "transparent",
    darkAssistantBubbleColor: "#e5e5ea",

    // Streaming
    streamingIndicator: "cursor",
  },

  /**
   * Modern Theme
   * Clean, minimal interface inspired by Dia. No avatars, no assistant bubble,
   * pill-shaped user bubbles, full-width assistant text.
   */
  modern: {
    // Avatars - none shown
    showUserAvatar: false,
    showAssistantAvatar: false,
    avatarSize: 32,
    avatarBorderRadius: "50%",
    avatarBorder: false,
    avatarMarginTop: 0,

    // Layout
    userMessageAlignment: "right",
    assistantMessageAlignment: "left",
    maxWidth: "768px",
    messageGap: 8,

    // Bubbles - user gets pill bubble, assistant is transparent
    bubbleStyle: "solid",
    showBubbleTail: false,
    bubbleBorderRadius: 22,
    flattenedCornerRadius: 0,
    bubblePadding: "10px 18px",

    // Colors
    userBubbleBackground: "var(--primary-color, hsl(var(--primary)))",
    userBubbleColor: "white",
    assistantBubbleBackground: "transparent",
    assistantBubbleColor: "hsl(var(--foreground))",

    // Dark mode
    darkAssistantBubbleBackground: "transparent",
    darkAssistantBubbleColor: "#e5e5ea",

    // Streaming
    streamingIndicator: "cursor",
  },
};

/**
 * Get a theme configuration by name, with fallback to default
 */
export function getChatTheme(themeName: string): ChatThemeConfig {
  return chatThemes[themeName] || chatThemes.default;
}

/**
 * Create a custom theme by merging with a base theme
 */
export function createCustomTheme(
  baseTheme: string | ChatThemeConfig,
  overrides: Partial<ChatThemeConfig>
): ChatThemeConfig {
  const base =
    typeof baseTheme === "string" ? getChatTheme(baseTheme) : baseTheme;
  return { ...base, ...overrides };
}

/**
 * Convert theme config to CSS custom properties
 * Useful for applying theme via inline styles
 */
export function themeToCSS(theme: ChatThemeConfig): Record<string, string> {
  // Extract horizontal padding from shorthand (e.g. "10px 18px" → "18px", "8px" → "8px")
  const paddingParts = theme.bubblePadding.split(/\s+/);
  const paddingX = paddingParts.length > 1 ? paddingParts[1] : paddingParts[0];

  return {
    "--chat-avatar-size": `${theme.avatarSize}px`,
    "--chat-avatar-border-radius": theme.avatarBorderRadius,
    "--chat-avatar-margin-top": `${theme.avatarMarginTop}px`,
    "--chat-max-width": theme.maxWidth,
    "--chat-message-gap": `${theme.messageGap}px`,
    "--chat-bubble-radius": `${theme.bubbleBorderRadius}px`,
    "--chat-flattened-corner": `${theme.flattenedCornerRadius}px`,
    "--chat-bubble-padding": theme.bubblePadding,
    "--chat-bubble-padding-x": paddingX,
    "--chat-user-bubble-bg": theme.userBubbleBackground,
    "--chat-user-bubble-color": theme.userBubbleColor,
    "--chat-assistant-bubble-bg": theme.assistantBubbleBackground,
    "--chat-assistant-bubble-color": theme.assistantBubbleColor,
    "--chat-dark-assistant-bubble-bg": theme.darkAssistantBubbleBackground,
    "--chat-dark-assistant-bubble-color": theme.darkAssistantBubbleColor,
  };
}

/**
 * Type for theme names (for TypeScript autocomplete)
 */
export type ChatThemeName = keyof typeof chatThemes;

/**
 * Default theme name
 */
export const DEFAULT_CHAT_THEME: ChatThemeName = "default";
