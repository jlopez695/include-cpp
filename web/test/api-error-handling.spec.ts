import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError, fetchProblem } from '../lib/api.js';

const root = path.join(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('ApiError carries HTTP status so callers can distinguish 404 from 5xx', () => {
  it('ApiError is an Error with a numeric status', () => {
    const e = new ApiError('boom', 503);
    assert.ok(e instanceof Error);
    assert.equal(e.status, 503);
    assert.equal(e.name, 'ApiError');
    assert.equal(e.message, 'boom');
  });

  it('fetchProblem throws ApiError(404) when backend returns 404', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('{"statusCode":404}', { status: 404 })) as typeof fetch;
    try {
      await assert.rejects(fetchProblem('DOES_NOT_EXIST'), (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).status, 404);
        return true;
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchProblem throws ApiError(500) when backend errors', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('upstream exploded', { status: 500 })) as typeof fetch;
    try {
      await assert.rejects(fetchProblem('POTD0'), (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).status, 500);
        return true;
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Problem detail page only calls notFound() on a true 404', () => {
  // The bug this guards against: previously the page did `catch { notFound() }`
  // unconditionally. When the backend was down or returning 5xx, users saw
  // a "Not Found" page for problems that actually exist — masking the real
  // failure. The fix narrows notFound() to ApiError(404) and rethrows
  // everything else so error.tsx renders for real outages.
  const src = read('app/problems/[id]/page.tsx');

  it('imports ApiError from the api client', () => {
    assert.match(src, /import\s*\{[^}]*\bApiError\b[^}]*\}\s*from\s*['"]@\/lib\/api['"]/);
  });

  it('only calls notFound() when caught error is an ApiError with status 404', () => {
    // The catch must check status before narrowing to notFound() — a bare
    // `catch { notFound(); }` is what we're guarding against.
    assert.match(
      src,
      /catch\s*\([^)]*\)\s*\{[\s\S]*?err\s+instanceof\s+ApiError[\s\S]*?status\s*===\s*404[\s\S]*?notFound\(\)/,
    );
  });

  it('rethrows non-404 errors so error.tsx renders for real outages', () => {
    // After the 404-narrowed notFound() call, the catch must propagate
    // anything else with `throw err`. Without this, the page would
    // silently succeed with `problem` undefined.
    assert.match(src, /catch\s*\([^)]*\)\s*\{[\s\S]*?notFound\(\)[\s\S]*?throw\s+err[\s\S]*?\}/);
  });
});
