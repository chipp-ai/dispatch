/**
 * Chat Theme System Exports
 *
 * Composable theme system for chat interfaces.
 *
 * @example
 * // Use a built-in theme
 * import { getChatTheme } from '$lib/design-system/themes';
 * const theme = getChatTheme('modern');
 *
 * @example
 * // Create a custom theme
 * import { createCustomTheme, chatThemes } from '$lib/design-system/themes';
 * const customTheme = createCustomTheme('modern', {
 *   showUserAvatar: true,
 *   bubbleBorderRadius: 24,
 * });
 *
 * @example
 * // Define a completely new theme
 * import type { ChatThemeConfig } from '$lib/design-system/themes';
 * const myTheme: ChatThemeConfig = {
 *   showUserAvatar: true,
 *   showAssistantAvatar: true,
 *   // ... all other required properties
 * };
 */

export {
  chatThemes,
  getChatTheme,
  createCustomTheme,
  themeToCSS,
  DEFAULT_CHAT_THEME,
  type ChatThemeConfig,
  type ChatThemeName,
} from "./chatThemes";
