/**
 * Lazy Supabase client.
 *
 * The previous `createClient()` statically imported `@supabase/ssr`, which
 * pulled the full Supabase SDK (~211KB after minification) into the first-
 * load chunk for /problems/[id] — even on builds where
 * NEXT_PUBLIC_SUPABASE_URL is unset (the default; remote sync is opt-in).
 *
 * Now the SDK is dynamically imported only after `supabaseEnabled` is true
 * AND a caller actually asks for a client. The promise is memoized so we
 * don't repeatedly re-import or re-construct.
 *
 * Callers in storage.ts use Supabase fire-and-forget (no await on the
 * actual upsert/delete), so the previously-sync interface can be lifted
 * to async without altering observable behavior — UI is driven by
 * localStorage, Supabase is the background sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(url && key);

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getClient(): Promise<SupabaseClient | null> {
  if (!supabaseEnabled) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/ssr').then(({ createBrowserClient }) =>
      createBrowserClient(url!, key!),
    );
  }
  return clientPromise;
}
