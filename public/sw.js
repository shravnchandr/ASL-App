/**
 * Service Worker — ASL Guide
 * Caches sign data, models, and app shell for offline support
 */

const CACHE_NAME = 'asl-guide-v1';
const SIGN_DATA_CACHE = 'asl-sign-data-v1';
const MODEL_CACHE = 'asl-models-v1';

// App shell — cached on install
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  const keepCaches = [CACHE_NAME, SIGN_DATA_CACHE, MODEL_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !keepCaches.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for sign data and models, network-first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Sign data JSON files — cache-first
  if (url.pathname.startsWith('/sign-data/')) {
    event.respondWith(
      caches.open(SIGN_DATA_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // ML model files — cache-first
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(
      caches.open(MODEL_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // API calls — network only
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // App shell and assets — stale-while-revalidate
  if (event.request.mode === 'navigate' || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});
