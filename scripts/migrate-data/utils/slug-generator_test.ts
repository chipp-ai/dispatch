/**
 * Unit Tests for Slug Generator
 */

import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import {
  generateVanitySlug,
  isEnumerableSlug,
  migrateSlug,
  ensureUniqueSlug,
  slugify,
  generateRandomSuffix,
} from "./slug-generator.ts";

// ========================================
// slugify Tests
// ========================================

Deno.test("slugify - converts to lowercase", () => {
  assertEquals(slugify("Hello World"), "hello-world");
  assertEquals(slugify("UPPERCASE"), "uppercase");
});

Deno.test("slugify - replaces spaces with dashes", () => {
  assertEquals(slugify("hello world"), "hello-world");
  assertEquals(slugify("hello   world"), "hello-world");
});

Deno.test("slugify - replaces underscores with dashes", () => {
  assertEquals(slugify("hello_world"), "hello-world");
  assertEquals(slugify("hello___world"), "hello-world");
});

Deno.test("slugify - removes special characters", () => {
  assertEquals(slugify("hello@world!"), "helloworld");
  assertEquals(slugify("test#$%app"), "testapp");
});

Deno.test("slugify - trims leading and trailing dashes", () => {
  assertEquals(slugify("-hello-"), "hello");
  assertEquals(slugify("--hello--"), "hello");
});

Deno.test("slugify - handles empty string", () => {
  assertEquals(slugify(""), "");
  assertEquals(slugify("   "), "");
});

// ========================================
// generateRandomSuffix Tests
// ========================================

Deno.test("generateRandomSuffix - generates correct length", () => {
  assertEquals(generateRandomSuffix(4).length, 4);
  assertEquals(generateRandomSuffix(6).length, 6);
  assertEquals(generateRandomSuffix(8).length, 8);
});

Deno.test("generateRandomSuffix - uses only allowed characters", () => {
  const allowed = /^[23456789abcdefghjkmnpqrstuvwxyz]+$/;
  for (let i = 0; i < 100; i++) {
    const suffix = generateRandomSuffix(10);
    assertMatch(suffix, allowed);
  }
});

Deno.test("generateRandomSuffix - generates unique values", () => {
  const suffixes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    suffixes.add(generateRandomSuffix(8));
  }
  // With 8 chars, collisions should be extremely rare
  assertEquals(suffixes.size, 100);
});

// ========================================
// generateVanitySlug Tests
// ========================================

// Pattern for playful slugs: adjective-verb-noun-suffix
const PLAYFUL_SLUG_PATTERN = /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]{4}$/;
const PLAYFUL_SLUG_PATTERN_6 = /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]{6}$/;

Deno.test(
  "generateVanitySlug - creates playful adjective-verb-noun slug",
  () => {
    const slug = generateVanitySlug("My Cool App");
    assertMatch(slug, PLAYFUL_SLUG_PATTERN);
    // Verify it has 4 parts (adjective, verb, noun, suffix)
    const parts = slug.split("-");
    assertEquals(parts.length, 4);
  }
);

Deno.test("generateVanitySlug - ignores app name (uses random words)", () => {
  const slug = generateVanitySlug("Test@App#123!");
  assertMatch(slug, PLAYFUL_SLUG_PATTERN);
  // Should NOT contain any part of the original name
  assertEquals(slug.includes("test"), false);
  assertEquals(slug.includes("app123"), false);
});

Deno.test("generateVanitySlug - works with empty name", () => {
  const slug = generateVanitySlug("");
  assertMatch(slug, PLAYFUL_SLUG_PATTERN);
});

Deno.test("generateVanitySlug - works with whitespace-only name", () => {
  const slug = generateVanitySlug("   ");
  assertMatch(slug, PLAYFUL_SLUG_PATTERN);
});

Deno.test("generateVanitySlug - works without any argument", () => {
  const slug = generateVanitySlug();
  assertMatch(slug, PLAYFUL_SLUG_PATTERN);
});

Deno.test("generateVanitySlug - custom suffix length", () => {
  const slug = generateVanitySlug("Test", 6);
  assertMatch(slug, PLAYFUL_SLUG_PATTERN_6);
});

Deno.test("generateVanitySlug - generates unique slugs", () => {
  const slugs = new Set<string>();
  for (let i = 0; i < 100; i++) {
    slugs.add(generateVanitySlug("Same Name"));
  }
  assertEquals(slugs.size, 100);
});

Deno.test("generateVanitySlug - produces readable words", () => {
  // Generate several slugs and verify they look like real words
  for (let i = 0; i < 10; i++) {
    const slug = generateVanitySlug();
    const parts = slug.split("-");
    // Each word part should be at least 2 characters
    assertEquals(
      parts[0].length >= 2,
      true,
      `Adjective too short: ${parts[0]}`
    );
    assertEquals(parts[1].length >= 2, true, `Verb too short: ${parts[1]}`);
    assertEquals(parts[2].length >= 2, true, `Noun too short: ${parts[2]}`);
  }
});

// ========================================
// isEnumerableSlug Tests
// ========================================

Deno.test("isEnumerableSlug - detects old sequential format", () => {
  assertEquals(isEnumerableSlug("my-app-123"), true);
  assertEquals(isEnumerableSlug("test-1"), true);
  assertEquals(isEnumerableSlug("chatbot-99999"), true);
});

Deno.test("isEnumerableSlug - rejects new secure format", () => {
  assertEquals(isEnumerableSlug("my-app-x7k9"), false);
  assertEquals(isEnumerableSlug("test-abcd"), false);
  assertEquals(isEnumerableSlug("chatbot-a1b2"), false);
});

Deno.test("isEnumerableSlug - rejects slugs without suffix", () => {
  assertEquals(isEnumerableSlug("my-app"), false);
  assertEquals(isEnumerableSlug("test"), false);
});

// ========================================
// migrateSlug Tests
// ========================================

Deno.test("migrateSlug - keeps secure slugs unchanged", () => {
  const slug = "my-app-x7k9";
  assertEquals(migrateSlug(slug, "My App"), slug);
});

Deno.test("migrateSlug - regenerates enumerable slugs", () => {
  const oldSlug = "my-app-123";
  const newSlug = migrateSlug(oldSlug, "My App");

  assertNotEquals(newSlug, oldSlug);
  // New format is playful adjective-verb-noun-suffix
  assertMatch(newSlug, PLAYFUL_SLUG_PATTERN);
});

// ========================================
// ensureUniqueSlug Tests
// ========================================

Deno.test("ensureUniqueSlug - returns slug if unique", async () => {
  const checkExists = () => Promise.resolve(false);
  const slug = await ensureUniqueSlug("test-app", checkExists);
  assertEquals(slug, "test-app");
});

Deno.test("ensureUniqueSlug - adds suffix if exists", async () => {
  let calls = 0;
  const checkExists = (slug: string) => {
    calls++;
    // First call (original slug) exists, second doesn't
    return Promise.resolve(slug === "test-app");
  };

  const slug = await ensureUniqueSlug("test-app", checkExists);
  assertMatch(slug, /^test-app-[a-z0-9]{2}$/);
  assertEquals(calls, 2);
});

Deno.test(
  "ensureUniqueSlug - falls back to random after max attempts",
  async () => {
    const checkExists = () => Promise.resolve(true);
    const slug = await ensureUniqueSlug("test-app", checkExists, 5);

    // Falls back to app-{8 random chars}
    assertMatch(slug, /^app-[a-z0-9]{8}$/);
  }
);
