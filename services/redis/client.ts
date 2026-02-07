/**
 * Redis Client
 *
 * Connection management and utilities for Redis.
 * Uses deno.land/x/redis - a Deno-native Redis client.
 */

import { connect, type Redis } from "redis";
import { log } from "@/lib/logger.ts";

let client: Redis | null = null;

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
  const redisUrl = Deno.env.get("REDIS_URL");

  if (!redisUrl) {
    log.info("No REDIS_URL configured, skipping initialization", { source: "redis", feature: "init" });
    return;
  }

  try {
    // Parse Redis URL
    const url = new URL(redisUrl);
    const hostname = url.hostname;
    const port = parseInt(url.port) || 6379;
    const password = url.password || undefined;

    client = await connect({
      hostname,
      port,
      password,
      maxRetryCount: 10,
    });

    log.info("Connected", { source: "redis", feature: "init" });
  } catch (error) {
    log.error("Failed to initialize", { source: "redis", feature: "init" }, error);
    client = null;
  }
}

/**
 * Get Redis client
 */
export function getRedis(): Redis | null {
  return client;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return client !== null && client.isConnected;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (client) {
    client.close();
    client = null;
    log.info("Disconnected", { source: "redis", feature: "shutdown" });
  }
}

// ============================================================
// Cache Utilities
// ============================================================

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get a cached value
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!client) return null;

  try {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    log.error("Cache get error", { source: "redis", feature: "cache-get", key }, error);
    return null;
  }
}

/**
 * Set a cached value
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL
): Promise<boolean> {
  if (!client) return false;

  try {
    await client.set(key, JSON.stringify(value), { ex: ttlSeconds });
    return true;
  } catch (error) {
    log.error("Cache set error", { source: "redis", feature: "cache-set", key }, error);
    return false;
  }
}

/**
 * Delete a cached value
 */
export async function cacheDelete(key: string): Promise<boolean> {
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (error) {
    log.error("Cache delete error", { source: "redis", feature: "cache-delete", key }, error);
    return false;
  }
}

/**
 * Delete cached values by pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  if (!client) return 0;

  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    return await client.del(...keys);
  } catch (error) {
    log.error("Cache delete pattern error", { source: "redis", feature: "cache-delete-pattern", pattern }, error);
    return 0;
  }
}

/**
 * Get or set a cached value (cache-aside pattern)
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const fresh = await fetcher();

  // Store in cache (don't await, fire and forget)
  cacheSet(key, fresh, ttlSeconds).catch(() => {});

  return fresh;
}

// ============================================================
// Application-Specific Cache Keys
// ============================================================

/**
 * Generate cache key for an application
 */
export function appCacheKey(appId: string, version = "v3"): string {
  return `app:${version}:${appId}`;
}

/**
 * Generate cache key for user data
 */
export function userCacheKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * Generate cache key for organization data
 */
export function orgCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

/**
 * Invalidate all cache for an application
 */
export async function invalidateAppCache(appId: string): Promise<void> {
  await cacheDeletePattern(`app:*:${appId}`);
}

/**
 * Invalidate all cache for a user
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await cacheDelete(userCacheKey(userId));
}

/**
 * Invalidate all cache for an organization
 */
export async function invalidateOrgCache(orgId: string): Promise<void> {
  await cacheDeletePattern(`org:${orgId}*`);
}
