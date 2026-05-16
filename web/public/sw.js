/* CS 225 POTD service worker.
 *
 * Strategy:
 *
 *   /_next/static/*  →  cache-first in a fixed `potd-static` cache. URLs
 *                       are content-hashed; a cache hit is always correct.
 *
 *   HTML navigations →  cache-first within a build-ID-namespaced cache,
 *                       e.g. `potd-html-zv7WDJNzwVTuUjRYq3cyR`. Within a
 *                       build the cache serves first, then revalidates in
 *                       the background. On deploy the build ID changes and
 *                       the prior namespace is evicted *inline* — see the
 *                       cache-eviction note below.
 *
 *   Everything else  →  pass-through.
 *
 * Cache-eviction note:
 *   `activate` only fires when the SW *file* changes, not when the *site*
 *   changes. If we ship a new build but don't edit sw.js, the browser
 *   never installs a new SW and the activate handler never runs. So we
 *   eject stale html caches inline from getBuildId — every time the
 *   memoized build ID expires (BUILD_ID_TTL) and a fresh probe returns a
 *   value different from the last we saw, we drop every potd-html-* cache
 *   that isn't the current one. This is what makes a deploy actually
 *   propagate to a long-lived SW.
 *
 * The build ID comes from /api/version (returns .next/BUILD_ID).
 */

const STATIC_CACHE = 'potd-static';
const HTML_CACHE_PREFIX = 'potd-html-';
const BUILD_ID_TTL = 30_000;

let buildIdPromise = null;
let buildIdFetchedAt = 0;
let lastSeenBuildId = null;

function getBuildId() {
  const now = Date.now();
  if (buildIdPromise && now - buildIdFetchedAt < BUILD_ID_TTL) {
    return buildIdPromise;
  }
  buildIdFetchedAt = now;
  buildIdPromise = fetch('/api/version', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d && typeof d.buildId === 'string' ? d.buildId : null))
    .then(async id => {
      if (id && lastSeenBuildId && id !== lastSeenBuildId) {
        // Build flipped mid-session — drop the old html cache *now*. We
        // can't wait for activate; this SW file may not have changed.
        await dropOtherHtmlCaches(id);
      }
      if (id) lastSeenBuildId = id;
      return id;
    })
    .catch(() => null);
  return buildIdPromise;
}

async function dropOtherHtmlCaches(currentId) {
  const live = HTML_CACHE_PREFIX + currentId;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(k => k.startsWith(HTML_CACHE_PREFIX) && k !== live)
      .map(k => caches.delete(k)),
  );
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Take over open clients before anything else so that any stale-cache
      // serving by an older SW yields to this one immediately.
      await self.clients.claim();
      const id = await getBuildId();
      const liveHtml = id ? HTML_CACHE_PREFIX + id : null;
      const keys = await caches.keys();
      await Promise.all(
        keys
          // Anything that isn't our static cache or the current html cache
          // is legacy — including caches from prior SW versions that used
          // different naming schemes (e.g. `potd-v1`). Drop them all.
          .filter(k => k !== STATIC_CACHE && k !== liveHtml)
          .map(k => caches.delete(k)),
      );
    })(),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Don't intercept the version probe — it must always hit the network and
  // it's the trigger for cache eviction, so caching it would deadlock.
  if (url.pathname === '/api/version') return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(navHtml(req));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    cache.put(req, res.clone());
  }
  return res;
}

async function navHtml(req) {
  const id = await getBuildId();

  // No build ID → don't risk caching against an unknown version. Pass through.
  if (!id) return fetch(req);

  const cacheName = HTML_CACHE_PREFIX + id;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  if (cached) {
    // Stale-while-revalidate within the current build.
    safeRevalidate(req, cache);
    return cached;
  }

  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

function safeRevalidate(req, cache) {
  fetch(req)
    .then(res => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    })
    .catch(() => {});
}
