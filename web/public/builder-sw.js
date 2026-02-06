/**
 * Builder Dashboard Service Worker
 *
 * Handles caching and offline support for the Chipp builder dashboard PWA.
 * Separate from consumer-sw.js which handles individual chatbot PWAs.
 */

const SW_VERSION = "v1.0.0";
const CACHE_NAME = `chipp-builder-${SW_VERSION}`;

// Detect development mode
const isDevelopment =
  self.location.hostname === "localhost" ||
  self.location.hostname.includes("ngrok") ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname.endsWith(".localhost");

// Static assets to pre-cache on install
const PRECACHE_ASSETS = ["/offline.html"];

// Patterns for cacheable static assets
const STATIC_ASSET_PATTERNS = [
  /\/assets\//,
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.png$/,
  /\.jpg$/,
  /\.svg$/,
];

// Patterns that should always go to network (never cache)
const NETWORK_ONLY_PATTERNS = [
  /\/api\//, // All API calls
  /\/auth\//, // Auth endpoints
  /\/ws/, // WebSocket
  /\/consumer\//, // Consumer routes
  /\/debug\//, // Debug routes
  /\/dev\//, // Dev routes
];

/**
 * Check if URL should bypass cache entirely
 */
function shouldBypassCache(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Check if URL is a cacheable static asset
 */
function isStaticAsset(url) {
  return STATIC_ASSET_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Clean response to handle opaque redirects
 */
function cleanResponse(response) {
  if (response.redirected) {
    return response.clone();
  }
  return response;
}

// Install event - pre-cache essential assets
self.addEventListener("install", (event) => {
  console.log(`[Builder SW] Installing ${SW_VERSION}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[Builder SW] Failed to precache ${url}:`, err);
          })
        )
      );
    })
  );

  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log(`[Builder SW] Activating ${SW_VERSION}`);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith("chipp-builder-") && cacheName !== CACHE_NAME) {
            console.log(`[Builder SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - caching strategies
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Network-only patterns (API, auth, etc.)
  if (shouldBypassCache(url)) return;

  // Development mode: network only for everything
  if (isDevelopment) return;

  event.respondWith(
    (async () => {
      // Static assets: stale-while-revalidate
      if (isStaticAsset(url)) {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          // Return cached, update in background
          event.waitUntil(
            fetch(event.request)
              .then((response) => {
                if (response.ok) {
                  const cleaned = cleanResponse(response);
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, cleaned.clone());
                  });
                }
              })
              .catch(() => {})
          );
          return cachedResponse;
        }
      }

      // Everything else: network-first with cache fallback
      try {
        const response = await fetch(event.request);
        const cleaned = cleanResponse(response);

        // Cache successful static asset responses
        if (cleaned.ok && isStaticAsset(url)) {
          const responseClone = cleaned.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }

        return cleaned;
      } catch (error) {
        // Try cache on network failure
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // Return offline page for navigation requests
        if (event.request.mode === "navigate") {
          const offlineResponse = await caches.match("/offline.html");
          if (offlineResponse) return offlineResponse;
        }

        throw error;
      }
    })()
  );
});

// Handle messages from client
self.addEventListener("message", (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "CLEAR_CACHE":
      caches.delete(CACHE_NAME).then(() => {
        console.log("[Builder SW] Cache cleared");
      });
      break;
  }
});
