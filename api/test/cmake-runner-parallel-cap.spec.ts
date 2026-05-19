/**
 * Regression test for "cmake --build --parallel oversubscribes under
 * concurrent users".
 *
 * `cmake --build <dir> --parallel` with no integer argument defaults to
 * the host's logical core count. Two concurrent users running /test on a
 * Catch2-heavy problem (different userIds, different in-flight slots
 * because InFlightRegistry keys on user+problem) can therefore spawn
 * 2 * NCPU compile jobs and oversubscribe — slowing both runs and, on
 * memory-constrained hosts, pushing ccache out of cache.
 *
 * The fix caps the count at a literal `2` so a sibling run can coexist.
 * This test pins the cap in source so a refactor that drops the number
 * (or bumps it back to unbounded) fails CI before it reaches prod.
 *
 * Structural pin only — the runtime cmake-runner suite already exercises
 * the full `cmake --build` path end-to-end; pinning the cap at the
 * source-string level is the cheapest correct check (parsing the spawn
 * argv at runtime would require mocking spawn, which is far more
 * invasive than the bug warrants).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('cmake-runner: --parallel is explicitly capped', () => {
  let source: string;
  before(() => {
    source = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'execution', 'cmake-runner.ts'),
      'utf8',
    );
  });

  it('cmake --build is invoked with `--parallel 2`, not bare `--parallel`', () => {
    // Find the line that builds with cmake. There must be exactly one.
    const buildInvocationRe = /spawnLimited\(\s*`cmake --build "\$\{buildDir\}" --parallel\s+(\d+)`/g;
    const matches = [...source.matchAll(buildInvocationRe)];
    assert.equal(
      matches.length,
      1,
      'expected exactly one `spawnLimited(\\`cmake --build ... --parallel N\\`)` call site in cmake-runner.ts',
    );
    const count = Number(matches[0]![1]);
    assert.equal(count, 2, `--parallel must be capped at 2 (got ${count})`);
  });

  it('does not leave a bare `--parallel` (no count) anywhere in the file', () => {
    // Anchor specifically on the cmake invocation context so a stray
    // `--parallel` in a comment about ctest or a future option string
    // doesn't trip the test. The bug we're guarding against is
    // specifically a cmake --build invocation with no count.
    assert.doesNotMatch(
      source,
      /cmake --build [^`]*--parallel\s*[`"]/,
      'cmake --build must always pass an integer count to --parallel',
    );
  });
});
