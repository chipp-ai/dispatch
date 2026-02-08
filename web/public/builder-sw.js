/**
 * Builder Dashboard Service Worker
 *
 * Handles caching for the Chipp builder dashboard PWA.
 * Separate from consumer-sw.js which handles individual chatbot PWAs.
 *
 * Caching strategies:
 *   - Hashed assets (/assets/Foo-A1B2C3.js): Cache-first (immutable, hash = version)
 *   - Navigation requests (index.html): Network-first (pick up new chunk refs on deploy)
 *   - API/auth/WS: Network-only (never cache)
 *   - Other static assets: Stale-while-revalidate
 */

const SW_VERSION = "v1.1.0";
const CACHE_NAME = `chipp-builder-${SW_VERSION}`;

// Detect development mode
const isDevelopment =
  self.location.hostname === "localhost" ||
  self.location.hostname.includes("ngrok") ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname.endsWith(".localhost");

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
 * Content-hashed assets are immutable. The hash in the filename
 * (e.g., Login-ZW_2cVN8.js) guarantees the content never changes.
 * Cache-first is safe and optimal - no revalidation needed.
 */
const HASHED_ASSET_PATTERN = /\/assets\/[^/]+-[a-zA-Z0-9_-]{6,}\.(js|css)$/;

/**
 * Other static assets that benefit from caching but may change.
 */
const STATIC_ASSET_PATTERNS = [/\.woff2?$/, /\.png$/, /\.jpg$/, /\.svg$/];

function shouldBypassCache(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
}

function isHashedAsset(url) {
  return HASHED_ASSET_PATTERN.test(url);
}

function isStaticAsset(url) {
  return STATIC_ASSET_PATTERNS.some((pattern) => pattern.test(url));
}

// Install event - activate immediately
self.addEventListener("install", (event) => {
  console.log(`[Builder SW] Installing ${SW_VERSION}`);
  self.skipWaiting();
});

// Activate event - clean up old caches, claim clients
self.addEventListener("activate", (event) => {
  console.log(`[Builder SW] Activating ${SW_VERSION}`);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName.startsWith("chipp-builder-") &&
            cacheName !== CACHE_NAME
          ) {
            console.log(`[Builder SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  self.clients.claim();
});

// Fetch event - route to appropriate caching strategy
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Network-only patterns (API, auth, etc.)
  if (shouldBypassCache(url)) return;

  // Development mode: network only for everything
  if (isDevelopment) return;

  // Navigation requests (index.html): network-first
  // This ensures users get fresh HTML with new chunk references after a deploy.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the HTML for offline fallback
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          // Offline: try cached HTML, then offline page
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
          return new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  // Content-hashed assets: cache-first (immutable)
  // The hash in the filename guarantees content correctness.
  // Once cached, we never need to re-fetch.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // Not in cache - fetch from network and cache for future use
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Other static assets (fonts, images): stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // Everything else: network-first with no caching
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
