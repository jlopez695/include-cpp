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
          // The outer .catch on getRegistrations does NOT propagate up
          // from the per-registration unregister() chain — those promises
          // are detached. A spec-allowed rejection here (rare, but
          // happens e.g. when the SW state machine is mid-installation)
          // would surface as an unhandled rejection in the browser
          // console, contradicting the file-level "failures are non-fatal
          // (logged)" contract. Each inner promise needs its own catch.
          reg.unregister().then(ok => {
            if (ok) console.info('[sw] unregistered stale dev worker');
          }).catch(err => {
            console.warn('[sw] failed to unregister stale dev worker:', err);
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
