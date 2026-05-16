/**
 * Regression test for "SSE stream keeps running and writing to React
 * state after the user navigates to a different problem".
 *
 * Two related bugs, two related fixes:
 *
 *   1. useSSE never aborted on unmount. The fetch reader kept
 *      consuming the body for the whole wall-clock budget of the
 *      spawn (up to ~60s), even after the React tree was gone. The
 *      setState calls in the dispatch path silently no-op'd on an
 *      unmounted component (React 18+), but the network work,
 *      compile output, and the server-side InFlightRegistry slot
 *      all stayed live for that duration.
 *
 *   2. useProblemEditor's `[problem.id]` useEffect cleared output /
 *      test-results / status state when the problem changed but did
 *      NOT abort the SSE. In Next.js App Router, navigating between
 *      /problems/POTD0 and /problems/POTD1 REUSES the
 *      ProblemWorkspace instance (different props, same component
 *      identity), so the host doesn't unmount and the unmount-cleanup
 *      from fix #1 doesn't fire. The old SSE kept streaming with
 *      callbacks that closed over the (stable) setOutputLines /
 *      setTestResults setters; output from the OLD problem's run
 *      landed in the NEW problem's freshly-cleared state. Visible
 *      bug: navigate mid-test-run and watch half of POTD0's test
 *      results pop into POTD1's view a moment later.
 *
 * The fix:
 *   - useSSE adds a `useEffect(() => () => abort(), [])` to abort
 *     on unmount.
 *   - useProblemEditor's `[problem.id]` effect returns a cleanup
 *     that calls `sse.abort()` — runs BEFORE the next setup that
 *     clears state, so the clear lands on a quiet stream.
 *
 * Pinned at the source level — exercising the actual race needs a
 * real fetch + real cancellation, which happy-dom won't give us
 * deterministically.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('useSSE aborts on host unmount', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'hooks', 'useSSE.ts'),
      'utf8',
    );
  });

  it('imports useEffect', () => {
    // Sanity check — the cleanup uses useEffect, so the import must
    // be present. A future refactor that moves the cleanup elsewhere
    // (e.g. into a useLayoutEffect or a custom hook) needs to update
    // this expectation explicitly.
    assert.match(src, /import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*['"]react['"]/);
  });

  it('registers an unmount-time cleanup that aborts abortRef.current', () => {
    // The cleanup must call abort on the LATEST controller via the
    // ref — capturing `controller` from a single run() invocation
    // wouldn't reach a later run's controller. Empty deps [] anchor
    // it to unmount only (we want the cleanup to fire ONCE, not
    // every render — running it per render would cancel every in-
    // flight stream the moment any state in useSSE updated, which
    // happens on every setState during the read loop).
    assert.match(
      src,
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?return\s*\(\)\s*=>\s*\{[\s\S]*?abortRef\.current\?\.abort\(\)[\s\S]*?\}[\s\S]*?\},\s*\[\s*\]\s*\)/,
      'useSSE must register a useEffect with empty deps whose cleanup aborts abortRef.current',
    );
  });
});

describe('useProblemEditor aborts SSE on problem-id navigation', () => {
  let src: string;
  before(() => {
    src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'hooks', 'useProblemEditor.ts'),
      'utf8',
    );
  });

  it("the [problem.id] effect returns a cleanup that calls sse.abort()", () => {
    // Anchor on the dep array because there could (in principle) be
    // other useEffects in this file — but only the problem.id one
    // needs this cleanup. Find it specifically.
    const effect = src.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]+?return\s*\(\)\s*=>\s*\{[\s\S]+?sse\.abort\(\)[\s\S]+?\},\s*\[problem\.id\]/,
    );
    assert.ok(
      effect,
      'the [problem.id] useEffect must return a cleanup that calls sse.abort() — otherwise OLD-problem SSE callbacks bleed into NEW-problem state',
    );
  });

  it('the cleanup is structured to run BEFORE the next setup (state-clear) on problem change', () => {
    // React semantic: when a useEffect's deps change, cleanup runs first
    // and then the new setup runs. We rely on that ordering — clear
    // state lands on a quiet stream. This test just pins the structural
    // expectation (cleanup-then-setup is React's invariant, not ours).
    // The pin: there must be a `return () => { ... }` INSIDE the same
    // useEffect that contains `setOutputLines([])`. Returning the
    // cleanup from a different effect would lose the ordering guarantee.
    const effect = src.match(
      /useEffect\(\(\)\s*=>\s*\{([\s\S]+?)\},\s*\[problem\.id\]/,
    );
    assert.ok(effect, 'could not locate the [problem.id] useEffect');
    const body = effect![1];
    assert.match(body, /setOutputLines\(\s*\[\s*\]\s*\)/, 'the same effect that clears state must own the cleanup');
    assert.match(body, /return\s*\(\)\s*=>\s*\{[\s\S]*?sse\.abort\(\)/, 'cleanup must be the inner return of this same effect');
  });
});
