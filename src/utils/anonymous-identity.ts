/**
 * Anonymous Identity System
 *
 * Generates cute "Adjective Animal" display names and deterministic
 * avatar colors for anonymous multiplayer chat participants.
 */

const CUTE_ADJECTIVES = [
  "happy", "fuzzy", "sparkly", "bouncy", "jolly", "cheerful",
  "cozy", "gentle", "merry", "snappy", "sunny", "lively",
  "quirky", "dreamy", "golden", "velvet", "calm", "bright",
  "cosmic", "mystic", "tiny", "bold", "swift", "clever",
];

const ANIMALS = [
  "dolphin", "panda", "unicorn", "otter", "koala", "penguin",
  "narwhal", "octopus", "bunny", "duckling", "giraffe", "hedgehog",
  "kitten", "llama", "owl", "parrot", "quokka", "raccoon",
  "sloth", "turtle", "walrus", "zebra", "fox", "puppy",
];

/**
 * Generate a random anonymous display name like "Sparkly Otter"
 */
export function generateAnonymousName(): string {
  const adjBytes = new Uint32Array(1);
  const animalBytes = new Uint32Array(1);
  crypto.getRandomValues(adjBytes);
  crypto.getRandomValues(animalBytes);

  const adj = CUTE_ADJECTIVES[adjBytes[0] % CUTE_ADJECTIVES.length];
  const animal = ANIMALS[animalBytes[0] % ANIMALS.length];

  return capitalizeDisplayName(`${adj} ${animal}`);
}

/**
 * Deterministic avatar color from display name using djb2 hash.
 * Returns an HSL color string with good saturation and brightness.
 */
export function getAvatarColor(displayName: string): string {
  let hash = 5381;
  for (let i = 0; i < displayName.length; i++) {
    hash = ((hash << 5) + hash + displayName.charCodeAt(i)) & 0xffffffff;
  }
  // Use absolute value for positive hue
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Capitalize each word in a display name.
 * "sparkly otter" -> "Sparkly Otter"
 */
export function capitalizeDisplayName(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
