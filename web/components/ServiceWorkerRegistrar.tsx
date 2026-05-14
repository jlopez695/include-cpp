'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker after first paint. Production-only — we
 * never want a stale SW handling chunk fetches during dev with Turbopack.
 * Failures are non-fatal (logged) since the site works without the SW;
 * the SW is purely a speed/offline win.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => {
        console.warn('[sw] registration failed:', err);
      });
  }, []);
  return null;
}
