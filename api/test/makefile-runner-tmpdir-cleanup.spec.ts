/**
 * Regression test for "makefile-runner's tmpdir cleanup is
 * fire-and-forget; the runMakefile promise resolves before the rm
 * flushes to disk".
 *
 * Pre-fix shape (api/src/execution/makefile-runner.ts):
 *
 *   } finally {
 *     fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
 *   }
 *
 * The finally returned synchronously after kicking off the rm promise,
 * which means:
 *   - The HTTP response and the SSE stream both completed and the
 *     enclosing async function resolved while the tmpdir was still on
 *     disk. Under sustained load, /tmp/cpp-* could briefly accumulate
 *     hundreds of directories.
 *   - If the Node process took a SIGTERM (graceful redeploy) or SIGKILL
 *     (OOM) in the gap between resolve and rm flush, the dir leaked
 *     permanently. macOS reliably clears /tmp on boot but long-running
 *     Linux containers don't.
 *
 * Fix: await the rm. The .catch(() => {}) stays so rm failures don't
 * mask any error escaping through the finally.
 *
 * This test verifies the runtime invariant: by the time runMakefile's
 * promise resolves, the tmpdir is gone. We intercept fs.promises.mkdtemp
 * to capture the exact path runMakefile chose (instead of scraping
 * os.tmpdir() and racing parallel test invocations), then assert the
 * path is absent after the awaited return.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runMakefile } from '../src/execution/makefile-runner.js';

// A solution good enough to compile + run + emit sentinels. We don't
// care about the test outcome here; we only need the runMakefile path
// to reach the `finally` block. Borrowed from makefile-runner.spec.ts.
const VALID_SOLUTION = `#include "hello.h"
#include <string>
std::string hello() {
  return std::string("Hello world! My name is Jacob and I am 21 years old.");
}
`;

test('makefile-runner: tmpdir is removed by the time runMakefile resolves (await, not fire-and-forget)', async () => {
  const origMkdtemp = fs.promises.mkdtemp;
  let createdDir: string | null = null;
  // Wrap mkdtemp to record exactly which tmpdir runMakefile picked.
  // Cast through unknown so TypeScript's strict overload resolution
  // doesn't object to the override; runMakefile only ever calls
  // mkdtemp(string), so the narrower signature is fine.
  (fs.promises as unknown as { mkdtemp: (prefix: string) => Promise<string> }).mkdtemp = async (
    prefix: string,
  ) => {
    const dir = await origMkdtemp(prefix);
    createdDir = dir;
    return dir;
  };
  try {
    const ctrl = new AbortController();
    const result = await runMakefile(
      'POTD0',
      { 'hello.cpp': VALID_SOLUTION },
      'test',
      'main',
      () => {},
      ctrl.signal,
    );
    // Sanity: the test fixture should have produced a real run.
    // (If POTD0's harness ever drifts out from under us, surface that
    // here as a clear assertion rather than letting the cleanup check
    // fail for an unrelated reason.)
    assert.equal(result.total, 5, 'POTD0 fixture should report 5 tests');

    assert.ok(createdDir, 'mkdtemp spy must have captured the tmpdir path');
    assert.equal(
      fs.existsSync(createdDir!),
      false,
      `tmpdir ${createdDir} must NOT exist after runMakefile resolves. The fix is to await the fs.promises.rm in the finally block instead of firing it off and resolving immediately.`,
    );
  } finally {
    (fs.promises as unknown as { mkdtemp: typeof origMkdtemp }).mkdtemp = origMkdtemp;
    // Belt-and-suspenders: if the assertion above failed because the
    // dir was still present, clean it up so we don't leak from the test
    // run itself.
    if (createdDir && fs.existsSync(createdDir)) {
      fs.rmSync(createdDir, { recursive: true, force: true });
    }
  }
});

test('makefile-runner: tmpdir is removed even when compile fails (finally path)', async () => {
  // The finally is the cleanup site, so the "compile fails" path is the
  // most important one to pin: in that branch the function returns
  // early from inside the try, and the finally is the only thing that
  // cleans up. A pre-fix regression would still race here.
  const origMkdtemp = fs.promises.mkdtemp;
  let createdDir: string | null = null;
  (fs.promises as unknown as { mkdtemp: (prefix: string) => Promise<string> }).mkdtemp = async (
    prefix: string,
  ) => {
    const dir = await origMkdtemp(prefix);
    createdDir = dir;
    return dir;
  };
  try {
    const ctrl = new AbortController();
    const result = await runMakefile(
      'POTD0',
      { 'hello.cpp': 'not valid c++\n' },
      'test',
      'main',
      () => {},
      ctrl.signal,
    );
    assert.notEqual(result.exitCode, 0, 'broken solution should fail to compile');
    assert.ok(createdDir, 'mkdtemp spy must have captured the tmpdir path');
    assert.equal(
      fs.existsSync(createdDir!),
      false,
      `tmpdir ${createdDir} must NOT exist after a compile-failure runMakefile resolves`,
    );
  } finally {
    (fs.promises as unknown as { mkdtemp: typeof origMkdtemp }).mkdtemp = origMkdtemp;
    if (createdDir && fs.existsSync(createdDir)) {
      fs.rmSync(createdDir, { recursive: true, force: true });
    }
  }
});
