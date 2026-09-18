import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCorsOrigins } from '../src/common/cors-origins.js';

/**
 * Regression coverage for the CORS allowlist computation.
 *
 * The two behaviors we care about:
 *
 *   1. Production lockdown: `NODE_ENV=production` plus a custom
 *      `FRONTEND_ORIGIN` must produce *only* that origin. Pre-fix the
 *      bootstrap always included `localhost:3000` and `localhost:5173`,
 *      which silently kept a dev-machine origin allowlisted in prod.
 *
 *   2. Dev ergonomics: with `FRONTEND_ORIGIN` unset (or set to the
 *      default), the allowlist must contain `localhost:3000` and
 *      `localhost:5173` but NOT duplicate `localhost:3000` — the
 *      pre-fix shape `[FRONTEND_ORIGIN, 'http://localhost:3000', ...]`
 *      had `localhost:3000` twice in the common case.
 */

describe('computeCorsOrigins', () => {
  it('production: returns only FRONTEND_ORIGIN, no localhost fallbacks', () => {
    const origins = computeCorsOrigins({
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://cpp.example.com',
    });
    assert.deepEqual(origins, ['https://cpp.example.com']);
  });

  it('production with no FRONTEND_ORIGIN: falls back to the default origin only', () => {
    // Edge case: a production deploy that forgot to set FRONTEND_ORIGIN.
    // The default kicks in but the dev localhost ports do NOT — preserving
    // the lockdown intent even on a misconfigured deploy.
    const origins = computeCorsOrigins({
      NODE_ENV: 'production',
    });
    assert.deepEqual(origins, ['http://localhost:3000']);
  });

  it('dev: includes FRONTEND_ORIGIN and the two localhost dev ports', () => {
    const origins = computeCorsOrigins({
      NODE_ENV: 'development',
      FRONTEND_ORIGIN: 'http://localhost:3000',
    });
    // Deduped — FRONTEND_ORIGIN === default localhost:3000 must not appear twice.
    assert.deepEqual(origins, ['http://localhost:3000', 'http://localhost:5173']);
  });

  it('dev with a custom FRONTEND_ORIGIN: keeps both the custom and the defaults', () => {
    const origins = computeCorsOrigins({
      NODE_ENV: 'development',
      FRONTEND_ORIGIN: 'http://localhost:4000',
    });
    assert.deepEqual(origins, [
      'http://localhost:4000',
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
  });

  it('NODE_ENV unset: treated as dev (matches Node convention)', () => {
    // `process.env.NODE_ENV` is genuinely unset in many local-run scenarios
    // (`node script.ts` outside of npm scripts). The helper must default
    // to dev so the localhost ports stay open.
    const origins = computeCorsOrigins({});
    assert.deepEqual(origins, ['http://localhost:3000', 'http://localhost:5173']);
  });

  it('NODE_ENV=test: treated as non-production (dev origins included)', () => {
    // Test runs don't typically issue CORS requests, but if they do they
    // should be permitted from the dev origins. NODE_ENV=test must not
    // accidentally trip the production lockdown.
    const origins = computeCorsOrigins({ NODE_ENV: 'test' });
    assert.deepEqual(origins, ['http://localhost:3000', 'http://localhost:5173']);
  });
});
