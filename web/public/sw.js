/* CS 225 POTD service worker.
 *
 * Strategy:
 *   - /_next/static/* (hashed, immutable):  cache-first, runtime-populated
 *   - Same-origin navigations (HTML pages):  network-first, fall back to
 *                                            cached HTML when offline
 *   - Everything else (API requests etc.):  pass-through, no SW interference
 *
 * The cache name is versioned. On activation we drop every cache that isn't
 * the current version so old hashed chunks from prior deploys get evicted.
 * Bump VERSION when changing the strategy.
 */

const VERSION = 'potd-v1';

self.addEventListener('install', () => {
  // Skip the "waiting" phase — there's no shared state with a prior version
  // worth preserving, and we want the new SW to take over immediately on
  // deploy.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== VERSION).map(k => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for hashed static assets (chunks, fonts, etc.). These are
  // content-addressed: their URL changes when their content changes, so a
  // cache hit is always correct.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Network-first for navigations so we always pick up fresh ISR-rendered
  // HTML when online. Falls back to the cached page when offline, which
  // means a previously-visited problem still loads with no connection.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  // Only cache successful, basic-type responses to avoid poisoning the cache
  // with opaque CDN failures.
  if (res.ok && res.type === 'basic') {
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw new Error('Offline and no cached page available');
  }
}
