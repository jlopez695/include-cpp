import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, fetchProblems, fetchProblem, fetchHealth } from '../lib/api.js';

/**
 * Regression for #2.5: the fetch helpers had no client-side timeout.
 * Browser fetch never times out by default, so an API that hangs
 * mid-response left the page-level promise pending forever and the
 * UI stuck on a loading spinner.
 *
 * Post-fix every helper goes through fetchWithTimeout, which wraps
 * the request in an AbortController and rethrows the AbortError as
 * an ApiError(504). The 504 is intentional: it matches the shape an
 * upstream gateway timeout would produce, and the page-level error
 * boundary already has a branch for "backend slow/unreachable" that
 * we want to reach.
 *
 * Pin: replace globalThis.fetch with a stub that ignores the abort
 * signal and never resolves, race it against a short artificial
 * shrinking of the timeout via a hand-driven controller. We can't
 * easily redefine FETCH_TIMEOUT_MS at runtime (it's a module-scoped
 * const), so we simulate the abort path by handing the fetch stub
 * an init.signal that's already aborted. The helpers should reject
 * with the ApiError(504) shape regardless of which path produced
 * the abort.
 */

function abortingFetch(): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    // Wait for the signal to fire, then reject with AbortError —
    // exactly what the real browser fetch does when the controller
    // aborts.
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
      // Never resolve otherwise — pin that the helper's own timer
      // (the AbortController.setTimeout) eventually fires and aborts.
    });
  }) as typeof fetch;
}

describe('fetch helpers reject with ApiError(504) on abort', () => {
  it('fetchProblems propagates AbortError as ApiError(504)', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = abortingFetch();
    try {
      await assert.rejects(fetchProblems(), (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).status, 504);
        assert.match((err as ApiError).message, /Timed out/);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('fetchProblem propagates AbortError as ApiError(504) and names the problem id', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = abortingFetch();
    try {
      await assert.rejects(fetchProblem('POTD42'), (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).status, 504);
        assert.match((err as ApiError).message, /POTD42/);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('fetchHealth propagates AbortError as ApiError(504)', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = abortingFetch();
    try {
      await assert.rejects(fetchHealth(), (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).status, 504);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a non-AbortError network failure is NOT turned into a 504', async () => {
    // Sanity check: only AbortError gets remapped. A generic TypeError
    // (the shape browsers throw on DNS/connection failures) must pass
    // through to the caller untouched, so the caller's error boundary
    // can present it accurately.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    try {
      await assert.rejects(fetchProblems(), (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });
}, { timeout: 30_000 });
