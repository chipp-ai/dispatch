/**
 * Color utility functions for the app generator
 */

/**
 * Adjusts a hex color by a given amount (lighter or darker)
 * @param hex - The hex color to adjust (e.g., "#5B72EE")
 * @param amount - The amount to adjust by (positive = lighter, negative = darker)
 * @returns The adjusted hex color
 */
export const adjustColor = (hex: string, amount: number): string => {
  const clamp = (num: number) => Math.min(255, Math.max(0, num));

  // Remove # if present
  const cleanHex = hex.replace("#", "");

  // Handle 3-character hex codes
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((char) => char + char)
          .join("")
      : cleanHex;

  // Convert hex to RGB
  const num = parseInt(fullHex, 16);
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0x00ff) + amount);
  const b = clamp((num & 0x0000ff) + amount);

  // Convert back to hex
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

/**
 * Generates gradient colors based on a primary color
 * @param primaryColor - The primary color to base the gradient on
 * @returns An object with gradient colors
 */
export const getButtonGradientColors = (primaryColor?: string) => {
  if (!primaryColor) {
    // Fallback to default purple-pink gradient
    return {
      from: "#9333ea", // purple-600
      to: "#ec4899", // pink-600
    };
  }

  // Create a lighter variant for gradient effect
  const lighterColor = adjustColor(primaryColor, 40);
  const darkerColor = adjustColor(primaryColor, -20);

  return {
    from: darkerColor,
    to: lighterColor,
  };
};
