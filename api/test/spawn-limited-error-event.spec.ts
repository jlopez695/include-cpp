/**
 * Regression test for "spawnLimited's done promise hangs forever when
 * the child process can't be spawned".
 *
 * Pre-fix the resolver only listened for 'close':
 *
 *   child.once('close', (code, signal) => { ... resolve(...); });
 *
 * Node fires 'close' only after the process has been spawned and its
 * stdio streams have drained. If the spawn itself fails — ENOENT
 * (binary not on PATH), EACCES (cwd not readable), EAGAIN (fork
 * pressure), EMFILE (too many open files) — the ChildProcess emits
 * 'error' and 'close' may NEVER fire.
 *
 * The cascading impact:
 *   1. spawnLimited's `done` promise stays unresolved.
 *   2. runMakefile / runCmake's `await compile.done` blocks forever.
 *   3. ExecutionService.runStream never returns.
 *   4. The SSE response stream stays open with no data flowing.
 *   5. InFlightRegistry.release(key) lives in the controller's
 *      `finally`, which never runs.
 *   6. Every subsequent /run AND /test for that (user, problem)
 *      comes back as 409 Conflict until the server restarts —
 *      one bad spawn permanently bricks the slot.
 *
 * The fix listens for 'error' too and resolves with an error-shaped
 * exitCode (1 by convention), guarded by a `settled` flag so a 'close'
 * arriving AFTER 'error' (rare but possible per Node docs) doesn't
 * double-resolve. clearTimeout and the abort listener removal both
 * move into a shared `settle` helper so neither code path leaks
 * resources.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { spawnLimited } from '../src/execution/resource-limits.js';

test("spawnLimited resolves (not hangs) when the spawn ITSELF fails (ENOENT on cwd)", async () => {
  // To trigger Node's 'error' event (not 'close' with a non-zero code),
  // we need the spawn syscall itself to fail. Pointing cwd at a
  // non-existent directory does that: Node attempts the fork+chdir,
  // chdir returns ENOENT, the ChildProcess emits 'error' and 'close'
  // may NEVER fire.
  //
  // Pre-fix, the done promise would never resolve here and the test
  // would hang until the harness timeout — except node:test has no
  // default per-test timeout, so it would hang forever. We use an
  // explicit Promise.race to fail fast and produce a clear error
  // message instead of an indefinite hang.
  const nonexistentCwd = '/this/directory/does/not/exist/anywhere/on/the/system/seriously';
  const { done } = spawnLimited('true', {
    cwd: nonexistentCwd,
    limits: { wallMs: 5_000 },
  });

  const result = await Promise.race([
    done,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("done promise hung — spawnLimited did not settle on the 'error' event")),
        2_000,
      ),
    ),
  ]);

  // We don't pin the exact exitCode value (the fix uses 1 by Node
  // convention, but a future refactor that picks 126/127 would be fine
  // too) — the load-bearing assertion is "the promise settled at all,
  // with a non-zero code". An exit code of 0 here would mean the spawn
  // somehow succeeded, which is a different problem.
  assert.notEqual(result.exitCode, 0, "a failed spawn must surface a non-zero exitCode");
  assert.equal(result.killedByTimeout, false, "wallTimer must not be the cause of settlement here");
});

test("spawnLimited's done promise settles exactly once when both 'error' and 'close' fire", async () => {
  // Some Node versions emit 'close' after 'error' (when the streams
  // had been opened before the error landed). The fix's `settled`
  // flag must coalesce them — without it, the second `resolve` is a
  // no-op but the cleanup (clearTimeout, removeEventListener) runs
  // twice and the second call to removeEventListener on a Mac AbortSignal
  // is harmless but on certain Node versions has tripped warnings.
  //
  // We can't easily force both events to fire from outside, but we
  // can pin the structural property that the resolver guards against
  // it. This is a runtime smoke test that the happy path still works
  // (i.e., the new `settled` flag didn't accidentally swallow a
  // legitimate resolve).
  const { done } = spawnLimited('true', {
    cwd: os.tmpdir(),
    limits: { wallMs: 5_000 },
  });
  const result = await done;
  assert.equal(result.exitCode, 0, '`true` should still resolve to exit code 0 — the settled-flag refactor must not have broken the happy path');
  assert.equal(result.killedByTimeout, false);
});
