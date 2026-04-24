/* ============================================
   SAFESTOCK AI — SERVICE WORKER
   Provides offline caching for PWA installability
   ============================================ */

const CACHE_NAME = "safestock-ai-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

const CDN_ASSETS = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

/**
 * INSTALL — Cache all static assets
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      /* Cache static assets first (critical) */
      return cache.addAll(STATIC_ASSETS).then(() => {
        /* Cache CDN assets with individual error handling
           so one CDN failure doesn't block installation */
        return Promise.allSettled(
          CDN_ASSETS.map((url) =>
            fetch(url, { mode: "cors" })
              .then((response) => {
                if (response.ok) {
                  return cache.put(url, response);
                }
                return Promise.resolve();
              })
              .catch(() => Promise.resolve())
          )
        );
      });
    })
  );
  /* Activate immediately without waiting */
  self.skipWaiting();
});

/**
 * ACTIVATE — Clean up old caches
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  /* Claim all open clients immediately */
  self.clients.claim();
});

/**
 * FETCH — Network-first with cache fallback strategy
 * - For navigation requests: try network, fall back to cached index.html
 * - For static assets: try cache first, then network
 * - For CDN/external: try network first, then cache
 */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  /* Skip non-GET requests */
  if (event.request.method !== "GET") {
    return;
  }

  /* Skip chrome-extension and other non-http protocols */
  if (!url.protocol.startsWith("http")) {
    return;
  }

  /* Navigation requests — network first, cache fallback */
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          /* Cache the latest version */
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match("./index.html").then((cached) => {
            return cached || new Response("Offline — Please check your connection.", {
              status: 503,
              headers: { "Content-Type": "text/plain" }
            });
          });
        })
    );
    return;
  }

  /* Static local assets — cache first */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          /* Return cached, but also update in background */
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, response);
                });
              }
            })
            .catch(() => {});
          return cached;
        }
        /* Not in cache — fetch from network */
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  /* External/CDN assets — network first with cache fallback */
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response("", { status: 408 });
        });
      })
  );
});

/**
 * MESSAGE — Handle skip-waiting messages from the client
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
