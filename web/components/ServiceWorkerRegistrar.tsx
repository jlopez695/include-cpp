'use client';

import { useEffect } from 'react';

/**
 * In production: register the service worker after first paint.
 *
 * In dev: actively unregister any service worker the browser still holds
 * from a prior `npm start` session. Without this, a stale SW intercepts
 * dev navigations and serves cached HTML against the freshly-compiled JS
 * bundle — the symptom is a hydration mismatch where the SSR output
 * structurally disagrees with what the client component renders. The fix
 * has to live here because we can't ask every contributor to dig into
 * DevTools → Application → Service Workers themselves.
 *
 * Failures are non-fatal (logged) — the SW is purely a speed/offline win.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          reg.unregister().then(ok => {
            if (ok) console.info('[sw] unregistered stale dev worker');
          });
        }
      }).catch(() => {});
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => {
        console.warn('[sw] registration failed:', err);
      });
  }, []);
  return null;
}
