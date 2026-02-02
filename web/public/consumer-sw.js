/**
 * Consumer Chat Service Worker
 *
 * Handles caching and offline support for consumer chat PWA.
 * Each app gets its own cache namespace based on appNameId.
 */

const SW_VERSION = "v1.0.0";
const CACHE_PREFIX = "chipp-consumer";

// Detect development mode
const isDevelopment =
  self.location.hostname === "localhost" ||
  self.location.hostname.includes("ngrok") ||
  self.location.hostname === "127.0.0.1";

// Static assets to cache on install
const STATIC_ASSETS = ["/offline.html"];

// Patterns to cache dynamically
const DYNAMIC_CACHE_PATTERNS = [
  /\/assets\//,
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.png$/,
  /\.jpg$/,
  /\.svg$/,
];

// Patterns that should always go to network
const NETWORK_ONLY_PATTERNS = [
  /\/consumer\/.*\/chat\/stream/, // SSE streaming
  /\/consumer\/.*\/session-activity/, // Analytics
  /\/consumer\/.*\/auth\//, // Auth endpoints
];

/**
 * Get cache name for a specific app
 */
function getCacheName(appNameId) {
  return `${CACHE_PREFIX}-${appNameId || "default"}-${SW_VERSION}`;
}

/**
 * Extract appNameId from URL
 */
function getAppNameId(url) {
  const match = url.match(/\/w\/chat\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Check if URL should bypass cache
 */
function shouldBypassCache(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Check if URL should be cached dynamically
 */
function shouldCacheDynamically(url) {
  return DYNAMIC_CACHE_PATTERNS.some((pattern) => pattern.test(url));
}

// Install event
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}`);

  event.waitUntil(
    caches.open(getCacheName(null)).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to cache ${url}:`, err);
          })
        )
      );
    })
  );

  // Activate immediately
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating ${SW_VERSION}`);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Clean up old version caches
          if (
            cacheName.startsWith(CACHE_PREFIX) &&
            !cacheName.includes(SW_VERSION)
          ) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control immediately
  self.clients.claim();
});

// Fetch event
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip cache for certain patterns
  if (shouldBypassCache(url)) {
    return;
  }

  // Development mode: network only
  if (isDevelopment) {
    return;
  }

  event.respondWith(
    (async () => {
      const appNameId = getAppNameId(url);
      const cacheName = getCacheName(appNameId);

      // Try cache first for static assets
      if (shouldCacheDynamically(url)) {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          // Stale-while-revalidate: return cache, update in background
          event.waitUntil(
            fetch(event.request)
              .then((response) => {
                if (response.ok) {
                  const responseClone = response.clone();
                  caches.open(cacheName).then((cache) => {
                    cache.put(event.request, responseClone);
                  });
                }
              })
              .catch(() => {})
          );
          return cachedResponse;
        }
      }

      // Network first, fallback to cache
      try {
        const response = await fetch(event.request);

        // Cache successful responses
        if (response.ok && shouldCacheDynamically(url)) {
          const responseClone = response.clone();
          caches.open(cacheName).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }

        return response;
      } catch (error) {
        // Try cache on network failure
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Return offline page for navigation requests
        if (event.request.mode === "navigate") {
          const offlineResponse = await caches.match("/offline.html");
          if (offlineResponse) {
            return offlineResponse;
          }
        }

        throw error;
      }
    })()
  );
});

// Handle skip waiting message from client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
