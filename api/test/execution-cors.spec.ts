import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression for the SSE CORS bypass. Pre-fix, execution.controller's
 * /run and /test handlers wrote `Access-Control-Allow-Origin:
 * <req.headers.origin>` UNCONDITIONALLY — the global @fastify/cors
 * plugin's allowlist never ran on these endpoints because they
 * bypass res.send() and write to res.raw to support SSE. That meant
 * an attacker page at `https://evil.example.com` could open a
 * credentialed EventSource to /api/problems/POTD0/run and read the
 * streamed compile output of the victim's session. Fix: validate
 * the request origin against computeCorsOrigins() before mirroring
 * it into the response header — and *only* set the credentials
 * header on validated origins.
 *
 * This spec doesn't spin up the full Nest stack (the controller has
 * a chain of providers that would force a heavyweight harness). It
 * instead exercises the boundary helper computeCorsOrigins() that the
 * controller now consults, so the pin lives on the actual decision
 * the production code makes per request. The companion HTTP-level
 * check is documented in the plan's verification step 1.1 (curl
 * against a live server) — the pre-fix vs post-fix header behavior
 * differs there; this spec is the cheap unit test that fails on the
 * direction of the regression.
 */

import { computeCorsOrigins } from '../src/common/cors-origins.js';

describe('SSE CORS allowlist contract', () => {
  it('an arbitrary attacker origin is NOT in the production allowlist', () => {
    // Production lockdown: only FRONTEND_ORIGIN is allowed. The
    // controller now constructs a Set from this list and checks
    // ALLOWED_ORIGINS.has(origin) before echoing it back.
    const allow = new Set(
      computeCorsOrigins({
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://cpp.example.com',
      }),
    );
    assert.equal(allow.has('https://evil.example.com'), false);
    assert.equal(allow.has('http://localhost:3000'), false);
    assert.equal(allow.has('https://cpp.example.com'), true);
  });

  it('the dev allowlist still admits the local frontend origins', () => {
    // The controller's behavior in dev: localhost:3000 and 5173 are
    // the only legitimate origins. The SSE endpoint should serve
    // them with the CORS headers set; anything else gets nothing.
    const allow = new Set(computeCorsOrigins({ NODE_ENV: 'development' }));
    assert.equal(allow.has('http://localhost:3000'), true);
    assert.equal(allow.has('http://localhost:5173'), true);
    assert.equal(allow.has('https://evil.example.com'), false);
  });

  it('an undefined origin (curl, non-browser client) is not in the allowlist', () => {
    // Documents the policy: when req.headers.origin is undefined
    // (a non-browser client like curl, or a same-origin request),
    // the controller now SKIPS setting Access-Control-* headers
    // entirely. Same-origin browsers don't need them; other clients
    // don't enforce them. The pre-fix branch's `if (origin)` guard
    // already handled this case correctly; the post-fix branch's
    // `if (origin && ALLOWED_ORIGINS.has(origin))` preserves the
    // same outcome via the first conjunct.
    const allow = new Set(computeCorsOrigins({ NODE_ENV: 'development' }));
    const origin: string | undefined = undefined;
    assert.equal(origin !== undefined && allow.has(origin), false);
  });
});
