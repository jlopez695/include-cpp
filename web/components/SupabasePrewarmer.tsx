'use client';

import { useEffect } from 'react';
import { supabaseEnabled, getClient } from '@/lib/supabase-browser';

/**
 * When Supabase is enabled, schedule the SDK download + client construction
 * during the next idle period after mount. By the time the user triggers
 * a save (saveCode/saveStatus etc.), `getClient()` resolves synchronously
 * to the memoized client instead of stalling on `import('@supabase/ssr')`.
 *
 * Today this is a no-op — supabaseEnabled is compiled to `false` when
 * NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are unset, so the import never
 * fires and the component returns immediately. When auth lands and the
 * env vars are set at build time, the prewarmer activates automatically.
 */
export function SupabasePrewarmer() {
  useEffect(() => {
    if (!supabaseEnabled) return;

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void getClient();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(run, 1000);
    }

    return () => {
      if (idleId !== undefined && typeof window !== 'undefined'
        && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
