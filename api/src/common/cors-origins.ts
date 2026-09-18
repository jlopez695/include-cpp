/**
 * Compute the CORS allowlist for the Fastify CORS plugin.
 *
 * Pre-fix the bootstrap registered a static
 * `[FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:5173']`
 * unconditionally. That had two problems:
 *
 *   1. The literal `'http://localhost:3000'` was redundant with the
 *      FRONTEND_ORIGIN default (which is also `'http://localhost:3000'`)
 *      — in dev it just appeared twice in the allowlist.
 *
 *   2. In production, setting `FRONTEND_ORIGIN=https://cpp.example.com`
 *      to lock the API down to one origin SILENTLY left
 *      `http://localhost:3000` and `http://localhost:5173` whitelisted,
 *      defeating the lockdown. Anyone who could resolve the API host
 *      from a `localhost:3000` page could send credentialed requests.
 *
 * The helper resolves both: FRONTEND_ORIGIN is always included, the
 * dev-only localhost entries are gated on `NODE_ENV !== 'production'`,
 * and the list is deduped so the dev common case (FRONTEND_ORIGIN
 * defaulting to `localhost:3000`) yields a clean single entry.
 *
 * Exported as a pure function over `env` so unit tests can pin both
 * branches without instantiating Fastify or running the full bootstrap.
 */
export function computeCorsOrigins(env: NodeJS.ProcessEnv): string[] {
  const frontendOrigin = env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
  const isDev = env.NODE_ENV !== 'production';
  const origins = [frontendOrigin];
  if (isDev) {
    origins.push('http://localhost:3000', 'http://localhost:5173');
  }
  return [...new Set(origins)];
}
