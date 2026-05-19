/**
 * Regression test for "per-problem Makefile hard-assigns CXX/CXXFLAGS,
 * silently defeating the API's ccache wrapping and -I${SHARED_INCLUDE}
 * flag".
 *
 * makefile-runner.ts:48 sets `CXX='ccache c++'` and adds
 * `-I${SHARED_INCLUDE_DIR}` to CXXFLAGS in the spawned env. Make's
 * variable-flavor rules say environment variables override `?=`
 * defaults but DO NOT override `=` assignments inside the Makefile:
 *
 *   CXX = clang++         # ignores the env entirely → ccache misses
 *   CXX ?= clang++        # honors the env when set → ccache wraps
 *
 * Same for CXXFLAGS: a hard `CXXFLAGS = ...` line wipes out
 * `-I${SHARED_INCLUDE_DIR}` from the env, which means once a problem's
 * grader needs `grader_harness.h` (the project's standard test
 * framework) it fails to compile with "grader_harness.h: file not
 * found" instead of running the test suite.
 *
 * Pin both flavors in source so a future "fix the warnings" PR that
 * tightens `?=` back to `=` on any per-problem Makefile fails CI
 * before it lands.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../src/common/paths.js';

describe('per-problem Makefiles soft-assign CXX and CXXFLAGS', () => {
  const ids = fs
    .readdirSync(PROBLEMS_DIR)
    .filter(name => !name.startsWith('_') && !name.startsWith('.'))
    .filter(name => {
      const m = path.join(PROBLEMS_DIR, name, 'Makefile');
      return fs.existsSync(m);
    })
    .sort();

  // Sanity: the audit was done against a non-trivial corpus. If the test
  // ever runs against an empty problems dir (a wrong PROBLEMS_DIR override
  // in tests, a copy-paste mistake) it would silently pass with zero
  // assertions. Pin a floor instead.
  it('finds at least three per-problem Makefiles to audit', () => {
    assert.ok(ids.length >= 3, `expected ≥3 Makefile problems under PROBLEMS_DIR (${PROBLEMS_DIR}); got ${ids.length}`);
  });

  for (const id of ids) {
    const makefilePath = path.join(PROBLEMS_DIR, id, 'Makefile');
    const source = fs.readFileSync(makefilePath, 'utf8');

    it(`${id}/Makefile: CXX is soft-assigned (?=) so the API's ccache env wraps the compile`, () => {
      // Reject any line that starts a CXX assignment with bare `=`. Allow
      // ?=, :=, +=, and lines where CXX appears in the body (e.g. $(CXX)
      // expansions in a recipe) — those aren't variable assignments.
      const hardAssignRe = /^[ \t]*CXX\s*=(?!=)/m;
      assert.doesNotMatch(
        source,
        hardAssignRe,
        `${id}/Makefile must use \`CXX ?= ...\`, not \`CXX = ...\`. Hard assignment overrides the API's CXX='ccache c++' env, so every compile misses the cache.`,
      );
    });

    it(`${id}/Makefile: CXXFLAGS is soft-assigned (?=) so the API's -I\${SHARED_INCLUDE} flag survives`, () => {
      const hardAssignRe = /^[ \t]*CXXFLAGS\s*=(?!=)/m;
      assert.doesNotMatch(
        source,
        hardAssignRe,
        `${id}/Makefile must use \`CXXFLAGS ?= ...\`, not \`CXXFLAGS = ...\`. Hard assignment overrides the API's CXXFLAGS that carries -I\${SHARED_INCLUDE_DIR}, so grader_harness.h won't resolve.`,
      );
    });
  }
});
