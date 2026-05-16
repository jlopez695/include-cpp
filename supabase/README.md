# Supabase setup

This site stores per-user code edits and problem status in Supabase. UI state (split sizes, etc.) is reserved for future cross-device sync — today it lives in localStorage only (see `web/lib/storage.ts`).

## One-time setup

1. **Create a project** at https://supabase.com/dashboard. Pick a region close to you and a strong DB password.

2. **Get your URL and keys** from `Project Settings → API`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. **Apply the schema.** Open the SQL editor in the Supabase dashboard and run the contents of `migrations/0001_init.sql`. Or with the Supabase CLI:
   ```
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

4. **Configure auth.** Under `Authentication → Providers`:
   - Enable **Email** (magic link) at minimum.
   - Optionally enable Google/GitHub.
   Under `Authentication → URL Configuration`:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`

5. **Drop your env vars** into `web/.env.local` (see `web/.env.example`).

## Schema overview

| Table | Purpose | Key |
|---|---|---|
| `user_code` | User's edited file contents (only when different from starter) | `(user_id, problem_id, filename)` |
| `problem_status` | Solved / attempted state + pass counts | `(user_id, problem_id)` |
| `ui_state` | *Reserved schema for future cross-device UI-state sync. Not yet wired in code — `loadUiState` / `saveUiState` are localStorage-only today.* | `user_id` |

RLS is enabled on all three — every row is scoped to `auth.uid()`.

## Notes on the tradeoff

Replacing localStorage with Supabase means:
- **Lost:** offline use, instant persistence (now round-trips to the network)
- **Gained:** cross-device sync, multi-user support, an audit trail

If you're the only user and you only ever use one machine, localStorage was the right answer. This rebuild assumes you may eventually want one or more of the gains.
