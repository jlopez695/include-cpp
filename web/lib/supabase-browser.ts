import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!(url && key);

export function createClient() {
  if (!supabaseEnabled) return null;
  return createBrowserClient(url!, key!);
}
