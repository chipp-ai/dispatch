/**
 * Playful Vanity Slug Generator
 *
 * Generates fun, memorable app slugs for vanity URLs.
 * Format: {adjective}-{verb}-{noun}-{random-suffix}
 *
 * Examples:
 *   happy-jumping-dolphin-x7k9
 *   cosmic-dancing-phoenix-m2p4
 *   sparkly-zooming-unicorn-t5n8
 *
 * Properties:
 * - Not sequential (can't enumerate by incrementing)
 * - Fun and memorable
 * - Human-readable
 * - Case-insensitive (lowercase only)
 */

// Alphanumeric chars excluding ambiguous ones (0,O,l,1,I)
const SUFFIX_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";
const DEFAULT_SUFFIX_LENGTH = 4;

// Fun, playful adjectives
const ADJECTIVES = [
  "happy",
  "swift",
  "clever",
  "bright",
  "cosmic",
  "fuzzy",
  "quantum",
  "nimble",
  "mighty",
  "jolly",
  "lucky",
  "sparkly",
  "bouncy",
  "blazing",
  "mystic",
  "gentle",
  "brave",
  "cheerful",
  "daring",
  "eager",
  "fancy",
  "groovy",
  "humble",
  "jazzy",
  "keen",
  "lively",
  "merry",
  "noble",
  "plucky",
  "quirky",
  "radiant",
  "snappy",
  "tiny",
  "ultra",
  "vivid",
  "witty",
  "zesty",
  "calm",
  "bold",
  "crisp",
  "dreamy",
  "epic",
  "fierce",
  "golden",
  "hidden",
  "icy",
  "jade",
  "kind",
  "lunar",
  "magic",
  "neon",
  "orange",
  "pastel",
  "quiet",
  "royal",
  "sunny",
  "turbo",
  "velvet",
  "wonder",
];

// Action verbs (present participle form for flow)
const VERBS = [
  "jumping",
  "dancing",
  "flying",
  "spinning",
  "zooming",
  "gliding",
  "bouncing",
  "racing",
  "soaring",
  "dashing",
  "prancing",
  "twirling",
  "leaping",
  "surfing",
  "zipping",
  "singing",
  "beaming",
  "blazing",
  "chasing",
  "diving",
  "floating",
  "glowing",
  "hiking",
  "jogging",
  "kicking",
  "laughing",
  "marching",
  "nodding",
  "orbiting",
  "playing",
  "questing",
  "rolling",
  "skating",
  "tumbling",
  "vaulting",
  "waving",
  "yawning",
  "zigzag",
  "bubbling",
  "climbing",
  "dreaming",
  "echoing",
  "flipping",
  "growing",
  "hopping",
  "inventing",
  "juggling",
  "knitting",
  "lifting",
  "munching",
  "napping",
  "painting",
  "quilting",
  "resting",
  "sliding",
  "tapping",
  "unwinding",
  "visiting",
  "wandering",
];

// Fun, memorable nouns
const NOUNS = [
  "dolphin",
  "phoenix",
  "wizard",
  "rocket",
  "panda",
  "unicorn",
  "falcon",
  "dragon",
  "otter",
  "koala",
  "penguin",
  "narwhal",
  "yeti",
  "octopus",
  "quasar",
  "asteroid",
  "bunny",
  "comet",
  "duckling",
  "elephant",
  "firefly",
  "giraffe",
  "hedgehog",
  "iguana",
  "jellyfish",
  "kitten",
  "llama",
  "mammoth",
  "nebula",
  "owl",
  "parrot",
  "quokka",
  "raccoon",
  "sloth",
  "turtle",
  "umbrella",
  "volcano",
  "walrus",
  "xray",
  "yak",
  "zebra",
  "acorn",
  "balloon",
  "crystal",
  "donut",
  "eclipse",
  "forest",
  "galaxy",
  "horizon",
  "island",
  "jungle",
  "kiwi",
  "lantern",
  "meadow",
  "nova",
  "ocean",
  "pickle",
  "rainbow",
  "sunset",
  "tornado",
];

/**
 * Generate a cryptographically random suffix
 */
function generateRandomSuffix(length: number = DEFAULT_SUFFIX_LENGTH): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  let suffix = "";
  for (let i = 0; i < length; i++) {
    suffix += SUFFIX_CHARS[array[i] % SUFFIX_CHARS.length];
  }
  return suffix;
}

/**
 * Pick a random element from an array using crypto-secure randomness
 */
function pickRandom(array: readonly string[]): string {
  const randomIndex =
    crypto.getRandomValues(new Uint32Array(1))[0] % array.length;
  return array[randomIndex];
}

/**
 * Slugify a name for URL usage (kept for migrateSlug compatibility)
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/[\s_-]+/g, "-") // Replace spaces/underscores with dashes
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing dashes
}

/**
 * Generate a playful vanity slug
 *
 * Creates a fun, memorable slug using random adjective-verb-noun combination.
 * The appName parameter is ignored (kept for backward compatibility).
 *
 * @param _appName - Ignored (kept for backward compatibility)
 * @param suffixLength - Length of random suffix (default 4)
 * @returns Vanity slug like "happy-jumping-dolphin-x7k9"
 */
export function generateVanitySlug(
  _appName?: string,
  suffixLength: number = DEFAULT_SUFFIX_LENGTH
): string {
  const adjective = pickRandom(ADJECTIVES);
  const verb = pickRandom(VERBS);
  const noun = pickRandom(NOUNS);
  const suffix = generateRandomSuffix(suffixLength);

  return `${adjective}-${verb}-${noun}-${suffix}`;
}

/**
 * Check if a slug looks like the old enumerable format
 *
 * Old format: "name-123" where 123 is a sequential integer
 * New format: "name-x7k9" where x7k9 is random alphanumeric
 */
export function isEnumerableSlug(slug: string): boolean {
  // Matches slugs ending in -<number>
  return /^.+-\d+$/.test(slug);
}

/**
 * Migrate an old-style slug to new secure format
 *
 * If the slug is already secure (non-enumerable), returns it unchanged.
 * If enumerable (ends in number), regenerates the suffix.
 *
 * @param oldSlug - The existing slug
 * @param appName - The app name (for regenerating)
 * @returns Secure slug
 */
export function migrateSlug(oldSlug: string, appName: string): string {
  if (isEnumerableSlug(oldSlug)) {
    // Generate new secure slug
    return generateVanitySlug(appName);
  }
  // Already secure, keep it
  return oldSlug;
}

/**
 * Ensure slug is unique by adding more random chars if needed
 */
export async function ensureUniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>,
  maxAttempts: number = 10
): Promise<string> {
  let slug = baseSlug;
  let attempts = 0;

  while ((await checkExists(slug)) && attempts < maxAttempts) {
    // Add more randomness
    const extraSuffix = generateRandomSuffix(2);
    slug = `${baseSlug}-${extraSuffix}`;
    attempts++;
  }

  if (attempts >= maxAttempts) {
    // Fallback: use full random slug
    slug = `app-${generateRandomSuffix(8)}`;
  }

  return slug;
}

// Export for testing
export { slugify, generateRandomSuffix };
