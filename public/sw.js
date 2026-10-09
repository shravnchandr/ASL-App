/**
 * Service Worker — ASL Guide
 * Caches sign data, models, and app shell for offline support
 */

// Bump these when the caching strategy changes; activate() deletes old caches.
const CACHE_NAME = 'asl-guide-v2';
const SIGN_DATA_CACHE = 'asl-sign-data-v2';
// ML model files are cached as complete, versioned bundles (see serveModelFile)
const MODEL_BUNDLE_PREFIX = 'asl-model-bundle-';
const MODEL_POINTER_CACHE = 'asl-model-pointer-v1';
const MODEL_POINTER_KEY = '/__current-model-bundle';
const MODEL_DIR = '/models/asl-classifier/';
// Everything one classifier load reads; must stay in sync with useASLClassifier
const MODEL_FILES = ['model.json', 'group1-shard1of1.bin', 'labels.json', 'scaler.json'];
// Requests within this window share one bundle download (one page load = 4 requests)
const MODEL_REFRESH_WINDOW_MS = 60 * 1000;

// Hashed /assets/* files accumulate across deploys; keep the newest N.
const MAX_ASSET_ENTRIES = 80;

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
  const keepCaches = [CACHE_NAME, SIGN_DATA_CACHE, MODEL_POINTER_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !keepCaches.includes(k) && !k.startsWith(MODEL_BUNDLE_PREFIX))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Only cache real data responses. A missing file can come back as the SPA's
// index.html, which must never be stored under a .json / model URL.
function isCacheableData(response) {
  if (!response.ok) return false;
  const type = response.headers.get('content-type') || '';
  return !type.includes('text/html');
}

async function trimAssets(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  // Only /assets/* entries — never evict the app shell
  const keys = (await cache.keys()).filter((k) => new URL(k.url).pathname.startsWith('/assets/'));
  // keys() is in insertion order — drop the oldest
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((k) => cache.delete(k)));
}

// Serve from cache immediately (fast, works offline) and refresh in the
// background, so updated sign data / retrained models reach users on the next load.
function staleWhileRevalidate(event, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (isCacheableData(response)) event.waitUntil(cache.put(event.request, response.clone()));
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    })
  );
}

// ── Model bundles ───────────────────────────────────────────────────────────
// Topology, weights, scaler and labels must come from the same training run.
//
// 1. A refresh downloads all files; only if every one succeeds are they written
//    to a new immutable bundle cache, and only then is the pointer switched to it.
// 2. Each page (service-worker client) is pinned to ONE bundle on its first model
//    request and every later file it asks for comes from that bundle — even if a
//    refresh fails for the topology and a later one would succeed for the weights.
//    Pins are kept in memory (shared synchronously by concurrent requests) and in
//    Cache Storage (survive the worker being stopped between requests).
// 3. Old bundles are deleted only when no live page is pinned to them.

const MODEL_PIN_PREFIX = '/__model-pin/';
let modelRefresh = null;              // { startedAt, promise<bundleName> }
const clientBundles = new Map();      // clientId → promise<bundleName | null>
const resolvedPins = new Map();       // clientId → bundleName, set as soon as it is known

async function currentModelBundle() {
  const pointer = await caches.open(MODEL_POINTER_CACHE);
  const entry = await pointer.match(MODEL_POINTER_KEY);
  return entry ? entry.text() : null;
}

/** Bundle names still pinned by an open page; prunes pins of closed pages. */
async function livePinnedBundles() {
  const pointer = await caches.open(MODEL_POINTER_CACHE);
  const live = new Set();
  for (const [clientId, name] of resolvedPins) {
    if (await self.clients.get(clientId)) live.add(name);
    else resolvedPins.delete(clientId);
  }
  for (const request of await pointer.keys()) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(MODEL_PIN_PREFIX)) continue;
    const clientId = decodeURIComponent(path.slice(MODEL_PIN_PREFIX.length));
    if (await self.clients.get(clientId)) {
      const entry = await pointer.match(request);
      if (entry) live.add(await entry.text());
    } else {
      await pointer.delete(request);
      clientBundles.delete(clientId);
    }
  }
  return live;
}

function refreshModelBundle() {
  const now = Date.now();
  if (modelRefresh && now - modelRefresh.startedAt < MODEL_REFRESH_WINDOW_MS) {
    return modelRefresh.promise;
  }
  const promise = (async () => {
    const responses = await Promise.all(
      MODEL_FILES.map((f) => fetch(MODEL_DIR + f, { cache: 'no-cache' }))
    );
    if (!responses.every(isCacheableData)) throw new Error('incomplete model bundle');

    const name = MODEL_BUNDLE_PREFIX + now;
    const bundle = await caches.open(name);
    await Promise.all(MODEL_FILES.map((f, i) => bundle.put(MODEL_DIR + f, responses[i])));

    const pointer = await caches.open(MODEL_POINTER_CACHE);
    await pointer.put(MODEL_POINTER_KEY, new Response(name));

    const keep = await livePinnedBundles();
    keep.add(name);
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(MODEL_BUNDLE_PREFIX) && !keep.has(k)).map((k) => caches.delete(k))
    );
    return name;
  })();
  modelRefresh = { startedAt: now, promise };
  // A failed refresh may be retried by *other* pages; pinned pages never switch.
  promise.catch(() => {
    if (modelRefresh && modelRefresh.promise === promise) modelRefresh = null;
  });
  return promise;
}

/** New bundle if a refresh succeeds, else the last complete one (offline / partial failure). */
async function resolveModelBundle() {
  try {
    return await refreshModelBundle();
  } catch {
    return currentModelBundle();
  }
}

async function readPin(clientId) {
  const pointer = await caches.open(MODEL_POINTER_CACHE);
  const entry = await pointer.match(MODEL_PIN_PREFIX + encodeURIComponent(clientId));
  const name = entry ? await entry.text() : null;
  return name && (await caches.has(name)) ? name : null;
}

async function pinBundle(clientId, name) {
  const pointer = await caches.open(MODEL_POINTER_CACHE);
  await pointer.put(MODEL_PIN_PREFIX + encodeURIComponent(clientId), new Response(name));
}

/**
 * The one bundle every model file for this page comes from, or null when no
 * complete bundle exists (nothing cached and the download failed).
 */
function bundleForClient(event) {
  const clientId = event.clientId;
  if (!clientId) return resolveModelBundle();
  if (!clientBundles.has(clientId)) {
    // Set synchronously so concurrent requests from this page share the decision
    const decision = (async () => {
      const pinned = await readPin(clientId);  // worker may have restarted mid-load
      if (pinned) {
        resolvedPins.set(clientId, pinned);
        return pinned;
      }
      const name = await resolveModelBundle();
      if (name) {
        resolvedPins.set(clientId, name);  // visible to cleanup before the async write
        await pinBundle(clientId, name);
      }
      return name;
    })();
    clientBundles.set(clientId, decision);
    // No bundle: don't remember the failure, so this page's next attempt (the
    // classifier retries a failed load) can download a complete bundle.
    decision.then((name) => {
      if (!name && clientBundles.get(clientId) === decision) clientBundles.delete(clientId);
    });
  }
  return clientBundles.get(clientId);
}

async function serveModelFile(event, path) {
  const bundleName = await bundleForClient(event);
  const hit = bundleName ? await (await caches.open(bundleName)).match(path) : undefined;
  // Never fall back to an individual network request: with no complete bundle,
  // per-file fetches could straddle a deploy (v1 topology + v2 weights). Fail
  // this load as a network error instead; the classifier retries the whole load.
  return hit || Response.error();
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // API calls — network only
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Sign data JSON and ML model files
  if (url.pathname.startsWith('/sign-data/')) {
    event.respondWith(staleWhileRevalidate(event, SIGN_DATA_CACHE));
    return;
  }
  // Classifier files are served from one complete, versioned bundle
  if (url.pathname.startsWith(MODEL_DIR) && MODEL_FILES.includes(url.pathname.slice(MODEL_DIR.length))) {
    event.respondWith(serveModelFile(event, url.pathname));
    return;
  }

  // Navigations — network-first so a new deploy's index.html (with new chunk
  // hashes) is always used when online. Stored under one key ('/') rather than
  // per URL, since every route serves the same SPA shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Hashed build assets — immutable, so cache-first is safe
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              event.waitUntil(
                cache.put(event.request, response.clone())
                  .then(() => trimAssets(CACHE_NAME, MAX_ASSET_ENTRIES))
              );
            }
            return response;
          });
        })
      )
    );
  }
});
